#!/usr/bin/env node
"use strict";

const { runCli } = require("./lib/run-cli.cjs");

runCli(["textgen", ...process.argv.slice(2)]);
