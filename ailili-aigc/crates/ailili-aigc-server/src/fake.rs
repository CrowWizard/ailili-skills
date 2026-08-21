use std::{fs, path::PathBuf};

use gpt_image_2_core::EditRequest;
use serde_json::{json, Value};

use crate::{text::TextRequest, JobRunner};

pub const TINY_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x08, 0x08, 0x06, 0x00, 0x00, 0x00, 0xC4, 0x0F, 0xBE,
    0x8B, 0x00, 0x00, 0x00, 0x1C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0xA0, 0x14, 0x30,
    0xC2, 0x18, 0xFF, 0xC1, 0x08, 0x45, 0x02, 0x2C, 0xC7, 0x44, 0xC8, 0x04, 0xCA, 0x15, 0x50, 0x0E,
    0x00, 0x7B, 0xD5, 0x02, 0x08, 0x74, 0x80, 0x08, 0x92, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82,
];

#[derive(Clone, Default)]
pub struct FakeRunner;

impl JobRunner for FakeRunner {
    fn run_edit(
        &self,
        _request: EditRequest,
        job_id: String,
        dir: PathBuf,
    ) -> Result<Value, Value> {
        let out = dir.join("out.png");
        fs::write(&out, TINY_PNG).map_err(|error| json!({ "message": error.to_string() }))?;
        Ok(json!({
            "payload": {
                "ok": true,
                "status": "completed",
                "provider": "fake",
                "output": {
                    "path": out.display().to_string(),
                    "files": [{
                        "index": 0,
                        "path": out.display().to_string()
                    }]
                }
            },
            "job_id": job_id
        }))
    }

    fn run_text(&self, request: TextRequest, job_id: String) -> Result<Value, Value> {
        let content = if request.prompt.contains("brandGeneJson")
            || request.prompt.contains("品牌视觉基因")
        {
            serde_json::to_string(&json!([{
                "brandColor": {
                    "brandColor (品牌主色)": "#EAF86C Lime",
                    "背景策略-风格定义": "现代北欧极简家居，符合目标市场审美",
                    "背景策略-场景关键词": "原木长桌, 亚麻桌布, 绿植, 晨光",
                    "背景策略-光影": "柔和自然侧光，暖色温 4000K，轻微长投影",
                    "Brand Injection（品牌植入）": "主色作抱枕点缀，Logo 低调压印于道具"
                },
                "fontStyle": {
                    "字体策略": "几何无衬线体",
                    "字体风格": "Montserrat",
                    "颜色策略-Heading": "[\"Heading Color\"：#EAF86C]",
                    "颜色策略-Body/Sub": "[\"Body color\"：#333333]",
                    "灵活反白": "You are authorized to switch to Matte White (#FFFFFF) text whenever using a dark background or a solid brand-color panel.",
                    "排版": "Non-italic, standard leading"
                }
            }]))
            .unwrap_or_else(|_| "[]".to_string())
        } else {
            format!("fake text: {}", request.prompt)
        };
        Ok(json!({
            "content": content,
            "promptTokens": 1,
            "completionTokens": 1,
            "totalTokens": 2,
            "provider": "fake",
            "job_id": job_id,
        }))
    }
}

pub fn enabled() -> bool {
    env_flag("AILILI_AIGC_FAKE")
        || env_flag("AILILI_AIGC_FAKE_IMAGE")
        || env_flag("AILILI_AIGC_FAKE_TEXT")
}

fn env_flag(name: &str) -> bool {
    matches!(
        std::env::var(name)
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}
