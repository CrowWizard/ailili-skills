use std::{collections::BTreeMap, fs, path::PathBuf};

use serde::Deserialize;
use serde_json::{json, Map, Value};

#[derive(Debug, Clone)]
pub struct ResolvedTextProvider {
    pub name: String,
    pub api_base: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Deserialize, Default)]
struct FileConfig {
    #[serde(default)]
    default_provider: Option<String>,
    #[serde(default)]
    default_image_provider: Option<String>,
    #[serde(default)]
    default_text_provider: Option<String>,
    #[serde(default)]
    providers: BTreeMap<String, FileProvider>,
}

#[derive(Debug, Deserialize, Default)]
struct FileProvider {
    #[serde(rename = "type", default)]
    provider_type: String,
    #[serde(default)]
    capability: Option<String>,
    #[serde(default)]
    api_base: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    credentials: BTreeMap<String, FileCredential>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "source", rename_all = "lowercase")]
enum FileCredential {
    Env {
        env: String,
    },
    File {
        value: String,
    },
    Keychain {
        #[allow(dead_code)]
        service: Option<String>,
        #[allow(dead_code)]
        account: String,
    },
}

pub fn data_home() -> PathBuf {
    if let Ok(value) = std::env::var("AILILI_AIGC_HOME") {
        let value = value.trim();
        if !value.is_empty() {
            return PathBuf::from(value);
        }
    }
    if let Ok(codex) = std::env::var("CODEX_HOME") {
        let codex = codex.trim();
        if !codex.is_empty() {
            return PathBuf::from(codex).join("ailili-aigc");
        }
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(".ailili-aigc")
}

pub fn config_path() -> PathBuf {
    data_home().join("config.json")
}

pub fn jobs_dir() -> PathBuf {
    data_home().join("jobs")
}

/// Point gpt-image-2 config/history at `$AILILI_AIGC_HOME` and, if needed,
/// copy image providers from `$CODEX_HOME/gpt-image-2-skill/config.json`.
pub fn bind_runtime_paths() {
    import_legacy_image_config();
    normalize_image_default_alias();
    let home = data_home();
    let _ = fs::create_dir_all(&home);
    std::env::set_var("GPT_IMAGE_2_CONFIG_FILE", config_path());
    std::env::set_var("GPT_IMAGE_2_HISTORY_FILE", home.join("history.sqlite"));
}

pub fn resolve_image_provider_name() -> Result<Option<String>, String> {
    let Some((path, parsed)) = load_file_config()? else {
        return Ok(None);
    };
    if let Some(name) = image_default_name(&parsed) {
        let provider = parsed.providers.get(&name).ok_or_else(|| {
            format!(
                "default image provider {name:?} is not in {}",
                path.display()
            )
        })?;
        if !is_image_capable(provider) {
            return Err(format!(
                "provider {name:?} has capability {:?} and cannot be used for images",
                provider.capability
            ));
        }
        return Ok(Some(name));
    }
    let mut image_names: Vec<String> = parsed
        .providers
        .iter()
        .filter(|(_, provider)| is_image_capable(provider))
        .map(|(name, _)| name.clone())
        .collect();
    if image_names.len() == 1 {
        return Ok(Some(image_names.pop().unwrap()));
    }
    Ok(None)
}

pub fn resolve_text_provider() -> Result<ResolvedTextProvider, String> {
    let path = config_path();
    if let Some((path, parsed)) = load_file_config()? {
        if let Some(name) = nonempty(&parsed.default_text_provider) {
            let provider = parsed.providers.get(&name).ok_or_else(|| {
                format!(
                    "default_text_provider {name:?} is not in {}",
                    path.display()
                )
            })?;
            if !is_text_capable(provider) {
                return Err(format!(
                    "provider {name:?} has capability {:?} and cannot be used for text",
                    provider.capability
                ));
            }
            if !provider.provider_type.is_empty()
                && provider.provider_type != "openai-compatible"
                && provider.provider_type != "openai"
            {
                return Err(format!(
                    "text provider {name:?} type {:?} is not supported yet",
                    provider.provider_type
                ));
            }
            return Ok(ResolvedTextProvider {
                name,
                api_base: provider
                    .api_base
                    .clone()
                    .unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
                model: provider
                    .model
                    .clone()
                    .unwrap_or_else(|| "gpt-4.1-mini".to_string()),
                api_key: credential_value(provider)?,
            });
        }
    }
    let api_key = std::env::var("OPENAI_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "no text provider: set default_text_provider in {} or OPENAI_API_KEY",
                path.display()
            )
        })?;
    Ok(ResolvedTextProvider {
        name: "openai-env".to_string(),
        api_base: std::env::var("OPENAI_API_BASE")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
        model: std::env::var("OPENAI_TEXT_MODEL")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "gpt-4.1-mini".to_string()),
        api_key,
    })
}

