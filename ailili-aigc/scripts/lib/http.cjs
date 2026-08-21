"use strict";

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const childProcess = require("node:child_process");
const { URL } = require("node:url");
const { getApiBase, isLoopbackBase } = require("./paths.cjs");

const POLL_INTERVAL_START = 10;
const POLL_INTERVAL_MIN = 5;
const POLL_INTERVAL_STEP = 1;
const MAX_POLL_TIME = 600;

function getApiKey() {
  return process.env.LINKFOX_AGENT_API_KEY || process.env.LINKFOXAGENT_API_KEY || "";
}

function requireApiKey() {
  const key = getApiKey();
  if (key) {
    return key;
  }
  if (isLoopbackBase(getApiBase())) {
    return "";
  }
  process.stderr.write("API Key 未配置\n");
  process.exit(1);
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function getJson(url, timeoutMs = 2000) {
  const parsed = new URL(url);
  const lib = parsed.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

function findAililiBin() {
  if (process.env.AILILI_AIGC_BIN && fs.existsSync(process.env.AILILI_AIGC_BIN)) {
    return process.env.AILILI_AIGC_BIN;
  }
  const repoRoot = path.resolve(__dirname, "../..");
  const names = process.platform === "win32" ? ["ailili-aigc.exe"] : ["ailili-aigc"];
  for (const profile of ["debug", "release"]) {
    for (const name of names) {
      const candidate = path.join(repoRoot, "target", profile, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

async function ensureGateway() {
  const base = getApiBase();
  try {
    await getJson(`${base}/health`);
    return;
  } catch (error) {
    if (!isLoopbackBase(base)) {
      throw new Error(`gateway ${base} is unreachable: ${error.message}`);
    }
  }
  const bin = findAililiBin();
  if (!bin) {
    throw new Error(
      `gateway ${base} is down and ailili-aigc binary was not found. Run: cargo run -p ailili-aigc -- daemon start`
    );
  }
  process.stderr.write(`ailili-aigc: starting daemon via ${bin}\n`);
  const started = childProcess.spawnSync(bin, ["daemon", "start"], {
    encoding: "utf8",
    timeout: 25000,
  });
  if (started.status !== 0) {
    throw new Error(
      started.stderr.trim() || started.stdout.trim() || "ailili-aigc daemon start failed"
    );
  }
  await getJson(`${base}/health`);
}

function postJson(url, params, timeoutMs = 150000) {
  const apiKey = requireApiKey();
  const body = JSON.stringify(params);
  const parsed = new URL(url);
  const lib = parsed.protocol === "http:" ? http : https;
  const headers = {
    Authorization: apiKey,
    "Content-Type": "application/json",
    "User-Agent": "LinkFox-Skill/2.0",
    SESSION_ID: process.env.SESSION_ID || "",
    MODE_ID: process.env.MODE_ID || "",
    APP_NAME: process.env.APP_NAME || "",
    "Content-Length": Buffer.byteLength(body),
  };
  return new Promise((resolve) => {
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsedBody;
          try {
            parsedBody = text ? JSON.parse(text) : {};
          } catch {
            parsedBody = { error: `HTTP ${res.statusCode}: ${res.statusMessage}`, details: text };
          }
          if (res.statusCode >= 400 && !parsedBody.error && !parsedBody.errcode && !parsedBody.errorCode) {
            parsedBody.error = parsedBody.error || `HTTP ${res.statusCode}: ${res.statusMessage}`;
          }
          resolve(parsedBody);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ error: "Connection failed: timeout" });
    });
    req.on("error", (error) => {
      resolve({ error: `Connection failed: ${error.message}` });
    });
    req.write(body);
    req.end();
  });
}

async function pollUntilDone(queryPath, taskId, memberId, { httpTimeout = 150000 } = {}) {
  const started = Date.now();
  let interval = POLL_INTERVAL_START;
  while ((Date.now() - started) / 1000 < MAX_POLL_TIME) {
    await sleep(interval);
    const result = await postJson(
      `${getApiBase()}${queryPath}`,
      { taskId, memberId },
      httpTimeout
    );
    if (result.error) {
      process.stderr.write(`  Poll error: ${result.error}\n`);
      interval = Math.max(interval - POLL_INTERVAL_STEP, POLL_INTERVAL_MIN);
      continue;
    }
    const status = result.status;
    if (status === "SUCCESS" || status === "FAILED") {
      return result;
    }
    const elapsed = Math.floor((Date.now() - started) / 1000);
    process.stderr.write(
      `  Polling... status=${status}, elapsed=${elapsed}s, next in ${interval}s\n`
    );
    interval = Math.max(interval - POLL_INTERVAL_STEP, POLL_INTERVAL_MIN);
  }
  return { error: `Polling timeout after ${MAX_POLL_TIME}s`, taskId };
}

module.exports = {
  getApiKey,
  requireApiKey,
  postJson,
  pollUntilDone,
  ensureGateway,
  POLL_INTERVAL_START,
  MAX_POLL_TIME,
};
