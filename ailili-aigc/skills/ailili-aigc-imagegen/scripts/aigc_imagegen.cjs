#!/usr/bin/env node
"use strict";

const { runCli } = require("./lib/run-cli.cjs");

runCli(["imagegen", ...process.argv.slice(2)]);
