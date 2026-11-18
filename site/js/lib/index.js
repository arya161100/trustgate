// TrustGate — the missing trust layer for the open agentic web.
// Signed agent identity (Ed25519) + policy gate (SpendGuard model) +
// hash-chained audit trail. Zero dependencies, isomorphic (browser + Node).

export { canonicalize, sha256Hex, hashObject } from "./canonical.js";
export { base64urlEncode, base64urlDecode, bytesToHex, utf8Bytes } from "./encoding.js";
export { generateKeypair, signData, verifyData } from "./sign.js";
export { signManifest, verifyManifest } from "./verify.js";
export { defaultPolicy, evaluatePolicy, utcDayKey, REASONS } from "./policy.js";
export { appendEntry, verifyChain, GENESIS_PREV } from "./audit.js";
