#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { processTask, specFromPlan } = require("./collection/one-task.cjs");
const { setTraceFile, trace } = require("./lib/trace.cjs");

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

function loadJson(file) {
  const resolved = path.resolve(file);
  const raw = fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw);
  } catch (error) {
    const match = /position (\d+)/i.exec(error.message);
    const at = match ? Number(match[1]) : 0;
    const near = raw.slice(Math.max(0, at - 90), at + 90).replace(/\n/g, "\\n");
    throw new Error(`Invalid JSON ${resolved}: ${error.message}\n  near: ${near}`);
  }
}

function planEntries(state) {
  if (Array.isArray(state.imagePlanList) && state.imagePlanList.length) {
    return state.imagePlanList;
  }
  if (Array.isArray(state.task_specs) && state.task_specs.some((row) => row.prompt || row.point || row.desc)) {
    return state.task_specs;
  }
  if (!state.plan_file) {
    throw new Error("collection-state.json 缺少 imagePlanList / plan_file");
  }
  const plan = loadJson(state.plan_file);
  return plan.imagePlanList || plan;
}

function main() {
  const argv = process.argv.slice(2);
  const stateFile = argValue(argv, "--state");
  const index = Number(argValue(argv, "--index") || 0);
  if (!stateFile || !index) {
    process.stderr.write("Usage: node run_one_task.cjs --state collection-state.json --index N\n");
    process.exit(1);
  }
  const state = loadJson(stateFile);
  if (state.trace_file) setTraceFile(state.trace_file);
  else if (state.datadir) setTraceFile(path.join(state.datadir, "ailili-trace.log"));
  trace("run_one_task:start", { index, state: path.resolve(stateFile) });
  const entries = planEntries(state);
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
