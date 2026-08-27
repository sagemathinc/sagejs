// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const cli = path.join(root, "packages/flint-wasm/node-cli.mjs");
const releaseArtifactAvailable = [
  "production-manifest.json",
  "build-receipt.json",
].every((name) =>
  existsSync(path.join(root, "packages/flint-wasm/dist", name))
);
const source = [
  "R=PolynomialRing(ZZ,names=('x','y','z'))",
  "x,y,z=R.gens()",
  "left=(x+y+z+1)^7+(x-y+2*z+3)^6+y^5*z",
  "right=(2*x-y+z+2)^6+(x+2*y-z+1)^5+z^6",
  "print(left.resultant(right,x).number_of_terms())",
].join(";");

test("the production Node-Wasm CLI uses the fixed multivariate route", {
  skip: releaseArtifactAvailable
    ? false
    : "build the FLINT Wasm release artifact first",
}, () => {
  const result = spawnSync(process.execPath, [cli, "--diagnostics", "-c", source], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "946\n");
  const receipt = JSON.parse(result.stderr.trim());
  assert.deepEqual(receipt.instrumentation.routes, [{
    capability_id: "wasm-library:flint:fmpz-mpoly-resultant-packed-v1",
    selected_route: "receipt-backed-wasm-artifact",
    execution_target: "wasm-artifact",
    call_count: 1,
    ingress_bytes: 4_928,
    egress_bytes: 32_192,
  }]);
  assert.equal(receipt.instrumentation.boundary_crossings, 1);
});
