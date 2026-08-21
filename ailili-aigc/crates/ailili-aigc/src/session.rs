use std::{
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Value};

fn now_secs() -> SystemTime {
    SystemTime::now()
}

fn micros(ts: SystemTime) -> u128 {
    ts.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros()
}

fn format_iso(ts: SystemTime) -> String {
    let secs = ts.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let dt = chrono_naive(secs);
    dt
}

fn chrono_naive(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let tod = secs.rem_euclid(86400);
    let (y, m, d) = civil_from_days(days);
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    let ss = tod % 60;
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}+0000")
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

fn date_str(ts: SystemTime) -> String {
    let secs = ts.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let (y, m, d) = civil_from_days(secs.div_euclid(86400));
    format!("{y:04}-{m:02}-{d:02}")
}

fn session_id(ts: SystemTime) -> String {
    if let Ok(env_id) = env::var("SESSION_ID") {
        let trimmed = env_id.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let secs = ts.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    let tod = secs.rem_euclid(86400);
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    let ss = tod % 60;
    format!(
        "{hh:02}{mm:02}{ss:02}-{:06x}",
        (micros(ts) % 0xffffff) as u32
    )
}

fn linkfox_root() -> PathBuf {
    let mut candidates = Vec::new();
    if let Ok(acpx) = env::var("ACPX_WORKSPACES") {
        if let Some(first) = env::split_paths(&acpx).next() {
            if !first.as_os_str().is_empty() {
                candidates.push(first.join("linkfox"));
            }
        }
    }
    candidates.push(
        env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("linkfox"),
    );
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        candidates.push(PathBuf::from(home).join("linkfox"));
    }
    candidates.push(env::temp_dir().join("linkfox"));
    for root in &candidates {
        if fs::create_dir_all(root).is_ok() {
            let probe = root.join(".write_probe");
            if fs::write(&probe, "").is_ok() {
                let _ = fs::remove_file(&probe);
                return root.canonicalize().unwrap_or_else(|_| root.clone());
            }
        }
    }
    candidates
        .last()
        .cloned()
        .unwrap_or_else(|| PathBuf::from("linkfox"))
}

fn ensure_meta(root: &Path, session_dir: &Path, date: &str, sid: &str, ts: SystemTime) {
    let meta_path = session_dir.join("_meta.json");
    if meta_path.exists() {
        return;
    }
    let meta = json!({
        "session_id": sid,
        "date": date,
        "started_at": format_iso(ts),
        "skills_called": [],
        "deliverables": [],
        "data_files": [],
        "media_files": [],
    });
    let _ = fs::write(
        &meta_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&meta).unwrap_or_default()
        ),
    );
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(root.join("index.jsonl"))
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(
                f,
                "{}",
                json!({
                    "session_id": sid,
                    "date": date,
                    "path": session_dir.strip_prefix(root).unwrap_or(session_dir).display().to_string(),
                    "started_at": format_iso(ts),
                })
            )
        });
}

fn update_meta(session_dir: &Path, skill: &str, kind: &str, file_rel: &str, ts: SystemTime) {
    let meta_path = session_dir.join("_meta.json");
    let mut meta: Value = fs::read_to_string(&meta_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_else(|| json!({}));
    let called = meta
        .as_object_mut()
        .map(|obj| obj.entry("skills_called").or_insert_with(|| json!([])));
    if let Some(Value::Array(list)) = called {
        if !list.iter().any(|item| item.as_str() == Some(skill)) {
            list.push(json!(skill));
        }
    }
    let bucket = match kind {
        "media" => "media_files",
        "deliverable" => "deliverables",
        _ => "data_files",
    };
    if let Some(obj) = meta.as_object_mut() {
        let files = obj.entry(bucket).or_insert_with(|| json!([]));
        if let Value::Array(list) = files {
            if !list.iter().any(|item| item.as_str() == Some(file_rel)) {
                list.push(json!(file_rel));
            }
        }
        obj.insert("last_used_at".into(), json!(format_iso(ts)));
    }
    let _ = fs::write(
        meta_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&meta).unwrap_or_default()
        ),
    );
}

fn ensure_session(ts: SystemTime) -> PathBuf {
    let date = date_str(ts);
    let sid = session_id(ts);
    let root = linkfox_root();
    let session_dir = root.join(&date).join(&sid);
    let _ = fs::create_dir_all(&session_dir);
    ensure_meta(&root, &session_dir, &date, &sid, ts);
    session_dir
}

pub fn resolve_data_path(slug: &str) -> PathBuf {
    let ts = now_secs();
    let session_dir = ensure_session(ts);
    let sub = session_dir.join("data");
    let _ = fs::create_dir_all(&sub);
    let out = sub.join(format!("{slug}-{}.json", micros(ts)));
    let rel = out
        .strip_prefix(&session_dir)
        .unwrap_or(&out)
        .to_string_lossy()
        .replace('\\', "/");
    update_meta(&session_dir, slug, "data", &rel, ts);
    out
}

pub fn download_media(url: &str, slug: &str) -> Option<PathBuf> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        eprintln!(
            "[download_media] Unsupported URL scheme: {}",
            &url[..url.len().min(80)]
        );
        return None;
    }
    let ts = now_secs();
    let session_dir = ensure_session(ts);
    let media_dir = session_dir.join("media");
    if fs::create_dir_all(&media_dir).is_err() {
        return None;
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .no_proxy()
        .build()
        .ok()?;
    let response = client
        .get(url)
        .header("User-Agent", "Ailili-AIGC/0.1")
        .send()
        .ok()?;
    if !response.status().is_success() {
        eprintln!(
            "[download_media] Failed to download {url}: HTTP {}",
            response.status()
        );
        return None;
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = response.bytes().ok()?;
    let ext = guess_ext(url, &content_type);
    let out = media_dir.join(format!("{slug}-{}.{ext}", micros(ts)));
    if fs::write(&out, &bytes).is_err() {
        return None;
    }
    let rel = out
        .strip_prefix(&session_dir)
        .unwrap_or(&out)
        .to_string_lossy()
        .replace('\\', "/");
    update_meta(&session_dir, slug, "media", &rel, ts);
    Some(out)
}

fn guess_ext(url: &str, content_type: &str) -> String {
    let path = url.split('?').next().unwrap_or(url);
    if let Some(ext) = Path::new(path).extension().and_then(|e| e.to_str()) {
        if ext.len() <= 5 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
            return ext.to_ascii_lowercase();
        }
    }
    if content_type.contains("png") {
        "png".into()
    } else if content_type.contains("jpeg") || content_type.contains("jpg") {
        "jpg".into()
    } else if content_type.contains("webp") {
        "webp".into()
    } else if content_type.contains("gif") {
        "gif".into()
    } else {
        "bin".into()
    }
}
