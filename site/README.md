# TrustGate site (M2)

Demo store + TrustGate console, with the agent network and BYOK assistant
mounted. Plain static files, zero dependencies, no build step. The trust
demos run in the browser with real WebCrypto Ed25519 and the real policy
engine from `trustgate/`; the assistant sends your messages, and the page
data it reads, to the LLM provider you choose in its settings.

## Files

```
index.html          Store + console UI (+ assistant section)
site.js             Assistant mount: BYOK chat + confirmation dialogs
css/style.css       Styles (no framework) + assistant layout
js/app.js           DOM wiring + the page object the actions wrap (browser only)
js/state.js         Demo state + trust operations (DOM-free, Node-tested)
js/lib/             Vendored copy of trustgate/ (byte-identical, see below)
site-actions.js     Registered site actions (website_* tools)
trustgate.hocon     Agent network definition (source)
trustgate.network.json  Resolved network (generated, do not edit by hand)
agent-manifest.json Public bundle file (brand, router, peer policy, tools)
links.json          Linked networks (none: no partner sites)
agent-mcp.json      MCP facade descriptor (generated, not available: static bundle)
bridge/             Action bridge + manifest copy (generated)
.well-known/        nsdeploy discovery files (generated)
runtime/            Reference browser runtime (copied unchanged from the
                    agentify-website skill; do not edit)
server.mjs          Zero-dependency static server (local + Railway)
tests/              Node tests for the site actions (+ site_harness.mjs setup)
```

## Serve locally

```shell
# Recommended: the skill's server sends the CORS header on public files,
# which the bridge and peer checks need.
node ~/workspace/cognizant-agentic-web-ref/skills/agentify-website/scripts/serve_site.mjs site --port 8080
# or the plain static server:
node server.mjs            # http://127.0.0.1:8080/
PORT=8123 node server.mjs  # another port
```

Open http://127.0.0.1:8080/ — the store, console, and attack demos all
work without any key. The assistant needs an LLM key (BYOK, ⚙ AI model
settings); Otari is the published default router.

## The assistant

Network `trustgate`: front agent `trustgate_guard` plus specialists
`verifier`, `policy_gate` and `auditor`. It can show the store and console,
add items to the cart, check the policy gate, verify a manifest, check the
audit trail, run the attack demos, and place an order — the browser asks you
to confirm anything that cannot be undone (checkout, verify a manifest,
reset the demo) before it happens. It takes no real payments and gives no
refunds: the demo store uses demo cents in a demo vault.

Other agent sites can run this network for their own visitors, but then it
has no site tools: it answers only from its instructions and points to this
site's page. Network URL: http://127.0.0.1:8080/trustgate (public:
https://arya161100.github.io/trustgate/trustgate).

## Deploy on Railway (static site)

The site is plain static files plus a tiny Node server, so it deploys as a
normal Railway service:

1. Create a service from the `trustgate` repo, root directory `site/`.
2. Start command: `node server.mjs` (listens on `$PORT`).
3. No build step, no environment variables, no secrets.

M1 is live at https://trustgate-production.up.railway.app/. M2 does not
redeploy (that is M3).

## What the site does

- **Demo store** — 6 items, cart, checkout. Checkout proposes a
  `place_order` action for the cart total; the policy gate decides.
- **Identity registry** — a fresh Ed25519 keypair is generated in the
  browser on load; the store manifest is signed with it. Verify checks
  signature, hash, expiry, and revocation via the library. A failed
  verification is registered with its reason and audited, like a passed one.
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
node --test site/tests/*.test.mjs        # site tests (47: 16 agentified + 9 actions + 22 state/lib-sync)
node --test trustgate/tests/*.test.mjs   # library tests (27)
```

Rebuild the network after editing `trustgate.hocon` or `agent-manifest.json`:

```shell
node ~/workspace/cognizant-agentic-web-ref/skills/agentify-website/scripts/build_network.mjs trustgate.hocon --manifest agent-manifest.json --check
```

Peer check (second origin on :8081):

```shell
node ~/workspace/cognizant-agentic-web-ref/skills/agentify-website/scripts/check_partner.mjs http://127.0.0.1:8080/trustgate --origin http://127.0.0.1:8081
```
