# TrustGate signed manifest format (v1)

A TrustGate manifest is a signed, hash-pinned description of an agent
network's publisher identity. It is published next to `agent-manifest.json`
as `trustgate-manifest.json` and verified before any peer network is loaded
or any of its actions are trusted.

## Fields

```json
{
  "version": 1,
  "network": "trustgate",
  "publisher": "arya161100",
  "origin": "https://arya161100.github.io/trustgate",
  "publicKey": "<base64url Ed25519 public key, SPKI DER>",
  "issuedAt": "2026-11-17T12:00:00Z",
  "expiresAt": "2027-01-11T16:00:00Z",
  "capabilities": ["verify_manifest", "check_policy", "place_order"],
  "hash": "<hex SHA-256 of the canonical JSON of all fields except signature>",
  "signature": "<base64url Ed25519 signature over the UTF-8 bytes of hash>"
}
```

## Rules

- **Canonical JSON:** keys sorted lexicographically (recursive), no
  whitespace, UTF-8. The `hash` covers every field except `signature`
  (and except `hash` itself). See `trustgate/canonical.js`.
- **Signature:** Ed25519 over the UTF-8 bytes of the hex `hash` string.
  Verifying the signature proves the publisher holds the private key;
  verifying the hash proves the manifest was not altered after signing.
- **Expiry:** `expiresAt` must be in the future. An expired manifest is
  rejected with `ManifestExpired`.
- **Revocation:** a publisher revokes by publishing a revocation entry
  (signed, with the manifest hash) at a well-known URL, or by removing the
  manifest. The verifier accepts a caller-supplied revocation list
  (`revokedHashes: string[]`). A revoked manifest is rejected with
  `AgentRevoked`.
- **Fail closed:** missing signature → `ManifestUnsigned`; hash mismatch →
  `ManifestHashMismatch`; bad signature → `ManifestBadSignature`. Any
  verification failure means the peer network is not loaded and none of its
  actions are trusted.

## Why this, not just the spec's manifest

The MVP spec's `agent-manifest.json` is unsigned public data: anyone can
copy it and claim to be the publisher. TrustGate adds the signature + hash
pin so a caller can verify *who* published the network and *that it has not
changed* — spec §7 "Versioning integrity and publisher terms: ... hashes,
caller pinning, signatures ... and re-consent when published artifacts
change."
