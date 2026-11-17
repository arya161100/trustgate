// policy.js — TrustGate policy engine.
// Ported from SpendGuard (crates/spendguard-policy): same primitives, same
// fail-closed defaults, same stable reject codes — NEAR vault -> browser gate.
// Policy schema: docs/policy-schema.md. Pure + sync (no crypto, no I/O).

export const REASONS = {
  Paused: "Paused",
  AmountZero: "AmountZero",
  OriginNotAllowed: "OriginNotAllowed",
  ActionNotAllowed: "ActionNotAllowed",
  PerActionLimitExceeded: "PerActionLimitExceeded",
  DailyLimitExceeded: "DailyLimitExceeded",
  InsufficientBalance: "InsufficientBalance",
};

/** Fail-closed defaults: limits 0, empty allowlists — nothing passes until the owner sets a policy. */
export function defaultPolicy() {
  return {
    version: 1,
    perActionMax: 0,
    dailyMax: 0,
    allowedOrigins: [],
    allowedActions: [],
    paused: false,
    balance: 0,
  };
}

/**
 * Evaluate one proposed action against a policy.
 * @param {object} policy — see docs/policy-schema.md
 * @param {object} action — { origin: string, name: string, amount: number }
 * @param {object} usage — { dailySpent: number } (UTC-day total so far)
 * @returns {{ allowed: true } | { allowed: false, reason: string }}
 * Evaluation order (first failure wins): Paused, AmountZero,
 * OriginNotAllowed, ActionNotAllowed, PerActionLimitExceeded,
 * DailyLimitExceeded, InsufficientBalance.
 */
export function evaluatePolicy(policy, action, usage = { dailySpent: 0 }) {
  if (policy.paused) return { allowed: false, reason: REASONS.Paused };
  if (!(action.amount > 0)) return { allowed: false, reason: REASONS.AmountZero };
  if (!policy.allowedOrigins.includes(action.origin)) {
    return { allowed: false, reason: REASONS.OriginNotAllowed };
  }
  if (!policy.allowedActions.includes(action.name)) {
    return { allowed: false, reason: REASONS.ActionNotAllowed };
  }
  if (action.amount > policy.perActionMax) {
    return { allowed: false, reason: REASONS.PerActionLimitExceeded };
  }
  if (usage.dailySpent + action.amount > policy.dailyMax) {
    return { allowed: false, reason: REASONS.DailyLimitExceeded };
  }
  if (action.amount > policy.balance) {
    return { allowed: false, reason: REASONS.InsufficientBalance };
  }
  return { allowed: true };
}

/** UTC calendar day key (YYYY-MM-DD) for the daily window. */
export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
