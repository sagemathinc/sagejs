// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { browserPrerequisites, requireBrowserPrerequisites } = require("../scripts/release/product-prerequisites.cjs");
const { boundaries, requiredStep } = require("../scripts/release/product-acceptance.cjs");
const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
const root = path.resolve(__dirname, "..");
const workflow = () => parseWorkflow(fs.readFileSync(path.join(root, boundaries.browser.workflow), "utf8"), boundaries.browser.workflow);
const good = () => Object.fromEntries(browserPrerequisites.map((id) => [id, { result: "success", outputs: {} }]));

test("every browser product prerequisite is mandatory even when the rest succeed", () => {
  assert.equal(requireBrowserPrerequisites(good()).status, "passed");
  for (const id of browserPrerequisites) {
    for (const result of ["failure", "cancelled", "skipped", "timed_out", "neutral", null, undefined]) {
      const needs = good(); needs[id].result = result;
      assert.throws(() => requireBrowserPrerequisites(needs), /did not succeed/, `${id}: ${result}`);
    }
    const missing = good(); delete missing[id];
    assert.throws(() => requireBrowserPrerequisites(missing), /set differs/, id);
  }
  for (const needs of [null, [], {}, { ...good(), unreviewed: { result: "success" } }]) {
    assert.throws(() => requireBrowserPrerequisites(needs));
  }
});

test("actual workflow binds the verifier contract and asserts every declared needs result", () => {
  const jobs = workflow().jobs;
  const gate = jobs["browser-product-acceptance"];
  assert.equal(gate.name, boundaries.browser.job);
  assert.equal(gate.if, "${{ always() }}");
  assert.equal(gate["continue-on-error"] ?? false, false);
  assert.deepEqual([...gate.needs].sort(), [...browserPrerequisites].sort());
  const steps = gate.steps.filter((step) => step.name === requiredStep);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].if, undefined);
  assert.equal(steps[0]["continue-on-error"] ?? false, false);
  assert.deepEqual(steps[0].env, { SAGEJS_PRODUCT_NEEDS: "${{ toJSON(needs) }}" });
  assert.equal(steps[0].run, "node scripts/release/product-prerequisites.cjs");
  // An added job cannot disappear from acceptance merely because no needs edge
  // was added. These two explicit exclusions retain their legacy enforcement.
  const excluded = ["browser-performance", "browser-release-gates", "browser-product-acceptance"];
  assert.deepEqual(Object.keys(jobs).filter((id) => !excluded.includes(id)).sort(), [...browserPrerequisites].sort());
  for (const id of browserPrerequisites) assert.equal(jobs[id]["continue-on-error"] ?? false, false, id);
  assert.deepEqual(jobs["clean-build"].strategy.matrix.replica, ["a", "b"]);
  assert.deepEqual(jobs["browser-parity"].strategy.matrix.engine, ["chromium", "firefox", "webkit"]);
  assert.deepEqual(jobs["cross-platform-toolchain"].strategy.matrix.include.map((item) => item.platform), ["linux-arm64", "darwin-arm64"]);
  assert.equal(jobs["windows-prebuilt-artifact"]["runs-on"], "windows-2025");
});

test("parity jobs produce both receipts and workload enforcement never reads performance reports", () => {
  const jobs = workflow().jobs;
  const parity = jobs["browser-parity"];
  const collect = parity.steps.filter((step) => step.run?.includes("node bench/browser-wasm-workload-acceptance.mjs"));
  assert.equal(collect.length, 1);
  assert.equal(collect[0].if, undefined);
  assert.equal(collect[0]["continue-on-error"] ?? false, false);
  assert.match(collect[0].run, /--engine \$\{\{ matrix.engine \}\}/);
  assert.match(collect[0].run, /--output build\/wasm-acceptance-\$\{\{ matrix.engine \}\}.json/);
  const upload = parity.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.match(upload.with.path, /wasm-parity-/);
  assert.match(upload.with.path, /wasm-acceptance-/);
  const enforce = jobs["workload-enforcement"];
  assert.equal(enforce.needs, "browser-parity");
  const download = enforce.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
  assert.equal(download.with.pattern, "wasm-browser-parity-*-receipts");
  const command = enforce.steps.find((step) => step.run?.includes("scripts/wasm-workload-dashboard.cjs")).run;
  assert.match(command, /--acceptance-only --source-revision "\$GITHUB_SHA"/);
  assert.match(command, /--explicit-receipts-only/);
  const receipts = [...command.matchAll(/--receipt ([^\s\\]+)/g)].map((match) => match[1]);
  assert.deepEqual(receipts.sort(), ["chromium", "firefox", "webkit"].flatMap((engine) => [
    `.artifacts/wasm-workload-receipts/wasm-parity-${engine}.json`,
    `.artifacts/wasm-workload-receipts/wasm-acceptance-${engine}.json`,
  ]).sort());
  assert.ok(jobs["browser-release-gates"].needs.includes("browser-performance"), "legacy guard stays until coordinated adoption");
});

test("the actual aggregate command fails closed on absent, malformed or failed results", () => {
  const run = (value) => spawnSync(process.execPath, [path.join(root, "scripts/release/product-prerequisites.cjs")], {
    env: { ...process.env, SAGEJS_PRODUCT_NEEDS: value }, encoding: "utf8",
  });
  const passed = run(JSON.stringify(good()));
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).prerequisites.length, browserPrerequisites.length);
  const needs = good(); needs["windows-prebuilt-artifact"].result = "skipped";
  assert.notEqual(run(JSON.stringify(needs)).status, 0);
  for (const value of ["", "null", "{untrusted-response", "{}"] ) assert.notEqual(run(value).status, 0);
  assert.doesNotMatch(run("{untrusted-response").stderr, /untrusted-response/);
});
