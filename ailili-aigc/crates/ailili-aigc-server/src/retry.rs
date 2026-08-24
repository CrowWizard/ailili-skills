use std::{thread, time::Duration};

pub const DEFAULT_RETRY_COUNT: usize = 3;
pub const DEFAULT_RETRY_DELAY_SECONDS: u64 = 1;

pub fn retry_count() -> usize {
    std::env::var("AILILI_AIGC_RETRY_COUNT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DEFAULT_RETRY_COUNT)
}

pub fn retry_delay_seconds(retry_number: usize) -> u64 {
    let base = std::env::var("AILILI_AIGC_RETRY_DELAY_SECS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DEFAULT_RETRY_DELAY_SECONDS);
    base.saturating_mul(2_u64.pow(retry_number.saturating_sub(1) as u32))
}

pub fn is_transient(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    if lower.contains("enametoolong")
        || lower.contains("prompt is required")
        || lower.contains("unsupported image")
        || lower.contains("invalid data url")
        || lower.contains("invalid json")
        || lower.contains("api key")
    {
        return false;
    }
    if lower.contains("http 429") || lower.contains("status: 429") {
        return true;
    }
    if let Some(code) = http_status(&lower) {
        if code == 429 || (500..600).contains(&code) {
            return true;
        }
        if code == 404 {
            return lower.contains("download");
        }
        return false;
    }
    lower.contains("connection")
        || lower.contains("timeout")
        || lower.contains("timed out")
        || lower.contains("reset")
        || lower.contains("broken pipe")
        || lower.contains("temporarily")
        || lower.contains("unavailable")
        || lower.contains("error sending")
        || lower.contains("dns")
        || lower.contains("tls")
        || lower.contains("eof")
        || lower.contains("connect")
}

fn http_status(lower: &str) -> Option<u16> {
    let mut found = None;
    let mut rest = lower;
    while let Some(idx) = rest.find("http ") {
        let after = &rest[idx + 5..];
        let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
        if digits.len() == 3 {
            found = digits.parse().ok();
        }
        rest = after;
    }
    found
}

pub fn retry<T>(label: &str, mut op: impl FnMut() -> Result<T, String>) -> Result<T, String> {
    let max = retry_count();
    let mut attempt = 0usize;
    loop {
        match op() {
            Ok(value) => return Ok(value),
            Err(error) => {
                if attempt >= max || !is_transient(&error) {
                    return Err(error);
                }
                attempt += 1;
                let delay = retry_delay_seconds(attempt);
                eprintln!(
                    "ailili-aigc: {label} transient ({error}); retry {attempt}/{max} in {delay}s"
                );
                if delay > 0 {
                    thread::sleep(Duration::from_secs(delay));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn classifies_transient_errors() {
        assert!(is_transient("Connection failed: reset"));
        assert!(is_transient("text provider HTTP 502: bad gateway"));
        assert!(is_transient("failed to download http://x: HTTP 429"));
        assert!(is_transient(
            "download http://127.0.0.1:8788/aigc/jobs/1/outputs/0: HTTP 502"
        ));
        assert!(is_transient("timeout"));
        assert!(!is_transient("prompt is required"));
        assert!(!is_transient("HTTP 400: bad request"));
        assert!(!is_transient("ENAMETOOLONG"));
        assert!(!is_transient("unsupported image URL scheme: foo"));
    }

    #[test]
    fn retries_then_succeeds() {
        let _guard = crate::config::ENV_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        std::env::set_var("AILILI_AIGC_RETRY_DELAY_SECS", "0");
        std::env::set_var("AILILI_AIGC_RETRY_COUNT", "3");
        let hits = AtomicUsize::new(0);
        let value = retry("test", || {
            let n = hits.fetch_add(1, Ordering::SeqCst);
            if n < 2 {
                Err("Connection failed".to_string())
            } else {
                Ok(7)
            }
        });
        std::env::remove_var("AILILI_AIGC_RETRY_DELAY_SECS");
        std::env::remove_var("AILILI_AIGC_RETRY_COUNT");
        assert_eq!(value.unwrap(), 7);
        assert_eq!(hits.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn does_not_retry_validation() {
        let hits = AtomicUsize::new(0);
        let err = retry("test", || -> Result<(), String> {
            hits.fetch_add(1, Ordering::SeqCst);
            Err("prompt is required".to_string())
        })
        .unwrap_err();
        assert_eq!(err, "prompt is required");
        assert_eq!(hits.load(Ordering::SeqCst), 1);
    }
}
