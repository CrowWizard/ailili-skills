#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { dataDir, resolveDataPath } = require("../../../scripts/lib/paths.cjs");

const SLUG = "ailili-aigc-imagegen-brand-gene-extract";

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--datadir")) {
    process.stdout.write(`${path.resolve(dataDir())}\n`);
    return 0;
  }
  const input = argv.find((arg) => !arg.startsWith("-"));
  let payload;
  try {
    const raw = input ? fs.readFileSync(input, "utf8") : fs.readFileSync(0, "utf8");
    payload = JSON.parse(raw);
  } catch (error) {
    process.stderr.write(`Invalid JSON: ${error.message}\n`);
    return 1;
  }
  const outPath = resolveDataPath(SLUG, new Date());
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serialized);
  process.stdout.write(
    `Saved full response: ${path.resolve(outPath)} (${Buffer.byteLength(serialized)} bytes)\n`
  );
  return 0;
}

process.exit(main());
