"use strict";

const { decodeNl } = require("./nl.cjs");

const REQUIRED_BRAND_COLOR = [
  "brandColor (品牌主色)",
  "背景策略-风格定义",
  "背景策略-场景关键词",
  "背景策略-光影",
  "Brand Injection（品牌植入）",
];
const REQUIRED_FONT_STYLE = [
  "字体策略",
  "字体风格",
  "颜色策略-Heading",
  "颜色策略-Body/Sub",
  "灵活反白",
  "排版",
];

const FALLBACKS = {
  "brandColor (品牌主色)": "#EAF86C",
  "背景策略-风格定义": "现代极简生活方式场景，符合目标市场审美",
  "背景策略-场景关键词": "自然光, 木质, 绿植, 简约",
  "背景策略-光影": "柔和自然侧光，暖色温，轻微长投影增强立体感",
  "Brand Injection（品牌植入）": "品牌主色作为点缀色自然融入场景道具，Logo 低调压印于道具表面",
  字体策略: "几何无衬线体",
  字体风格: "Montserrat",
  "颜色策略-Heading": '["Heading Color"：品牌主色]',
  "颜色策略-Body/Sub": '["Body color"：#333333]',
  灵活反白:
    "You are authorized to switch to Matte White (#FFFFFF) text whenever using a dark background or a solid brand-color panel.",
  排版: "Non-italic, standard leading",
};

function normalizeBrandKey(brandKey) {
  const bk = brandKey && typeof brandKey === "object" ? { ...brandKey } : {};
  if (!stringValue(bk.language)) bk.language = "英文";
  if (!stringValue(bk.platform)) bk.platform = "亚马逊";
  if (!stringValue(bk.salesRegion)) bk.salesRegion = "美国";
  if (bk.brandColor == null) bk.brandColor = "";
  if (bk.fontStyle == null) bk.fontStyle = "";
  if (bk.brandName == null) bk.brandName = "";
  return bk;
}

function stringValue(value) {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeImageUrls(input) {
  const raw = input.imageUrls || input.images || input.imageUrlList || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(item.url || item.src || item.imageUrl || "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function buildPrompt(template, brandKey) {
  return template.replace("{brand_key_json}", JSON.stringify(brandKey, null, 2));
}

function parseJsonFromText(text) {
  let raw = decodeNl(String(text || "")).trim();
  if (!raw) {
    throw new Error("textgen 返回空 content");
  }
  const attempts = [];
  attempts.push(raw);
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    attempts.push(fence[1].trim());
  }
  for (const opener of ["[", "{"]) {
    const start = raw.indexOf(opener);
    const closer = opener === "[" ? "]" : "}";
    const end = raw.lastIndexOf(closer);
    if (start >= 0 && end > start) {
      attempts.push(raw.slice(start, end + 1));
    }
  }
  let lastError = null;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`无法从 textgen 输出解析 JSON: ${lastError && lastError.message}`);
}

function firstGene(parsed) {
  let value = parsed;
  while (Array.isArray(value) && value.length === 1 && Array.isArray(value[0])) {
    value = value[0];
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      throw new Error("brandGeneJson 为空列表");
    }
    value = value[0];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`brandGeneJson 格式异常: ${typeof parsed}`);
  }
  return value;
}

function fillMissingFields(gene, brandKey) {
  const out = { ...gene };
  const brandColor = { ...(out.brandColor && typeof out.brandColor === "object" ? out.brandColor : {}) };
  const fontStyle = { ...(out.fontStyle && typeof out.fontStyle === "object" ? out.fontStyle : {}) };
  for (const key of REQUIRED_BRAND_COLOR) {
    if (!stringValue(brandColor[key])) {
      brandColor[key] = FALLBACKS[key];
    }
  }
  for (const key of REQUIRED_FONT_STYLE) {
    if (!stringValue(fontStyle[key])) {
      fontStyle[key] = FALLBACKS[key];
    }
  }
  if (stringValue(brandKey.brandColor)) {
    brandColor["brandColor (品牌主色)"] = String(brandKey.brandColor).trim();
  }
  if (stringValue(brandKey.fontStyle)) {
    fontStyle["字体风格"] = String(brandKey.fontStyle).trim();
  }
  out.brandColor = brandColor;
  out.fontStyle = fontStyle;
  return out;
}

function assembleBrandGeneJson(content, brandKey) {
  const gene = fillMissingFields(firstGene(parseJsonFromText(content)), brandKey);
  return [gene];
}

module.exports = {
  REQUIRED_BRAND_COLOR,
  REQUIRED_FONT_STYLE,
  normalizeBrandKey,
  normalizeImageUrls,
  buildPrompt,
  parseJsonFromText,
  fillMissingFields,
  assembleBrandGeneJson,
};
