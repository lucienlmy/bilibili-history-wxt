use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize, Clone)]
struct LoginStatus {
    logged_in: bool,
    uname: Option<String>,
    mid: Option<i64>,
    has_csrf: bool,
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct SessionFile {
    sessdata: Option<String>,
    bili_jct: Option<String>,
    watermark_view_at: Option<i64>,
    last_sync_at: Option<i64>,
    backup_dir: Option<String>,
    last_dir_backup_at: Option<i64>,
}

#[derive(Serialize)]
struct SyncMeta {
    watermark_view_at: i64,
    last_sync_at: Option<i64>,
}

#[derive(Serialize)]
struct HistoryPageResult {
    items: Vec<serde_json::Value>,
    cursor_max: i64,
    cursor_view_at: i64,
    is_end: bool,
}

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("bilibili_session.json"))
}

fn read_session(app: &AppHandle) -> Result<SessionFile, String> {
    let path = session_path(app)?;
    if !path.exists() {
        return Ok(SessionFile::default());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn write_session(app: &AppHandle, s: &SessionFile) -> Result<(), String> {
    let path = session_path(app)?;
    let body = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(path, body).map_err(|e| e.to_string())
}

fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

fn bili_get(sessdata: &str, url: &str) -> Result<serde_json::Value, String> {
    let c = client()?;
    let resp = c
        .get(url)
        .header("Cookie", format!("SESSDATA={}", sessdata))
        .header("Referer", "https://www.bilibili.com")
        .send()
        .map_err(|e| format!("网络请求失败：{}", e))?;
    let status = resp.status();
    if status.as_u16() == 412 || status.as_u16() == 429 {
        return Err(format!("触发风控 HTTP {}", status.as_u16()));
    }
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("登录状态无效，请重新配置 SESSDATA".into());
    }
    if !status.is_success() {
        return Err(format!("HTTP {}", status.as_u16()));
    }
    let body: serde_json::Value = resp.json().map_err(|e| format!("解析响应失败：{}", e))?;
    let code = body.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code == -412 {
        return Err(body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("触发访问风控")
            .to_string());
    }
    if code != 0 {
        return Err(body
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("接口返回失败")
            .to_string());
    }
    Ok(body)
}

fn fetch_nav(sessdata: &str) -> Result<(Option<String>, Option<i64>), String> {
    let body = bili_get(sessdata, "https://api.bilibili.com/x/web-interface/nav")?;
    let data = body.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let uname = data
        .get("uname")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let mid = data.get("mid").and_then(|v| v.as_i64());
    if mid.unwrap_or(0) <= 0 {
        return Err("未登录或 SESSDATA 无效".into());
    }
    Ok((uname, mid))
}

fn map_history_item(item: &serde_json::Value) -> Option<serde_json::Value> {
    let hist = item.get("history")?;
    let oid = hist.get("oid").cloned().unwrap_or(serde_json::Value::Null);
    let business = hist
        .get("business")
        .and_then(|v| v.as_str())
        .unwrap_or("archive");
    let bvid = hist.get("bvid").and_then(|v| v.as_str()).unwrap_or("");
    let cover = item
        .get("cover")
        .and_then(|v| v.as_str())
        .or_else(|| {
            item.get("covers")
                .and_then(|c| c.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("");
    Some(serde_json::json!({
        "id": oid,
        "business": business,
        "bvid": bvid,
        "cid": hist.get("cid").cloned().unwrap_or(serde_json::Value::Null),
        "title": item.get("title").and_then(|v| v.as_str()).unwrap_or(""),
        "tag_name": item.get("tag_name").cloned().unwrap_or(serde_json::Value::Null),
        "cover": cover,
        "view_at": item.get("view_at").cloned().unwrap_or(serde_json::Value::Null),
        "uri": item.get("uri").and_then(|v| v.as_str()).unwrap_or(""),
        "author_name": item.get("author_name").and_then(|v| v.as_str()).unwrap_or(""),
        "author_mid": item.get("author_mid").and_then(|v| v.as_i64()).unwrap_or(0),
        "progress": item.get("progress").cloned().unwrap_or(serde_json::json!(0)),
        "duration": item.get("duration").cloned().unwrap_or(serde_json::json!(0)),
        "is_fav": item.get("is_fav").and_then(|v| v.as_i64()).unwrap_or(0) == 1,
    }))
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_login_status(app: AppHandle) -> Result<LoginStatus, String> {
    let sess = read_session(&app)?;
    let has_csrf = sess
        .bili_jct
        .as_ref()
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    let Some(s) = sess.sessdata.filter(|x| !x.is_empty()) else {
        return Ok(LoginStatus {
            logged_in: false,
            uname: None,
            mid: None,
            has_csrf,
        });
    };
    match fetch_nav(&s) {
        Ok((uname, mid)) => Ok(LoginStatus {
            logged_in: true,
            uname,
            mid,
            has_csrf,
        }),
        Err(_) => Ok(LoginStatus {
            logged_in: false,
            uname: None,
            mid: None,
            has_csrf,
        }),
    }
}

#[tauri::command]
fn save_sessdata(
    app: AppHandle,
    sessdata: String,
    bili_jct: Option<String>,
) -> Result<LoginStatus, String> {
    let s = sessdata.trim().to_string();
    if s.is_empty() {
        return Err("SESSDATA 不能为空".into());
    }
    let (uname, mid) = fetch_nav(&s)?;
    let mut file = read_session(&app)?;
    file.sessdata = Some(s);
    if let Some(j) = bili_jct {
        let j = j.trim().to_string();
        file.bili_jct = if j.is_empty() { None } else { Some(j) };
    }
    let has_csrf = file
        .bili_jct
        .as_ref()
        .map(|x| !x.is_empty())
        .unwrap_or(false);
    write_session(&app, &file)?;
    Ok(LoginStatus {
        logged_in: true,
        uname,
        mid,
        has_csrf,
    })
}

#[tauri::command]
fn clear_sessdata(app: AppHandle) -> Result<(), String> {
    let mut file = read_session(&app)?;
    file.sessdata = None;
    file.bili_jct = None;
    write_session(&app, &file)
}

#[tauri::command]
fn get_sync_meta(app: AppHandle) -> Result<SyncMeta, String> {
    let s = read_session(&app)?;
    Ok(SyncMeta {
        watermark_view_at: s.watermark_view_at.unwrap_or(0),
        last_sync_at: s.last_sync_at,
    })
}

#[tauri::command]
fn save_sync_meta(
    app: AppHandle,
    watermark_view_at: Option<i64>,
    last_sync_at: Option<i64>,
) -> Result<(), String> {
    let mut s = read_session(&app)?;
    if let Some(w) = watermark_view_at {
        s.watermark_view_at = Some(w);
    }
    if let Some(t) = last_sync_at {
        s.last_sync_at = Some(t);
    }
    write_session(&app, &s)
}

#[tauri::command]
fn fetch_history_page(
    app: AppHandle,
    max: Option<i64>,
    view_at: Option<i64>,
) -> Result<HistoryPageResult, String> {
    let sess = read_session(&app)?
        .sessdata
        .filter(|x| !x.is_empty())
        .ok_or_else(|| "未登录，请先配置 SESSDATA".to_string())?;
    let max = max.unwrap_or(0);
    let view_at = view_at.unwrap_or(0);
    let url = format!(
        "https://api.bilibili.com/x/web-interface/history/cursor?max={}&view_at={}&type=all&ps=30",
        max, view_at
    );
    let body = bili_get(&sess, &url)?;
    let data = body.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let list = data
        .get("list")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let items: Vec<_> = list.iter().filter_map(map_history_item).collect();
    let cursor = data.get("cursor").cloned().unwrap_or(serde_json::Value::Null);
    Ok(HistoryPageResult {
        items,
        cursor_max: cursor.get("max").and_then(|v| v.as_i64()).unwrap_or(0),
        cursor_view_at: cursor.get("view_at").and_then(|v| v.as_i64()).unwrap_or(0),
        is_end: cursor
            .get("is_end")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("history_cache.json"))
}

#[tauri::command]
fn save_local_pack(app: AppHandle, pack: serde_json::Value) -> Result<String, String> {
    let path = cache_path(&app)?;
    let body = serde_json::to_string(&pack).map_err(|e| e.to_string())?;
    fs::write(&path, body).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_local_pack(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = cache_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(val))
}

#[tauri::command]
fn clear_local_pack(app: AppHandle) -> Result<(), String> {
    let path = cache_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Serialize)]
struct BackupDirStatus {
    path: Option<String>,
    last_dir_backup_at: Option<i64>,
}

#[tauri::command]
fn get_backup_dir_status(app: AppHandle) -> Result<BackupDirStatus, String> {
    let s = read_session(&app)?;
    Ok(BackupDirStatus {
        path: s.backup_dir,
        last_dir_backup_at: s.last_dir_backup_at,
    })
}

#[tauri::command]
fn pick_backup_directory(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let folder = app
        .dialog()
        .file()
        .set_title("选择本地备份目录")
        .blocking_pick_folder();
    let Some(path) = folder else {
        return Ok(None);
    };
    let path_str = path.to_string();
    let test = PathBuf::from(&path_str).join(format!(
        ".bilibili-history-write-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    fs::write(&test, b"ok").map_err(|e| format!("目录不可写：{}", e))?;
    let _ = fs::remove_file(&test);
    let mut s = read_session(&app)?;
    s.backup_dir = Some(path_str.clone());
    write_session(&app, &s)?;
    Ok(Some(path_str))
}

#[tauri::command]
fn clear_backup_directory(app: AppHandle) -> Result<(), String> {
    let mut s = read_session(&app)?;
    s.backup_dir = None;
    write_session(&app, &s)
}

fn chrono_like_date() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs / 86400;
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

#[tauri::command]
fn export_pack_to_backup_dir(
    app: AppHandle,
    pack: serde_json::Value,
) -> Result<String, String> {
    let s = read_session(&app)?;
    let dir = s
        .backup_dir
        .filter(|p| !p.is_empty())
        .ok_or_else(|| "请先选择备份目录".to_string())?;
    let dir_path = PathBuf::from(&dir);
    if !dir_path.is_dir() {
        return Err("备份目录不存在，请重新选择".into());
    }
    let date = chrono_like_date();
    let file_name = format!("bilibili-history-backup-{}.json", date);
    let out = dir_path.join(&file_name);
    let body = serde_json::to_string_pretty(&pack).map_err(|e| e.to_string())?;
    fs::write(&out, body).map_err(|e| format!("写入失败：{}", e))?;
    let mut s = read_session(&app)?;
    s.last_dir_backup_at = Some(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
    );
    write_session(&app, &s)?;
    Ok(out.to_string_lossy().to_string())
}

#[tauri::command]
fn export_pack_as_file(
    app: AppHandle,
    pack: serde_json::Value,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let date = chrono_like_date();
    let path = app
        .dialog()
        .file()
        .set_title("导出 JSON 备份")
        .add_filter("JSON", &["json"])
        .set_file_name(&format!("bilibili-history-backup-{}.json", date))
        .blocking_save_file();
    let Some(path) = path else {
        return Ok(None);
    };
    let path_str = path.to_string();
    let body = serde_json::to_string_pretty(&pack).map_err(|e| e.to_string())?;
    fs::write(&path_str, body).map_err(|e| format!("写入失败：{}", e))?;
    Ok(Some(path_str))
}

#[tauri::command]
fn delete_history_item(
    app: AppHandle,
    business: String,
    id: i64,
) -> Result<(), String> {
    let sess = read_session(&app)?;
    let sessdata = sess
        .sessdata
        .filter(|x| !x.is_empty())
        .ok_or_else(|| "未登录，请先配置 SESSDATA".to_string())?;
    let jct = sess
        .bili_jct
        .filter(|x| !x.is_empty())
        .ok_or_else(|| {
            "缺少 bili_jct（CSRF）。请在登录里一并填写，删除历史需要该字段。".to_string()
        })?;
    let kid = format!("{}_{}", business.trim(), id);
    let body = format!("kid={}&csrf={}", kid, jct);
    let c = client()?;
    let resp = c
        .post("https://api.bilibili.com/x/v2/history/delete")
        .header(
            "Cookie",
            format!("SESSDATA={}; bili_jct={}", sessdata, jct),
        )
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("Referer", "https://www.bilibili.com")
        .header("Origin", "https://www.bilibili.com")
        .body(body)
        .send()
        .map_err(|e| format!("网络请求失败：{}", e))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("删除失败 HTTP {}", status.as_u16()));
    }
    let data: serde_json::Value = resp
        .json()
        .map_err(|e| format!("解析响应失败：{}", e))?;
    let code = data.get("code").and_then(|c| c.as_i64()).unwrap_or(-1);
    if code != 0 {
        return Err(data
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("删除 B 站历史记录失败")
            .to_string());
    }
    Ok(())
}

#[tauri::command]
fn fetch_favorite_folders(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let sess = read_session(&app)?;
    let sessdata = sess
        .sessdata
        .filter(|x| !x.is_empty())
        .ok_or_else(|| "未登录，请先配置 SESSDATA".to_string())?;
    let (_, mid) = fetch_nav(&sessdata)?;
    let mid = mid.ok_or_else(|| "无法获取用户 mid".to_string())?;
    let url = format!(
        "https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid={}",
        mid
    );
    let body = bili_get(&sessdata, &url)?;
    let data = body.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let list = data.get("list");
    if list.is_none() || list == Some(&serde_json::Value::Null) {
        return Ok(vec![]);
    }
    let arr = list
        .and_then(|v| v.as_array())
        .ok_or_else(|| "收藏夹数据格式异常".to_string())?;
    let mut out = Vec::new();
    for (index, folder) in arr.iter().enumerate() {
        let mut f = folder.clone();
        if let Some(obj) = f.as_object_mut() {
            if let Some(id) = obj.get("id").and_then(|v| v.as_i64()) {
                obj.insert("id".into(), serde_json::json!(id));
            }
            obj.insert("index".into(), serde_json::json!(index));
        }
        out.push(f);
    }
    Ok(out)
}

#[derive(Serialize)]
struct FavPageResult {
    medias: Vec<serde_json::Value>,
    has_more: bool,
}

#[tauri::command]
fn fetch_favorite_folder_page(
    app: AppHandle,
    media_id: i64,
    pn: Option<i64>,
) -> Result<FavPageResult, String> {
    let sess = read_session(&app)?;
    let sessdata = sess
        .sessdata
        .filter(|x| !x.is_empty())
        .ok_or_else(|| "未登录，请先配置 SESSDATA".to_string())?;
    let pn = pn.unwrap_or(1).max(1);
    let url = format!(
        "https://api.bilibili.com/x/v3/fav/resource/list?media_id={}&pn={}&ps=20",
        media_id, pn
    );
    let body = bili_get(&sessdata, &url)?;
    let data = body.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let medias = data
        .get("medias")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let has_more = data
        .get("has_more")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Ok(FavPageResult { medias, has_more })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_external,
            get_login_status,
            save_sessdata,
            clear_sessdata,
            get_sync_meta,
            save_sync_meta,
            fetch_history_page,
            save_local_pack,
            load_local_pack,
            clear_local_pack,
            get_backup_dir_status,
            pick_backup_directory,
            clear_backup_directory,
            export_pack_to_backup_dir,
            export_pack_as_file,
            delete_history_item,
            fetch_favorite_folders,
            fetch_favorite_folder_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
