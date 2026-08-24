#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  expandTypeSlots,
  defaultPlanForCount,
  jobImageCount,
  buildSlotsSkeleton,
  formatPlanTable,
} = require("./slots.cjs");
const { VARIANT } = require("./config.cjs");
const { buildParams } = require("./textgen-params.cjs");
const { extractWhiteBgPrompt } = require("./imagegen-prompt.cjs");
const { runPlanPhase } = require("./plan.cjs");

function testSlots() {
  assert.deepEqual(defaultPlanForCount(6), [
    ["SELLING_POINT", 3],
    ["SCENE", 2],
    ["WHITE_BG", 1],
  ]);
  assert.deepEqual(defaultPlanForCount(8), [
    ["SELLING_POINT", 4],
    ["SCENE", 3],
    ["WHITE_BG", 1],
  ]);
  assert.deepEqual(defaultPlanForCount(10), [
    ["SELLING_POINT", 5],
    ["SCENE", 4],
    ["WHITE_BG", 1],
  ]);
  assert.equal(jobImageCount({}), 6);
  assert.equal(jobImageCount({ count: 10 }), 10);
  const slots = expandTypeSlots(null, defaultPlanForCount(6));
  assert.equal(slots.length, 6);
  assert.equal(slots.filter((t) => t === "SELLING_POINT").length, 3);
  const custom = expandTypeSlots([{ type: "WHITE_BG", count: 2 }], VARIANT.default_plan_d);
  assert.deepEqual(custom, ["WHITE_BG", "WHITE_BG"]);
  const plan = buildSlotsSkeleton(["SELLING_POINT", "SCENE"], {
    aspectRatio: "1:1",
    aplusRatio: "",
    userImageDesc: "",
  });
  assert.equal(plan[0].layout, "概览");
  assert.equal(plan[1].layout, "");
  const table = formatPlanTable([{ index: 1, label: "白底图", desc: "a", image_desc: "b", ratio: "1:1" }]);
  assert.match(table, /白底图/);
}

function testTemplates() {
  const tg = buildParams("SCENE", ["https://example.com/a.jpg"], { point: "防水" });
  assert.match(tg.prompt, /防水/);
  assert.equal(tg.thinkingLevel, "low");
  const white = extractWhiteBgPrompt();
  assert.match(white, /Pure White Background/);
}

function testPlanSkip() {
  const datadir = fs.mkdtempSync(path.join(os.tmpdir(), "ailili-plan-"));
  const skillRoot = path.resolve(__dirname, "../..");
  const result = runPlanPhase(
    {
      imageUrls: ["https://example.com/a.jpg"],
      skip_s1: true,
      extract_brand_gene: false,
      skip_confirm: true,
      types: [{ type: "WHITE_BG", count: 1 }],
      datadir,
    },
    skillRoot
  );
  assert.equal(result.status, "ready_to_dispatch");
  assert.equal(result.total, 1);
  assert.equal(result.specs[0].type, "WHITE_BG");
  assert.ok(fs.existsSync(result.state_file));
  fs.rmSync(datadir, { recursive: true, force: true });
}

testSlots();
testTemplates();
testPlanSkip();
process.stdout.write("collection.lib ok\n");
