#!/usr/bin/env node
"use strict";

const { runCli } = require("../../../scripts/lib/run-cli.cjs");

runCli(["imagegen", ...process.argv.slice(2)]);
