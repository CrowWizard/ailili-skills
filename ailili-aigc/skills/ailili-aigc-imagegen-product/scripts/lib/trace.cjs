"use strict";

const fs = require("node:fs");
const path = require("node:path");

function resolveTraceFile() {
  const env = (process.env.AILILI_TRACE_FILE || "").trim();
  return env || "";
}

function setTraceFile(file) {
  if (!file) return "";
  const resolved = path.resolve(file);
  process.env.AILILI_TRACE_FILE = resolved;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function trace(event, fields) {
  const payload = {
    ts: new Date().toISOString(),
    t: Date.now(),
    pid: process.pid,
    event: String(event || "event"),
  };
  if (fields && typeof fields === "object") {
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      payload[key] = value;
    }
  }
  const line = `${JSON.stringify(payload)}\n`;
  const file = resolveTraceFile();
  if (file) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, line);
    } catch (error) {
      process.stderr.write(`[trace] write failed: ${error.message}\n`);
    }
  }
  const extra = payload.ms != null ? ` ${payload.ms}ms` : "";
  const id = payload.id || payload.taskId || payload.phase || "";
  process.stderr.write(`[trace] ${payload.event}${id ? ` ${id}` : ""}${extra}\n`);
}

function timed(event, fields, fn) {
  const t0 = Date.now();
  trace(`${event}:start`, fields);
  try {
    const result = fn();
    trace(`${event}:ok`, { ...fields, ms: Date.now() - t0 });
    return result;
  } catch (error) {
    trace(`${event}:err`, {
      ...fields,
      ms: Date.now() - t0,
      err: String(error && error.message ? error.message : error).slice(0, 400),
    });
    throw error;
  }
}

module.exports = { resolveTraceFile, setTraceFile, trace, timed };
