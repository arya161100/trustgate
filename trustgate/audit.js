// audit.js — hash-chained append-only audit trail.
// Audit format: docs/audit-format.md.

import { canonicalize, sha256Hex } from "./canonical.js";

export const GENESIS_PREV = "0".repeat(64);

/**
 * Append an entry to a chain. `fields` holds the entry payload
 * (ts, decision, reason, origin, action, amount, actor, ...).
 * Returns the new entry (with seq, prevHash, hash). Does not mutate `chain`.
 */
export async function appendEntry(chain, fields) {
  const prevHash = chain.length ? chain[chain.length - 1].hash : GENESIS_PREV;
  const entry = { seq: chain.length, ...fields, prevHash };
  const hash = await sha256Hex(canonicalize(entry));
  return { ...entry, hash };
}

/**
 * Verify a chain. Returns { ok: true } or
 * { ok: false, breakIndex, reason } where reason is one of
 * SeqMismatch | PrevHashMismatch | HashMismatch.
 */
export async function verifyChain(chain) {
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    if (entry.seq !== i) return { ok: false, breakIndex: i, reason: "SeqMismatch" };
    const expectedPrev = i === 0 ? GENESIS_PREV : chain[i - 1].hash;
    if (entry.prevHash !== expectedPrev) {
      return { ok: false, breakIndex: i, reason: "PrevHashMismatch" };
    }
    const { hash, ...rest } = entry;
    const computed = await sha256Hex(canonicalize(rest));
    if (computed !== hash) return { ok: false, breakIndex: i, reason: "HashMismatch" };
  }
  return { ok: true };
}
