use std::io::Read;

use serde_json::{json, Value};

use crate::{gateway, nl, session};

const SLUG: &str = "ailili-aigc-textgen";
const SMALL_THRESHOLD: usize = 8000;

pub fn dispatch(argv: &[String]) -> i32 {
    let stdin = argv.iter().any(|arg| arg == "--stdin");
    let inline = argv.iter().any(|arg| arg == "--inline");
    let content_only = argv.iter().any(|arg| arg == "--content-only");
    let params = match read_params(argv, stdin) {
        Ok(value) => nl::decode_nl_in_value(value),
        Err(code) => return code,
    };
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
    let create = match gateway::post_json("/aigc/textGenAsync", &params, 150) {
        Ok(value) => value,
        Err(error) => {
            println!("{}", json!({"error": error}));
            return 1;
        }
    };
    if create.get("error").is_some() {
        println!("{create}");
        return 1;
    }
    let Some(task_id) = create.get("taskId").and_then(Value::as_str) else {
        println!("{create}");
        return 1;
    };
    eprintln!("Task created: taskId={task_id}");
    let result = nl::encode_content_in_result(gateway::poll_until_done(
        "/aigc/textTaskQuery",
        task_id,
        &member_id,
        150,
    ));
    let failed = is_failure(&result);
    if content_only {
        match nl::extract_content(&result) {
            Some(content) => {
                println!("{content}");
                return i32::from(failed);
            }
            None => {
                eprintln!("ERROR: content field not found in response");
                eprintln!(
                    "{}",
                    serde_json::to_string_pretty(&result).unwrap_or_default()
                );
                return 1;
            }
        }
    }
    if inline {
        println!(
            "{}",
            serde_json::to_string_pretty(&result).unwrap_or_else(|_| result.to_string())
        );
        return i32::from(failed);
    }
    let serialized = serde_json::to_string_pretty(&result).unwrap_or_else(|_| result.to_string());
    if serialized.len() <= SMALL_THRESHOLD {
        println!("{serialized}");
        if nl::extract_content(&result).is_some() {
            eprintln!(
                "# CHAIN-HINT: content 已压平为单行（换行=⏎），可直接提取后内联拼接进下游参数 JSON；\
                 也可用 --content-only 只取文本。下游脚本接收后会自动把 ⏎ 还原为换行符。"
            );
        }
        return i32::from(failed);
    }
    let out_path = session::resolve_data_path(SLUG);
    if let Some(parent) = out_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let saved = match std::fs::write(&out_path, &serialized) {
        Ok(()) => {
            eprintln!(
                "Saved full response: {} ({} bytes)",
                out_path.display(),
                serialized.len()
            );
            Some(out_path.display().to_string())
        }
        Err(error) => {
            eprintln!("Failed to save to {}: {error}", out_path.display());
            None
        }
    };
    println!(
        "{}",
        json!({
            "ok": !failed,
            "truncated": true,
            "savedPath": saved,
            "bytes": serialized.len(),
            "content": nl::extract_content(&result),
        })
    );
    i32::from(failed)
}

fn read_params(argv: &[String], stdin: bool) -> Result<Value, i32> {
    if stdin {
        let mut raw = String::new();
        if let Err(error) = std::io::stdin().read_to_string(&mut raw) {
            eprintln!("Invalid JSON from stdin: {error}");
            return Err(1);
        }
        return serde_json::from_str(&raw).map_err(|error| {
            eprintln!("Invalid JSON from stdin: {error}");
            1
        });
    }
    let remaining: Vec<&str> = argv
        .iter()
        .skip(1)
        .filter(|arg| {
            !matches!(
                arg.as_str(),
                "textgen" | "--stdin" | "--inline" | "--content-only"
            )
        })
        .map(String::as_str)
        .collect();
    if remaining.is_empty() {
        eprintln!(
            "Usage: ailili-aigc textgen '<JSON>' [--inline]\n       ailili-aigc textgen --stdin [--inline] [--content-only]"
        );
        return Err(1);
    }
    serde_json::from_str(remaining[0]).map_err(|error| {
        eprintln!("Invalid parameter format: {error}");
        1
    })
}

fn is_failure(result: &Value) -> bool {
    if result.get("error").is_some() {
        return true;
    }
    for key in ["errcode", "errorCode", "code"] {
        if let Some(code) = result.get(key) {
            let ok = code.as_u64() == Some(200)
                || code.as_i64() == Some(200)
                || code.as_str() == Some("200");
            if !code.is_null() && !ok {
                return true;
            }
        }
    }
    matches!(result.get("status").and_then(Value::as_str), Some("FAILED"))
        || result.get("status").and_then(Value::as_u64) == Some(4)
}
