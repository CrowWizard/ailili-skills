#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SKILL_ROOT = path.resolve(__dirname, "..");
const MODELS = path.join(SKILL_ROOT, "assets", "models.json");

function main() {
  const gender = (process.argv.find((a, i, arr) => arr[i - 1] === "--gender") || "").toLowerCase();
  const list = JSON.parse(fs.readFileSync(MODELS, "utf8"));
  const rows = list
    .filter((m) => !gender || String(m.gender || "").toLowerCase() === gender)
    .map((m) => ({
      id: m.id,
      name: m.name,
      style: m.style,
      gender: m.gender,
      path: path.resolve(SKILL_ROOT, m.local || `assets/models/${m.id}.png`),
      desc: m.desc || "",
    }));
  process.stdout.write(`${JSON.stringify({ models: rows, total: rows.length }, null, 2)}\n`);
}

main();
