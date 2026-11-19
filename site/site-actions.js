// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module". Only the names in
// "actions.agentTools" become model tools, called website_<name>.
//
// Each action wraps a function the page already uses (App.page), so the assistant and
// the manual UI share one set of rules. Operations return {ok: false, reason, field}
// when they refuse input, before changing anything, and throw only on unexpected
// failures. A throw is reported as "unknown".
// Import the page script by the same URL the page uses (js/app.js, no ?v= query), or
// the actions get a second, separate copy of the page state.
import { App } from "./js/app.js";

/**
 * Describes the site's operations as actions the agents can call.
 *
 * Each action wraps a function the page already uses, so the assistant and the manual
 * UI share one set of rules. The runtime validates arguments against inputSchema before
 * execute runs, and asks the visitor to confirm "irreversible" actions first.
 */
class SiteActions {
  /**
   * Register every site action with the runtime.
   *
   * :param actions: The runtime registry facade with a register(definition) method.
   */
  static registerActions(actions) {
    actions.register(SiteActions.getSiteStateAction());
    actions.register(SiteActions.addItemAction());
    actions.register(SiteActions.setCartQuantitiesAction());
    actions.register(SiteActions.checkPolicyAction());
    actions.register(SiteActions.verifyManifestAction());
    actions.register(SiteActions.verifyAuditChainAction());
    actions.register(SiteActions.updatePolicyAction());
    actions.register(SiteActions.runAttackDemoAction());
    actions.register(SiteActions.checkoutAction());
    actions.register(SiteActions.resetDemoAction());
  }

  static getSiteStateAction() {
    return {
      name: "get_site_state",
      description: "Read the demo store and TrustGate console as they are now: the catalog with prices in cents, the cart with its version and total, the policy (per-action cap, daily cap, vault balance, spent today, paused, origin and action allowlists), the identity registry, the last audit entries, the latest order, today's date, and the page's own descriptions. Call it again in each turn that needs current values: the visitor can also use the page directly, and results from earlier turns are not kept.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.getSiteState,
    };
  }

  static getSiteState() {
    return App.page.getState();
  }

