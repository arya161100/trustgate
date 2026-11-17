// canonical.js — canonical JSON (RFC 8785-style: sorted keys, no whitespace)
// + SHA-256. Isomorphic: WebCrypto subtle in browsers and Node.

import { bytesToHex, utf8Bytes } from "./encoding.js";

export function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonicalize: non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") +
      "}"
    );
  }
  throw new Error("canonicalize: unsupported type " + typeof value);
}

export async function sha256Hex(input) {
  const data = typeof input === "string" ? utf8Bytes(input) : input;
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error("sha256Hex: WebCrypto subtle not available");
  const digest = await subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

/** SHA-256 of the canonical JSON of an object. */
export async function hashObject(obj) {
  return sha256Hex(canonicalize(obj));
}
