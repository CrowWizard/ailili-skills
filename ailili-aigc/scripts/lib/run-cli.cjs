"use strict";

const fs = require("node:fs");
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

function findAililiBin() {
  if (process.env.AILILI_AIGC_BIN && isExecutable(process.env.AILILI_AIGC_BIN)) {
    return process.env.AILILI_AIGC_BIN;
  }
  const names = process.platform === "win32" ? ["ailili-aigc.exe"] : ["ailili-aigc"];
  const skillRoot = process.env.AILILI_SKILL_ROOT;
  const searchRoots = [];
  if (skillRoot) searchRoots.push(path.join(skillRoot, "scripts"), skillRoot);
  searchRoots.push(path.resolve(__dirname, "../.."));
  for (const root of searchRoots) {
    for (const name of names) {
      const direct = path.join(root, name);
      if (isExecutable(direct)) return direct;
      const scripts = path.join(root, "scripts", name);
      if (isExecutable(scripts)) return scripts;
      for (const profile of ["debug", "release"]) {
        const candidate = path.join(root, "target", profile, name);
        if (isExecutable(candidate)) return candidate;
      }
    }
  }
  return null;
}

function runCli(forwardArgv) {
  const bin = findAililiBin();
  if (!bin) {
    process.stderr.write(
      "ailili-aigc binary not found. Set AILILI_AIGC_BIN or run: cargo build -p ailili-aigc\n"
    );
    process.exit(1);
  }
  const result = childProcess.spawnSync(bin, forwardArgv, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status == null ? 1 : result.status);
}

module.exports = { findAililiBin, runCli };
