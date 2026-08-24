#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { dataDir, resolveDataPath } = require("../../../scripts/lib/paths.cjs");
const {
  normalizeBrandKey,
  normalizeImageUrls,
  buildPrompt,
  assembleBrandGeneJson,
} = require("../../../scripts/lib/brand-gene.cjs");

const SLUG = "ailili-aigc-imagegen-brand-gene-extract";
const TEXTGEN_TIMEOUT_MS = 360000;

function usage() {
  process.stderr.write(
    "Usage: node extract_brand_gene.cjs '<JSON>'\n" +
      "       node extract_brand_gene.cjs --stdin < params.json\n"
  );
}

function readParams(argv) {
  if (argv.includes("--stdin")) {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  }
  const remaining = argv.filter((arg) => !arg.startsWith("-"));
  if (!remaining.length) {
    usage();
    process.exit(1);
  }
  return JSON.parse(remaining[0]);
}

function findTextgenScript() {
  if (process.env.AILILI_TEXTGEN_SCRIPT && fs.existsSync(process.env.AILILI_TEXTGEN_SCRIPT)) {
    return process.env.AILILI_TEXTGEN_SCRIPT;
  }
  const sibling = path.resolve(
    __dirname,
    "../../ailili-aigc-textgen/scripts/aigc_textgen.cjs"
  );
  if (fs.existsSync(sibling)) {
    return sibling;
  }
  throw new Error(`aigc_textgen.cjs not found at ${sibling}`);
}

function loadTemplate() {
  const templatePath = path.resolve(__dirname, "../templates/brand-gene-extract.txt");
  return fs.readFileSync(templatePath, "utf8");
}

function runTextgen(script, params) {
  const result = childProcess.spawnSync(process.execPath, [script, "--stdin", "--content-only"], {
    input: JSON.stringify(params),
    encoding: "utf8",
    timeout: TEXTGEN_TIMEOUT_MS,
    env: process.env,
    windowsHide: process.platform === "win32",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const tail = (result.stderr || result.stdout || "").trim().split(/\n/).slice(-8).join(" | ");
    throw new Error(`textgen failed (exit=${result.status}): ${tail}`);
  }
  const content = (result.stdout || "").replace(/\n$/, "");
  if (!content) {
    throw new Error("textgen 返回空 content");
  }
  return content;
}

function savePayload(payload) {
  const outPath = resolveDataPath(SLUG, new Date());
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serialized);
  return { outPath: path.resolve(outPath), bytes: Buffer.byteLength(serialized) };
}

function main() {
  const argv = process.argv.slice(2);
  let params;
  try {
    params = readParams(argv);
  } catch (error) {
    process.stderr.write(`Invalid JSON: ${error.message}\n`);
    process.exit(1);
  }

  const imageUrls = normalizeImageUrls(params);
  if (!imageUrls.length) {
    process.stderr.write("images/imageUrls 至少需要 1 张商品图 URL\n");
    process.exit(1);
  }
  const brandKey = normalizeBrandKey(params.brandKey);
  const prompt = buildPrompt(loadTemplate(), brandKey);
  const textgenParams = {
    prompt,
    imageUrls,
    model: params.model || "GEM_3_1_PRO",
    thinkingLevel: params.thinkingLevel || "high",
  };

  const datadir = dataDir();
  const paramsPath = path.join(datadir, "brand_gene_params.json");
  fs.mkdirSync(datadir, { recursive: true });
  fs.writeFileSync(paramsPath, `${JSON.stringify(textgenParams, null, 2)}\n`);
  process.stderr.write(`Wrote textgen params: ${paramsPath}\n`);

  const content = runTextgen(findTextgenScript(), textgenParams);
  const payload = assembleBrandGeneJson(content, brandKey);
  const saved = savePayload(payload);
  process.stdout.write(`Saved full response: ${saved.outPath} (${saved.bytes} bytes)\n`);
  return 0;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
