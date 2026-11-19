// Tests for the other site actions. Each test file runs in its own process, with
// its own page (see site_harness.mjs). Run: node --test "site/tests/*.test.mjs".
// Before each call under test, the page holds other data; after the call, the whole
// page (document.snapshot()) and the stored records are compared, so a change the
// call should not make shows up.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ActionRegistry } from "../runtime/actions.js";
import { AgentNetwork } from "../runtime/kernel.js";
import { buildToolTable, dispatchToolCall } from "../runtime/runner.js";
import { TraceBus } from "../runtime/trace.js";
import { ScriptedModel } from "./scripted_model.mjs";
import { BASE, NETWORK_NAME, registerActions, AssistantMount, App, bindEvents } from "./site_harness.mjs";
import { tamperEntry } from "../js/state.js";

async function registry() {
  const reg = new ActionRegistry();
  await registerActions({
    register: reg.register.bind(reg, { base: BASE, network: NETWORK_NAME }),
  });
  return reg;
}

function ref(reg, name) {
  for (const entry of reg.catalog({ base: BASE, network: NETWORK_NAME })) {
    if (entry.name === name) return entry.ref;
  }
  throw new Error(`Action ${name} is not registered.`);
}

async function readState(reg) {
  const plan = reg.prepare({ kind: "action", action: ref(reg, "get_site_state"), arguments: {} });
  const receipts = await reg.execute(plan, approve, "test-read");
  return receipts[0].result;
}

async function callTool(reg, name, args, confirm = approve) {
  const loaded = await load();
  const ctx = {
    network: loaded.network,
    manifest: loaded.manifest,
    actions: reg,
    baseOrigin: BASE,
    displayOrigin: new URL(BASE).host,
    trace: new TraceBus(),
    isTop: true,
    frontMan: loaded.network.findFrontMan(),
    history: [],
    llm: new ScriptedModel([]),
    confirmWebsiteActions: confirm,
  };
  const spec = loaded.network.getAgentSpec(loaded.network.findFrontMan());
  const table = await buildToolTable(ctx, spec, [], null);
  const entry = table.toolByName.get(`website_${name}`);
  assert.ok(entry, `website_${name} is not offered to the front agent.`);
  return dispatchToolCall(ctx, entry, args, null, []);
}

async function load() {
  const config = JSON.parse(await readFile(new URL(`../${NETWORK_NAME}.network.json`, import.meta.url), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("../agent-manifest.json", import.meta.url), "utf8"));
  return { config, manifest, network: new AgentNetwork(config, NETWORK_NAME) };
}

async function approve() {
  return true;
}

function clearFocus() {
  for (const element of document.elements.values()) {
    element.focused = false;
  }
}

function focusedIds() {
  const ids = [];
  for (const [id, element] of document.elements) {
    if (element.focused) {
      ids.push(id);
    }
  }
  return ids;
}

test("reads leave the page as it was", async () => {
  const reg = await registry();
  const before = document.snapshot();
  const state = await readState(reg);
  // The state is this demo's single visitor only: no other person's records.
  assert.equal(state.catalog.length, 6);
  assert.deepEqual(state.cart.lines, []);
  assert.equal(state.cart.version, 0);
  assert.equal(state.policy.perActionMax, 5000);
  assert.equal(state.policy.dailyMax, 10000);
  assert.equal(state.policy.balance, 100000);
  assert.equal(state.policy.dailySpent, 0);
  assert.equal(state.policy.paused, false);
  assert.equal(state.latestOrder, null);
  assert.equal(state.registry.length, 1);
  // The store's own manifest is registered at init, not verified through the gate.
  assert.equal(state.registry[0].status, "registered");
  assert.equal(state.ownManifest.network, "trustgate");
  assert.equal(state.ownManifest.publisher, "arya161100");
  assert.match(state.today.iso, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(state.pageFacts).sort(), ["about", "attacks", "audit", "identity", "policy", "store"]);
  for (const value of Object.values(state.pageFacts)) {
    assert.equal(typeof value, "string");
  }
  const check = await callTool(reg, "check_policy", { origin: BASE, name: "place_order", amount: 100 });
  assert.equal(check.status, "succeeded");
  assert.equal(check.result.allowed, true);
  assert.equal(check.result.perActionMax, 5000);
  assert.equal(check.result.dailyMax, 10000);
  assert.equal(check.result.dailySpent, 0);
  assert.equal(check.result.balance, 100000);
  const chain = await callTool(reg, "verify_audit_chain", {});
  assert.equal(chain.status, "succeeded");
  assert.equal(chain.result.ok, true);
  assert.equal(chain.result.count, state.audit.count);
  assert.deepEqual(document.snapshot(), before);
});

