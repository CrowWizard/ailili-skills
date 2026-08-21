#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { processTask, specFromPlan } = require("./collection/one-task.cjs");

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

function main() {
  const argv = process.argv.slice(2);
  const stateFile = argValue(argv, "--state");
  const index = Number(argValue(argv, "--index") || 0);
  if (!stateFile || !index) {
    process.stderr.write("Usage: node run_one_task.cjs --state collection-state.json --index N\n");
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync(path.resolve(stateFile), "utf8"));
  const plan = JSON.parse(fs.readFileSync(state.plan_file, "utf8"));
  const entries = plan.imagePlanList || plan;
  const entry = entries[index - 1];
  if (!entry) throw new Error(`index ${index} 超出 plan 长度 ${entries.length}`);
  const spec = specFromPlan(entry, state, index);
  const result = processTask(spec, state.skill_root);
  return result.status === "success" ? 0 : 1;
}

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
