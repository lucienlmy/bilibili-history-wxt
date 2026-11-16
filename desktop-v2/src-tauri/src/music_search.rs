use serde_json::{json, Value};

#[tauri::command]
pub fn fetch_music_search_page(
    keyword: String,
    page: Option<i64>,
) -> Result<Vec<Value>, String> {
    let keyword = keyword.trim();

    if keyword.is_empty() {
        return Err("请输入歌曲名称或关键词".to_string());
    }

    let page = page.unwrap_or(1).max(1);
    let page_string = page.to_string();

    let client = reqwest::blocking::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("创建网络请求失败：{}", e))?;

    let response = client
        .get("https://api.bilibili.com/x/web-interface/search/type")
        .header(
            reqwest::header::REFERER,
            "https://www.bilibili.com/",
        )
        .query(&[
            ("search_type", "video"),
            ("keyword", keyword),
            ("page", page_string.as_str()),
            ("page_size", "20"),
        ])
        .send()
        .map_err(|e| format!("搜索请求失败：{}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "搜索接口 HTTP {}",
            response.status().as_u16()
        ));
    }

    let body: Value = response
        .json()
        .map_err(|e| format!("解析搜索结果失败：{}", e))?;

    let code = body
        .get("code")
        .and_then(Value::as_i64)
        .unwrap_or(-1);

    if code != 0 {
        let message = body
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("B站搜索接口返回错误");

        return Err(message.to_string());
    }

    let results = body
        .get("data")
        .and_then(|v| v.get("result"))
        .and_then(Value::as_array)
        .ok_or_else(|| "搜索结果格式异常".to_string())?;

    let items = results
        .iter()
        .filter_map(|item| {
            let bvid = item
                .get("bvid")?
                .as_str()?
                .to_string();

            let title = item
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("未命名")
                .to_string();

            let author = item
                .get("author")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            let cover = item
                .get("pic")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            let duration = item
                .get("duration")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            let play = item
                .get("play")
                .and_then(Value::as_i64)
                .unwrap_or(0);

            Some(json!({
                "bvid": bvid,
                "title": title,
                "author": author,
                "cover": cover,
                "duration": duration,
                "play": play
            }))
        })
        .collect();

    Ok(items)
}
