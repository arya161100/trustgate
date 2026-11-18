// sign.js — Ed25519 keypair, sign, verify.
// Primary backend: WebCrypto subtle (browsers + Node 22). Fallback: node:crypto
// (only loaded when subtle Ed25519 is unavailable). Both backends exchange
// keys as base64url DER (SPKI public / PKCS#8 private), so they interop.

import { base64urlEncode, base64urlDecode, utf8Bytes } from "./encoding.js";

let backend = null; // 'subtle' | 'node'
let nodeCrypto = null;

async function pickBackend() {
  if (backend) return backend;
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle) {
    try {
      await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
      backend = "subtle";
      return backend;
    } catch {
      // fall through to node backend
    }
  }
  try {
    nodeCrypto = await import("node:crypto");
    backend = "node";
    return backend;
  } catch {
    throw new Error("Ed25519: no usable backend (need WebCrypto subtle or node:crypto)");
  }
}

// --- subtle backend -------------------------------------------------------

async function subtleGenerate() {
  const pair = await globalThis.crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"],
  );
  const pubDer = await globalThis.crypto.subtle.exportKey("spki", pair.publicKey);
  const privDer = await globalThis.crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return {
    publicKey: base64urlEncode(new Uint8Array(pubDer)),
    privateKey: base64urlEncode(new Uint8Array(privDer)),
  };
}

async function subtleImportPublic(b64) {
  return globalThis.crypto.subtle.importKey(
    "spki",
    base64urlDecode(b64),
    { name: "Ed25519" },
    true,
    ["verify"],
  );
}

async function subtleImportPrivate(b64) {
  return globalThis.crypto.subtle.importKey(
    "pkcs8",
    base64urlDecode(b64),
    { name: "Ed25519" },
    true,
    ["sign"],
  );
}

async function subtleSign(privKey, data) {
  const sig = await globalThis.crypto.subtle.sign({ name: "Ed25519" }, privKey, data);
  return base64urlEncode(new Uint8Array(sig));
}

async function subtleVerify(pubKey, sigB64, data) {
  return globalThis.crypto.subtle.verify(
    { name: "Ed25519" },
    pubKey,
    base64urlDecode(sigB64),
    data,
  );
}

// --- node backend ---------------------------------------------------------

function nodeGenerate() {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("ed25519");
  return {
    publicKey: base64urlEncode(publicKey.export({ type: "spki", format: "der" })),
    privateKey: base64urlEncode(privateKey.export({ type: "pkcs8", format: "der" })),
  };
}

function nodeImportPublic(b64) {
  return nodeCrypto.createPublicKey({
    key: Buffer.from(base64urlDecode(b64)),
    format: "der",
    type: "spki",
  });
}

function nodeImportPrivate(b64) {
  return nodeCrypto.createPrivateKey({
    key: Buffer.from(base64urlDecode(b64)),
    format: "der",
    type: "pkcs8",
  });
}

function nodeSign(privKey, data) {
  return base64urlEncode(nodeCrypto.sign(null, Buffer.from(data), privKey));
}

function nodeVerify(pubKey, sigB64, data) {
  return nodeCrypto.verify(null, Buffer.from(data), pubKey, Buffer.from(base64urlDecode(sigB64)));
}

// --- public API -----------------------------------------------------------

/** Generate an Ed25519 keypair. Returns { publicKey, privateKey } (base64url DER). */
export async function generateKeypair() {
  const b = await pickBackend();
  return b === "subtle" ? subtleGenerate() : nodeGenerate();
}

/** Sign bytes (string or Uint8Array) with a base64url PKCS#8 private key. Returns base64url signature. */
export async function signData(privateKeyB64, data) {
  const b = await pickBackend();
  const bytes = typeof data === "string" ? utf8Bytes(data) : data;
  if (b === "subtle") {
    const key = await subtleImportPrivate(privateKeyB64);
    return subtleSign(key, bytes);
  }
  return nodeSign(nodeImportPrivate(privateKeyB64), bytes);
}

/** Verify a base64url signature over bytes with a base64url SPKI public key. Returns bool. */
export async function verifyData(publicKeyB64, signatureB64, data) {
  const b = await pickBackend();
  const bytes = typeof data === "string" ? utf8Bytes(data) : data;
  if (b === "subtle") {
    const key = await subtleImportPublic(publicKeyB64);
    return subtleVerify(key, signatureB64, bytes);
  }
  return nodeVerify(nodeImportPublic(publicKeyB64), signatureB64, bytes);
}
