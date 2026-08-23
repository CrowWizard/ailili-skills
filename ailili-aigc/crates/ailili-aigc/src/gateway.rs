use std::{
    thread,
    time::{Duration, Instant},
};

use serde_json::{json, Value};

use crate::daemon;

pub fn api_base() -> String {
    std::env::var("AILILI_TOOL_GATEWAY")
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| daemon::daemon_base_url())
}

pub fn is_loopback_base(base: &str) -> bool {
    url_host(base)
        .map(|host| host == "127.0.0.1" || host == "localhost" || host == "::1")
        .unwrap_or(false)
}

fn url_host(base: &str) -> Option<String> {
    let rest = base
        .strip_prefix("http://")
        .or_else(|| base.strip_prefix("https://"))?;
    let host = rest.split(['/', ':']).next()?;
    Some(host.to_string())
}

fn api_key() -> Result<String, String> {
    let key = std::env::var("AILILI_AIGC_TOKEN")
        .ok()
        .or_else(|| std::env::var("AILILI_AGENT_API_KEY").ok())
        .unwrap_or_default();
    if !key.is_empty() {
        return Ok(key);
    }
    if is_loopback_base(&api_base()) {
        return Ok(String::new());
    }
    Err("API Key 未配置".to_string())
}

pub fn ensure_gateway() -> Result<(), String> {
    let base = api_base();
    if health_ok(&base) {
        return Ok(());
    }
    if !is_loopback_base(&base) {
        return Err(format!("gateway {base} is unreachable"));
    }
    daemon::ensure_running()?;
    if health_ok(&base) {
        Ok(())
    } else {
        Err(format!("gateway {base} did not become healthy"))
    }
}

fn health_ok(base: &str) -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .no_proxy()
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };
    client
        .get(format!("{base}/health"))
        .send()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

pub fn post_json(path: &str, body: &Value, timeout_secs: u64) -> Result<Value, String> {
    let key = api_key()?;
    let url = format!("{}{path}", api_base());
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .no_proxy()
        .build()
        .map_err(|error| error.to_string())?;
    let mut request = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "Ailili-AIGC/0.1")
        .header(
            "SESSION_ID",
            std::env::var("SESSION_ID").unwrap_or_default(),
        )
        .json(body);
    if !key.is_empty() {
        request = request.header("Authorization", key);
    }
    let response = request
        .send()
        .map_err(|error| format!("Connection failed: {error}"))?;
    let status = response.status();
    let payload: Value = response.json().unwrap_or_else(|_| json!({}));
    if !status.is_success()
        && payload.get("error").is_none()
        && payload.get("errcode").is_none()
        && payload.get("errorCode").is_none()
    {
        return Ok(json!({"error": format!("HTTP {status}")}));
    }
    Ok(payload)
}

pub fn poll_until_done(path: &str, task_id: &str, member_id: &str, timeout_secs: u64) -> Value {
    let started = Instant::now();
    let mut interval = 10u64;
    while started.elapsed() < Duration::from_secs(600) {
        thread::sleep(Duration::from_secs(interval));
        match post_json(
            path,
            &json!({ "taskId": task_id, "memberId": member_id }),
            timeout_secs,
        ) {
            Ok(result) => {
                if let Some(error) = result.get("error").and_then(Value::as_str) {
                    eprintln!("  Poll error: {error}");
                    interval = interval.saturating_sub(1).max(5);
                    continue;
                }
                match result.get("status").and_then(Value::as_str) {
                    Some("SUCCESS") | Some("FAILED") => return result,
                    other => {
                        eprintln!(
                            "  Polling... status={}, elapsed={}s, next in {interval}s",
                            other.unwrap_or(""),
                            started.elapsed().as_secs()
                        );
                    }
                }
            }
            Err(error) => {
                eprintln!("  Poll error: {error}");
            }
        }
        interval = interval.saturating_sub(1).max(5);
    }
    json!({ "error": "Polling timeout after 600s", "taskId": task_id })
}
