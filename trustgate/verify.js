// verify.js — TrustGate signed manifest: sign + verify.
// Manifest format: docs/manifest-format.md

import { hashObject } from "./canonical.js";
import { signData, verifyData } from "./sign.js";

/**
 * Sign a manifest's fields. Returns the full manifest:
 * { ...fields, hash, signature }.
 * `fields` must contain publicKey, issuedAt, expiresAt (see docs).
 */
export async function signManifest(fields, privateKeyB64) {
  const hash = await hashObject(fields);
  const signature = await signData(privateKeyB64, hash);
  return { ...fields, hash, signature };
}

/**
 * Verify a manifest. Returns { ok: true } or { ok: false, reason }.
 * Reasons: ManifestUnsigned | ManifestHashMismatch | AgentRevoked |
 *          ManifestExpired | ManifestBadSignature.
 * `opts.now` (Date, default now) and `opts.revokedHashes` (string[]).
 */
export async function verifyManifest(manifest, opts = {}) {
  const now = opts.now || new Date();
  const revokedHashes = opts.revokedHashes || [];
  const { signature, hash, ...fields } = manifest;

  if (!signature) return { ok: false, reason: "ManifestUnsigned" };
  if (!hash) return { ok: false, reason: "ManifestHashMismatch" };
  if (!manifest.publicKey) return { ok: false, reason: "ManifestBadSignature" };

  const computed = await hashObject(fields);
  if (computed !== hash) return { ok: false, reason: "ManifestHashMismatch" };
  if (revokedHashes.includes(hash)) return { ok: false, reason: "AgentRevoked" };
  if (manifest.expiresAt && new Date(manifest.expiresAt) <= now) {
    return { ok: false, reason: "ManifestExpired" };
  }

  let valid;
  try {
    valid = await verifyData(manifest.publicKey, signature, hash);
  } catch {
    return { ok: false, reason: "ManifestBadSignature" };
  }
  if (!valid) return { ok: false, reason: "ManifestBadSignature" };
  return { ok: true };
}
