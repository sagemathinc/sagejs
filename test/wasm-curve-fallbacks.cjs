// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

test("curve Wasm C adapter is a flat host-neutral boundary", () => {
  const source = fs.readFileSync(
    path.join(root, "packages/flint-wasm/src/curves/elliptic-lseries-adapter.c"),
    "utf8",
  );
  const header = fs.readFileSync(
    path.join(root, "packages/flint-wasm/src/curves/elliptic-lseries-adapter.h"),
    "utf8",
  );
  assert.doesNotMatch(source + header, /napi_|node_api|v8::/);
  assert.match(source, /sagejs_ec_lseries_values_refined_acb/);
  assert.match(source, /SAGEJS_WASM_EC_MAX_POINTS_PER_TILE 10000U/);
  assert.match(header, /exact signed coefficients/);
  assert.match(header, /preserving the requested Acb/);
  assert.match(header, /Binary64 is explicit and confined/);
});

test("the Wasm core is extracted from the authoritative desktop source", () => {
  const source = fs.readFileSync(
    path.join(root, "packages/flint/src/elliptic_lfunction.c"),
    "utf8",
  );
  const { ellipticLseriesCoreSource } = require(
    path.join(root, "packages/flint-wasm/src/curves/core-source.cjs"),
  );
  const core = ellipticLseriesCoreSource(source);
  assert.match(core, /int sagejs_ec_lseries_values_acb\(/);
  assert.match(core, /int sagejs_ec_lseries_values_refined_acb\(/);
  assert.match(core, /int sagejs_ec_lseries_direct_values_acb\(/);
  assert.doesNotMatch(core, /napi_|node_api|v8::/);
  assert.ok(core.length > 30_000, "the complete mathematical source prefix is retained");
});

test("specialist curve dependencies have reviewed portable dispositions", async () => {
  const module = await import(pathToFileURL(
    path.join(root, "packages/flint-wasm/curve-backend.mjs"),
  ));
  const decisions = module.curveCapabilities;
  assert.equal(decisions["eclib-descent-and-rank"].disposition, "desktop-only");
  assert.equal(decisions["smalljac-local-factors"].fallback,
    "exact-bounded-exhaustive-frobenius");
  assert.equal(decisions["rforest-genus3"].fallback,
    "exact-bounded-exhaustive-local-factor");
  assert.equal(
    decisions["hyperelliptic-genus3-candidate-scan"].fallback,
    "same-source-exact-python",
  );
});
