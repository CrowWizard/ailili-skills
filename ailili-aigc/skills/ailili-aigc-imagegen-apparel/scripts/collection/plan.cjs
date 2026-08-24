"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  TYPE_LABELS,
  buildPrompt,
  productDescription,
  resolveProductImages,
  defaultTypeList,
  parseTypesSpec,
  refsForType,
  captionForType,
} = require("../prompts.cjs");
const { dataDir } = require("../lib/paths.cjs");

function resolveScripts(skillRoot) {
  return {
    run_one_task_script: path.join(skillRoot, "scripts", "run_one_task.cjs"),
  };
}

function isUsableUrl(url) {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (!value || value.startsWith("data:")) return false;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("file:")) return true;
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/")) return true;
  return fs.existsSync(value);
}

function sanitizeCell(val) {
  if (val == null || val === "") return "—";
  const s = String(val).replace(/\r\n/g, " ").replace(/[\n\r]/g, " ").replace(/[|｜]/g, "/").trim();
  return s || "—";
}

function formatPlanTable(rows) {
  const lines = [
    "# 服饰套图规划",
    "",
    "| 序号 | 类型 | 简述 | 参考图 | 比例 |",
    "|------|------|------|--------|------|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.index} | ${sanitizeCell(row.label)} | ${sanitizeCell(row.point)} | ${sanitizeCell(row.refs)} | ${sanitizeCell(row.ratio)} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function runPlanPhase(job, skillRoot) {
  const scripts = resolveScripts(skillRoot);
  const datadir = path.resolve(job.datadir || dataDir());
  fs.mkdirSync(datadir, { recursive: true });
  const productImages = resolveProductImages(job);
  if (!productImages.length || !productImages.every(isUsableUrl)) {
    throw new Error("job.imageUrls / productImages 须为非空本地路径或 http(s) 数组，禁止 data URL");
  }
  const product = job.product || {};
  if (job.input_image_type && !product.input_image_type) product.input_image_type = job.input_image_type;
  const lang = job.lang || (product.brandKey && product.brandKey.language === "英文" ? "en" : "zh");
  const types = parseTypesSpec(job.types) || defaultTypeList(productImages, product);
  const modelImage = job.modelImage || job.model_image || "";
  if (modelImage && !isUsableUrl(modelImage)) {
    throw new Error("modelImage 须为本地路径或 http(s)");
  }
  const needsModel = types.some((t) => t === "model" || t === "lifestyle" || t === "multi_scene" || t === "three_angle_view");
  const ratio = job.aspectRatio || job.ratio || "1:1";
  const resolution = job.resolution || "2K";
  const templateSet = Number(job.templateSet || job.template_set || 1);
  const desc = productDescription(product);

  const plan = types.map((typeId) => {
    if (!TYPE_LABELS[typeId]) throw new Error(`未知类型: ${typeId}`);
    const refs = refsForType(typeId, productImages, modelImage);
    if (!refs.length) throw new Error(`${typeId} 缺少参考图`);
    const prompt = buildPrompt(typeId, {
      product,
      desc,
      lang,
      templateSet,
      hasProductRef: true,
      hasModelRef: Boolean(modelImage) && refs.includes(modelImage),
      modelStyle: job.modelStyle || job.model_style || "standard",
      keyFeaturesStyle: job.keyFeaturesStyle || job.key_features_style || "",
      perTypeTemplates: job.perTypeTemplates || {},
    });
    return {
      type: typeId,
      label: TYPE_LABELS[typeId],
      point: captionForType(typeId, product, lang),
      desc,
      ratio,
      image_urls: refs,
      prompt,
    };
  });

  const urlsPath = path.join(datadir, "image-urls.json");
  fs.writeFileSync(urlsPath, `${JSON.stringify(productImages, null, 2)}\n`);
  const planPath = path.join(datadir, "image-plan.json");
  fs.writeFileSync(planPath, `${JSON.stringify({ imagePlanList: plan }, null, 2)}\n`);

  const taskSpecs = plan.map((entry, i) => ({
    id: `${i + 1}-${entry.label}`,
    type: entry.type,
    label: entry.label,
    point: entry.point,
    prompt: entry.prompt,
    image_urls: entry.image_urls,
    ratio: entry.ratio,
  }));
  const state = {
    variant: "apparel",
    imageUrls: productImages,
    modelImage: modelImage || "",
    product,
    lang,
    template_set: templateSet,
    image_urls_file: urlsPath,
    resolution,
    plan_file: planPath,
    run_one_task_script: job.run_one_task_script || scripts.run_one_task_script,
    skill_root: path.resolve(skillRoot),
    datadir,
    task_specs: taskSpecs,
  };
  const statePath = path.join(datadir, "collection-state.json");
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const summary = plan.map((row, i) => ({
    index: i + 1,
    type: row.type,
    label: row.label,
    point: row.point,
    refs: row.image_urls.map((p) => path.basename(String(p))).join(" + "),
    ratio: row.ratio,
  }));
  const skipConfirm = job.skip_confirm === true;
  return {
    status: skipConfirm ? "ready_to_dispatch" : "awaiting_confirm",
    skip_confirm: skipConfirm,
    needs_model_image: needsModel && !modelImage,
    plan_file: planPath,
    state_file: statePath,
    image_urls_file: urlsPath,
    run_one_task_script: state.run_one_task_script,
    total: taskSpecs.length,
    specs: taskSpecs.map((s, i) => ({ index: i + 1, type: s.type, label: s.label })),
    summary,
    table: formatPlanTable(summary),
  };
}

module.exports = { runPlanPhase, resolveScripts, formatPlanTable };
