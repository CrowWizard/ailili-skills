"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

const sessionCache = {};

function getApiBase() {
  const raw = process.env.AILILI_TOOL_GATEWAY || "http://127.0.0.1:8788";
  return raw.replace(/\/+$/, "");
}

function isLoopbackBase(base) {
  try {
    const host = new URL(base).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function formatIso(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const tz = -date.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const abs = Math.abs(tz);
  const offset = `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`
  );
}

function sessionId(date) {
  const env = (process.env.SESSION_ID || "").trim();
  if (env) {
    return env;
  }
  if (!sessionCache._auto) {
    const hhmmss = [
      String(date.getHours()).padStart(2, "0"),
      String(date.getMinutes()).padStart(2, "0"),
      String(date.getSeconds()).padStart(2, "0"),
    ].join("");
    sessionCache._auto = `${hhmmss}-${crypto.randomBytes(3).toString("hex")}`;
  }
  return sessionCache._auto;
}

function sessionStoreRoot() {
  if (sessionCache._root) {
    return sessionCache._root;
  }
  const candidates = [];
  const acpx = (process.env.ACPX_WORKSPACES || "").trim();
  if (acpx) {
    const first = acpx.split(path.delimiter)[0].trim();
    if (first) {
      candidates.push(path.join(first, "ailili"));
    }
  }
  candidates.push(path.join(process.cwd(), "ailili"));
  candidates.push(path.join(os.homedir(), "ailili"));
  candidates.push(path.join(os.tmpdir(), "ailili"));
  for (const root of candidates) {
    try {
      fs.mkdirSync(root, { recursive: true });
      const probe = path.join(root, ".write_probe");
      fs.writeFileSync(probe, "");
      fs.unlinkSync(probe);
      sessionCache._root = path.resolve(root);
      return sessionCache._root;
    } catch {
      continue;
    }
  }
  const fallback = path.resolve(candidates[candidates.length - 1]);
  sessionCache._root = fallback;
  return fallback;
}

function ensureMeta(root, sessionDir, dateStr, sid, date) {
  const metaPath = path.join(sessionDir, "_meta.json");
  if (fs.existsSync(metaPath)) {
    return;
  }
  const meta = {
    session_id: sid,
    date: dateStr,
    started_at: formatIso(date),
    skills_called: [],
    deliverables: [],
    data_files: [],
    media_files: [],
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  try {
    fs.appendFileSync(
      path.join(root, "index.jsonl"),
      `${JSON.stringify({
        session_id: sid,
        date: dateStr,
        path: path.relative(root, sessionDir),
        started_at: formatIso(date),
      })}\n`
    );
  } catch {
    // ignore index write failures
  }
}

function updateMeta(sessionDir, { skill, kind, fileRel, date }) {
  const metaPath = path.join(sessionDir, "_meta.json");
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return;
  }
  meta.skills_called = meta.skills_called || [];
  if (skill && !meta.skills_called.includes(skill)) {
    meta.skills_called.push(skill);
  }
  const bucket =
    { data: "data_files", deliverable: "deliverables", media: "media_files" }[kind] ||
    "data_files";
  const files = meta[bucket] || [];
  if (!files.includes(fileRel)) {
    files.push(fileRel);
  }
  meta[bucket] = files;
  meta.last_used_at = formatIso(date);
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

function ensureSession(date) {
  const dateStr = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const sid = sessionId(date);
  const root = sessionStoreRoot();
  const sessionDir = path.join(root, dateStr, sid);
  fs.mkdirSync(sessionDir, { recursive: true });
  ensureMeta(root, sessionDir, dateStr, sid, date);
  return { root, sessionDir };
}

function sessionRoot(date = new Date()) {
  return ensureSession(date).sessionDir;
}

function resolveDataPath(slug, date = new Date(), ext = "json") {
  const { sessionDir } = ensureSession(date);
  const sub = path.join(sessionDir, "data");
  fs.mkdirSync(sub, { recursive: true });
  const out = path.join(sub, `${slug}-${Math.floor(date.getTime() * 1000)}.${ext}`);
  updateMeta(sessionDir, {
    skill: slug,
    kind: "data",
    fileRel: path.relative(sessionDir, out),
    date,
  });
  return out;
}

function dataDir(date = new Date()) {
  const dir = path.join(sessionRoot(date), "data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function guessExtFromUrl(url, contentType) {
  const pathname = url.split("?")[0];
  const candidate = path.posix.extname(pathname).replace(/^\./, "");
  if (candidate && candidate.length <= 5 && /^[a-zA-Z0-9]+$/.test(candidate)) {
    return candidate;
  }
  const ct = contentType || "";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("webm")) return "webm";
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "bin";
}

function downloadOnce(url, destPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.get(
      url,
      {
        timeout: timeoutMs,
        headers: { "User-Agent": "Ailili-AIGC/0.1" },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          downloadOnce(new URL(res.headers.location, url).href, destPath, timeoutMs)
            .then(resolve)
            .catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on("finish", () => {
          out.close(() =>
            resolve({ tmp: destPath, contentType: res.headers["content-type"] || "" })
          );
        });
        out.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

async function downloadMedia(url, slug, date = new Date(), ext = null, timeoutMs = 300000) {
  if (!url || typeof url !== "string") {
    return null;
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    process.stderr.write(`[download_media] Unsupported URL scheme: ${url.slice(0, 80)}\n`);
    return null;
  }
  const { sessionDir } = ensureSession(date);
  const mediaDir = path.join(sessionDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  const tmpFilename = `.tmp-${slug}-${Math.floor(date.getTime() * 1000)}.download`;
  const tmpPath = path.join(mediaDir, tmpFilename);
  try {
    const { tmp, contentType } = await downloadOnce(url, tmpPath, timeoutMs);
    const guessed = ext || guessExtFromUrl(url, contentType);
    const finalPath = path.join(mediaDir, `${slug}-${Math.floor(date.getTime() * 1000)}.${guessed}`);
    fs.renameSync(tmp, finalPath);
    updateMeta(sessionDir, {
      skill: slug,
      kind: "media",
      fileRel: path.relative(sessionDir, finalPath),
      date,
    });
    return finalPath;
  } catch (error) {
    process.stderr.write(`[download_media] Failed to download ${url}: ${error.message}\n`);
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // ignore
    }
    return null;
  }
}

module.exports = {
  getApiBase,
  isLoopbackBase,
  sessionRoot,
  resolveDataPath,
  dataDir,
  downloadMedia,
};