test("check_policy answers every gate rule", async () => {
  const reg = await registry();
  const cases = [
    [{ origin: BASE, name: "place_order", amount: 100 }, true, undefined],
    [{ origin: BASE, name: "place_order", amount: 0 }, false, "AmountZero"],
    [{ origin: "https://evil.example", name: "place_order", amount: 100 }, false, "OriginNotAllowed"],
    [{ origin: BASE, name: "drain_vault", amount: 100 }, false, "ActionNotAllowed"],
    [{ origin: BASE, name: "place_order", amount: 6000 }, false, "PerActionLimitExceeded"],
    [{ origin: BASE, name: "place_order", amount: 5000 }, true, undefined],
  ];
  for (const [args, allowed, reason] of cases) {
    const receipt = await callTool(reg, "check_policy", args);
    assert.equal(receipt.status, "succeeded");
    assert.equal(receipt.result.allowed, allowed, JSON.stringify(args));
    assert.equal(receipt.result.reason, reason, JSON.stringify(args));
  }
  // Daily budget: with dailyMax 0, any positive spend exceeds it.
  await callTool(reg, "update_policy", { dailyMax: 0 });
  const overBudget = await callTool(reg, "check_policy", { origin: BASE, name: "place_order", amount: 100 });
  assert.equal(overBudget.result.allowed, false);
  assert.equal(overBudget.result.reason, "DailyLimitExceeded");
  await callTool(reg, "update_policy", { dailyMax: 10000 });
  // Balance: with a 50-cent vault, a 100-cent spend cannot be covered.
  await callTool(reg, "update_policy", { balance: 50 });
  const broke = await callTool(reg, "check_policy", { origin: BASE, name: "place_order", amount: 100 });
  assert.equal(broke.result.allowed, false);
  assert.equal(broke.result.reason, "InsufficientBalance");
  await callTool(reg, "update_policy", { balance: 100000 });
  // Paused: every action is denied.
  await callTool(reg, "update_policy", { paused: true });
  const paused = await callTool(reg, "check_policy", { origin: BASE, name: "place_order", amount: 100 });
  assert.equal(paused.result.allowed, false);
  assert.equal(paused.result.reason, "Paused");
  await callTool(reg, "update_policy", { paused: false });
  const state = await readState(reg);
  assert.equal(state.policy.perActionMax, 5000);
  assert.equal(state.policy.dailyMax, 10000);
  assert.equal(state.policy.balance, 100000);
  assert.equal(state.policy.paused, false);
  // The reads changed nothing; the policy changes above were audited and undone.
  assert.deepEqual((await readState(reg)).policy, state.policy);
});

test("set_cart_quantities changes the cart and refuses bad lines", async () => {
  const reg = await registry();
  const before = await readState(reg);
  clearFocus();
  const set = await callTool(reg, "set_cart_quantities", {
    lines: [{ id: "tee", qty: 2 }, { id: "mug", qty: 1 }],
  });
  assert.equal(set.status, "succeeded");
  assert.equal(set.result.ok, true);
  assert.deepEqual(set.result.cart.lines, [
    { id: "tee", name: "TrustGate Tee", qty: 2, price: 2500, priceText: "$25.00", lineTotal: 5000, lineTotalText: "$50.00" },
    { id: "mug", name: "Agent Mug", qty: 1, price: 1500, priceText: "$15.00", lineTotal: 1500, lineTotalText: "$15.00" },
  ]);
  assert.equal(set.result.cart.total, 6500);
  assert.equal(set.result.cart.totalText, "$65.00");
  assert.equal(set.result.cart.version, before.cart.version + 1);
  assert.equal(document.getElementById("cart-total").textContent, "$65.00");
  assert.deepEqual(focusedIds(), []);
  // A swapped argument changes the result: same items, other quantities.
  const swapped = await callTool(reg, "set_cart_quantities", {
    lines: [{ id: "tee", qty: 1 }, { id: "mug", qty: 2 }],
  });
  assert.equal(swapped.result.cart.total, 5500);
  assert.equal(swapped.result.cart.totalText, "$55.00");
  // The schema refuses bad lines before the operation runs; the operation
  // refuses a repeated item itself. Each refusal keeps the items already there.
  const kept = await readState(reg);
  const schemaRefusals = [
    [{ id: "no-such-item", qty: 1 }],
    [{ id: "tee", qty: 101 }],
    [{ id: "tee", qty: -1 }],
    [{ id: "tee", qty: 1.5 }],
  ];
  for (const lines of schemaRefusals) {
    await assert.rejects(callTool(reg, "set_cart_quantities", { lines }), /Invalid arguments/);
    assert.deepEqual(await readState(reg), kept);
  }
  const duplicate = await callTool(reg, "set_cart_quantities", {
    lines: [{ id: "tee", qty: 1 }, { id: "tee", qty: 2 }],
  });
  assert.equal(duplicate.status, "succeeded");
  assert.equal(duplicate.result.ok, false);
  assert.equal(duplicate.result.reason, "DuplicateItem: each item once");
  assert.deepEqual(await readState(reg), kept);
  // The operation itself refuses an unknown id too (the page's own code calls
  // it without the schema in front of it).
  assert.deepEqual(await App.page.setCartQuantities([{ id: "nope", qty: 1 }]), {
    ok: false,
    reason: "UnknownItem: nope",
    field: "lines",
  });
  assert.deepEqual(await readState(reg), kept);
  // The largest quantity the site allows is accepted.
  const max = await callTool(reg, "set_cart_quantities", { lines: [{ id: "tee", qty: 100 }] });
  assert.equal(max.result.ok, true);
  assert.equal(max.result.cart.total, 250000);
  // An empty list clears the cart.
  const cleared = await callTool(reg, "set_cart_quantities", { lines: [] });
  assert.equal(cleared.result.ok, true);
  assert.deepEqual(cleared.result.cart.lines, []);
  assert.equal(cleared.result.cart.total, 0);
});

