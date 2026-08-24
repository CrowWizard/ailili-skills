"use strict";

const NL_PLACEHOLDER = "⏎";

function encodeNl(text) {
  if (typeof text !== "string") {
    return text;
  }
  return text
    .replace(/\\r\\n/g, NL_PLACEHOLDER)
    .replace(/\\n/g, NL_PLACEHOLDER)
    .replace(/\\r/g, NL_PLACEHOLDER)
    .replace(/\r\n/g, NL_PLACEHOLDER)
    .replace(/\r/g, NL_PLACEHOLDER)
    .replace(/\n/g, NL_PLACEHOLDER);
}

function decodeNl(text) {
  if (typeof text !== "string") {
    return text;
  }
  return text.replaceAll(NL_PLACEHOLDER, "\n");
}

function decodeNlInObj(obj) {
  if (typeof obj === "string") {
    return decodeNl(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(decodeNlInObj);
  }
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      out[key] = decodeNlInObj(value);
    }
    return out;
  }
  return obj;
}

module.exports = {
  NL_PLACEHOLDER,
  encodeNl,
  decodeNl,
  decodeNlInObj,
};
