use serde_json::Value;

pub const NL_PLACEHOLDER: char = '⏎';

pub fn encode_nl(text: &str) -> String {
    text.replace("\\r\\n", &NL_PLACEHOLDER.to_string())
        .replace("\\n", &NL_PLACEHOLDER.to_string())
        .replace("\\r", &NL_PLACEHOLDER.to_string())
        .replace("\r\n", &NL_PLACEHOLDER.to_string())
        .replace('\r', &NL_PLACEHOLDER.to_string())
        .replace('\n', &NL_PLACEHOLDER.to_string())
}

pub fn decode_nl(text: &str) -> String {
    text.replace(NL_PLACEHOLDER, "\n")
}

pub fn decode_nl_in_value(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(decode_nl(&text)),
        Value::Array(items) => Value::Array(items.into_iter().map(decode_nl_in_value).collect()),
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(k, v)| (k, decode_nl_in_value(v)))
                .collect(),
        ),
        other => other,
    }
}

pub fn encode_content_in_result(mut result: Value) -> Value {
    if let Some(content) = result.get("content").and_then(Value::as_str) {
        let encoded = encode_nl(content);
        result["content"] = Value::String(encoded);
        return result;
    }
    for key in ["data", "result"] {
        if let Some(content) = result
            .get(key)
            .and_then(|inner| inner.get("content"))
            .and_then(Value::as_str)
        {
            let encoded = encode_nl(content);
            result[key]["content"] = Value::String(encoded);
            break;
        }
    }
    result
}

pub fn extract_content(result: &Value) -> Option<String> {
    if let Some(content) = result.get("content").and_then(Value::as_str) {
        return Some(content.to_string());
    }
    for key in ["data", "result"] {
        if let Some(content) = result
            .get(key)
            .and_then(|inner| inner.get("content"))
            .and_then(Value::as_str)
        {
            return Some(content.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn flattens_and_restores_newlines() {
        assert_eq!(encode_nl("a\nb"), "a⏎b");
        assert_eq!(decode_nl("a⏎b"), "a\nb");
        let value = decode_nl_in_value(json!({"prompt": "a⏎b"}));
        assert_eq!(value["prompt"], "a\nb");
    }
}
