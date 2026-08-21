"use strict";

const fs = require("node:fs");
const path = require("node:path");

const WHITE_BG_REF = path.resolve(__dirname, "../../references/types/white-bg.md");

function extractWhiteBgPrompt() {
  const md = fs.readFileSync(WHITE_BG_REF, "utf8");
  const match = md.match(/```text\s*\n([\s\S]*?)\n```/);
  if (!match || !match[1].trim()) {
    throw new Error(`未在 ${WHITE_BG_REF} 中找到非空 \`\`\`text\`\`\` 提示词正文`);
  }
  return match[1].trim();
}

function buildParams(imgType, imageUrls) {
  if (!Array.isArray(imageUrls)) throw new Error("image_urls 必须是 list");
  if (imgType === "WHITE_BG") {
    return { prompt: extractWhiteBgPrompt(), imageUrls };
  }
  throw new Error(`不支持的 imagegen 静态直出类型: ${imgType}`);
}

module.exports = { extractWhiteBgPrompt, buildParams };
