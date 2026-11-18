# TrustGate site (M1)

Demo store + TrustGate console. Plain static files, zero dependencies,
no build step, no LLM needed. Everything runs in the browser with real
WebCrypto Ed25519 and the real policy engine from `trustgate/`.

## Files

```
index.html          Store + console UI
css/style.css       Styles (no framework)
js/app.js           DOM wiring (browser only)
js/state.js         Demo state + trust operations (DOM-free, Node-tested)
js/lib/             Vendored copy of trustgate/ (byte-identical, see below)
server.mjs          Zero-dependency static server (local + Railway)
tests/              Node tests for the site logic
```

## Serve locally

```shell
node server.mjs            # http://127.0.0.1:8080/
PORT=8123 node server.mjs  # another port
# or: python3 -m http.server 8123
```

Open http://127.0.0.1:8080/ — the store, console, and attack demos all
work without any key.

## Deploy on Railway (static site)

The site is plain static files plus a tiny Node server, so it deploys as a
normal Railway service:

1. Create a service from the `trustgate` repo, root directory `site/`.
2. Start command: `node server.mjs` (listens on `$PORT`).
3. No build step, no environment variables, no secrets.

This has not been deployed yet — the first live deploy will confirm the
exact Railway settings.

## What the site does

- **Demo store** — 6 items, cart, checkout. Checkout proposes a
  `place_order` action for the cart total; the policy gate decides.
- **Identity registry** — a fresh Ed25519 keypair is generated in the
  browser on load; the store manifest is signed with it. Verify checks
  signature, hash, expiry, and revocation via the library.
- **Policy editor** — per-action cap, daily budget, vault balance, pause,
  origin/action allowlists. Fail-closed defaults; changes are audited.
- **Audit viewer** — every allow/deny is hash-chained. "Verify audit
  chain" recomputes every hash and reports the break point, if any.
  "Tamper with entry #1" modifies one entry so verification can show a
  real break (`HashMismatch` at entry #1).
- **Attack demos** — each runs the real check and shows the stable code:
  unsigned `ManifestUnsigned`, tampered `ManifestHashMismatch`, expired
  `ManifestExpired`, revoked `AgentRevoked`, over-cap
  `PerActionLimitExceeded`, over-budget `DailyLimitExceeded` (real
  sequential spends through the gate), off-allowlist origin
  `OriginNotAllowed`, prompt-injected drain `OriginNotAllowed`.

## Library vendoring

`site/js/lib/` is a byte-identical copy of `trustgate/` (the site must be
self-contained for static hosting). `tests/lib-sync.test.mjs` fails if the
copy drifts from the source — re-copy the changed files when it does.

## Tests

```shell
node --test site/tests/*.test.mjs        # site tests (22)
node --test trustgate/tests/*.test.mjs   # library tests (27)
```
