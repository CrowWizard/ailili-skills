"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

function isExecutable(filePath) {
  try {
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) return false;
    if (process.platform === "win32") return true;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function binaryName() {
  return process.platform === "win32" ? "ailili-aigc.exe" : "ailili-aigc";
}

function dataHome() {
  const home = (process.env.AILILI_AIGC_HOME || "").trim();
  if (home) return home;
  const codex = (process.env.CODEX_HOME || "").trim();
  if (codex) return path.join(codex, "ailili-aigc");
  return path.join(process.env.HOME || process.env.USERPROFILE || os.tmpdir(), ".ailili-aigc");
}

function candidateBin(root) {
  const name = binaryName();
  return [path.join(root, name), path.join(root, "bin", name), path.join(root, "scripts", name)];
}

function searchRoots() {
  const roots = [];
  const seen = new Set();
  const add = (p) => {
    if (!p) return;
    const resolved = path.resolve(p);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    roots.push(resolved);
  };
  const envRoot = (process.env.AILILI_SKILL_ROOT || "").trim();
  if (envRoot) add(envRoot);
  add(path.resolve(__dirname, "../.."));
  add(dataHome());
  let dir = path.resolve(__dirname);
  for (let i = 0; i < 8; i += 1) {
    add(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return roots;
}

function findAililiBin() {
  const name = binaryName();
  const explicit = (process.env.AILILI_AIGC_BIN || "").trim();
  if (explicit) {
    if (isExecutable(explicit)) return explicit;
    const nested = path.join(explicit, name);
    if (isExecutable(nested)) return nested;
  }
  for (const root of searchRoots()) {
    for (const direct of candidateBin(root)) {
      if (isExecutable(direct)) return direct;
    }
    for (const profile of ["debug", "release"]) {
      const candidate = path.join(root, "target", profile, name);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function missingBinMessage() {
  return "ailili-aigc binary not found. Set AILILI_AIGC_BIN or put ailili-aigc.exe in $AILILI_AIGC_HOME / skill scripts/";
}

function runCaptured(forwardArgv, { input, timeout } = {}) {
  const bin = findAililiBin();
  if (!bin) throw new Error(missingBinMessage());
  let trace;
  try {
    trace = require("./trace.cjs");
  } catch {
    trace = null;
  }
  const cmd = forwardArgv[0] || "cli";
  const t0 = Date.now();
  if (trace) trace.trace("cli:start", { cmd, bin });
  const result = childProcess.spawnSync(bin, forwardArgv, {
    input,
    encoding: "utf8",
    timeout: timeout || 0,
    env: process.env,
    windowsHide: process.platform === "win32",
  });
  if (result.stderr) process.stderr.write(result.stderr);
  const ms = Date.now() - t0;
  if (result.error) {
    if (trace) trace.trace("cli:err", { cmd, ms, err: result.error.message });
    throw result.error;
  }
  if (result.status !== 0) {
    const tail = (result.stderr || result.stdout || "").trim().split("\n").slice(-5).join(" | ");
    if (trace) trace.trace("cli:err", { cmd, ms, exit: result.status, err: tail.slice(0, 400) });
    throw new Error(`ailili-aigc ${forwardArgv[0] || ""} failed (exit=${result.status}): ${tail}`);
  }
  if (trace) trace.trace("cli:ok", { cmd, ms });
  return result.stdout || "";
}

function runCli(forwardArgv) {
  try {
    const stdout = runCaptured(forwardArgv);
    if (stdout) process.stdout.write(stdout);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { findAililiBin, runCli, runCaptured, dataHome };
