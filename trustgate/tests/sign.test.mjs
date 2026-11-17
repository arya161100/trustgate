import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeypair, signData, verifyData } from "../sign.js";

describe("Ed25519 sign/verify", () => {
  it("round-trips: sign then verify is true", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const sig = await signData(privateKey, "hello trustgate");
    assert.equal(await verifyData(publicKey, sig, "hello trustgate"), true);
  });

  it("tampered message fails verification", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    const sig = await signData(privateKey, "hello trustgate");
    assert.equal(await verifyData(publicKey, sig, "hello trustgatf"), false);
  });

  it("wrong key fails verification", async () => {
    const a = await generateKeypair();
    const b = await generateKeypair();
    const sig = await signData(a.privateKey, "hello");
    assert.equal(await verifyData(b.publicKey, sig, "hello"), false);
  });

  it("keys are base64url DER (SPKI / PKCS#8)", async () => {
    const { publicKey, privateKey } = await generateKeypair();
    assert.match(publicKey, /^[A-Za-z0-9_-]+$/);
    assert.match(privateKey, /^[A-Za-z0-9_-]+$/);
    assert.ok(publicKey.length > 40 && privateKey.length > 40);
  });
});
