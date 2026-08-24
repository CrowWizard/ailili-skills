use std::{fs, path::Path, path::PathBuf};

use base64::Engine;
use gpt_image_2_core::UploadFile;

pub fn fetch_refs(urls: &[String]) -> Result<Vec<UploadFile>, String> {
    if urls.is_empty() {
        return Err("imageUrls must contain at least one URL".to_string());
    }
    let mut refs = Vec::with_capacity(urls.len());
    for (index, url) in urls.iter().enumerate() {
        let url = url.trim();
        if url.is_empty() {
            return Err("imageUrls contains an empty URL".to_string());
        }
        let bytes = read_source_bytes(url)?;
        if bytes.is_empty() {
            return Err(format!("empty image from {url}"));
        }
        refs.push(UploadFile {
            name: guess_name(url, index),
            bytes,
        });
    }
    Ok(refs)
}

/// Turn a local path / file URL into a data URL so remote chat APIs can see it.
/// http(s) and data: are passed through.
pub fn to_chat_image_url(source: &str) -> Result<String, String> {
    let source = source.trim();
    if source.starts_with("http://")
        || source.starts_with("https://")
        || source.starts_with("data:")
    {
        return Ok(source.to_string());
    }
    let bytes = read_source_bytes(source)?;
    let mime = guess_mime(source, &bytes);
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

pub fn read_source_bytes(source: &str) -> Result<Vec<u8>, String> {
    let source = source.trim();
    if let Some(rest) = source.strip_prefix("data:") {
        return decode_data_url(rest);
    }
    if source.starts_with("http://") || source.starts_with("https://") {
        return download_http(source);
    }
    let path = local_path(source)?;
    fs::read(&path).map_err(|error| format!("failed to read {}: {error}", path.display()))
}

fn download_http(url: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .no_proxy()
        .build()
        .map_err(|error| error.to_string())?;
    crate::retry::retry("download_ref", || {
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
        Ok(response
            .bytes()
            .map_err(|error| format!("failed to read {url}: {error}"))?
            .to_vec())
    })
}

fn local_path(source: &str) -> Result<PathBuf, String> {
    if source.starts_with("file:") {
        let parsed = reqwest::Url::parse(source)
            .map_err(|error| format!("invalid file URL {source}: {error}"))?;
        return parsed
            .to_file_path()
            .map_err(|_| format!("invalid file URL {source}"));
    }
    let path = PathBuf::from(source);
    if path.is_file() || looks_like_path(source) {
        return Ok(path);
    }
    Err(format!("unsupported image URL scheme: {source}"))
}

fn looks_like_path(source: &str) -> bool {
    if source.starts_with('/') || source.starts_with('\\') {
        return true;
    }
    let bytes = source.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

fn decode_data_url(rest: &str) -> Result<Vec<u8>, String> {
    let (_meta, data) = rest
        .split_once(',')
        .ok_or_else(|| "invalid data URL".to_string())?;
    base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|error| format!("invalid data URL base64: {error}"))
}

fn guess_mime(source: &str, bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return "image/png";
    }
    if bytes.starts_with(b"\xff\xd8\xff") {
        return "image/jpeg";
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return "image/webp";
    }
    match Path::new(source)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

fn guess_name(url: &str, index: usize) -> String {
    if url.starts_with("data:image/jpeg") || url.starts_with("data:image/jpg") {
        return format!("ref-{index}.jpg");
    }
    if url.starts_with("data:image/webp") {
        return format!("ref-{index}.webp");
    }
    if let Ok(path) = local_path(url) {
        if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
            return format!("ref-{index}-{name}");
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::TINY_PNG;

    #[test]
    fn reads_local_file_path() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("product.png");
        fs::write(&path, TINY_PNG).unwrap();
        let refs = fetch_refs(&[path.display().to_string()]).unwrap();
        assert_eq!(refs[0].bytes, TINY_PNG);
        assert!(refs[0].name.contains("product.png"));
    }

    #[test]
    fn reads_file_url() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ref.png");
        fs::write(&path, TINY_PNG).unwrap();
        let url = reqwest::Url::from_file_path(&path).unwrap();
        let refs = fetch_refs(&[url.to_string()]).unwrap();
        assert_eq!(refs[0].bytes, TINY_PNG);
    }

    #[test]
    fn rejects_missing_local_file() {
        let err = fetch_refs(&["/no/such/ailili-ref.png".to_string()]).unwrap_err();
        assert!(err.contains("failed to read"), "{err}");
    }

    #[test]
    fn chat_url_keeps_https() {
        assert_eq!(
            to_chat_image_url("https://example.com/a.png").unwrap(),
            "https://example.com/a.png"
        );
    }

    #[test]
    fn chat_url_encodes_local_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.png");
        fs::write(&path, TINY_PNG).unwrap();
        let encoded = to_chat_image_url(&path.display().to_string()).unwrap();
        assert!(encoded.starts_with("data:image/png;base64,"));
    }
}
