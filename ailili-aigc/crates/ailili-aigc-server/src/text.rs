use serde_json::{json, Value};

use crate::config;

#[derive(Debug, Clone)]
pub struct TextRequest {
    pub prompt: String,
    pub image_urls: Vec<String>,
}

pub fn complete(request: &TextRequest) -> Result<Value, String> {
    if let Some(url) = request.image_urls.iter().find(|url| is_video_url(url)) {
        return Err(format!("video URLs are not supported yet: {url}"));
    }
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
    let payload = crate::retry::retry("textgen", || {
        let response = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", provider.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .map_err(|error| format!("text provider request failed: {error}"))?;
        let status = response.status();
        let payload: Value = response
            .json()
            .map_err(|error| format!("text provider returned non-JSON: {error}"))?;
        if !status.is_success() {
            let message = payload
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or_else(|| status.as_str());
            return Err(format!("text provider HTTP {status}: {message}"));
        }
        Ok(payload)
    })?;
    let content = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "text provider response missing choices[0].message.content".to_string())?;
    let usage = payload.get("usage").cloned().unwrap_or(Value::Null);
    Ok(json!({
        "content": content,
        "promptTokens": usage.get("prompt_tokens").and_then(Value::as_u64).unwrap_or(0),
        "completionTokens": usage.get("completion_tokens").and_then(Value::as_u64).unwrap_or(0),
        "totalTokens": usage.get("total_tokens").and_then(Value::as_u64).unwrap_or(0),
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
    fn builds_multimodal_body() {
        let body = chat_body(
            "gpt-4.1-mini",
            &TextRequest {
                prompt: "describe".to_string(),
                image_urls: vec!["https://example.com/a.png".to_string()],
            },
        );
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
}
