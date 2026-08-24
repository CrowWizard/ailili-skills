"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { VARIANT } = require("./config.cjs");
const {
  expandTypeSlots,
  buildSlotsSkeleton,
  mergeS1Result,
  planSummary,
  formatPlanTable,
  extractImagePlanList,
} = require("./slots.cjs");
const { normalizeBrandKey } = require("../../../../scripts/lib/brand-gene.cjs");
const { parseJsonFromText } = require("../../../../scripts/lib/brand-gene.cjs");
const { runTextgen } = require("./one-task.cjs");
const { dataDir } = require("../../../../scripts/lib/paths.cjs");

function resolveScripts(skillRoot) {
  const skillsRoot = path.dirname(path.resolve(skillRoot));
  return {
    textgen_script: path.join(skillsRoot, "ailili-aigc-textgen", "scripts", "aigc_textgen.cjs"),
    imagegen_script: path.join(skillsRoot, "ailili-aigc-imagegen", "scripts", "aigc_imagegen.cjs"),
    brand_gene_script: path.join(
      skillsRoot,
      "ailili-aigc-imagegen-brand-gene-extract",
      "scripts",
      "extract_brand_gene.cjs"
    ),
    run_one_task_script: path.join(skillRoot, "scripts", "run_one_task.cjs"),
  };
}

function isUsableUrl(url) {
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

function buildS1Prompt(job, slots) {
  const template = fs.readFileSync(
    path.resolve(__dirname, "../../templates", VARIANT.s1_template),
    "utf8"
  );
  const labels = VARIANT.type_labels;
  const slotDesc = slots.map((t, i) => `${i + 1}. ${labels[t] || t} (${t})`).join("\n");
  const ctx = [];
  for (const [key, label] of [
    ["point", "用户完整卖点 point"],
    ["pointHint", "用户卖点方向 pointHint"],
    ["imageDesc", "用户画面描述 imageDesc"],
    ["sellingPoints", "商品档案卖点"],
    ["category", "品类"],
    ["brand", "品牌"],
  ]) {
    if (job[key]) ctx.push(`- ${label}: ${job[key]}`);
  }
  const bk = normalizeBrandKey(job.brandKey);
  for (const [key, label] of [
    ["language", "目标语言 language"],
    ["platform", "平台 platform"],
    ["salesRegion", "销售地区 salesRegion"],
  ]) {
    if (bk[key]) ctx.push(`- ${label}: ${bk[key]}`);
  }
  const hist = (job.historicalPoints || []).filter(Boolean);
  return template
    .replace("{slot_list}", slotDesc)
    .replace("{slot_count}", String(slots.length))
    .replace("{context_block}", ctx.length ? ctx.join("\n") : "（无额外上下文）")
    .replace("{historical_points}", hist.length ? hist.map((p) => `- ${p}`).join("\n") : "（无）");
}

function extractBrandGeneFile(job, scripts, imageUrls, brandKey) {
  if (job.brand_gene_file && fs.existsSync(job.brand_gene_file)) {
    return path.resolve(job.brand_gene_file);
  }
  const child = require("node:child_process").spawnSync(
    process.execPath,
    [scripts.brand_gene_script, "--stdin"],
    {
      input: JSON.stringify({ images: imageUrls, brandKey }),
      encoding: "utf8",
      timeout: 360000,
      env: process.env,
      windowsHide: process.platform === "win32",
    }
  );
  if (child.status !== 0) {
    throw new Error(`brand-gene extract failed: ${(child.stderr || child.stdout || "").trim()}`);
  }
  const line = (child.stdout || "").split("\n").find((row) => row.includes("Saved full response:"));
  if (!line) throw new Error("brand-gene extract 未返回 Saved full response");
  return line.split("Saved full response:", 1)[1].trim().split(" ", 1)[0];
}

function runPlanPhase(job, skillRoot) {
  const scripts = resolveScripts(skillRoot);
  const datadir = path.resolve(job.datadir || dataDir());
  fs.mkdirSync(datadir, { recursive: true });
  const imageUrls = job.imageUrls || job.images || [];
  if (!imageUrls.length || !imageUrls.every(isUsableUrl)) {
    throw new Error("job.imageUrls 须为非空本地路径或 http(s)/data URL 数组");
  }
  const scene = String(job.scene || "D").toUpperCase();
  const brandKey = normalizeBrandKey(job.brandKey);
  const slots = expandTypeSlots(job.types, VARIANT.default_plan_d);
  let plan = buildSlotsSkeleton(slots, {
    aspectRatio: job.aspectRatio || job.ratio || "1:1",
    aplusRatio: job.aplusRatio || "",
    userImageDesc: job.imageDesc || "",
  });

  const textgenScript = job.textgen_script || scripts.textgen_script;
  const needsS1 = job.skip_s1 !== true && VARIANT.needs_s1_scenes.has(scene);
  if (needsS1) {
    if (!fs.existsSync(textgenScript)) throw new Error(`textgen_script 不存在: ${textgenScript}`);
    const content = runTextgen(textgenScript, {
      prompt: buildS1Prompt(job, slots),
      imageUrls,
      model: "GEM_3_1_PRO",
      thinkingLevel: "high",
    });
    const parsed = parseJsonFromText(content);
    plan = mergeS1Result(plan, extractImagePlanList(parsed));
  }

  let brandGeneFile = job.brand_gene_file || "";
  const needsGene =
    !brandGeneFile &&
    job.extract_brand_gene !== false &&
    VARIANT.extract_brand_gene_scenes.has(scene);
  if (needsGene) {
    brandGeneFile = extractBrandGeneFile(job, scripts, imageUrls, brandKey);
  } else if (brandGeneFile) {
    brandGeneFile = path.resolve(brandGeneFile);
  }

  const urlsPath = path.join(datadir, "image-urls.json");
  fs.writeFileSync(urlsPath, `${JSON.stringify(imageUrls, null, 2)}\n`);
  const planPath = path.join(datadir, "image-plan.json");
  fs.writeFileSync(planPath, `${JSON.stringify({ imagePlanList: plan }, null, 2)}\n`);

  const taskSpecs = plan.map((entry, i) => {
    const ttype = entry.type || "";
    const label = VARIANT.type_labels[ttype] || ttype;
    return { id: `${i + 1}-${label}`, type: ttype, label };
  });
  const state = {
    variant: "product",
    scene,
    imageUrls,
    image_urls_file: urlsPath,
    provider: job.provider || "BANANA_PRO",
    resolution: job.resolution || "2K",
    plan_file: planPath,
    brandKey,
    brand_gene_file: brandGeneFile || "",
    textgen_script: textgenScript,
    imagegen_script: job.imagegen_script || scripts.imagegen_script,
    run_one_task_script: job.run_one_task_script || scripts.run_one_task_script,
    skill_root: path.resolve(skillRoot),
    datadir,
    write_asset_manifest: true,
    task_specs: taskSpecs,
  };
  const statePath = path.join(datadir, "collection-state.json");
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const skipConfirm = scene === "E" || job.skip_confirm === true;
  const summary = planSummary(plan, VARIANT.type_labels);
  return {
    status: skipConfirm ? "ready_to_dispatch" : "awaiting_confirm",
    skip_confirm: skipConfirm,
    plan_file: planPath,
    state_file: statePath,
    brand_gene_file: brandGeneFile || null,
    image_urls_file: urlsPath,
    run_one_task_script: state.run_one_task_script,
    total: taskSpecs.length,
    specs: taskSpecs.map((s, i) => ({ index: i + 1, ...s })),
    summary,
    table: formatPlanTable(summary),
  };
}

module.exports = { runPlanPhase, resolveScripts };
