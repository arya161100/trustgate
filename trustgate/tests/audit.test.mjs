import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendEntry, verifyChain, GENESIS_PREV } from "../audit.js";

describe("hash-chained audit trail", () => {
  it("appends entries linked by hash and verifies clean", async () => {
    let chain = [];
    chain = [...chain, await appendEntry(chain, { ts: "2026-11-17T12:00:00Z", decision: "ALLOW", reason: "OK", origin: "https://a.example/", action: "place_order", amount: 4000, actor: "trustgate_guard" })];
    chain = [...chain, await appendEntry(chain, { ts: "2026-11-17T12:01:00Z", decision: "DENY", reason: "PerActionLimitExceeded", origin: "https://a.example/", action: "place_order", amount: 6000, actor: "trustgate_guard" })];
    chain = [...chain, await appendEntry(chain, { ts: "2026-11-17T12:02:00Z", decision: "DENY", reason: "OriginNotAllowed", origin: "https://evil.example/", action: "place_order", amount: 100, actor: "trustgate_guard" })];

    assert.equal(chain[0].seq, 0);
    assert.equal(chain[0].prevHash, GENESIS_PREV);
    assert.equal(chain[1].prevHash, chain[0].hash);
    assert.equal(chain[2].prevHash, chain[1].hash);
    assert.deepEqual(await verifyChain(chain), { ok: true });
  });

  it("tampering with a middle entry breaks the chain at that index", async () => {
    let chain = [];
    for (let i = 0; i < 3; i++) {
      chain = [...chain, await appendEntry(chain, { ts: `2026-11-17T12:0${i}:00Z`, decision: "ALLOW", reason: "OK", origin: "https://a.example/", action: "place_order", amount: 100, actor: "g" })];
    }
    const tampered = chain.map((e) => ({ ...e }));
    tampered[1] = { ...tampered[1], amount: 99999 }; // alter history, keep old hash
    const res = await verifyChain(tampered);
    assert.equal(res.ok, false);
    assert.equal(res.breakIndex, 1);
    assert.equal(res.reason, "HashMismatch");
  });

  it("an empty chain verifies", async () => {
    assert.deepEqual(await verifyChain([]), { ok: true });
  });
});
