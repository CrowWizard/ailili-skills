"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { TYPE_LABELS } = require("../prompts.cjs");
const { runCaptured } = require("../lib/run-cli.cjs");
const { timed, trace } = require("../lib/trace.cjs");

const IMAGEGEN_TIMEOUT = 720000;

function isUsableImageRef(url) {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value || value.startsWith("data:")) return false;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("file:")) return true;
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/")) return true;
  return fs.existsSync(value);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isTransientError(message) {
  return /connection failed|econnreset|enotfound|http 5\d\d|http 429|\beof\b|unavailable/i.test(String(message || ""));
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

function runImagegen(params) {
  const stdout = withRetry("imagegen", () =>
    runCaptured(["imagegen", JSON.stringify(params)], { timeout: IMAGEGEN_TIMEOUT })
  );
  const match = stdout.match(/Saved full response:\s*(.+)\s*$/m);
  if (!match) throw new Error("imagegen 无 Saved full response");
  const payload = match[1].trim();
  if (payload.startsWith("[")) {
    const images = JSON.parse(payload);
    if (!images.length) throw new Error("imagegen 返回空图片数组");
    return images;
  }
  throw new Error(`imagegen 业务失败，错误详情见: ${payload}`);
}

function taskResultPath(datadir, taskId) {
  const safe = String(taskId || "unknown").replace(/[^0-9A-Za-z\u4e00-\u9fff_-]+/g, "-");
  return path.join(datadir, `task-result-${safe}.json`);
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
    point: spec.point || "",
  };
  try {
    if (!spec.prompt) throw new Error("缺少 prompt");
    if (!Array.isArray(imageUrls) || !imageUrls.length || !imageUrls.every(isUsableImageRef)) {
      throw new Error("image_urls 须为本地路径或 http(s)");
    }
    result.images = timed("task:imagegen", { id: tid, type: ttype }, () =>
      runImagegen({
        prompt: spec.prompt,
        imageUrls,
        outputNum: 1,
        aspectRatio: spec.ratio || "1:1",
        resolution: spec.resolution || "2K",
        quality: "high",
      })
    );
    result.status = "success";
  } catch (error) {
    result.error = error.message;
  }
  const datadir = spec.datadir || skillRoot;
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
  const ttype = entry.type;
  const label = entry.label || TYPE_LABELS[ttype] || ttype;
  return {
    id: `${idx}-${label}`,
    type: ttype,
    label,
    point: entry.point || "",
    prompt: entry.prompt || (state.task_specs[idx - 1] && state.task_specs[idx - 1].prompt) || "",
    image_urls: entry.image_urls || [],
    ratio: entry.ratio || "1:1",
    resolution: state.resolution || "2K",
    imagegen_script: state.imagegen_script || "",
    datadir: path.resolve(state.datadir || "."),
  };
}

module.exports = { processTask, specFromPlan, taskResultPath, runImagegen };
