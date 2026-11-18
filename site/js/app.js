// app.js — TrustGate demo site UI wiring (browser only).
// All trust calls go through site/js/state.js, which uses the real
// library. This file only renders state and binds buttons.

import {
  CATALOG,
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
} from "./state.js";

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
  $("catalog").querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addToCart(state, btn.dataset.add, 1);
      renderCart();
    });
  });
}

function renderCart() {
  const lines = state.cart.map((line) => {
    const item = CATALOG.find((i) => i.id === line.id);
    return `<div class="cart-line"><span>${esc(item.name)} × ${line.qty}</span><span>${fmt(item.price * line.qty)}</span></div>`;
  });
  $("cart-lines").innerHTML = lines.join("") || '<div class="muted">Cart is empty.</div>';
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
  renderCart();
  renderRegistry();
  renderPolicyForm();
  renderAudit();
}

function showResult(el, html) {
  el.innerHTML = html;
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
      html += `<p>${verdictBadge(out)}</p>
        <p class="muted">Audit entry #${out.entry.seq} · hash ${esc(trunc(out.entry.hash, 12))}</p>`;
    }
    showResult(box, html);
  } catch (err) {
    showResult(box, `<p class="error">Error: ${esc(err.message)}</p>`);
  }
  renderAll();
}

const ATTACKS = {
  unsigned: ["Unsigned manifest", () => attackUnsigned(state)],
  tampered: ["Tampered manifest", () => attackTampered(state)],
  expired: ["Expired manifest", () => attackExpired(state)],
  revoked: ["Revoked manifest", () => attackRevoked(state)],
  overcap: ["Spend over per-action cap", () => attackOverCap(state, window.location.origin)],
  overbudget: ["Spend over daily budget", () => attackOverBudget(state, window.location.origin)],
  offallowlist: ["Spend from off-allowlist origin", () => attackOffAllowlist(state)],
  drain: ["Prompt-injected drain", () => attackDrain(state)],
};

function bindEvents() {
  $("checkout-btn").addEventListener("click", async () => {
    const result = await checkout(state, window.location.origin);
    const box = $("checkout-result");
    if (result.allowed) {
      showResult(box, `<p>${verdictBadge(result)} Order <code>${esc(result.orderId)}</code> for ${fmt(result.amount)} placed. Receipt: audit #${result.entry.seq}, hash ${esc(trunc(result.entry.hash, 12))}.</p>`);
    } else {
      showResult(box, `<p>${verdictBadge(result)} Checkout denied. Audit #${result.entry.seq}.</p>`);
    }
    renderAll();
  });

  $("verify-own-btn").addEventListener("click", async () => {
    const result = await verifyPeerManifest(state, state.manifest, {
      revokedHashes: state.revokedHashes,
    });
    $("verify-own-result").innerHTML = result.ok
      ? `<p>${verdictBadge(result)} Own manifest verifies: signature valid, hash matches, not expired, not revoked.</p>`
      : `<p>${verdictBadge(result)} Own manifest failed: ${esc(result.reason)}.</p>`;
    renderAll();
  });

  $("policy-save-btn").addEventListener("click", async () => {
    try {
      await updatePolicy(state, {
        perActionMax: Number($("pol-perActionMax").value),
        dailyMax: Number($("pol-dailyMax").value),
        balance: Number($("pol-balance").value),
        paused: $("pol-paused").checked,
        allowedOrigins: $("pol-origins").value.split("\n").map((s) => s.trim()).filter(Boolean),
        allowedActions: $("pol-actions").value.split("\n").map((s) => s.trim()).filter(Boolean),
      }, window.location.origin);
      $("policy-result").innerHTML = "<p>Policy saved and audited.</p>";
    } catch (err) {
      $("policy-result").innerHTML = `<p class="error">Error: ${esc(err.message)}</p>`;
    }
    renderAll();
  });

  $("verify-chain-btn").addEventListener("click", async () => {
    const result = await verifyAuditChain(state);
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
    const result = await verifyAuditChain(state);
    $("verify-chain-result").innerHTML = result.ok
      ? `<p>Entry #${index} was modified (amount +1). Re-verification: chain still OK (unexpected).</p>`
      : `<p>Entry #${index} was modified (amount +1). Re-verification: <span class="badge deny">BROKEN</span> at entry #${result.breakIndex}: ${esc(result.reason)}.</p>`;
    renderAudit();
  });

  document.querySelectorAll("[data-attack]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [name, fn] = ATTACKS[btn.dataset.attack];
      runAttack(name, fn);
    });
  });

  $("reset-btn").addEventListener("click", async () => {
    const fresh = createDemoState();
    Object.assign(state, fresh);
    await initDemo(state, { origin: window.location.origin });
    $("checkout-result").innerHTML = "";
    $("verify-own-result").innerHTML = "";
    $("policy-result").innerHTML = "";
    $("verify-chain-result").innerHTML = "";
    $("attack-result").innerHTML = "";
    renderAll();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  renderCatalog();
  bindEvents();
  await initDemo(state, { origin: window.location.origin });
  renderAll();
});
