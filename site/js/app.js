// app.js — TrustGate demo site UI wiring + the page object the agent wraps.
// All trust calls go through site/js/state.js, which uses the real
// library. This file only renders state and binds buttons. The agent's
// site actions call the same App.page methods as the page's own buttons,
// so both follow one set of rules.
//
// Page methods refuse bad input by returning {ok: false, reason} without
// changing anything; they throw only on unexpected failures. Operations
// clear the messages the page showed for that panel's last refusal,
// without moving focus; the button handlers move focus and reset forms.

import {
  CATALOG,
  createDemoState,
  initDemo,
  dailySpent,
  cartTotal,
  addToCart,
  setCartQuantities,
  checkCheckout,
  checkout,
  verifyPeerManifest,
  previewManifest,
  checkPolicy,
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
} from "./state.js";

/** The eight attack demos, by the name the page and the agent use. */
export const ATTACK_NAMES = [
  "unsigned",
  "tampered",
  "expired",
  "revoked",
  "overcap",
  "overbudget",
  "offallowlist",
  "drain",
];

const state = createDemoState();

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(amount) {
  return "$" + (amount / 100).toFixed(2);
}

function trunc(s, head = 16) {
  const str = String(s);
  return str.length > head + 4 ? str.slice(0, head) + "…" : str;
}

function $(id) {
  return document.getElementById(id);
}

function verdictBadge(result) {
  if (result.allowed || result.ok) {
    return '<span class="badge ok">ALLOWED</span>';
  }
  const code = result.reason || "DENIED";
  return `<span class="badge deny">DENIED · ${esc(code)}</span>`;
}

function renderStatus() {
  $("origin-line").textContent = state.policy.allowedOrigins[0] || "—";
  $("balance-line").textContent = fmt(state.policy.balance);
  $("daily-line").textContent = `${fmt(dailySpent(state))} / ${fmt(state.policy.dailyMax)}`;
  $("cap-line").textContent = fmt(state.policy.perActionMax);
  $("paused-line").textContent = state.policy.paused ? "PAUSED" : "active";
}

function renderCatalog() {
  $("catalog").innerHTML = CATALOG.map(
    (item) => `<div class="item">
      <div class="item-name">${esc(item.name)}</div>
      <div class="item-price">${fmt(item.price)}</div>
      <button data-add="${esc(item.id)}">Add to cart</button>
    </div>`,
  ).join("");
  // Tag query only: the DOM stand-in in Node tests cannot match [data-add].
  $("catalog").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.page.addItem(btn.dataset.add, 1);
    });
  });
}

function renderCart() {
  const lines = state.cart.map((line) => {
    const item = CATALOG.find((i) => i.id === line.id);
    return `<div class="cart-line"><span>${esc(item.name)} × ${line.qty}</span><span>${fmt(item.price * line.qty)}</span><button data-remove="${esc(line.id)}" class="secondary">Remove</button></div>`;
  });
  $("cart-lines").innerHTML = lines.join("") || '<div class="muted">Cart is empty.</div>';
  $("cart-lines").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      App.page.setCartQuantities([{ id: btn.dataset.remove, qty: 0 }]);
    });
  });
  $("cart-total").textContent = fmt(cartTotal(state));
  $("checkout-btn").disabled = state.cart.length === 0;
}

