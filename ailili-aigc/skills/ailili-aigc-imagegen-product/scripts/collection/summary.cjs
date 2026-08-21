"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { VARIANT } = require("./config.cjs");
const { taskResultPath } = require("./slots.cjs");

function readTaskResults(datadir, expectedIds) {
  return expectedIds.map((tid) => {
    const file = taskResultPath(datadir, tid);
    if (!fs.existsSync(file)) {
      return { id: tid, status: "pending", error: "task-result 尚未写出" };
    }
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      return { id: tid, status: "failed", error: `task-result 读取失败: ${error.message}` };
    }
  });
}

function collectionStatus(state) {
  const datadir = path.resolve(state.datadir);
  const specs = state.task_specs || [];
  const results = readTaskResults(
    datadir,
    specs.map((s) => s.id)
  );
  let pending = 0;
  let completed = 0;
  let failed = 0;
  for (const row of results) {
    if (row.status === "success" || row.status === "dry-run") completed += 1;
    else if (row.status === "failed") failed += 1;
    else pending += 1;
  }
  return {
    status: pending > 0 ? "running" : "dispatch_complete",
    command: "collection status",
    pending,
    completed,
    failed,
    total: specs.length,
    done: pending === 0,
    all_ok: pending === 0 && failed === 0,
    tasks: results.map((row, i) => ({
      id: row.id,
      type: specs[i] && specs[i].type,
      label: specs[i] && specs[i].label,
      status: row.status,
      images: row.images || [],
      error: row.error || null,
    })),
  };
}

function formatCompletion(results, specs) {
  const total = specs.length;
  const successCount = results.filter((r) => r.status === "success" || r.status === "dry-run").length;
  const failedCount = total - successCount;
  const lines = [];
  if (total === successCount) lines.push(`**${successCount}/${total} 全部生成成功**`);
  else if (successCount === 0) lines.push(`**0/${total} 生成失败**`);
  else lines.push(`**${successCount}/${total} 生成成功，${failedCount} 张失败**`);
  lines.push("");
  results.forEach((result, i) => {
    const spec = specs[i] || {};
    const label = spec.label || VARIANT.type_labels[spec.type] || spec.type || "图片";
    if (result.status === "success" || result.status === "dry-run") {
      const desc = (spec.desc || result.desc || "").trim();
      const tail = desc ? `　简述：${desc}` : "";
      lines.push(`- **第 ${i + 1} 张 · ${label}**${tail}`);
      const img = (result.images || []).find((item) => typeof item === "string" && item);
      if (img) lines.push(`  ![${label}](${img})`);
    }
  });
  const failedRows = results
    .map((result, i) => ({ result, i }))
    .filter(({ result }) => result.status === "failed");
  if (failedRows.length) {
    lines.push("", "**失败项：**", "");
    for (const { result, i } of failedRows) {
      const spec = specs[i] || {};
      const label = spec.label || spec.type || "图片";
      const err = String(result.error || "未知错误").split("\n")[0];
      lines.push(`- 第 ${i + 1} 张 · ${label}：${err}`);
    }
  }
  return lines.join("\n");
}

function writeManifest(state, results) {
  const assets = [];
  for (const row of results) {
    for (const asset of row.assets || []) {
      if (asset && typeof asset === "object") assets.push(asset);
    }
  }
  const out = path.join(path.resolve(state.datadir), "collection-asset-manifest.json");
  const payload = {
    schema: "linkfox-listing-asset-manifest/v1",
    source: {
      kind: "ailili-aigc-imagegen-product",
      datadir: state.datadir,
      provider: state.provider,
      resolution: state.resolution,
    },
    assets,
    summary: {
      total: assets.length,
      main: assets.filter((a) => a.slot === "main").length,
      aplus: assets.filter((a) => a.slot === "aplus").length,
    },
  };
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  return out;
}

function runSummaryPhase(state) {
  const specs = state.task_specs || [];
  const results = readTaskResults(
    path.resolve(state.datadir),
    specs.map((s) => s.id)
  );
  const pending = results.filter((r) => r.status === "pending").length;
  if (pending > 0) {
    throw new Error(`还有 ${pending} 个任务未完成，请先 --phase status 等到 done=true 再 summary`);
  }
  const markdown = formatCompletion(results, specs);
  process.stdout.write(`${markdown}\n`);
  const success = results.filter((r) => r.status === "success" || r.status === "dry-run").length;
  const status = {
    status: "completed",
    variant: "product",
    datadir: state.datadir,
    total: results.length,
    success,
    failed: results.length - success,
    summary_emitted_at: Date.now(),
    asset_manifest_file: writeManifest(state, results),
  };
  process.stdout.write(`${JSON.stringify(status)}\n`);
  return status;
}

module.exports = { collectionStatus, runSummaryPhase, readTaskResults, formatCompletion };