  static addItemAction() {
    return {
      name: "add_item",
      description: "Add a quantity of one catalog item to the visible cart, keeping existing items. Returns the updated cart with its new version, or ok false with a reason. Does not place an order. The visitor can undo it on the page with Remove or by setting quantities.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id", "quantity"],
        properties: {
          // An enum of real IDs stops the model from inventing items.
          id: {
            type: "string",
            enum: App.page.catalogIds(),
            description: "Item id from website_get_site_state.",
          },
          quantity: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "How many to add.",
          },
        },
      },
      execute: SiteActions.addItem,
    };
  }

  static addItem(args) {
    return App.page.addItem(args.id, args.quantity);
  }

  static setCartQuantitiesAction() {
    return {
      name: "set_cart_quantities",
      description: "Set exact quantities for the listed cart items; a quantity of 0 removes the item. Every line is checked before any change: an unknown item, a bad quantity or a repeated item refuses the whole call and changes nothing. An empty list clears the cart. Returns the updated cart with its new version, or ok false with a reason. Does not place an order.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["lines"],
        properties: {
          lines: {
            type: "array",
            minItems: 0,
            maxItems: 6,
            description: "The cart after the change: one line per item to keep, with its quantity.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "qty"],
              properties: {
                id: {
                  type: "string",
                  enum: App.page.catalogIds(),
                  description: "Item id from website_get_site_state.",
                },
                qty: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "Exact quantity to keep; 0 removes the item.",
                },
              },
            },
          },
        },
      },
      execute: SiteActions.setCartQuantities,
    };
  }

  static setCartQuantities(args) {
    return App.page.setCartQuantities(args.lines);
  }

  static checkPolicyAction() {
    return {
      name: "check_policy",
      description: "Ask the policy gate whether it would allow one proposed action, without executing anything. Returns the verdict (allowed, or the stable reject code) with the current caps, spent today and vault balance. It does not check who the visitor is: the demo has no login, so anyone on this page can propose an action; the gate judges the action, not the person.",
      effect: "read",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["origin", "name", "amount"],
        properties: {
          origin: {
            type: "string",
            maxLength: 200,
            description: "The origin the action would come from, such as the page origin from website_get_site_state.",
          },
          name: {
            type: "string",
            maxLength: 80,
            description: "The action name, such as place_order. Any name the policy does not allow is refused with ActionNotAllowed.",
          },
          amount: {
            type: "integer",
            minimum: 0,
            maximum: 1000000000,
            description: "The amount in cents.",
          },
        },
      },
      execute: SiteActions.checkPolicy,
    };
  }

  static checkPolicy(args) {
    return App.page.checkPolicy({ origin: args.origin, name: args.name, amount: args.amount });
  }

  static verifyManifestAction() {
    return {
      name: "verify_manifest",
      description: "Verify a TrustGate agent manifest: signature valid, hash matches, not expired, not revoked. Registers the manifest in the identity registry and writes the verdict to the audit trail either way. The browser asks the visitor to confirm first. Returns the verdict {ok} or {ok: false, reason} with a stable code: ManifestUnsigned, ManifestHashMismatch, ManifestExpired, AgentRevoked or ManifestBadSignature. A value that is not a manifest at all is refused as ManifestInvalid without registering it.",
      // "irreversible" makes the runtime open a confirmation dialog before execute runs:
      // verification appends permanent registry and audit records the page cannot undo.
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["manifest"],
        properties: {
          manifest: {
            type: "object",
            description: "The manifest to verify, as signed JSON: version, network, publisher, origin, publicKey, issuedAt, expiresAt, capabilities, hash and signature. Use the store's own manifest from website_get_site_state, or one the visitor pastes.",
            required: ["version", "network", "publisher", "origin", "publicKey", "issuedAt", "expiresAt", "capabilities", "hash", "signature"],
            properties: {
              version: { type: "integer", description: "Manifest format version, 1." },
              network: { type: "string", maxLength: 80, description: "Agent network name." },
              publisher: { type: "string", maxLength: 80, description: "Publisher name." },
              origin: { type: "string", maxLength: 200, description: "Publisher origin." },
              publicKey: { type: "string", maxLength: 500, description: "Base64url Ed25519 public key." },
              issuedAt: { type: "string", maxLength: 40, description: "ISO timestamp the manifest was issued." },
              expiresAt: { type: "string", maxLength: 40, description: "ISO timestamp the manifest expires." },
              capabilities: {
                type: "array",
                maxItems: 20,
                description: "Action names the manifest claims.",
                items: { type: "string", maxLength: 80 },
              },
              hash: { type: "string", maxLength: 100, description: "Hex SHA-256 of the canonical manifest fields." },
              signature: { type: "string", maxLength: 500, description: "Base64url Ed25519 signature over the hash." },
            },
          },
        },
      },
      execute: SiteActions.verifyManifest,
    };
  }

  static verifyManifest(args) {
    return App.page.verifyManifest(args.manifest);
  }

  static verifyAuditChainAction() {
    return {
      name: "verify_audit_chain",
      description: "Recompute the hash-chained audit trail: every entry hash and every link to the previous entry. Returns {ok: true, count} when the chain is intact, or {ok: false, breakIndex, reason, count} with the first broken entry (SeqMismatch, PrevHashMismatch or HashMismatch). Changes nothing.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.verifyAuditChain,
    };
  }

  static verifyAuditChain() {
    return App.page.verifyAuditChain();
  }

  static updatePolicyAction() {
    return {
      name: "update_policy",
      description: "Change the policy gate's settings. Only the fields given change; the rest stay. The change is written to the audit trail. The visitor can change any field back on the page. Returns the updated policy, or ok false with a reason. Amounts are in cents; allowlists are exact-match lists.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          perActionMax: {
            type: "integer",
            minimum: 0,
            maximum: 1000000000,
            description: "Most cents one action may spend.",
          },
          dailyMax: {
            type: "integer",
            minimum: 0,
            maximum: 1000000000,
            description: "Most cents the gate may allow in one UTC day.",
          },
          balance: {
            type: "integer",
            minimum: 0,
            maximum: 1000000000,
            description: "Demo vault balance in cents.",
          },
          paused: {
            type: "boolean",
            description: "True denies every action; false reopens the gate.",
          },
          allowedOrigins: {
            type: "array",
            maxItems: 20,
            description: "Origins the gate allows, such as the page origin from website_get_site_state.",
            items: { type: "string", maxLength: 200 },
          },
          allowedActions: {
            type: "array",
            maxItems: 20,
            description: "Action names the gate allows, such as place_order.",
            items: { type: "string", maxLength: 80 },
          },
        },
      },
      execute: SiteActions.updatePolicy,
    };
  }

  static updatePolicy(args) {
    return App.page.updatePolicy(args);
  }

  static runAttackDemoAction() {
    return {
      name: "run_attack_demo",
      description: "Run one of the eight attack demos with the real check (WebCrypto signature verification or the real policy engine) and write the verdict to the audit trail. Returns the real verdict with its stable reject code. The over-budget demo spends real demo funds through the gate until the next spend is denied — that is the demo. Names: unsigned, tampered, expired, revoked, overcap, overbudget, offallowlist, drain.",
      effect: "write",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: {
            type: "string",
            enum: ["unsigned", "tampered", "expired", "revoked", "overcap", "overbudget", "offallowlist", "drain"],
            description: "Which attack demo to run.",
          },
        },
      },
      execute: SiteActions.runAttackDemo,
    };
  }

  static runAttackDemo(args) {
    return App.page.runAttackDemo(args.name);
  }

  static checkoutAction() {
    return {
      name: "checkout",
      description: "Place the order for the current cart: the cart total goes through the policy gate as place_order. The browser asks the visitor to confirm first. The site refuses a stale expectedVersion. On allow, returns the order receipt (order id, amount, audit entry); the cart is cleared. On deny, returns the stable reject code and changes nothing.",
      // "irreversible" makes the runtime open a confirmation dialog before execute runs.
      effect: "irreversible",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["expectedVersion"],
        properties: {
          expectedVersion: {
            type: "integer",
            minimum: 0,
            description: "The latest cart version in this turn: from website_get_site_state, or from a cart change made after that read.",
          },
        },
      },
      execute: SiteActions.checkout,
    };
  }

  static checkout(args) {
    return App.page.checkout(args.expectedVersion);
  }

  static resetDemoAction() {
    return {
      name: "reset_demo",
      description: "Reset the demo: clears the cart, the policy changes, the identity registry and the audit trail, and generates a fresh keypair and signed manifest. The browser asks the visitor to confirm first. Returns the fresh state. There is no undo.",
      // "irreversible" makes the runtime open a confirmation dialog before execute runs.
      effect: "irreversible",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: SiteActions.resetDemo,
    };
  }

  static resetDemo() {
    return App.page.resetDemo();
  }
}

// The runtime calls the module's registerActions export.
export const registerActions = SiteActions.registerActions;