function renderRegistry() {
  const rows = state.registry.map((entry) => {
    const m = entry.manifest;
    return `<tr>
      <td>${esc(m.network)}</td>
      <td>${esc(m.publisher)}</td>
      <td>${esc(trunc(m.publicKey, 12))}</td>
      <td>${esc(m.expiresAt.slice(0, 19).replace("T", " "))}</td>
      <td>${esc(entry.status)}</td>
    </tr>`;
  });
  $("registry-table").innerHTML = `<table>
    <thead><tr><th>Network</th><th>Publisher</th><th>Public key</th><th>Expires</th><th>Status</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
  if (state.manifest) {
    $("own-key").textContent = trunc(state.keypair.publicKey, 24);
    $("own-manifest").textContent = JSON.stringify(state.manifest, null, 2);
  }
}

function renderPolicyForm() {
  const p = state.policy;
  $("pol-perActionMax").value = p.perActionMax;
  $("pol-dailyMax").value = p.dailyMax;
  $("pol-balance").value = p.balance;
  $("pol-paused").checked = p.paused;
  $("pol-origins").value = p.allowedOrigins.join("\n");
  $("pol-actions").value = p.allowedActions.join("\n");
}

function renderAudit() {
  const rows = [...state.chain].reverse().map((e) => `<tr>
    <td>${e.seq}</td>
    <td>${esc(e.ts.slice(11, 19))}</td>
    <td>${esc(e.decision)}</td>
    <td>${esc(e.reason)}</td>
    <td>${esc(e.action)}</td>
    <td>${fmt(e.amount)}</td>
    <td>${esc(trunc(e.hash, 10))}</td>
  </tr>`);
  $("audit-table").innerHTML = `<table>
    <thead><tr><th>#</th><th>Time (UTC)</th><th>Decision</th><th>Reason</th><th>Action</th><th>Amount</th><th>Hash</th></tr></thead>
    <tbody>${rows.join("")}</tbody></table>`;
  $("audit-count").textContent = String(state.chain.length);
}

function renderAll() {
  renderStatus();
  renderCatalog();
  renderCart();
  renderRegistry();
  renderPolicyForm();
  renderAudit();
}

function showResult(el, html) {
  el.innerHTML = html;
}

function clearResult(id) {
  const el = $(id);
  if (el) el.innerHTML = "";
}

/** The page's own origin, in the browser and under the Node test stand-in. */
function pageOrigin() {
  return new URL(document.URL).origin;
}

async function runAttack(name, fn) {
  const box = $("attack-result");
  showResult(box, `<p>Running <strong>${esc(name)}</strong>…</p>`);
  try {
    const out = await fn();
    let html = `<h3>${esc(name)}</h3>`;
    if (Array.isArray(out)) {
      html += "<ol>" + out.map((step) => {
        const label = step.allowed ? "allowed" : `denied (${esc(step.reason)})`;
        return `<li>${verdictBadge(step)} place_order ${fmt(step.entry.amount)} — ${label} (audit #${step.entry.seq})</li>`;
      }).join("") + "</ol>";
    } else if (out && out.injectedPrompt) {
      html += `<blockquote>${esc(out.injectedPrompt)}</blockquote>
        <p>Proposed action: <code>drain_vault</code> to <code>https://evil.example/</code> for ${fmt(state.policy.balance)}.</p>
        <p>${verdictBadge(out)} The gate evaluates the action, not the model's words.</p>
        <p class="muted">Audit entry #${out.entry.seq} · hash ${esc(trunc(out.entry.hash, 12))}</p>`;
    } else {
      // Manifest verdicts carry no entry object (verifyPeerManifest returns
      // the library verdict only); the spend verdicts do. Do not read
      // out.entry unless it exists — the old code threw here for the four
      // manifest demos and showed an error instead of the verdict.
      html += `<p>${verdictBadge(out)}</p>`;
      if (out && out.entry) {
        html += `<p class="muted">Audit entry #${out.entry.seq} · hash ${esc(trunc(out.entry.hash, 12))}</p>`;
      } else {
        html += `<p class="muted">Recorded in the audit trail and registry.</p>`;
      }
    }
    showResult(box, html);
  } catch (err) {
    showResult(box, `<p class="error">Error: ${esc(err.message)}</p>`);
  }
  renderAll();
}

const ATTACK_LABELS = {
  unsigned: "Unsigned manifest",
  tampered: "Tampered manifest",
  expired: "Expired manifest",
  revoked: "Revoked manifest",
  overcap: "Spend over per-action cap",
  overbudget: "Spend over daily budget",
  offallowlist: "Spend from off-allowlist origin",
  drain: "Prompt-injected drain",
};

/**
 * The page object: one state reader plus one method per operation.
 * The page's own buttons and the agent's site actions call these same
 * methods, so both follow one set of rules.
 */
class TrustGatePage {
  constructor() {
    this.state = state;
    this.latestOrder = null;
  }

  /** Initialise the demo (fresh keypair, signed manifest, genesis entry). */
  async init(origin) {
    await initDemo(this.state, { origin });
    renderAll();
  }

