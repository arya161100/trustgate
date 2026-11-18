// lib-sync.test.mjs — the vendored library in site/js/lib/ must stay
// byte-identical to the canonical library in trustgate/. The site is a
// static deployment (no build step), so the copy is the deployment; this
// test is the guard against drift. If it fails, re-copy the changed files.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "js", "lib");
const SRC = join(HERE, "..", "..", "trustgate");

const FILES = [
  "canonical.js",
  "encoding.js",
  "sign.js",
  "verify.js",
  "policy.js",
  "audit.js",
  "index.js",
];

for (const file of FILES) {
  test(`site/js/lib/${file} is byte-identical to trustgate/${file}`, () => {
    const vendored = readFileSync(join(LIB, file), "utf8");
    const source = readFileSync(join(SRC, file), "utf8");
    assert.equal(vendored, source, `${file} drifted — re-copy from trustgate/`);
  });
}
