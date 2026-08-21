#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildParams } = require("./collection/imagegen-prompt.cjs");

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : "";
}

function main() {
  const argv = process.argv.slice(2);
  const type = argValue(argv, "--type") || "WHITE_BG";
  const out = argValue(argv, "--out");
  const imageUrlsRaw = argValue(argv, "--image-urls");
  if (!out || !imageUrlsRaw) {
    process.stderr.write(
      "Usage: node build_imagegen_prompt.cjs --type WHITE_BG --image-urls '[...]' --out file.json\n"
    );
    process.exit(1);
  }
  const params = buildParams(type, JSON.parse(imageUrlsRaw));
  const outPath = path.resolve(out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(params, null, 2)}\n`);
  process.stdout.write(`IMAGEGEN_PARAMS_PATH=${outPath}\n`);
}

main();