fn load_file_config() -> Result<Option<(PathBuf, FileConfig)>, String> {
    let path = config_path();
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("unable to read {}: {error}", path.display()))?;
    let parsed: FileConfig = serde_json::from_str(&raw)
        .map_err(|error| format!("invalid {}: {error}", path.display()))?;
    Ok(Some((path, parsed)))
}

fn image_default_name(parsed: &FileConfig) -> Option<String> {
    nonempty(&parsed.default_image_provider).or_else(|| nonempty(&parsed.default_provider))
}

fn nonempty(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
}

fn capability(provider: &FileProvider) -> &str {
    provider.capability.as_deref().map(str::trim).unwrap_or("")
}

fn is_image_capable(provider: &FileProvider) -> bool {
    matches!(capability(provider), "" | "image" | "both")
}

fn is_text_capable(provider: &FileProvider) -> bool {
    matches!(capability(provider), "" | "text" | "both")
}

fn credential_value(provider: &FileProvider) -> Result<String, String> {
    if let Some(credential) = provider.credentials.get("api_key") {
        return match credential {
            FileCredential::Env { env } => std::env::var(env)
                .map_err(|_| format!("environment variable {env} is not set"))
                .map(|value| value.trim().to_string())
                .and_then(|value| {
                    if value.is_empty() {
                        Err(format!("environment variable {env} is empty"))
                    } else {
                        Ok(value)
                    }
                }),
            FileCredential::File { value } => {
                let value = value.trim();
                if value.is_empty() {
                    Err("credentials.api_key.value is empty".to_string())
                } else {
                    Ok(value.to_string())
                }
            }
            FileCredential::Keychain { .. } => {
                Err("text provider keychain credentials are not supported yet".to_string())
            }
        };
    }
    std::env::var("OPENAI_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "text provider is missing api_key credentials".to_string())
}

fn resolve_codex_home() -> PathBuf {
    if let Ok(value) = std::env::var("CODEX_HOME") {
        let value = value.trim();
        if !value.is_empty() {
            return PathBuf::from(value);
        }
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".codex")
}

fn legacy_gpt_image2_config_path() -> PathBuf {
    resolve_codex_home()
        .join("gpt-image-2-skill")
        .join("config.json")
}

fn read_json_object(path: &PathBuf) -> Option<Map<String, Value>> {
    let raw = fs::read_to_string(path).ok()?;
    match serde_json::from_str::<Value>(&raw).ok()? {
        Value::Object(map) => Some(map),
        _ => None,
    }
}

fn json_nonempty_str(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
}

fn import_legacy_image_config() {
    let dest_path = config_path();
    let src_path = legacy_gpt_image2_config_path();
    if !src_path.is_file() {
        return;
    }
    let Some(src) = read_json_object(&src_path) else {
        return;
    };
    let mut dest = if dest_path.is_file() {
        match read_json_object(&dest_path) {
            Some(map) => map,
            None => return,
        }
    } else {
        let mut map = Map::new();
        map.insert("version".to_string(), json!(1));
        map
    };
    let dest_has_image = json_nonempty_str(dest.get("default_image_provider")).is_some()
        || json_nonempty_str(dest.get("default_provider")).is_some();
    if dest_has_image {
        return;
    }
    if let Some(name) = json_nonempty_str(src.get("default_provider")) {
        dest.insert("default_provider".to_string(), json!(name.clone()));
        dest.insert("default_image_provider".to_string(), json!(name));
    }
    if !dest.contains_key("providers") {
        dest.insert("providers".to_string(), json!({}));
    }
    if let (Some(Value::Object(dest_providers)), Some(Value::Object(src_providers))) =
        (dest.get_mut("providers"), src.get("providers"))
    {
        for (name, provider) in src_providers {
            if dest_providers.contains_key(name) {
                continue;
            }
            let mut copied = provider.clone();
            if copied.get("capability").and_then(Value::as_str).is_none() {
                if let Value::Object(object) = &mut copied {
                    object.insert("capability".to_string(), json!("image"));
                }
            }
            dest_providers.insert(name.clone(), copied);
        }
    }
    write_json_object(&dest_path, &dest);
}

fn normalize_image_default_alias() {
    let path = config_path();
    let Some(mut dest) = read_json_object(&path) else {
        return;
    };
    let image = json_nonempty_str(dest.get("default_image_provider"));
    let provider = json_nonempty_str(dest.get("default_provider"));
    match (image, provider) {
        (Some(image), None) => {
            dest.insert("default_provider".to_string(), json!(image));
            write_json_object(&path, &dest);
        }
        (None, Some(provider)) => {
            dest.insert("default_image_provider".to_string(), json!(provider));
            write_json_object(&path, &dest);
        }
        _ => {}
    }
}

fn write_json_object(path: &PathBuf, dest: &Map<String, Value>) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(raw) = serde_json::to_string_pretty(&Value::Object(dest.clone())) {
        let _ = fs::write(path, format!("{raw}\n"));
    }
}

