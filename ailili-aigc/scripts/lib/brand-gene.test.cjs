#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  normalizeBrandKey,
  normalizeImageUrls,
  buildPrompt,
  parseJsonFromText,
  fillMissingFields,
  assembleBrandGeneJson,
} = require("./brand-gene.cjs");

function testNormalize() {
  const bk = normalizeBrandKey({});
  assert.equal(bk.language, "英文");
  assert.equal(bk.platform, "亚马逊");
  assert.equal(bk.salesRegion, "美国");
  assert.equal(bk.brandColor, "");
  const urls = normalizeImageUrls({ images: [{ url: "https://a.png" }, " https://b.jpg "] });
  assert.deepEqual(urls, ["https://a.png", "https://b.jpg"]);
}

function testParseAndFill() {
  const content = "```json\n[{\"brandColor\":{\"brandColor (品牌主色)\":\"#112233\"},\"fontStyle\":{}}]\n```";
  const gene = fillMissingFields(parseJsonFromText(content)[0], { brandColor: "#FF00AA", fontStyle: "Oswald" });
  assert.equal(gene.brandColor["brandColor (品牌主色)"], "#FF00AA");
  assert.equal(gene.fontStyle["字体风格"], "Oswald");
  assert.ok(gene.brandColor["背景策略-光影"]);
  assert.ok(gene.fontStyle["灵活反白"].includes("Matte White"));
}

function testAssemblePlaceholder() {
  const payload = assembleBrandGeneJson("⏎[{\"brandColor\":{},\"fontStyle\":{}}]⏎", {});
  assert.equal(payload.length, 1);
  assert.equal(payload[0].fontStyle["排版"], "Non-italic, standard leading");
}

function testPrompt() {
  const prompt = buildPrompt("key={brand_key_json}", { language: "英文" });
  assert.match(prompt, /"language": "英文"/);
}

testNormalize();
testParseAndFill();
testAssemblePlaceholder();
testPrompt();
process.stdout.write("brand-gene.lib ok\n");
