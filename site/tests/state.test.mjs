// state.test.mjs — Node tests for the demo site logic (site/js/state.js).
// Uses the real library (real Ed25519, real policy evaluation, real audit
// chain) — the same code the browser runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoState,
  initDemo,
  dailySpent,
  cartTotal,
  addToCart,
  checkout,
  verifyPeerManifest,
  updatePolicy,
  verifyAuditChain,
  tamperEntry,
  attackUnsigned,
  attackTampered,
  attackExpired,
  attackRevoked,
  attackOverCap,
  attackOverBudget,
  attackOffAllowlist,
  attackDrain,
  CATALOG,
} from "../js/state.js";

const ORIGIN = "https://demo.test/";

async function fresh() {
  const state = createDemoState();
  await initDemo(state, { origin: ORIGIN, now: new Date("2026-11-19T03:30:00Z") });
  return state;
}

test("init: keypair + signed manifest verify, fail-closed policy replaced by demo policy", async () => {
  const state = await fresh();
  assert.ok(state.keypair.publicKey.length > 40);
  const result = await verifyPeerManifest(state, state.manifest);
  assert.equal(result.ok, true);
  assert.equal(state.policy.perActionMax, 5000);
  assert.equal(state.policy.dailyMax, 10000);
  assert.deepEqual(state.policy.allowedOrigins, [ORIGIN]);
  assert.equal(state.chain.length, 2); // init + verify
});

test("checkout within policy: allowed, balance deducted, cart cleared, audited", async () => {
  const state = await fresh();
  addToCart(state, "hoodie", 1); // 4500 <= 5000 cap
  assert.equal(cartTotal(state), 4500);
  const result = await checkout(state, ORIGIN);
  assert.equal(result.allowed, true);
  assert.equal(result.amount, 4500);
  assert.ok(result.orderId);
  assert.equal(state.policy.balance, 100000 - 4500);
  assert.equal(state.cart.length, 0);
  assert.equal(dailySpent(state), 4500);
});

test("checkout over the per-action cap is denied with PerActionLimitExceeded", async () => {
  const state = await fresh();
  addToCart(state, "hoodie", 1);
  addToCart(state, "tee", 1); // 4500 + 2500 = 7000 > 5000
  const result = await checkout(state, ORIGIN);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "PerActionLimitExceeded");
  assert.equal(state.policy.balance, 100000); // nothing deducted
});

test("checkout from an off-allowlist origin is denied with OriginNotAllowed", async () => {
  const state = await fresh();
  addToCart(state, "mug", 1);
  const result = await checkout(state, "https://evil.example/");
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OriginNotAllowed");
});

test("attack: unsigned manifest -> ManifestUnsigned", async () => {
  const state = await fresh();
  const result = await attackUnsigned(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ManifestUnsigned");
});

test("attack: tampered manifest -> ManifestHashMismatch", async () => {
  const state = await fresh();
  const result = await attackTampered(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ManifestHashMismatch");
});

test("attack: expired manifest -> ManifestExpired", async () => {
  const state = await fresh();
  const result = await attackExpired(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ManifestExpired");
});

test("attack: revoked manifest -> AgentRevoked", async () => {
  const state = await fresh();
  const result = await attackRevoked(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "AgentRevoked");
});

test("attack: over-cap spend -> PerActionLimitExceeded", async () => {
  const state = await fresh();
  const result = await attackOverCap(state, ORIGIN);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "PerActionLimitExceeded");
  assert.equal(result.entry.amount, state.policy.perActionMax + 1);
});

test("attack: over-budget spend -> DailyLimitExceeded after real spends", async () => {
  const state = await fresh();
  const steps = await attackOverBudget(state, ORIGIN);
  assert.ok(steps.length >= 2);
  assert.equal(steps[0].allowed, true);
  assert.equal(steps[1].allowed, true);
  const last = steps[steps.length - 1];
  assert.equal(last.allowed, false);
  assert.equal(last.reason, "DailyLimitExceeded");
  assert.equal(dailySpent(state), 10000);
});

test("attack: off-allowlist spend -> OriginNotAllowed", async () => {
  const state = await fresh();
  const result = await attackOffAllowlist(state);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OriginNotAllowed");
});

test("attack: prompt-injected drain -> denied, gate decides not the prompt", async () => {
  const state = await fresh();
  const result = await attackDrain(state);
  assert.ok(result.injectedPrompt.includes("Ignore all previous instructions"));
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "OriginNotAllowed");
  assert.equal(state.policy.balance, 100000); // nothing drained
});

test("audit chain verifies; tampering breaks it at the modified entry", async () => {
  const state = await fresh();
  addToCart(state, "mug", 1);
  await checkout(state, ORIGIN);
  const ok = await verifyAuditChain(state);
  assert.equal(ok.ok, true);
  const index = tamperEntry(state, 1);
  assert.equal(index, 1);
  const broken = await verifyAuditChain(state);
  assert.equal(broken.ok, false);
  assert.equal(broken.breakIndex, 1);
  assert.equal(broken.reason, "HashMismatch");
});

test("policy editor: pausing denies everything; invalid values rejected", async () => {
  const state = await fresh();
  await updatePolicy(state, { paused: true }, ORIGIN);
  addToCart(state, "stickers", 1);
  const denied = await checkout(state, ORIGIN);
  assert.equal(denied.reason, "Paused");
  await assert.rejects(updatePolicy(state, { perActionMax: -1 }, ORIGIN), /perActionMax/);
  await assert.rejects(updatePolicy(state, { dailyMax: 1.5 }, ORIGIN), /dailyMax/);
});

test("catalog totals are computed, not hardcoded", () => {
  const state = createDemoState();
  addToCart(state, "tee", 2);
  addToCart(state, "cable", 3);
  const expected = CATALOG.find((i) => i.id === "tee").price * 2
    + CATALOG.find((i) => i.id === "cable").price * 3;
  assert.equal(cartTotal(state), expected);
});