  /**
   * Plain-JSON copy of the page's data and current state: catalog, cart
   * with its version, policy with today's spend, registry, audit entries,
   * latest order, today's date, and the page-only facts the HTML states.
   * Leaves out nothing the page shows, and no other visitor's records
   * (this demo has a single visitor's state).
   */
  getState() {
    const s = this.state;
    const now = new Date();
    const lines = s.cart.map((line) => {
      const item = CATALOG.find((i) => i.id === line.id);
      return {
        id: line.id,
        name: item.name,
        qty: line.qty,
        price: item.price,
        priceText: fmt(item.price),
        lineTotal: item.price * line.qty,
        lineTotalText: fmt(item.price * line.qty),
      };
    });
    const fact = (id) => document.getElementById(id)?.textContent?.trim() ?? "";
    return {
      initialized: s.keypair !== null,
      today: {
        iso: now.toISOString().slice(0, 10),
        weekday: now.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      },
      origin: pageOrigin(),
      catalog: CATALOG.map((i) => ({ id: i.id, name: i.name, price: i.price, priceText: fmt(i.price) })),
      cart: {
        lines,
        total: cartTotal(s),
        totalText: fmt(cartTotal(s)),
        version: s.version,
      },
      policy: {
        perActionMax: s.policy.perActionMax,
        perActionMaxText: fmt(s.policy.perActionMax),
        dailyMax: s.policy.dailyMax,
        dailyMaxText: fmt(s.policy.dailyMax),
        balance: s.policy.balance,
        balanceText: fmt(s.policy.balance),
        dailySpent: dailySpent(s),
        dailySpentText: fmt(dailySpent(s)),
        paused: s.policy.paused,
        allowedOrigins: [...s.policy.allowedOrigins],
        allowedActions: [...s.policy.allowedActions],
      },
      registry: s.registry.map((e) => ({
        network: e.manifest.network,
        publisher: e.manifest.publisher,
        publicKey: e.manifest.publicKey,
        expiresAt: e.manifest.expiresAt,
        status: e.status,
        checkedAt: e.checkedAt,
      })),
      ownManifest: s.manifest ? { ...s.manifest } : null,
      audit: {
        count: s.chain.length,
        entries: [...s.chain].reverse().slice(0, 10).map((e) => ({
          seq: e.seq,
          ts: e.ts,
          decision: e.decision,
          reason: e.reason,
          action: e.action,
          amount: e.amount,
          amountText: fmt(e.amount),
          hash: e.hash,
        })),
      },
      latestOrder: this.latestOrder ? { ...this.latestOrder } : null,
      pageFacts: {
        about: fact("fact-about"),
        store: fact("fact-store"),
        identity: fact("fact-identity"),
        policy: fact("fact-policy"),
        audit: fact("fact-audit"),
        attacks: fact("fact-attacks"),
      },
    };
  }

  /** The catalog ids, for the add-to-cart enum in the action schema. */
  catalogIds() {
    return CATALOG.map((i) => i.id);
  }

  /**
   * Add a quantity of one item to the cart. Returns the updated cart, or
   * {ok: false, reason} without changing anything.
   */
  addItem(id, qty) {
    if (typeof id !== "string" || !CATALOG.some((i) => i.id === id)) {
      return { ok: false, reason: `UnknownItem: ${id}`, field: "id" };
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return { ok: false, reason: "InvalidQuantity: qty must be an integer 1..100", field: "quantity" };
    }
    addToCart(this.state, id, qty);
    renderCart();
    renderStatus();
    return { ok: true, cart: this.getState().cart };
  }

  /**
   * Set exact cart quantities (0 removes the line). Validates every line
   * before changing anything. Returns the updated cart, or {ok: false,
   * reason} without changing anything.
   */
  setCartQuantities(lines) {
    if (!Array.isArray(lines)) {
      return { ok: false, reason: "InvalidLines: lines must be an array", field: "lines" };
    }
    for (const line of lines) {
      if (!line || typeof line !== "object" || !CATALOG.some((i) => i.id === line.id)) {
        return { ok: false, reason: `UnknownItem: ${line?.id}`, field: "lines" };
      }
      if (!Number.isInteger(line.qty) || line.qty < 0 || line.qty > 100) {
        return { ok: false, reason: "InvalidQuantity: qty must be an integer 0..100", field: "lines" };
      }
    }
    if (new Set(lines.map((l) => l.id)).size !== lines.length) {
      return { ok: false, reason: "DuplicateItem: each item once", field: "lines" };
    }
    try {
      setCartQuantities(this.state, lines);
    } catch (err) {
      return { ok: false, reason: err.message, field: "lines" };
    }
    renderCart();
    renderStatus();
    return { ok: true, cart: this.getState().cart };
  }