test("verify_manifest verifies the store's own manifest and refuses a bad value", async () => {
  const reg = await registry();
  const before = await readState(reg);
  const own = before.ownManifest;
  const receipt = await callTool(reg, "verify_manifest", { manifest: own }, approve);
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.result.ok, true);
  const after = await readState(reg);
  assert.equal(after.registry.length, before.registry.length + 1);
  assert.equal(after.registry.at(-1).status, "verified");
  assert.equal(after.audit.count, before.audit.count + 1);
  // A tampered manifest is registered with its reason and audited.
  const tampered = { ...own, publisher: "mallory" };
  const bad = await callTool(reg, "verify_manifest", { manifest: tampered }, approve);
  assert.equal(bad.result.ok, false);
  assert.equal(bad.result.reason, "ManifestHashMismatch");
  const afterTamper = await readState(reg);
  assert.equal(afterTamper.registry.length, after.registry.length + 1);
  assert.equal(afterTamper.registry.at(-1).status, "ManifestHashMismatch");
  // A value that is not a manifest at all is refused without registering it:
  // the schema blocks it at the tool, and the operation refuses it directly.
  await assert.rejects(
    callTool(reg, "verify_manifest", { manifest: "not-a-manifest" }, approve),
    /Invalid arguments/,
  );
  assert.deepEqual(await App.page.verifyManifest("not-a-manifest"), {
    ok: false,
    reason: "ManifestInvalid",
  });
  assert.deepEqual(await readState(reg), afterTamper);
  // The dialog shows the manifest's own fields, and refuses a bad value too.
  const content = AssistantMount.dialogContent({
    action: "verify_manifest",
    origin: BASE,
    effect: "irreversible",
    arguments: { manifest: own },
  });
  assert.equal(content.refusal, undefined);
  assert.equal(content.details.Publisher, "arya161100");
  assert.equal(content.details.Network, "trustgate");
  assert.equal(content.details.Origin, BASE);
  assert.equal(content.details.Expires, own.expiresAt);
  assert.equal(content.details.Capabilities, "verify_manifest, check_policy, place_order");
  const refused = AssistantMount.dialogContent({
    action: "verify_manifest",
    origin: BASE,
    effect: "irreversible",
    arguments: { manifest: "not-a-manifest" },
  });
  assert.equal(refused.refusal, "ManifestInvalid");
});

test("verify_audit_chain verifies and breaks at the tampered entry", async () => {
  const reg = await registry();
  const before = await readState(reg);
  const ok = await callTool(reg, "verify_audit_chain", {});
  assert.equal(ok.result.ok, true);
  assert.equal(ok.result.count, before.audit.count);
  const index = tamperEntry(App.page.state, 1);
  assert.equal(index, 1);
  const snapshotBeforeVerify = document.snapshot();
  const broken = await callTool(reg, "verify_audit_chain", {});
  assert.equal(broken.result.ok, false);
  assert.equal(broken.result.breakIndex, 1);
  assert.equal(broken.result.reason, "HashMismatch");
  assert.equal(broken.result.count, before.audit.count);
  assert.deepEqual(document.snapshot(), snapshotBeforeVerify);
});

