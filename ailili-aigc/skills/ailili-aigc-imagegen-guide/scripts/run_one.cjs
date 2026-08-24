#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { runCli } = require("./lib/run-cli.cjs");

function isUsableRef(url) {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  if (value.startsWith("data:")) return false;
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/")) return true;
  return fs.existsSync(value);
}

function parseParams(argv) {
  if (argv[0] === "--stdin" || argv.length === 0) {
    const raw = fs.readFileSync(0, "utf8");
    return JSON.parse(raw);
  }
  return JSON.parse(argv[0]);
}

function main() {
  const params = parseParams(process.argv.slice(2));
  const imageUrls = params.imageUrls || params.image_urls || [];
  const prompt = params.prompt;
  if (!prompt || typeof prompt !== "string") throw new Error("prompt 必填");
  if (!Array.isArray(imageUrls) || !imageUrls.length) {
    throw new Error("imageUrls 至少 1 张（本地绝对路径或 http(s)）。无参考文生图请改用 ailili-aigc-imagegen");
  }
  if (!imageUrls.every(isUsableRef)) {
    throw new Error("imageUrls 须为本地绝对路径或短 http(s)，禁止 data URL");
  }
  const payload = {
    prompt,
    imageUrls,
    outputNum: Number(params.outputNum || 1),
    resolution: params.resolution || "2K",
    aspectRatio: params.aspectRatio || params.ratio || "1:1",
    quality: params.quality || "high",
  };
  runCli(["imagegen", JSON.stringify(payload)]);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
