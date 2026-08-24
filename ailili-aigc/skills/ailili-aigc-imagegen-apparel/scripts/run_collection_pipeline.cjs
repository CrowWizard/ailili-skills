#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { runPlanPhase } = require("./collection/plan.cjs");
const { collectionStatus, runSummaryPhase } = require("./collection/summary.cjs");

const SKILL_ROOT = path.resolve(__dirname, "..");

function argValue(argv, name) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return null;
  return argv[i + 1];
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function dispatch(stateFile) {
  const state = loadJson(stateFile);
  const runScript = state.run_one_task_script;
  if (!runScript || !fs.existsSync(runScript)) {
    throw new Error(`run_one_task_script 不存在: ${runScript}`);
  }
  const total = (state.task_specs || []).length;
  const datadir = path.resolve(state.datadir);
  fs.mkdirSync(datadir, { recursive: true });
  const pids = [];
  for (let i = 1; i <= total; i += 1) {
    const log = fs.openSync(path.join(datadir, `task-${i}.log`), "a");
    const child = childProcess.spawn(
      process.execPath,
      [runScript, "--state", path.resolve(stateFile), "--index", String(i)],
      {
        detached: true,
        stdio: ["ignore", log, log],
        env: process.env,
        windowsHide: process.platform === "win32",
      }
    );
    child.unref();
    pids.push(child.pid);
    fs.closeSync(log);
  }
  state.dispatch_started_at = Date.now();
  state.dispatch_pids = pids;
  fs.writeFileSync(path.resolve(stateFile), `${JSON.stringify(state, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      status: "dispatch_started",
      total,
      pending: total,
      completed: 0,
      failed: 0,
      done: false,
      state_file: path.resolve(stateFile),
      pids,
    })}\n`
  );
}

function main() {
  const argv = process.argv.slice(2);
  const phase = argValue(argv, "--phase");
  if (!phase || !["plan", "dispatch", "status", "summary"].includes(phase)) {
    process.stderr.write(
      "Usage:\n" +
        "  node run_collection_pipeline.cjs --phase plan --job job.json\n" +
        "  node run_collection_pipeline.cjs --phase dispatch --state collection-state.json\n" +
        "  node run_collection_pipeline.cjs --phase status --state collection-state.json\n" +
        "  node run_collection_pipeline.cjs --phase summary --state collection-state.json\n"
    );
    process.exit(1);
  }
  try {
    if (phase === "plan") {
      const jobPath = argValue(argv, "--job");
      if (!jobPath) throw new Error("plan 需要 --job");
      const result = runPlanPhase(loadJson(jobPath), SKILL_ROOT);
      if (result.status === "awaiting_confirm" && result.table) process.stdout.write(result.table);
      const { table, ...status } = result;
      process.stdout.write(`${JSON.stringify(status)}\n`);
      return 0;
    }
    const stateFile = argValue(argv, "--state");
    if (!stateFile) throw new Error(`${phase} 需要 --state`);
    if (phase === "dispatch") {
      dispatch(stateFile);
      return 0;
    }
    const state = loadJson(stateFile);
    if (phase === "status") {
      process.stdout.write(`${JSON.stringify(collectionStatus(state))}\n`);
      return 0;
    }
    runSummaryPhase(state);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "error", error: error.message })}\n`);
    process.stderr.write(`ERROR: ${error.message}\n`);
    return 1;
  }
}

process.exit(main());