  /**
   * Read-only checkout check: what checkout would do, without changing
   * anything. Used by the confirmation dialog and by checkout itself.
   */
  checkCheckout(expectedVersion) {
    return checkCheckout(this.state, pageOrigin(), expectedVersion);
  }

  /**
   * Check out the current cart through the policy gate. Refuses (without
   * changing anything) when the check refuses. On allow, returns the order
   * receipt and clears the cart.
   */
  async checkout(expectedVersion) {
    clearResult("checkout-result");
    if (!this.state.keypair) return { allowed: false, reason: "NotInitialized" };
    const result = await checkout(this.state, pageOrigin(), expectedVersion);
    if (!result.allowed) return result;
    this.latestOrder = {
      orderId: result.orderId,
      amount: result.amount,
      amountText: fmt(result.amount),
      auditSeq: result.entry.seq,
      auditHash: result.entry.hash,
    };
    renderAll();
    return { allowed: true, orderId: result.orderId, amount: result.amount, amountText: fmt(result.amount), auditSeq: result.entry.seq, auditHash: result.entry.hash };
  }

  /**
   * Verify a manifest, register it and audit the verdict. Returns the
   * library verdict {ok} or {ok: false, reason}. A value that is not a
   * manifest at all is refused without registering it.
   */
  async verifyManifest(manifest) {
    clearResult("verify-own-result");
    if (!this.state.keypair) return { ok: false, reason: "NotInitialized" };
    const result = await verifyPeerManifest(this.state, manifest);
    renderRegistry();
    renderAudit();
    renderStatus();
    return result;
  }

  /**
   * Pure manifest verification (no registry, no audit): the read-only
   * check the confirmation dialog runs before verify_manifest is confirmed.
   */
  async previewVerify(manifest) {
    if (!this.state.keypair) return { ok: false, reason: "NotInitialized" };
    return previewManifest(this.state, manifest);
  }

  /**
   * Evaluate a proposed action against the policy without executing it.
   * `action` is {origin, name, amount}. Returns the gate verdict plus the
   * figures needed to explain it.
   */
  checkPolicy(action) {
    if (!action || typeof action !== "object") {
      return { allowed: false, reason: "InvalidAction" };
    }
    return checkPolicy(this.state, action);
  }

  /** Recompute the audit chain. Returns the library verdict. */
  async verifyAuditChain() {
    const result = await verifyAuditChain(this.state);
    return { ...result, count: this.state.chain.length };
  }

  /**
   * Apply a policy patch from the editor and audit the change. Returns the
   * updated policy, or {ok: false, reason} without changing anything.
   */
  async updatePolicy(patch) {
    clearResult("policy-result");
    if (!this.state.keypair) return { ok: false, reason: "NotInitialized" };
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return { ok: false, reason: "InvalidPolicy: patch must be an object" };
    }
    for (const key of ["perActionMax", "dailyMax", "balance"]) {
      if (patch[key] !== undefined && (!Number.isInteger(patch[key]) || patch[key] < 0)) {
        return { ok: false, reason: `InvalidPolicy: ${key} must be a non-negative integer`, field: key };
      }
    }
    if (patch.paused !== undefined && typeof patch.paused !== "boolean") {
      return { ok: false, reason: "InvalidPolicy: paused must be a boolean", field: "paused" };
    }
    for (const key of ["allowedOrigins", "allowedActions"]) {
      if (patch[key] !== undefined && (!Array.isArray(patch[key]) || patch[key].some((v) => typeof v !== "string"))) {
        return { ok: false, reason: `InvalidPolicy: ${key} must be an array of strings`, field: key };
      }
    }
    try {
      const policy = await updatePolicy(this.state, patch, pageOrigin());
      renderAll();
      return { ok: true, policy };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }

  /**
   * Run one attack demo by name. Returns the real verdict from the
   * library. The over-budget demo spends real demo funds through the gate
   * until the next spend is denied — that is the demo.
   */
  async runAttackDemo(name) {
    clearResult("attack-result");
    if (!this.state.keypair) return { ok: false, reason: "NotInitialized" };
    if (!ATTACK_NAMES.includes(name)) {
      return { ok: false, reason: `UnknownAttack: ${name}`, field: "name" };
    }
    const origin = pageOrigin();
    const fns = {
      unsigned: () => attackUnsigned(this.state),
      tampered: () => attackTampered(this.state),
      expired: () => attackExpired(this.state),
      revoked: () => attackRevoked(this.state),
      overcap: () => attackOverCap(this.state, origin),
      overbudget: () => attackOverBudget(this.state, origin),
      offallowlist: () => attackOffAllowlist(this.state),
      drain: () => attackDrain(this.state),
    };
    const out = await fns[name]();
    renderAll();
    return out;
  }

