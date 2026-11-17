# TrustGate

**The missing trust layer for the open agentic web.**

Schema validation doesn't establish trust. TrustGate does.

TrustGate is a Track 2 entry for the **Cognizant Open Agentic Web Challenge**
(11 Nov 2026 – 11 Jan 2027). It gives the open agentic web what the MVP
specification itself says is missing: a way to verify *who* an agent is, define
*what* it is authorized to do, and make its actions *accountable* — before it
acts, not after.

> "Schema validation and coded-tool sandboxing do not establish trust in the
> peer network or its publisher." — Worldwide Agentic Web MVP Spec §5

## The problem

The MVP spec lets any site load any other site's agent network into the
visitor's browser. The network definition is public data, and its instructions
are untrusted input: a publisher's instructions can try to override caller
policies, elicit information, or induce unsafe tool calls. Consent cards and
CORS bound *where* data goes, but nothing verifies *who* the publisher is,
*what* the agent is allowed to do, or *what it actually did*.

## What TrustGate does (three layers, all real code)

1. **Signed agent identity** — Ed25519 (WebCrypto). A publisher signs their
   agent manifest (canonical JSON + SHA-256 hash). Any site verifies: signature
   valid, hash matches, not expired, not revoked. A tampered manifest fails the
   hash. An unsigned manifest is rejected. Implements spec §7 "Versioning
   integrity and publisher terms: hashes, caller pinning, signatures".
2. **Policy gate** — a port of [SpendGuard](https://github.com/arya161100/spendguard-agent)'s
   policy engine (NEAR hackathon, Agent Economy + AI Security & Defense) to the
   browser: per-action cap, daily budget, origin allowlist, action allowlist,
   pause, fail-closed defaults, stable reject codes
   (`PerActionLimitExceeded`, `DailyLimitExceeded`, `OriginNotAllowed`,
   `ActionNotAllowed`, `UnauthorizedAgent`, `Paused`, `AmountZero`,
   `InsufficientBalance`). The model proposes; the gate decides. Implements
   spec §7 "Transactions: policy-bound mandates ... and auditable receipts
   through a trusted arbiter" and §5 "Fail closed".
3. **Hash-chained audit trail** — an append-only log. Every allow/deny (with
   reason code, origin, action, amount, timestamp) links to the previous
   entry's hash. Tamper with history and the chain breaks — verifiable in one
   click.

## The demo site

`site/` is a conforming open agentic website (MVP Profile 0.2): a demo store
plus the TrustGate console, with an agent network (`trustgate`) that runs in
the browser via the reference runtime, BYOK chat, and site actions
(`website_*` tools) that the policy gate guards.

Try it live: **https://arya161100.github.io/trustgate/**

Attack demos (all verifiable in the browser, no LLM key needed):
- unsigned peer manifest → rejected (`UnauthorizedAgent`)
- tampered manifest (hash mismatch) → rejected (`ManifestHashMismatch`)
- spend over the per-action cap → denied (`PerActionLimitExceeded`)
- spend over the daily budget → denied (`DailyLimitExceeded`)
- revoked agent → denied (`AgentRevoked`)
- prompt-injected drain to a stranger → denied (`OriginNotAllowed`)

## Layout

```
trustgate/            Reusable zero-dependency JS library (the community component)
  canonical.js        Canonical JSON (stable key order) + SHA-256
  sign.js             Ed25519 keypair + manifest signing (WebCrypto / Node)
  verify.js           Manifest verification: signature, hash, expiry, revocation
  policy.js           Policy engine (SpendGuard primitives, ported to JS)
  audit.js            Hash-chained append-only audit log
  tests/              node --test
site/                 The conforming agentic website (demo store + console)
  index.html          Store + TrustGate console UI
  js/                 Store logic + TrustGate UI
  site-actions.js     Registered site actions (website_* tools)
  trustgate.hocon     Agent network definition (source)
  trustgate.network.json  Resolved network (generated, do not edit by hand)
  agent-manifest.json Links.json  Public bundle files
  runtime/            Reference browser runtime (copied unchanged from
                      cognizant-ai-labs/agentic-web skills/agentify-website)
  tests/              Node tests for site actions
docs/                 Design docs: manifest format, policy schema, audit format
```

## Quickstart (local)

```shell
node --test trustgate/tests/*.test.mjs   # library tests
node --test site/tests/*.test.mjs        # site-action tests
# serve the site (sends the CORS header on public files):
node ~/workspace/cognizant-agentic-web-ref/skills/agentify-website/scripts/serve_site.mjs site --port 8080
# open http://127.0.0.1:8080/
```

The agent chat needs an LLM key (BYOK, ⚙ AI model settings). Otari is the
published default router; any OpenAI-compatible provider works. The trust
demos (verify / gate / audit) run without any key.

## Relationship to SpendGuard

TrustGate ports SpendGuard's policy model — per-transaction cap, daily cap,
receiver/method allowlists, pause, fail-closed defaults, stable reject codes —
from a NEAR vault contract to the browser, and adds the two layers the agentic
web needs on top: signed publisher identity and a hash-chained audit trail.
SpendGuard proved the model on NEAR testnet (contract `sgd3147470a.testnet`):
0.4 NEAR approved, 1.5 NEAR rejected `PerTxLimitExceeded`, injected drain to
`evil-payout.near` rejected `ReceiverNotAllowed`.

## License

MIT. See `LICENSE`.
