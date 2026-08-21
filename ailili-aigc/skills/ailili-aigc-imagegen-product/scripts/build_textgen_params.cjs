#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { TYPE_CONFIG, buildParams } = require("./collection/textgen-params.cjs");

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : "";
}

function main() {
  const argv = process.argv.slice(2);
  const type = argValue(argv, "--type");
  const out = argValue(argv, "--out");
  const imageUrlsRaw = argValue(argv, "--image-urls");
  if (!type || !out || !imageUrlsRaw) {
    process.stderr.write(
      "Usage: node build_textgen_params.cjs --type SCENE --image-urls '[...]' --out file.json\n"
    );
    process.exit(1);
  }
  const imageUrls = JSON.parse(imageUrlsRaw);
  let brandGene = argValue(argv, "--brand-gene-json");
  const brandFile = argValue(argv, "--brand-gene-file");
  if (!brandGene && brandFile) {
    brandGene = fs.readFileSync(path.resolve(brandFile), "utf8").trim();
  }
  const params = buildParams(type, imageUrls, {
    point: argValue(argv, "--point"),
    layout: argValue(argv, "--layout"),
    image_desc: argValue(argv, "--image-desc"),
    brand_gene: brandGene,
    language: argValue(argv, "--language") || "英文",
    sales_region: argValue(argv, "--sales-region") || "美国",
    platform: argValue(argv, "--platform") || "亚马逊",
    ratio: argValue(argv, "--ratio") || "1:1",
  });
  const outPath = path.resolve(out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(params, null, 2)}\n`);
  const config = TYPE_CONFIG[type];
  process.stdout.write(`TEXTGEN_PARAMS_PATH=${outPath}\n`);
  process.stdout.write(`  type          : ${type}\n`);
  process.stdout.write(`  model         : ${config.model}\n`);
  process.stdout.write(`  thinkingLevel : ${config.thinkingLevel}\n`);
}

main();
