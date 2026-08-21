use base64::Engine;
use gpt_image_2_core::UploadFile;
use std::path::Path;

pub fn fetch_refs(urls: &[String]) -> Result<Vec<UploadFile>, String> {
    if urls.is_empty() {
        return Err("imageUrls must contain at least one URL".to_string());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| error.to_string())?;
    let mut refs = Vec::with_capacity(urls.len());
    for (index, url) in urls.iter().enumerate() {
        let url = url.trim();
        if url.is_empty() {
            return Err("imageUrls contains an empty URL".to_string());
        }
        let bytes = if let Some(rest) = url.strip_prefix("data:") {
            decode_data_url(rest)?
        } else if url.starts_with("http://") || url.starts_with("https://") {
            let response = client
                .get(url)
                .header("User-Agent", "Ailili-AIGC/0.1")
                .send()
                .map_err(|error| format!("failed to download {url}: {error}"))?;
            if !response.status().is_success() {
                return Err(format!(
                    "failed to download {url}: HTTP {}",
                    response.status()
                ));
            }
            response
                .bytes()
                .map_err(|error| format!("failed to read {url}: {error}"))?
                .to_vec()
        } else {
            return Err(format!("unsupported image URL scheme: {url}"));
        };
        if bytes.is_empty() {
            return Err(format!("downloaded empty image from {url}"));
        }
        refs.push(UploadFile {
            name: guess_name(url, index),
            bytes,
        });
    }
    Ok(refs)
}

fn decode_data_url(rest: &str) -> Result<Vec<u8>, String> {
    let (_meta, data) = rest
        .split_once(',')
        .ok_or_else(|| "invalid data URL".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|error| format!("invalid data URL base64: {error}"))
}

fn guess_name(url: &str, index: usize) -> String {
    if url.starts_with("data:image/jpeg") || url.starts_with("data:image/jpg") {
        return format!("ref-{index}.jpg");
    }
    if url.starts_with("data:image/webp") {
        return format!("ref-{index}.webp");
    }
    if let Ok(parsed) = reqwest::Url::parse(url) {
        if let Some(seg) = parsed
            .path_segments()
            .and_then(|mut s| s.next_back())
            .filter(|s| !s.is_empty())
        {
            let ext = Path::new(seg)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");
            return format!("ref-{index}.{ext}");
        }
    }
    format!("ref-{index}.png")
}
