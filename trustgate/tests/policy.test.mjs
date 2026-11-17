import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultPolicy, evaluatePolicy } from "../policy.js";

const ORIGIN = "https://arya161100.github.io";
const base = {
  version: 1,
  perActionMax: 5000, // cents
  dailyMax: 10000,
  allowedOrigins: [ORIGIN],
  allowedActions: ["place_order", "verify_manifest"],
  paused: false,
  balance: 100000,
};

describe("policy engine (SpendGuard model)", () => {
  it("fail-closed defaults deny everything", () => {
    const p = defaultPolicy();
    // amount 1 passes the AmountZero check; the empty origin allowlist
    // is the first failing check. (Limits are 0 too, but origin is
    // evaluated first.)
    assert.deepEqual(
      evaluatePolicy(p, { origin: ORIGIN, name: "place_order", amount: 1 }),
      { allowed: false, reason: "OriginNotAllowed" },
    );
    assert.deepEqual(
      evaluatePolicy(p, { origin: ORIGIN, name: "place_order", amount: 0 }),
      { allowed: false, reason: "AmountZero" },
    );
  });

  it("approves a spend inside all limits", () => {
    assert.deepEqual(
      evaluatePolicy(base, { origin: ORIGIN, name: "place_order", amount: 4000 }, { dailySpent: 0 }),
      { allowed: true },
    );
  });

  it("over per-action cap -> PerActionLimitExceeded (SpendGuard: 1.5 NEAR vs 1 NEAR cap)", () => {
    assert.deepEqual(
      evaluatePolicy(base, { origin: ORIGIN, name: "place_order", amount: 5001 }, { dailySpent: 0 }),
      { allowed: false, reason: "PerActionLimitExceeded" },
    );
  });

  it("over daily budget -> DailyLimitExceeded", () => {
    assert.deepEqual(
      evaluatePolicy(base, { origin: ORIGIN, name: "place_order", amount: 4000 }, { dailySpent: 7000 }),
      { allowed: false, reason: "DailyLimitExceeded" },
    );
  });

  it("off-allowlist origin -> OriginNotAllowed (SpendGuard: drain to evil-payout)", () => {
    assert.deepEqual(
      evaluatePolicy(base, { origin: "https://evil.example/", name: "place_order", amount: 100 }, { dailySpent: 0 }),
      { allowed: false, reason: "OriginNotAllowed" },
    );
  });

  it("off-allowlist action -> ActionNotAllowed (SpendGuard: drain() method)", () => {
    assert.deepEqual(
      evaluatePolicy(base, { origin: ORIGIN, name: "drain_vault", amount: 100 }, { dailySpent: 0 }),
      { allowed: false, reason: "ActionNotAllowed" },
    );
  });

  it("paused -> Paused", () => {
    assert.deepEqual(
      evaluatePolicy({ ...base, paused: true }, { origin: ORIGIN, name: "place_order", amount: 100 }, { dailySpent: 0 }),
      { allowed: false, reason: "Paused" },
    );
  });

  it("zero amount -> AmountZero", () => {
    assert.deepEqual(
      evaluatePolicy(base, { origin: ORIGIN, name: "place_order", amount: 0 }, { dailySpent: 0 }),
      { allowed: false, reason: "AmountZero" },
    );
  });

  it("over balance -> InsufficientBalance", () => {
    assert.deepEqual(
      evaluatePolicy({ ...base, perActionMax: 200000, dailyMax: 200000 }, { origin: ORIGIN, name: "place_order", amount: 150000 }, { dailySpent: 0 }),
      { allowed: false, reason: "InsufficientBalance" },
    );
  });

  it("evaluation order: paused beats everything, origin beats limits", () => {
    assert.deepEqual(
      evaluatePolicy({ ...base, paused: true }, { origin: "https://evil.example/", name: "drain_vault", amount: 999999 }, { dailySpent: 999999 }),
      { allowed: false, reason: "Paused" },
    );
    assert.deepEqual(
      evaluatePolicy(base, { origin: "https://evil.example/", name: "drain_vault", amount: 999999 }, { dailySpent: 999999 }),
      { allowed: false, reason: "OriginNotAllowed" },
    );
  });
});
