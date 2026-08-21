"use strict";

const fs = require("node:fs");
const path = require("node:path");

const TEMPLATES_DIR = path.resolve(__dirname, "../../templates");

const TYPE_CONFIG = {
  SCENE: { template: "scene.txt", model: "GEM_3_FLASH", thinkingLevel: "low", sensitivity: false },
  CLOSE_UP: { template: "close-up.txt", model: "GEM_3_FLASH", thinkingLevel: "low", sensitivity: false },
  SELLING_POINT: { template: "selling-point-aplus.txt", model: "GEM_3_1_PRO", thinkingLevel: "high", sensitivity: true },
  PREMIUM_APLUS: { template: "selling-point-aplus.txt", model: "GEM_3_1_PRO", thinkingLevel: "high", sensitivity: true },
  STANDARD_APLUS: { template: "selling-point-aplus.txt", model: "GEM_3_1_PRO", thinkingLevel: "high", sensitivity: true },
  PHONE_APLUS: { template: "selling-point-aplus.txt", model: "GEM_3_1_PRO", thinkingLevel: "high", sensitivity: true },
};

const SENSITIVITY_SUFFIX =
  "\n\n【敏感词规避指令】：在撰写 Text on Image 文案时，必须主动规避所有违禁词、" +
  "侵权词、敏感词汇，确保文案内容合规，不出现任何可能引发版权纠纷、" +
  "品牌侵权或平台审核风险的词汇。";

function buildLayoutInfo(imgType, layout) {
  if (!layout) return "";
  if (imgType === "SELLING_POINT") return `卖点图·${layout}点展示版式：按概览/功能/品质/场景之一组织模块`;
  if (imgType === "PREMIUM_APLUS") return `高级A+·${layout}点多模块版式`;
  if (imgType === "STANDARD_APLUS") return `普通A+·${layout}点多模块版式`;
  return "";
}

function buildParams(imgType, imageUrls, opts = {}) {
  const config = TYPE_CONFIG[imgType];
  if (!config) throw new Error(`不支持的 textgen 类型: ${imgType}`);
  if (!Array.isArray(imageUrls)) throw new Error("image_urls 必须是 list");
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, config.template), "utf8");
  const point = opts.point || "";
  const imageDesc = opts.imageDesc || opts.image_desc || "";
  const brandGene = opts.brandGene || opts.brand_gene || "";
  const language = opts.language || "英文";
  const salesRegion = opts.salesRegion || opts.sales_region || "美国";
  const platform = opts.platform || "亚马逊";
  const ratio = opts.ratio || "1:1";
  const layoutInfo = buildLayoutInfo(imgType, opts.layout || "");
  let prompt = template
    .replaceAll("{customer_keywords}", point)
    .replaceAll("{brandKey}", brandGene)
    .replaceAll("{customSetting}", imageDesc)
    .replaceAll("{language}", language)
    .replaceAll("{salesRegion}", salesRegion)
    .replaceAll("{platform}", platform)
    .replaceAll("{Ratio}", ratio)
    .replaceAll("{layoutInfo}", layoutInfo)
    .replaceAll("{infringingWords}", "");
  if (config.sensitivity) prompt += SENSITIVITY_SUFFIX;
  return {
    prompt,
    imageUrls,
    model: config.model,
    thinkingLevel: config.thinkingLevel,
  };
}

module.exports = { TYPE_CONFIG, buildParams };
