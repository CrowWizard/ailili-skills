use serde_json::{json, Value};

use crate::{gateway, nl, session};

const SLUG: &str = "ailili-aigc-imagegen";

pub fn dispatch(argv: &[String]) -> i32 {
    let args: Vec<&str> = argv
        .iter()
        .skip(1)
        .filter(|arg| arg.as_str() != "imagegen" && *arg != "--inline")
        .map(String::as_str)
        .collect();
    if args.is_empty() {
        eprintln!("Usage: ailili-aigc imagegen '<JSON>'");
        return 1;
    }
    let mut params: Value = match serde_json::from_str(args[0]) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("Invalid parameter format: {error}");
            return 1;
        }
    };
    params = nl::decode_nl_in_value(params);
    let member_id = params
        .get("memberId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if let Err(error) = gateway::ensure_gateway() {
        eprintln!("{error}");
        println!("{}", json!({"error": error}));
        return 1;
    }
    let create = match gateway::post_json("/aigc/imageGenAsync", &params, 150) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", json!({"error": error}));
            return 1;
        }
    };
    if create.get("error").is_some() {
        println!("{}", create);
        return 1;
    }
    let Some(task_id) = create.get("taskId").and_then(Value::as_str) else {
        println!("{create}");
        return 1;
    };
    let cost_token = create.get("costToken").cloned().unwrap_or(json!(0));
    eprintln!("Task created: taskId={task_id}, costToken={cost_token}");
    let mut result = gateway::poll_until_done("/aigc/taskQuery", task_id, &member_id, 150);
    result["costToken"] = cost_token;
    let media_paths = download_results(&result);
    let serialized = serde_json::to_string_pretty(&result).unwrap_or_else(|_| result.to_string());
    let out_path = session::resolve_data_path(SLUG);
    if let Some(parent) = out_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(error) = std::fs::write(&out_path, &serialized) {
        eprintln!(
            "Failed to save raw response to {}: {error}",
            out_path.display()
        );
    }
    if media_paths.is_empty() {
        println!(
            "Saved full response: {} ({} bytes)",
            out_path.display(),
            serialized.len()
        );
        summarize(&result);
    } else {
        println!(
            "Saved full response: {}",
            serde_json::to_string(&media_paths).unwrap_or_else(|_| "[]".into())
        );
    }
    0
}

fn download_results(result: &Value) -> Vec<String> {
    let Some(list) = result.get("resultList").and_then(Value::as_array) else {
        return Vec::new();
    };
    let mut paths = Vec::new();
    for item in list {
        if let Some(url) = item.get("url").and_then(Value::as_str) {
            match session::download_media(url, SLUG) {
                Some(path) => paths.push(path.display().to_string()),
                None => eprintln!("  Download failed: {url}"),
            }
        }
    }
    paths
}

fn summarize(result: &Value) {
    if let Some(obj) = result.as_object() {
        println!(
            "Top-level keys: {}",
            obj.keys().cloned().collect::<Vec<_>>().join(",")
        );
    }
}
