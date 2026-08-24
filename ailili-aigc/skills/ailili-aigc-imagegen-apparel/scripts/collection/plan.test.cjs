"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runPlanPhase } = require("./plan.cjs");

const skillRoot = path.resolve(__dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apparel-plan-"));
const front = path.join(tmp, "front.jpg");
fs.writeFileSync(front, "fake");

const job = {
  datadir: tmp,
  imageUrls: [front],
  lang: "zh",
  skip_confirm: true,
  product: {
    product_description_for_prompt: "white cotton tee",
    garment_position: "top",
    selling_points: [{ zh: "纯棉", en: "Cotton", visual_keywords: ["combed cotton"] }],
  },
};

const result = runPlanPhase(job, skillRoot);
assert.equal(result.status, "ready_to_dispatch");
assert.equal(result.needs_model_image, true);
assert.ok(result.total >= 8);
assert.ok(result.specs.some((s) => s.type === "three_angle_view"));
assert.ok(result.table.includes("服饰套图规划"));
assert.ok(fs.existsSync(result.state_file));
const state = JSON.parse(fs.readFileSync(result.state_file, "utf8"));
assert.equal(state.variant, "apparel");
assert.ok(state.task_specs[0].prompt.includes("white cotton tee"));

const typed = runPlanPhase({ ...job, types: ["white_bg"], skip_confirm: true }, skillRoot);
assert.equal(typed.total, 1);
assert.equal(typed.specs[0].type, "white_bg");
assert.equal(typed.needs_model_image, false);

console.log("ok");