test("update_policy changes the policy and refuses invalid values", async () => {
  const reg = await registry();
  const set = await callTool(reg, "update_policy", { perActionMax: 6000 });
  assert.equal(set.status, "succeeded");
  assert.equal(set.result.ok, true);
  assert.equal(set.result.policy.perActionMax, 6000);
  const restored = await callTool(reg, "update_policy", { perActionMax: 5000 });
  assert.equal(restored.result.policy.perActionMax, 5000);
  // A refused change keeps the policy, and clears the panel's last message.
  // The schema blocks the bad values at the tool; the operation refuses them
  // directly too (the page's own form calls it without the schema in front).
  const kept = await readState(reg);
  document.getElementById("policy-result").innerHTML = "old error";
  const schemaRefusals = [
    { perActionMax: -1 },
    { dailyMax: 1.5 },
    { balance: -100 },
    { paused: "yes" },
    { allowedOrigins: ["ok", 42] },
    { allowedActions: "place_order" },
  ];
  for (const patch of schemaRefusals) {
    await assert.rejects(callTool(reg, "update_policy", patch), /Invalid arguments/);
    assert.deepEqual((await readState(reg)).policy, kept.policy);
  }
  for (const patch of schemaRefusals) {
    const direct = await App.page.updatePolicy(patch);
    assert.equal(direct.ok, false, JSON.stringify(patch));
    assert.deepEqual((await readState(reg)).policy, kept.policy);
  }
  assert.equal(document.getElementById("policy-result").innerHTML, "");
  // Pausing denies every action until it is undone.
  await callTool(reg, "update_policy", { paused: true });
  const denied = await callTool(reg, "check_policy", { origin: BASE, name: "place_order", amount: 100 });
  assert.equal(denied.result.reason, "Paused");
  await callTool(reg, "update_policy", { paused: false });
  const allowed = await callTool(reg, "check_policy", { origin: BASE, name: "place_order", amount: 100 });
  assert.equal(allowed.result.allowed, true);
});

