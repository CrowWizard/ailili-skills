use std::{
    fs::OpenOptions,
    io::Write,
    time::{SystemTime, UNIX_EPOCH},
};

use serde_json::{json, Map, Value};

pub fn emit(event: &str, fields: Value) {
    let path = match std::env::var("AILILI_TRACE_FILE") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return,
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let mut obj = Map::new();
    obj.insert(
        "ts".into(),
        json!(format!("{}.{:03}Z", now.as_secs(), now.subsec_millis())),
    );
    obj.insert("t".into(), json!(now.as_millis() as u64));
    obj.insert("pid".into(), json!(std::process::id()));
    obj.insert("event".into(), json!(event));
    if let Value::Object(extra) = fields {
        for (key, value) in extra {
            obj.insert(key, value);
        }
    }
    let line = format!("{}\n", Value::Object(obj));
    let _ = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .and_then(|mut file| file.write_all(line.as_bytes()));
}