  /**
   * Reset the demo: fresh state, new keypair and manifest, cleared cart,
   * policy, registry and audit trail. Returns the fresh state summary.
   */
  async resetDemo() {
    const fresh = createDemoState();
    Object.assign(this.state, fresh);
    this.latestOrder = null;
    await initDemo(this.state, { origin: pageOrigin() });
    for (const id of ["checkout-result", "verify-own-result", "policy-result", "verify-chain-result", "attack-result"]) {
      clearResult(id);
    }
    renderAll();
    return { ok: true, state: this.getState() };
  }
}

export class App {
  static page = new TrustGatePage();
}

// Exported for tests: the DOM stand-in never fires DOMContentLoaded, so tests
// attach the page's own handlers directly to check they store the same record
// as the tool calls.
export { bindEvents };

function bindEvents() {
  $("checkout-btn").addEventListener("click", async () => {
    const result = await App.page.checkout(App.page.getState().cart.version);
    const box = $("checkout-result");
    if (result.allowed) {
      showResult(box, `<p>${verdictBadge(result)} Order <code>${esc(result.orderId)}</code> for ${fmt(result.amount)} placed. Receipt: audit #${result.auditSeq}, hash ${esc(trunc(result.auditHash, 12))}.</p>`);
    } else {
      showResult(box, `<p>${verdictBadge(result)} Checkout denied. Audit entry recorded.</p>`);
    }
  });

  $("verify-own-btn").addEventListener("click", async () => {
    const result = await App.page.verifyManifest(App.page.getState().ownManifest);
    $("verify-own-result").innerHTML = result.ok
      ? `<p>${verdictBadge(result)} Own manifest verifies: signature valid, hash matches, not expired, not revoked.</p>`
      : `<p>${verdictBadge(result)} Own manifest failed: ${esc(result.reason)}.</p>`;
  });

  $("policy-save-btn").addEventListener("click", async () => {
    const result = await App.page.updatePolicy({
      perActionMax: Number($("pol-perActionMax").value),
      dailyMax: Number($("pol-dailyMax").value),
      balance: Number($("pol-balance").value),
      paused: $("pol-paused").checked,
      allowedOrigins: $("pol-origins").value.split("\n").map((s) => s.trim()).filter(Boolean),
      allowedActions: $("pol-actions").value.split("\n").map((s) => s.trim()).filter(Boolean),
    });
    $("policy-result").innerHTML = result.ok
      ? "<p>Policy saved and audited.</p>"
      : `<p class="error">Error: ${esc(result.reason)}</p>`;
  });

  $("verify-chain-btn").addEventListener("click", async () => {
    const result = await App.page.verifyAuditChain();
    $("verify-chain-result").innerHTML = result.ok
      ? `<p>${verdictBadge({ allowed: true })} Chain OK — ${state.chain.length} entries, every hash recomputed, every link intact.</p>`
      : `<p><span class="badge deny">BROKEN</span> Chain breaks at entry #${result.breakIndex}: ${esc(result.reason)}. Entries after the break are untrusted.</p>`;
  });

  $("tamper-btn").addEventListener("click", async () => {
    const index = tamperEntry(state, 1);
    if (index < 0) {
      $("verify-chain-result").innerHTML = "<p class=\"error\">Chain too short to tamper — make a purchase or run an attack first.</p>";
      return;
    }
    const result = await App.page.verifyAuditChain();
    $("verify-chain-result").innerHTML = result.ok
      ? `<p>Entry #${index} was modified (amount +1). Re-verification: chain still OK (unexpected).</p>`
      : `<p>Entry #${index} was modified (amount +1). Re-verification: <span class="badge deny">BROKEN</span> at entry #${result.breakIndex}: ${esc(result.reason)}.</p>`;
    renderAudit();
  });

  // Tag query only: the DOM stand-in in Node tests cannot match [data-attack].
  $("attack-grid").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      runAttack(ATTACK_LABELS[btn.dataset.attack], () => App.page.runAttackDemo(btn.dataset.attack));
    });
  });

  $("reset-btn").addEventListener("click", async () => {
    await App.page.resetDemo();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await App.page.init(window.location.origin);
});
