# TrustGate hash-chained audit trail (v1)

Every policy decision (allow and deny) is appended to an append-only log.
Each entry links to the previous entry's hash, so tampering with history
breaks the chain.

## Entry

```json
{
  "seq": 3,
  "ts": "2026-11-17T12:00:00Z",
  "decision": "DENY",
  "reason": "PerActionLimitExceeded",
  "origin": "https://evil.example/",
  "action": "place_order",
  "amount": 15000,
  "actor": "trustgate_guard",
  "prevHash": "<hex SHA-256 of the previous entry's canonical JSON>",
  "hash": "<hex SHA-256 of this entry's canonical JSON (excluding hash)>"
}
```

- Genesis entry (`seq: 0`) has `prevHash` = 64 zeroes.
- `hash` = SHA-256 of the canonical JSON of all fields except `hash`.
- Canonical JSON: keys sorted lexicographically (recursive), no
  whitespace, UTF-8 — same function as the manifest (`trustgate/canonical.js`).

## Verification

Recompute each entry's hash from its fields and compare; check each
`prevHash` equals the previous entry's `hash`; check `seq` is contiguous
from 0. The first mismatch is reported with its index. Verification is
one click in the console and one function (`verifyChain`) in the library.

## Why

The spec (§5, "Observable execution") says implementations SHOULD expose
agent and tool calls, consent decisions, errors, and action receipts. The
audit trail makes that exposure tamper-evident: a receipt you can verify,
not just a log you have to trust.
