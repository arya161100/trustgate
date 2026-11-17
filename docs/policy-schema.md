# TrustGate policy schema (v1)

Ported from [SpendGuard](https://github.com/arya161100/spendguard-agent)
(`crates/spendguard-policy`): the same primitives, the same fail-closed
defaults, the same stable reject codes — adapted from a NEAR vault to a
browser policy gate.

## Policy

```json
{
  "version": 1,
  "perActionMax": 5000,
  "dailyMax": 10000,
  "allowedOrigins": ["https://arya161100.github.io"],
  "allowedActions": ["place_order", "verify_manifest", "check_policy"],
  "paused": false,
  "balance": 100000
}
```

Amounts are in the store's minor unit (cents). `balance` is the demo vault
balance the gate draws from.

## Evaluation order (first failure wins)

1. `paused` → `Paused`
2. amount <= 0 → `AmountZero`
3. origin not in `allowedOrigins` → `OriginNotAllowed`
4. action not in `allowedActions` → `ActionNotAllowed`
5. amount > `perActionMax` → `PerActionLimitExceeded`
6. `dailySpent + amount` > `dailyMax` → `DailyLimitExceeded`
7. amount > `balance` → `InsufficientBalance`
8. otherwise → `ALLOWED`

## Fail-closed defaults

A fresh policy has `perActionMax: 0`, `dailyMax: 0`, empty allowlists, and
`paused: false` — so nothing can pass until the owner sets a policy. An
empty origin list denies every action; an empty action list denies every
action. The daily window is the UTC calendar day.

## The model is advisory; the gate is the control

The agent proposes an action. The gate evaluates it. A prompt-injected
agent that wants to drain the vault to a stranger still cannot: the policy
is enforced in code, not in the model's instructions. The gate runs in the
site's own functions (`site-actions.js`), never in agent instructions.