#[cfg(test)]
pub(crate) static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::MutexGuard;

    fn lock_env() -> MutexGuard<'static, ()> {
        ENV_LOCK.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn with_homes<R>(run: impl FnOnce(&std::path::Path, &std::path::Path) -> R) -> R {
        let _guard = lock_env();
        let tmp = tempfile::tempdir().unwrap();
        let ailili = tmp.path().join("ailili");
        let codex = tmp.path().join("codex");
        fs::create_dir_all(&ailili).unwrap();
        fs::create_dir_all(codex.join("gpt-image-2-skill")).unwrap();
        std::env::set_var("AILILI_AIGC_HOME", &ailili);
        std::env::set_var("CODEX_HOME", &codex);
        run(&ailili, &codex)
    }

    #[test]
    fn image_name_prefers_default_image_provider() {
        with_homes(|ailili, _| {
            fs::write(
                ailili.join("config.json"),
                r#"{
                  "default_provider": "legacy-image",
                  "default_image_provider": "local-image",
                  "default_text_provider": "local-text",
                  "providers": {
                    "legacy-image": { "type": "openai-compatible", "capability": "image" },
                    "local-image": { "type": "openai-compatible", "capability": "image" },
                    "local-text": { "type": "openai-compatible", "capability": "text" }
                  }
                }"#,
            )
            .unwrap();
            assert_eq!(
                resolve_image_provider_name().unwrap().as_deref(),
                Some("local-image")
            );
        });
    }

    #[test]
    fn image_name_falls_back_to_default_provider() {
        with_homes(|ailili, _| {
            fs::write(
                ailili.join("config.json"),
                r#"{
                  "default_provider": "local-image",
                  "providers": {
                    "local-image": { "type": "openai-compatible" }
                  }
                }"#,
            )
            .unwrap();
            assert_eq!(
                resolve_image_provider_name().unwrap().as_deref(),
                Some("local-image")
            );
        });
    }

    #[test]
    fn image_name_rejects_text_capability() {
        with_homes(|ailili, _| {
            fs::write(
                ailili.join("config.json"),
                r#"{
                  "default_image_provider": "local-text",
                  "providers": {
                    "local-text": { "type": "openai-compatible", "capability": "text" }
                  }
                }"#,
            )
            .unwrap();
            let error = resolve_image_provider_name().unwrap_err();
            assert!(error.contains("cannot be used for images"), "{error}");
        });
    }

    #[test]
    fn image_name_uses_unique_image_capable_provider() {
        with_homes(|ailili, _| {
            fs::write(
                ailili.join("config.json"),
                r#"{
                  "default_text_provider": "local-text",
                  "providers": {
                    "local-image": { "type": "openai-compatible", "capability": "image" },
                    "local-text": { "type": "openai-compatible", "capability": "text" }
                  }
                }"#,
            )
            .unwrap();
            assert_eq!(
                resolve_image_provider_name().unwrap().as_deref(),
                Some("local-image")
            );
        });
    }

    #[test]
    fn bind_imports_gpt_image2_skill_config() {
        with_homes(|ailili, codex| {
            fs::write(
                ailili.join("config.json"),
                r#"{
                  "version": 1,
                  "default_text_provider": "local-text",
                  "providers": {
                    "local-text": {
                      "type": "openai-compatible",
                      "capability": "text",
                      "api_base": "https://api.openai.com/v1",
                      "model": "gpt-4.1-mini"
                    }
                  }
                }"#,
            )
            .unwrap();
            fs::write(
                codex.join("gpt-image-2-skill").join("config.json"),
                r#"{
                  "version": 1,
                  "default_provider": "my-image-api",
                  "providers": {
                    "my-image-api": {
                      "type": "openai-compatible",
                      "api_base": "https://example.com/v1",
                      "model": "gpt-image-2",
                      "credentials": { "api_key": { "source": "env", "env": "OPENAI_API_KEY" } }
                    }
                  }
                }"#,
            )
            .unwrap();
            bind_runtime_paths();
            assert_eq!(
                std::env::var("GPT_IMAGE_2_CONFIG_FILE").unwrap(),
                ailili.join("config.json").to_string_lossy()
            );
            assert_eq!(
                std::env::var("GPT_IMAGE_2_HISTORY_FILE").unwrap(),
                ailili.join("history.sqlite").to_string_lossy()
            );
            let merged: Value =
                serde_json::from_str(&fs::read_to_string(ailili.join("config.json")).unwrap())
                    .unwrap();
            assert_eq!(merged["default_provider"], "my-image-api");
            assert_eq!(merged["default_image_provider"], "my-image-api");
            assert_eq!(merged["default_text_provider"], "local-text");
            assert_eq!(merged["providers"]["my-image-api"]["capability"], "image");
            assert_eq!(
                resolve_image_provider_name().unwrap().as_deref(),
                Some("my-image-api")
            );
        });
    }
}
