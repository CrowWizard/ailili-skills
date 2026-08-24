use std::io::Read;

use serde_json::{json, Value};

use crate::config;

#[derive(Debug, Clone)]
pub struct TextRequest {
    pub prompt: String,
    pub image_urls: Vec<String>,
}

#[derive(Debug)]
struct ParsedCompletion {
    content: String,
    prompt_tokens: u64,
    completion_tokens: u64,
    total_tokens: u64,
}

pub fn complete(request: &TextRequest) -> Result<Value, String> {
    if let Some(url) = request.image_urls.iter().find(|url| is_video_url(url)) {
        return Err(format!("video URLs are not supported yet: {url}"));
    }
    // Local paths stay paths on the CLI / PowerShell argv. Encode to data: only
    // in this upstream JSON body so Windows CreateProcess does not ENAMETOOLONG.
    let image_urls = request
        .image_urls
        .iter()
        .map(|url| crate::download::to_chat_image_url(url))
        .collect::<Result<Vec<_>, _>>()?;
    let request = TextRequest {
        prompt: request.prompt.clone(),
        image_urls,
    };
    let provider = config::resolve_text_provider()?;
    let url = chat_completions_url(&provider.api_base);
    let body = chat_body(&provider.model, &request);
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(150))
        .build()
        .map_err(|error| error.to_string())?;
    let parsed = crate::retry::retry("textgen", || {
        let mut response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", provider.api_key))
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .json(&body)
            .send()
            .map_err(|error| format!("text provider request failed: {error}"))?;
        let status = response.status();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        let mut bytes = Vec::new();
        response
            .read_to_end(&mut bytes)
            .map_err(|error| format!("text provider stream read failed: {error}"))?;
        let text = String::from_utf8_lossy(&bytes);
        if !status.is_success() {
            let message = error_message_from_body(&text, status);
            return Err(format!("text provider HTTP {status}: {message}"));
        }
        parse_chat_completion(&text, &content_type)
    })?;
    Ok(json!({
        "content": parsed.content,
        "promptTokens": parsed.prompt_tokens,
        "completionTokens": parsed.completion_tokens,
        "totalTokens": parsed.total_tokens,
        "provider": provider.name,
        "model": provider.model,
    }))
}

pub fn chat_body(model: &str, request: &TextRequest) -> Value {
    let content = if request.image_urls.is_empty() {
        json!(request.prompt)
    } else {
        let mut parts = vec![json!({"type": "text", "text": request.prompt})];
        for url in &request.image_urls {
            parts.push(json!({
                "type": "image_url",
                "image_url": { "url": url }
            }));
        }
        json!(parts)
    };
    json!({
        "model": model,
        "stream": true,
        "messages": [{ "role": "user", "content": content }]
    })
}

pub fn chat_completions_url(api_base: &str) -> String {
    let base = api_base.trim().trim_end_matches('/');
    if base.ends_with("/chat/completions") {
        base.to_string()
    } else {
        format!("{base}/chat/completions")
    }
}

fn parse_chat_completion(body: &str, content_type: &str) -> Result<ParsedCompletion, String> {
    let trimmed = body.trim_start_matches('\u{feff}').trim_start();
    if trimmed.is_empty() {
        return Err("text provider returned empty body".to_string());
    }
    let looks_sse = content_type.contains("event-stream")
        || trimmed.starts_with("data:")
        || trimmed.contains("\ndata:");
    if looks_sse {
        return parse_chat_sse(body);
    }
    if trimmed.starts_with('{') {
        return parse_chat_json(body);
    }
    if body.contains("data:") {
        return parse_chat_sse(body);
    }
    Err(format!(
        "text provider returned non-JSON: {}",
        truncate(trimmed, 200)
    ))
}

fn parse_chat_json(body: &str) -> Result<ParsedCompletion, String> {
    let payload: Value = serde_json::from_str(body.trim())
        .map_err(|error| format!("text provider returned non-JSON: {error}"))?;
    if let Some(message) = payload.pointer("/error/message").and_then(Value::as_str) {
        return Err(message.to_string());
    }
    let content = payload
        .pointer("/choices/0/message/content")
        .and_then(content_text)
        .ok_or_else(|| "text provider response missing choices[0].message.content".to_string())?;
    Ok(parsed_from_usage(content, payload.get("usage")))
}

fn parse_chat_sse(body: &str) -> Result<ParsedCompletion, String> {
    let mut content = String::new();
    let mut usage = Value::Null;
    let mut stream_error: Option<String> = None;
    for payload in sse_data_payloads(body) {
        if payload == "[DONE]" {
            break;
        }
        let value: Value = match serde_json::from_str(&payload) {
            Ok(value) => value,
            Err(_) => continue,
        };
        if let Some(message) = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                value
                    .get("error")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
        {
            stream_error = Some(message);
            continue;
        }
        if let Some(next_usage) = value.get("usage").cloned().filter(|value| !value.is_null()) {
            usage = next_usage;
        }
        if let Some(choices) = value.get("choices").and_then(Value::as_array) {
            for choice in choices {
                append_content(
                    &mut content,
                    choice.get("delta").and_then(|delta| delta.get("content")),
                );
                append_content(
                    &mut content,
                    choice
                        .get("message")
                        .and_then(|message| message.get("content")),
                );
            }
        }
    }
    if content.is_empty() {
        return Err(stream_error.unwrap_or_else(|| {
            "text provider stream produced no choices[0].delta.content".to_string()
        }));
    }
    Ok(parsed_from_usage(content, Some(&usage)))
}

