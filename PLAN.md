# TrustGate — Build Plan

**Challenge:** Cognizant Open Agentic Web Challenge (Devpost).
**Deadline:** 11 Jan 2027 16:00 UTC = 23:00 WIB.
**Track:** Track 2 — Building technology components.
**Repo:** https://github.com/arya161100/trustgate (public, MIT).
**Site:** https://arya161100.github.io/trustgate/ (GitHub Pages, HTTPS).

## Concept (one line)

The missing trust layer for the open agentic web: signed agent identity +
policy gate + hash-chained audit trail — the exact gap MVP Spec §5 names
("schema validation ... do[es] not establish trust in the peer network or
its publisher") and the two §7 extensions it lists (policy-bound mandates
with auditable receipts; versioning integrity with signatures).

## Milestones

### M0 — Foundation (17–23 Nov 2026) ✅ in progress
- [x] Spec + Devpost + repo + skill read; plan written.
- [ ] Repo created on GitHub (public, MIT), pushed.
- [ ] `trustgate/` library core: canonical JSON, SHA-256, Ed25519
      sign/verify, policy engine, hash-chained audit log — Node tests green.
- [ ] Design docs: manifest format, policy schema, audit format.

### M1 — Demo store + TrustGate console, no LLM needed (24–30 Nov) ✅ done 19 Nov 2026
- [x] `site/` plain website: demo store (items, cart, checkout) + console
      (identity registry, policy editor, audit viewer).
- [x] Attack demos all working in-browser: unsigned / tampered / expired /
      revoked manifest; over-cap / over-budget / off-allowlist spend;
      prompt-injected drain. Each shows the stable reject code.
- [x] Audit chain verify button (recompute + report break point, if any).
- Site tests: 22 green (15 state + 7 lib-sync); library tests 27 green;
  total 49. Site is plain static files + `server.mjs`, ready for Railway
  static deploy (not deployed yet).

### M2 — Agentify (1–7 Dec)
- [ ] Follow `skills/agentify-website/SKILL.md`: inventory → network design
      (front `trustgate_guard` + specialists `verifier`, `policy_gate`,
      `auditor`) → site-actions.js → trustgate.hocon + agent-manifest.json
      + links.json → `build_network.mjs` validation clean.
- [ ] Mount assistant (BYOK chat, Otari default). Node tests for site
      actions green. Local serve + peer check (second origin on :8081).

### M3 — Host + live verify (8–14 Dec)
- [ ] GitHub Pages deploy (`site/` via Actions). HTTPS live.
- [ ] Live checks: manifest fetchable, network loads, BYOK chat works,
      peer call works cross-origin, attack demos work on the live site.
- [ ] README + screenshots.

### M4 — Submission package (15–21 Dec)
- [ ] Polish: design pass, copy, judge-facing README section.
- [ ] Video script (<2 min). **User records the demo video** (must be the
      entrant explaining, not AI-generated).
- [ ] Devpost draft prepared (text description, screenshots, links).

### M5 — Buffer + submit (22 Dec 2026 – 8 Jan 2027)
- [ ] Final checks, judge-criteria self-review (Implementation / Design /
      Potential Impact / Quality of Idea).
- [ ] **User submits on Devpost** (registration + submit are the user's
      account; agent prepares everything). Target: submit by 8 Jan, 3 days
      before the 11 Jan 16:00 UTC deadline.

## Decisions needed (parent / user)

1. **Devpost registration** — the user must register at
   https://cognizant-agenticweb.devpost.com/ themselves (free). Register
   early or at submission time?
2. **Project name** — TrustGate (repo `arya161100/trustgate`). Confirm or
   rename.
3. **Default LLM** — Otari (published default router, free credits for
   registrants, same as the official examples) with BYOK. No cost unless the
   user chooses another provider.

## Rules (from the challenge + the skill)

- Everything open source (MIT). No keys/tokens/personal data in any
  published file.
- No `demo_mode`, no invented prices/times/IDs/statuses. The trust demos
  use real crypto and real policy evaluation.
- The network definition (incl. instructions) is public by design.
- The user records the video themselves; the agent never submits or pays
  anything without explicit approval.
- Registration + Devpost submission are done by the user (their account).
