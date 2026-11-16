#[derive(Serialize)]
struct CollectedPageResult {
    list: Vec<serde_json::Value>,
    count: i64,
    has_more: bool,
}

/// 订阅合集目录（扩展：x/v3/fav/folder/collected/list）
#[tauri::command]
fn fetch_collected_folders_page(
    app: AppHandle,
    pn: Option<i64>,
) -> Result<CollectedPageResult, String> {
    let sess = read_session(&app)?;
    let sessdata = sess
        .sessdata
        .filter(|x| !x.is_empty())
        .ok_or_else(|| "未登录，请先配置 SESSDATA".to_string())?;
    let (_, mid) = fetch_nav(&sessdata)?;
    let mid = mid.ok_or_else(|| "无法获取用户 mid".to_string())?;
    let pn = pn.unwrap_or(1).max(1);
    let url = format!(
        "https://api.bilibili.com/x/v3/fav/folder/collected/list?pn={}&ps=50&up_mid={}&platform=web&web_location=333.1387",
        pn, mid
    );
    let body = bili_get(&sessdata, &url)?;
    let data = body.get("data").cloned().unwrap_or(serde_json::Value::Null);
    let count = data.get("count").and_then(|v| v.as_i64()).unwrap_or(0);
    let list = data
        .get("list")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let has_more = (pn * 50) < count && !list.is_empty();
    Ok(CollectedPageResult {
        list,
        count,
        has_more,
    })
}

#[derive(Serialize)]
struct SeasonPageResult {
    medias: Vec<serde_json::Value>,
    has_more: bool,
}

/// 某个订阅合集内的视频（扩展：x/space/fav/season/list）
#[tauri::command]
fn fetch_season_page(
    app: AppHandle,
    season_id: i64,
    pn: Option<i64>,
) -> Result<SeasonPageResult, String> {
    let sess = read_session(&app)?;
    let sessdata = sess
        .sessdata
        .filter(|x| !x.is_empty())
        .ok_or_else(|| "未登录，请先配置 SESSDATA".to_string())?;
    let pn = pn.unwrap_or(1).max(1);
    let url = format!(
        "https://api.bilibili.com/x/space/fav/season/list?season_id={}&pn={}&ps=30",
        season_id, pn
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
    Ok(SeasonPageResult { medias, has_more })
}