fn sse_data_payloads(body: &str) -> Vec<String> {
    let mut payloads = Vec::new();
    let mut data_lines: Vec<String> = Vec::new();
    for line in body.split('\n') {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            if !data_lines.is_empty() {
                payloads.push(data_lines.join("\n"));
                data_lines.clear();
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("data:") {
            data_lines.push(rest.trim_start().to_string());
        }
    }
    if !data_lines.is_empty() {
        payloads.push(data_lines.join("\n"));
    }
    payloads
}

fn append_content(out: &mut String, content: Option<&Value>) {
    if let Some(text) = content.and_then(content_text) {
        out.push_str(&text);
    }
}

fn content_text(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let mut text = String::new();
            for part in parts {
                if let Some(chunk) = part.get("text").and_then(Value::as_str) {
                    text.push_str(chunk);
                } else if let Some(chunk) = part.as_str() {
                    text.push_str(chunk);
                }
            }
            if text.is_empty() {
                None
            } else {
                Some(text)
            }
        }
        _ => None,
    }
}

fn parsed_from_usage(content: String, usage: Option<&Value>) -> ParsedCompletion {
    let usage = usage.unwrap_or(&Value::Null);
    ParsedCompletion {
        content,
        prompt_tokens: usage
            .get("prompt_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        completion_tokens: usage
            .get("completion_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens: usage
            .get("total_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    }
}

fn error_message_from_body(text: &str, status: reqwest::StatusCode) -> String {
    if let Ok(payload) = serde_json::from_str::<Value>(text.trim()) {
        if let Some(message) = payload.pointer("/error/message").and_then(Value::as_str) {
            return message.to_string();
        }
        if let Some(message) = payload.get("message").and_then(Value::as_str) {
            return message.to_string();
        }
    }
    let trimmed = text.trim();
    if trimmed.is_empty() {
        status.as_str().to_string()
    } else {
        truncate(trimmed, 300)
    }
}

fn truncate(text: &str, max: usize) -> String {
    let mut chars = text.chars();
    let head: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}

fn is_video_url(url: &str) -> bool {
    let path = url.split('?').next().unwrap_or(url).to_ascii_lowercase();
    path.ends_with(".mp4")
        || path.ends_with(".webm")
        || path.ends_with(".mov")
        || path.ends_with(".m4v")
        || path.ends_with(".avi")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_multimodal_streaming_body() {
        let body = chat_body(
            "gpt-4.1-mini",
            &TextRequest {
                prompt: "describe".to_string(),
                image_urls: vec!["https://example.com/a.png".to_string()],
            },
        );
        assert_eq!(body["stream"], json!(true));
        assert_eq!(
            body["messages"][0]["content"][1]["image_url"]["url"],
            "https://example.com/a.png"
        );
    }

    #[test]
    fn joins_chat_url() {
        assert_eq!(
            chat_completions_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://example.com/v1/chat/completions"),
            "https://example.com/v1/chat/completions"
        );
    }

    #[test]
    fn parses_sse_deltas() {
        let body = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}],\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":2,\"total_tokens\":5}}\n\n",
            "data: [DONE]\n\n"
        );
        let parsed = parse_chat_sse(body).unwrap();
        assert_eq!(parsed.content, "hello world");
        assert_eq!(parsed.prompt_tokens, 3);
        assert_eq!(parsed.completion_tokens, 2);
        assert_eq!(parsed.total_tokens, 5);
    }

    #[test]
    fn parses_sse_content_parts() {
        let body = "data: {\"choices\":[{\"delta\":{\"content\":[{\"type\":\"text\",\"text\":\"ok\"}]}}]}\n\n";
        let parsed = parse_chat_sse(body).unwrap();
        assert_eq!(parsed.content, "ok");
    }

    #[test]
    fn sse_error_without_content_fails() {
        let body = "data: {\"error\":{\"message\":\"rate limited\"}}\n\n";
        let err = parse_chat_sse(body).unwrap_err();
        assert!(err.contains("rate limited"), "{err}");
    }

    #[test]
    fn falls_back_to_non_stream_json() {
        let body = r#"{"choices":[{"message":{"content":"done"}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}"#;
        let parsed = parse_chat_completion(body, "application/json").unwrap();
        assert_eq!(parsed.content, "done");
        assert_eq!(parsed.total_tokens, 2);
    }
}
