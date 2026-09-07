// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { browserPrerequisites, nativePrerequisites, requireProductPrerequisites } = require("../scripts/release/product-prerequisites.cjs");
const requireBrowserPrerequisites = (needs) => requireProductPrerequisites("browser", needs);
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
  assert.equal(steps[0].run, "node scripts/release/product-prerequisites.cjs browser");
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

test("native correctness retains both corpora but no repeated timing campaign", () => {
  const jobs = workflow().jobs;
  const oracle = jobs["node-oracle"];
  const parity = oracle.steps.filter((step) => step.run?.includes("browser-wasm-node-parity.cjs"));
  assert.equal(parity.length, 1);
  assert.match(parity[0].run, /--tier release --receipt build\/wasm-node-oracle.json/);
  const acceptance = oracle.steps.filter((step) => step.run?.includes("--native-acceptance"));
  assert.equal(acceptance.length, 1);
  assert.equal(acceptance[0].if, undefined);
  assert.equal(acceptance[0]["continue-on-error"] ?? false, false);
  assert.match(acceptance[0].run, /--budget bench\/browser-wasm-budget.json/);
  assert.doesNotMatch(acceptance[0].run, /--(?:samples|workloads|shard|report-regressions|require-baseline)/);
  assert.ok(oracle.steps.indexOf(acceptance[0]) > oracle.steps.indexOf(parity[0]));
  assert.equal(oracle.steps.filter((step) => step.run?.includes("pnpm build")).length, 1);
  const upload = oracle.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.match(upload.with.path, /wasm-node-oracle.json/);
  assert.match(upload.with.path, /wasm-native-acceptance.json/);
  assert.doesNotMatch(oracle.steps.map((step) => step.run || "").join("\n"), /--samples 7/);
  const report = jobs["browser-performance"].steps.find((step) => step.run?.includes("--native-reference"));
  assert.match(report.run, /--native-reference build\/node-reference\/wasm-native-acceptance.json/);
  assert.match(report.run, /--report-regressions/);
});

test("the actual aggregate command fails closed on absent, malformed or failed results", () => {
  const run = (value) => spawnSync(process.execPath, [path.join(root, "scripts/release/product-prerequisites.cjs"), "browser"], {
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

test("native acceptance covers every release producer and never accepts a missing or failed prerequisite", () => {
  const filename = boundaries.native.workflow;
  const jobs = parseWorkflow(fs.readFileSync(path.join(root, filename), "utf8"), filename).jobs;
  const gate = jobs["native-product-acceptance"];
  assert.equal(gate.name, boundaries.native.job);
  assert.equal(gate.if, "${{ always() && startsWith(github.ref, 'refs/tags/v') }}");
  assert.equal(gate["continue-on-error"] ?? false, false);
  assert.deepEqual([...gate.needs].sort(), [...nativePrerequisites].sort());
  const excluded = ["platform-smoke", "publish-release", "recover-publish", "native-product-acceptance"];
  assert.deepEqual(Object.keys(jobs).filter((id) => !excluded.includes(id)).sort(), [...nativePrerequisites].sort());
  for (const id of nativePrerequisites) assert.equal(jobs[id]["continue-on-error"] ?? false, false, id);
  const steps = gate.steps.filter((step) => step.name === requiredStep);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].run, "node scripts/release/product-prerequisites.cjs native");
  assert.equal(steps[0].if, undefined);
  assert.equal(steps[0]["continue-on-error"] ?? false, false);
  assert.deepEqual(steps[0].env, { SAGEJS_PRODUCT_NEEDS: "${{ toJSON(needs) }}" });
  const passed = () => Object.fromEntries(nativePrerequisites.map((id) => [id, { result: "success" }]));
  assert.equal(requireProductPrerequisites("native", passed()).product, "native");
  for (const id of nativePrerequisites) {
    for (const result of ["failure", "cancelled", "skipped", "neutral", null, undefined]) {
      const needs = passed(); needs[id].result = result;
      assert.throws(() => requireProductPrerequisites("native", needs), /did not succeed/);
    }
    const missing = passed(); delete missing[id];
    assert.throws(() => requireProductPrerequisites("native", missing), /set differs/);
  }
  assert.throws(() => requireProductPrerequisites("native", good()), /set differs/);
  assert.throws(() => requireProductPrerequisites("browser", passed()), /set differs/);
  for (const kind of [undefined, "", "constructor", "toString", "unknown"]) {
    assert.throws(() => requireProductPrerequisites(kind, passed()), /unknown product kind/);
  }
  const cli = spawnSync(process.execPath, [path.join(root, "scripts/release/product-prerequisites.cjs"), "native"], {
    env: { ...process.env, SAGEJS_PRODUCT_NEEDS: JSON.stringify(passed()) }, encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).product, "native");
  // Add the complete producer boundary without removing the old numerical gate.
  assert.deepEqual(jobs["publish-release"].needs, ["numerical-release-gate", "native-product-acceptance"]);
});
