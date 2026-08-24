"use strict";

const { APLUS_TYPES, SP_APLUS_TYPES, SP_LAYOUTS, DEFAULT_RATIOS } = require("./config.cjs");

function jobImageCount(job) {
  if (!job || typeof job !== "object") return 6;
  const raw = job.count ?? job.n ?? job.total ?? job.outputNum;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 6;
  return Math.min(30, Math.floor(n));
}

/** Default mix: 卖点 (n-6)/2+3, 白底 1, 其余场景. n=6 → 3+2+1. */
function defaultPlanForCount(n) {
  const total = Math.max(1, Math.floor(Number(n) || 6));
  const white = 1;
  let selling = Math.floor((total - 6) / 2) + 3;
  selling = Math.max(0, Math.min(selling, Math.max(0, total - white)));
  let scene = total - selling - white;
  if (scene < 0) {
    selling += scene;
    scene = 0;
  }
  const plan = [];
  if (selling > 0) plan.push(["SELLING_POINT", selling]);
  if (scene > 0) plan.push(["SCENE", scene]);
  if (white > 0) plan.push(["WHITE_BG", white]);
  return plan;
}

function expandTypeSlots(typesSpec, defaultPlan) {
  if (!typesSpec || !typesSpec.length) {
    const slots = [];
    for (const [ttype, count] of defaultPlan) {
      for (let i = 0; i < count; i += 1) slots.push(ttype);
    }
    return slots;
  }
  const slots = [];
  for (const item of typesSpec) {
    const ttype = item.type;
    const count = Number(item.count || 1);
    if (!ttype || count < 1) {
      throw new Error(`非法 types 条目: ${JSON.stringify(item)}`);
    }
    for (let i = 0; i < count; i += 1) slots.push(ttype);
  }
  return slots;
}

function resolveRatio(ttype, aspectRatio, aplusRatio) {
  if (APLUS_TYPES.has(ttype)) {
    return aplusRatio || aspectRatio || DEFAULT_RATIOS[ttype] || "1464:600";
  }
  return aspectRatio || DEFAULT_RATIOS[ttype] || "1:1";
}

function assignLayouts(slots) {
  let spI = 0;
  return slots.map((ttype) => {
    if (SP_APLUS_TYPES.has(ttype)) {
      const layout = SP_LAYOUTS[spI % SP_LAYOUTS.length];
      spI += 1;
      return layout;
    }
    return "";
  });
}

function buildSlotsSkeleton(slots, { aspectRatio, aplusRatio, userImageDesc }) {
  const layouts = assignLayouts(slots);
  return slots.map((ttype, i) => {
    const entry = {
      type: ttype,
      point: "",
      desc: "",
      image_desc: "",
      ratio: resolveRatio(ttype, aspectRatio, aplusRatio),
      layout: layouts[i],
    };
    if (ttype === "MODEL_IMAGE" && userImageDesc) {
      entry.image_desc = userImageDesc;
    }
    return entry;
  });
}

function mergeS1Result(base, s1List) {
  if (!Array.isArray(s1List) || s1List.length !== base.length) {
    throw new Error(`S1 返回条目数 ${s1List && s1List.length} 与规划槽位 ${base.length} 不一致`);
  }
  return base.map((b, i) => {
    const row = { ...b };
    const s = s1List[i] || {};
    for (const key of ["type", "point", "desc", "image_desc", "ratio", "layout"]) {
      const val = s[key];
      if (val != null && val !== "") {
        if (key === "type" && val !== row.type) {
          throw new Error(`S1 类型 ${val} 与槽位 ${row.type} 不一致`);
        }
        row[key] = val;
      }
    }
    return row;
  });
}

function planSummary(plan, typeLabels) {
  return plan.map((row, i) => ({
    index: i + 1,
    type: row.type || "",
    label: typeLabels[row.type] || row.type,
    desc: row.desc || "—",
    point: row.point || "—",
    image_desc: row.image_desc || "—",
    ratio: row.ratio || "1:1",
  }));
}

function sanitizeCell(val) {
  if (val == null || val === "") return "—";
  const s = String(val)
    .replace(/\r\n/g, " ")
    .replace(/[\n\r]/g, " ")
    .replace(/[|｜]/g, "/")
    .trim();
  return s || "—";
}

function formatPlanTable(summary) {
  const lines = [
    "# 套图规划方案",
    "",
    "| 序号 | 类型 | 简述 | 画面内容 | 比例 |",
    "|------|------|------|----------|------|",
  ];
  for (const row of summary) {
    lines.push(
      `| ${row.index} | ${sanitizeCell(row.label)} | ${sanitizeCell(row.desc)} | ${sanitizeCell(row.image_desc)} | ${sanitizeCell(row.ratio)} |`
    );
  }
  return `${lines.join("\n")}\n`;
}

function extractImagePlanList(parsed) {
  let value = parsed;
  while (Array.isArray(value) && value.length === 1 && Array.isArray(value[0])) {
    value = value[0];
  }
  if (Array.isArray(value) && value.length === 1 && value[0] && value[0].imagePlanList) {
    value = value[0];
  }
  if (value && typeof value === "object" && !Array.isArray(value) && value.imagePlanList) {
    return value.imagePlanList;
  }
  return value;
}

function taskResultPath(datadir, taskId) {
  const safe = String(taskId || "unknown").replace(/[^0-9A-Za-z\u4e00-\u9fff_-]+/g, "-");
  return require("node:path").join(datadir, `task-result-${safe}.json`);
}

module.exports = {
  jobImageCount,
  defaultPlanForCount,
  expandTypeSlots,
  buildSlotsSkeleton,
  mergeS1Result,
  planSummary,
  formatPlanTable,
  extractImagePlanList,
  taskResultPath,
};
