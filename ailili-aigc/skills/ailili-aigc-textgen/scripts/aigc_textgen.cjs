#!/usr/bin/env node
"use strict";

const { runCli } = require("../../../scripts/lib/run-cli.cjs");

runCli(["textgen", ...process.argv.slice(2)]);
