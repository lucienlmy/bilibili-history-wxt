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
}

#[derive(Serialize, Deserialize, Default, Clone)]
struct SessionFile {
    sessdata: Option<String>,
    watermark_view_at: Option<i64>,
    last_sync_at: Option<i64>,
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
    let Some(s) = sess.sessdata.filter(|x| !x.is_empty()) else {
        return Ok(LoginStatus {
            logged_in: false,
            uname: None,
            mid: None,
        });
    };
    match fetch_nav(&s) {
        Ok((uname, mid)) => Ok(LoginStatus {
            logged_in: true,
            uname,
            mid,
        }),
        Err(_) => Ok(LoginStatus {
            logged_in: false,
            uname: None,
            mid: None,
        }),
    }
}

#[tauri::command]
fn save_sessdata(app: AppHandle, sessdata: String) -> Result<LoginStatus, String> {
    let s = sessdata.trim().to_string();
    if s.is_empty() {
        return Err("SESSDATA 不能为空".into());
    }
    let (uname, mid) = fetch_nav(&s)?;
    let mut file = read_session(&app)?;
    file.sessdata = Some(s);
    write_session(&app, &file)?;
    Ok(LoginStatus {
        logged_in: true,
        uname,
        mid,
    })
}

#[tauri::command]
fn clear_sessdata(app: AppHandle) -> Result<(), String> {
    let mut file = read_session(&app)?;
    file.sessdata = None;
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
            fetch_history_page
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
