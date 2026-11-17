import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, sha256Hex, hashObject } from "../canonical.js";

describe("canonicalize", () => {
  it("sorts keys recursively and drops whitespace", () => {
    assert.equal(canonicalize({ b: 1, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":1}');
    assert.equal(canonicalize([3, { b: 1, a: 2 }]), '[3,{"a":2,"b":1}]');
    assert.equal(canonicalize("x"), '"x"');
    assert.equal(canonicalize(null), "null");
    assert.equal(canonicalize(true), "true");
  });

  it("rejects non-finite numbers", () => {
    assert.throws(() => canonicalize(NaN), /non-finite/);
    assert.throws(() => canonicalize(undefined), /unsupported/);
  });
});

describe("sha256Hex", () => {
  it("matches known vectors", async () => {
    assert.equal(
      await sha256Hex(""),
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    assert.equal(
      await sha256Hex("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashObject is deterministic and order-insensitive", async () => {
    const h1 = await hashObject({ b: 1, a: 2 });
    const h2 = await hashObject({ a: 2, b: 1 });
    assert.equal(h1, h2);
    assert.notEqual(h1, await hashObject({ a: 2, b: 3 }));
  });
});
