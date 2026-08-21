use std::{collections::BTreeMap, fs, path::PathBuf};

use serde::Deserialize;

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
    default_text_provider: Option<String>,
    #[serde(default)]
    providers: BTreeMap<String, FileProvider>,
}

#[derive(Debug, Deserialize, Default)]
struct FileProvider {
    #[serde(rename = "type", default)]
    provider_type: String,
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
    Env { env: String },
    File { value: String },
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

pub fn resolve_text_provider() -> Result<ResolvedTextProvider, String> {
    let path = config_path();
    if path.is_file() {
        let raw = fs::read_to_string(&path)
            .map_err(|error| format!("unable to read {}: {error}", path.display()))?;
        let parsed: FileConfig = serde_json::from_str(&raw)
            .map_err(|error| format!("invalid {}: {error}", path.display()))?;
        if let Some(name) = parsed
            .default_text_provider
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
        {
            let provider = parsed.providers.get(name).ok_or_else(|| {
                format!(
                    "default_text_provider {name:?} is not in {}",
                    path.display()
                )
            })?;
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
                name: name.to_string(),
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
        };
    }
    std::env::var("OPENAI_API_KEY")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "text provider is missing api_key credentials".to_string())
}