test("checkout refuses an empty cart and a stale version, and stores the same record as the page's button", async () => {
  const reg = await registry();
  const before = await readState(reg);
  assert.deepEqual(before.cart.lines, []);
  const empty = AssistantMount.dialogContent({
    action: "checkout",
    origin: BASE,
    effect: "irreversible",
    arguments: { expectedVersion: before.cart.version },
  });
  assert.equal(empty.refusal, "AmountZero");
  const emptyCall = await callTool(reg, "checkout", { expectedVersion: before.cart.version });
  assert.equal(emptyCall.result.allowed, false);
  assert.equal(emptyCall.result.reason, "AmountZero");
  assert.deepEqual(await readState(reg), before);
  // Arrange one tee, then refuse a stale version.
  await callTool(reg, "set_cart_quantities", { lines: [{ id: "tee", qty: 1 }] });
  const arranged = await readState(reg);
  const stale = AssistantMount.dialogContent({
    action: "checkout",
    origin: BASE,
    effect: "irreversible",
    arguments: { expectedVersion: arranged.cart.version + 1 },
  });
  assert.equal(stale.refusal, "StaleCartVersion");
  const staleCall = await callTool(reg, "checkout", { expectedVersion: arranged.cart.version + 1 });
  assert.equal(staleCall.result.allowed, false);
  assert.equal(staleCall.result.reason, "StaleCartVersion");
  assert.deepEqual(await readState(reg), arranged);
  // The tool's approved checkout stores the order and the audit entry.
  clearFocus();
  const toolReceipt = await callTool(reg, "checkout", { expectedVersion: arranged.cart.version });
  assert.equal(toolReceipt.status, "succeeded");
  assert.equal(toolReceipt.result.allowed, true);
  assert.equal(toolReceipt.result.amount, 2500);
  const afterTool = await readState(reg);
  assert.equal(afterTool.latestOrder.amount, 2500);
  assert.equal(afterTool.latestOrder.orderId, toolReceipt.result.orderId);
  assert.deepEqual(afterTool.cart.lines, []);
  assert.deepEqual(focusedIds(), []);
  // The page's own checkout button stores the same record for the same cart.
  await callTool(reg, "set_cart_quantities", { lines: [{ id: "tee", qty: 1 }] });
  const beforeButton = await readState(reg);
  bindEvents();
  document.getElementById("checkout-btn").dispatch("click");
  await new Promise((resolve) => setTimeout(resolve, 50));
  const afterButton = await readState(reg);
  assert.equal(afterButton.latestOrder.amount, 2500);
  assert.notEqual(afterButton.latestOrder.orderId, toolReceipt.result.orderId);
  assert.match(afterButton.latestOrder.orderId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(afterButton.cart.lines, []);
  assert.equal(afterButton.audit.count, beforeButton.audit.count + 1);
  assert.equal(afterButton.audit.entries[0].decision, "ALLOW");
  assert.equal(afterButton.audit.entries[0].action, "place_order");
  assert.equal(afterButton.audit.entries[0].amount, 2500);
  assert.equal(afterButton.policy.dailySpent, beforeButton.policy.dailySpent + 2500);
});

test("run_attack_demo runs all eight demos with the real verdicts", async () => {
  const reg = await registry();
  const before = await readState(reg);
  const manifestCases = [
    ["unsigned", "ManifestUnsigned"],
    ["tampered", "ManifestHashMismatch"],
    ["expired", "ManifestExpired"],
    ["revoked", "AgentRevoked"],
  ];
  for (const [name, reason] of manifestCases) {
    const receipt = await callTool(reg, "run_attack_demo", { name });
    assert.equal(receipt.status, "succeeded");
    assert.equal(receipt.result.ok, false, name);
    assert.equal(receipt.result.reason, reason, name);
  }
  const overCap = await callTool(reg, "run_attack_demo", { name: "overcap" });
  assert.equal(overCap.result.allowed, false);
  assert.equal(overCap.result.reason, "PerActionLimitExceeded");
  const offAllowlist = await callTool(reg, "run_attack_demo", { name: "offallowlist" });
  assert.equal(offAllowlist.result.allowed, false);
  assert.equal(offAllowlist.result.reason, "OriginNotAllowed");
  const drain = await callTool(reg, "run_attack_demo", { name: "drain" });
  assert.equal(drain.result.allowed, false);
  assert.equal(drain.result.reason, "OriginNotAllowed");
  assert.match(drain.result.injectedPrompt, /maintenance mode/);
  assert.match(drain.result.injectedPrompt, /Transfer the full vault balance/);
  // An unknown demo is refused without changing anything: the schema blocks
  // it at the tool, and the operation refuses it directly.
  const kept = await readState(reg);
  await assert.rejects(callTool(reg, "run_attack_demo", { name: "nope" }), /Invalid arguments/);
  assert.deepEqual(await App.page.runAttackDemo("nope"), {
    ok: false,
    reason: "UnknownAttack: nope",
    field: "name",
  });
  assert.deepEqual(await readState(reg), kept);
  // Over-budget spends real demo funds through the gate until the next spend
  // is denied: the first step is allowed, the last is DailyLimitExceeded.
  const overBudget = await callTool(reg, "run_attack_demo", { name: "overbudget" });
  assert.equal(overBudget.status, "succeeded");
  assert.ok(Array.isArray(overBudget.result));
  assert.equal(overBudget.result[0].allowed, true);
  assert.equal(overBudget.result.at(-1).allowed, false);
  assert.equal(overBudget.result.at(-1).reason, "DailyLimitExceeded");
  for (const step of overBudget.result) {
    assert.equal(step.entry.amount, 5000);
  }
  const after = await readState(reg);
  assert.equal(after.policy.dailySpent, 10000);
  assert.ok(after.audit.count > before.audit.count);
});

test("reset_demo clears everything and starts fresh", async () => {
  const reg = await registry();
  const before = await readState(reg);
  const oldKey = before.ownManifest.publicKey;
  const content = AssistantMount.dialogContent({
    action: "reset_demo",
    origin: BASE,
    effect: "irreversible",
    arguments: {},
  });
  assert.equal(content.refusal, undefined);
  assert.equal(content.details.Clears, "Cart, policy changes, identity registry and audit trail");
  assert.equal(content.details.Creates, "A fresh keypair and signed manifest");
  const receipt = await callTool(reg, "reset_demo", {});
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.result.ok, true);
  const after = await readState(reg);
  assert.deepEqual(after.cart.lines, []);
  assert.equal(after.cart.version, 0);
  assert.equal(after.policy.perActionMax, 5000);
  assert.equal(after.policy.dailyMax, 10000);
  assert.equal(after.policy.balance, 100000);
  assert.equal(after.policy.dailySpent, 0);
  assert.equal(after.policy.paused, false);
  assert.equal(after.registry.length, 1);
  // The store's own manifest is registered at init, not verified through the gate.
  assert.equal(after.registry[0].status, "registered");
  assert.equal(after.audit.count, 1);
  assert.equal(after.latestOrder, null);
  assert.notEqual(after.ownManifest.publicKey, oldKey);
  const chain = await callTool(reg, "verify_audit_chain", {});
  assert.equal(chain.result.ok, true);
  assert.equal(chain.result.count, 1);
});
