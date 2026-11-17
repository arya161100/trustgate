import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeypair } from "../sign.js";
import { signManifest, verifyManifest } from "../verify.js";

function fields(pub, overrides = {}) {
  return {
    version: 1,
    network: "trustgate",
    publisher: "arya161100",
    origin: "https://arya161100.github.io/trustgate",
    publicKey: pub,
    issuedAt: "2026-11-17T12:00:00Z",
    expiresAt: "2027-01-11T16:00:00Z",
    capabilities: ["verify_manifest", "check_policy", "place_order"],
    ...overrides,
  };
}

describe("signed manifest", () => {
  it("a correctly signed manifest verifies", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await signManifest(fields(publicKey), privateKey);
    assert.deepEqual(await verifyManifest(manifest, { now: new Date("2026-12-01T00:00:00Z") }), { ok: true });
  });

  it("tampered field -> ManifestHashMismatch", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await signManifest(fields(publicKey), privateKey);
    manifest.capabilities = ["verify_manifest", "place_order", "drain_vault"];
    assert.deepEqual(await verifyManifest(manifest), { ok: false, reason: "ManifestHashMismatch" });
  });

  it("wrong publisher key -> ManifestBadSignature", async () => {
    const a = await generateKeypair();
    const b = await generateKeypair();
    const manifest = await signManifest(fields(a.publicKey), b.privateKey);
    assert.deepEqual(await verifyManifest(manifest), { ok: false, reason: "ManifestBadSignature" });
  });

  it("missing signature -> ManifestUnsigned", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await signManifest(fields(publicKey), privateKey);
    delete manifest.signature;
    assert.deepEqual(await verifyManifest(manifest), { ok: false, reason: "ManifestUnsigned" });
  });

  it("expired manifest -> ManifestExpired", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await signManifest(fields(publicKey), privateKey);
    assert.deepEqual(
      await verifyManifest(manifest, { now: new Date("2027-02-01T00:00:00Z") }),
      { ok: false, reason: "ManifestExpired" },
    );
  });

  it("revoked manifest -> AgentRevoked", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const manifest = await signManifest(fields(publicKey), privateKey);
    assert.deepEqual(
      await verifyManifest(manifest, { revokedHashes: [manifest.hash] }),
      { ok: false, reason: "AgentRevoked" },
    );
  });
});
