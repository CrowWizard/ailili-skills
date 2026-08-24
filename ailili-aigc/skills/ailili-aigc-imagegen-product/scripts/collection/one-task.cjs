"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { TEXTGEN_TYPES, DIRECT_TYPES, ASSET_SLOT, TYPE_LABELS } = require("./config.cjs");
const { taskResultPath } = require("./slots.cjs");
const { buildParams: buildTextgenParams } = require("./textgen-params.cjs");
const { buildParams: buildImagegenPrompt } = require("./imagegen-prompt.cjs");
const { runCaptured } = require("../lib/run-cli.cjs");

const TEXTGEN_TIMEOUT = 360000;
const IMAGEGEN_TIMEOUT = 720000;

function isUsableImageRef(url) {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value) return false;
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("file:")
  ) {
    return true;
  }
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/")) {
    return true;
  }
  return fs.existsSync(value);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isTransientError(message) {
  return /connection failed|econnreset|enotfound|http 5\d\d|http 429|\beof\b|unavailable/i.test(
    String(message || "")
  );
}

function withRetry(label, fn) {
  const max = Number(process.env.AILILI_AIGC_RETRY_COUNT || 3);
  let last;
  for (let attempt = 0; attempt <= max; attempt += 1) {
    try {
      return fn();
    } catch (error) {
      last = error;
      const message = error && error.message ? error.message : String(error);
      if (attempt >= max || !isTransientError(message)) throw error;
      const delay = 1000 * 2 ** attempt;
      process.stderr.write(`[${label}] transient (${message}); retry ${attempt + 1}/${max} in ${delay}ms\n`);
      sleepMs(delay);
    }
  }
  throw last;
}

function runTextgen(paramsOrScript, maybeParams) {
  const params = maybeParams || paramsOrScript;
  const stdout = withRetry("textgen", () =>
    runCaptured(["textgen", "--stdin", "--content-only"], {
      input: JSON.stringify(params),
      timeout: TEXTGEN_TIMEOUT,
    })
  );
  const content = stdout.replace(/\n$/, "");
  if (!content) throw new Error("textgen 返回空 content");
  return content;
}

function runImagegen(_script, params) {
  const payload = params && params.prompt ? params : _script;
  const stdout = withRetry("imagegen", () =>
    runCaptured(["imagegen", JSON.stringify(payload)], { timeout: IMAGEGEN_TIMEOUT })
  );
  const match = stdout.match(/Saved full response:\s*(.+)\s*$/m);
  if (!match) throw new Error("imagegen 无 Saved full response");
  const saved = match[1].trim();
  if (saved.startsWith("[")) {
    const images = JSON.parse(saved);
    if (!images.length) throw new Error("imagegen 返回空图片数组");
    return images;
  }
  throw new Error(`imagegen 业务失败，错误详情见: ${saved}`);
}

function readBrandGene(spec) {
  const file = spec.brand_gene_file;
  if (file && fs.existsSync(file)) {
    return fs.readFileSync(file, "utf8").trim();
  }
  return spec.brand_gene_json || "";
}

function buildAssets(spec, images) {
  const ttype = spec.type || "";
  const slot = ASSET_SLOT[ttype] || "main";
  const baseLabel = spec.label || TYPE_LABELS[ttype] || ttype || "图片";
  return images.filter(Boolean).map((src, i) => {
    const asset = {
      src,
      label: images.length === 1 ? baseLabel : `${baseLabel} ${i + 1}`,
      kind: "image",
      slot,
      type: ttype,
      sourceTaskId: spec.id,
    };
    for (const key of ["point", "layout", "image_desc", "ratio"]) {
      if (spec[key]) asset[key] = spec[key];
    }
    return asset;
  });
}

function processTask(spec, skillRoot) {
  const tid = spec.id || spec.type || "unknown";
  const ttype = spec.type || "";
  const imageUrls = spec.image_urls || spec.imageUrls || [];
  const result = {
    id: tid,
    type: ttype,
    label: spec.label || TYPE_LABELS[ttype] || ttype,
    status: "failed",
    images: [],
    error: null,
    ratio: spec.ratio || "1:1",
  };
  for (const key of ["point", "desc", "layout", "image_desc"]) {
    if (spec[key]) result[key] = spec[key];
  }
  try {
    if (!Array.isArray(imageUrls) || !imageUrls.length) {
      throw new Error("image_urls 为空");
    }
    if (!imageUrls.every(isUsableImageRef)) {
      throw new Error("image_urls 须为本地路径或 http(s)/data URL");
    }
    const provider = spec.provider || "BANANA_PRO";
    const resolution = spec.resolution || "2K";
    const ratio = spec.ratio || "1:1";
    let prompt;
    if (TEXTGEN_TYPES.has(ttype)) {
      const tg = buildTextgenParams(ttype, imageUrls, {
        point: spec.point || "",
        layout: spec.layout || "",
        image_desc: spec.image_desc || "",
        brand_gene: readBrandGene(spec),
        language: spec.language || "英文",
        sales_region: spec.sales_region || "美国",
        platform: spec.platform || "亚马逊",
        ratio,
      });
      prompt = runTextgen(tg);
    } else if (DIRECT_TYPES.has(ttype)) {
      prompt = buildImagegenPrompt(ttype, imageUrls).prompt;
    } else {
      throw new Error(`未知类型: ${ttype}`);
    }
    result.images = runImagegen({
      prompt,
      imageUrls,
      provider,
      outputNum: 1,
      aspectRatio: ratio,
      resolution,
    });
    result.status = "success";
    result.assets = buildAssets(spec, result.images);
  } catch (error) {
    result.error = error.message;
  }
  const datadir = spec.datadir || path.join(skillRoot, ".");
  const out = taskResultPath(datadir, tid);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "success") {
    process.stdout.write(`Saved full response: ${JSON.stringify(result.images)}\n`);
  } else {
    process.stdout.write(`Saved full response: ${out}\n`);
  }
  return result;
}

function specFromPlan(entry, state, idx) {
  const { TYPE_LABELS } = require("./config.cjs");
  const ttype = entry.type;
  if (!ttype) throw new Error(`image-plan 第 ${idx} 条缺少 type`);
  const label = TYPE_LABELS[ttype] || ttype;
  let imageUrls = state.imageUrls || [];
  if (!imageUrls.length && state.image_urls_file && fs.existsSync(state.image_urls_file)) {
    imageUrls = JSON.parse(fs.readFileSync(state.image_urls_file, "utf8"));
  }
  const bk = state.brandKey || {};
  const spec = {
    id: `${idx}-${label}`,
    type: ttype,
    label,
    image_urls: imageUrls,
    ratio: entry.ratio || "1:1",
    provider: state.provider || "BANANA_PRO",
    resolution: state.resolution || "2K",
    textgen_script: state.textgen_script || "",
    imagegen_script: state.imagegen_script || "",
    brand_gene_file: state.brand_gene_file || "",
    datadir: path.resolve(state.datadir || "."),
    language: entry.language || bk.language || "英文",
    sales_region: bk.salesRegion || "美国",
    platform: bk.platform || "亚马逊",
  };
  for (const key of ["point", "desc", "image_desc", "layout"]) {
    if (entry[key]) spec[key] = entry[key];
  }
  return spec;
}

module.exports = { processTask, specFromPlan, runTextgen, runImagegen };
