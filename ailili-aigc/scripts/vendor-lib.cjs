#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const SRC = path.resolve(__dirname, "lib");
const SKILLS = path.resolve(__dirname, "../skills");
const MANIFEST = {
  "ailili-aigc-imagegen": ["run-cli.cjs"],
  "ailili-aigc-textgen": ["run-cli.cjs"],
  "ailili-aigc-imagegen-guide": ["run-cli.cjs"],
  "ailili-aigc-imagegen-apparel": ["run-cli.cjs", "paths.cjs"],
  "ailili-aigc-imagegen-product": ["run-cli.cjs", "paths.cjs", "brand-gene.cjs", "nl.cjs"],
  "ailili-aigc-imagegen-brand-gene-extract": ["run-cli.cjs", "paths.cjs", "brand-gene.cjs", "nl.cjs"],
  "ailili-aigc-imagegen-scenes": ["run-cli.cjs"],
};

function main() {
  for (const [skill, files] of Object.entries(MANIFEST)) {
    const dest = path.join(SKILLS, skill, "scripts", "lib");
    fs.mkdirSync(dest, { recursive: true });
    for (const file of files) {
      const from = path.join(SRC, file);
      if (!fs.existsSync(from)) throw new Error(`missing ${from}`);
      fs.copyFileSync(from, path.join(dest, file));
    }
  }
}

main();
