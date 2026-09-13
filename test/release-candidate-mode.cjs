// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { validateCandidateRequest } = require("../scripts/release/candidate-mode.cjs");
const { nativePrerequisites } = require("../scripts/release/product-prerequisites.cjs");
const { parseWorkflow } = require("../scripts/release/workflow-inventory.cjs");
const root = path.resolve(__dirname, "..");
const sha = "a".repeat(40);
const inputs = { qualify_release: true, candidate_sha: sha, platform_smoke: false, native_targets: "all", recovery_run_id: "", recovery_tag: "" };
const request = () => ({ kind: "native", event: "workflow_dispatch", ref: "refs/heads/candidate/release-080", sha, checkoutSha: sha, inputs: { ...inputs } });
const workflow = (name) => parseWorkflow(fs.readFileSync(path.join(root, `.github/workflows/${name}`), "utf8"), name);

// Evaluate only the small boolean expression subset used by these checked-in
// conditions, against fixtures. This is not a general GitHub job simulator:
// aggregate-result tests separately cover failed/skipped dependencies.
function enabled(expression, context) {
  if (expression === undefined) return true;
  const body = expression.replace(/^\$\{\{\s*/, "").replace(/\s*\}\}$/, "");
  return Boolean(Function("github", "inputs", "vars", "always", "startsWith", "contains", `return (${body})`)(
    context.github, context.inputs, context.vars ?? {}, () => true,
    (value, prefix) => String(value).startsWith(prefix), (value, item) => String(value).includes(item)));
}
const candidateContext = () => ({ github: { event_name: "workflow_dispatch", ref: "refs/heads/candidate/release-080" }, inputs: { ...inputs } });
const tagContext = () => ({ github: { event_name: "push", ref: "refs/tags/v0.8.0" }, inputs: {} });

test("full pre-tag qualification pins the dispatched and checked-out source", () => {
  assert.deepEqual(validateCandidateRequest(request()), { qualifyRelease: true, candidateSha: sha, purpose: "qualification", publishes: false });
  const browser = request(); browser.kind = "browser"; browser.inputs = { qualify_release: true, candidate_sha: sha };
  assert.equal(validateCandidateRequest(browser).qualifyRelease, true);
  for (const mutate of [
    (v) => { v.sha = "b".repeat(40); }, (v) => { v.checkoutSha = "b".repeat(40); },
    (v) => { v.inputs.candidate_sha = "short"; }, (v) => { v.event = "push"; },
    (v) => { v.ref = "refs/tags/v0.8.0"; }, (v) => { v.inputs.platform_smoke = true; },
    (v) => { v.inputs.native_targets = "linux-x64"; }, (v) => { v.inputs.recovery_run_id = "12"; },
    (v) => { v.inputs.recovery_tag = "v0.8.0"; }, (v) => { v.inputs.qualify_release = "true"; },
    (v) => { v.inputs.qualify_release = false; },
  ]) { const value = request(); mutate(value); assert.throws(() => validateCandidateRequest(value)); }
  assert.equal(validateCandidateRequest({ ...request(), inputs: {} }).qualifyRelease, false);
});

test("candidate qualification includes every tagged native producer and required conditional step", () => {
  const data = workflow("ci.yml");
  assert.equal(data.on.workflow_dispatch.inputs.qualify_release.default, false);
  assert.equal(data.on.workflow_dispatch.inputs.qualify_release.type, "boolean");
  assert.ok(data.on.workflow_dispatch.inputs.candidate_sha);
  for (const mode of ["azure", "pfx", "unsigned"]) {
    const candidate = candidateContext(), tag = tagContext();
    candidate.vars = tag.vars = { SAGEJS_WINDOWS_SIGNING_MODE: mode };
    for (const id of [...nativePrerequisites, "native-product-acceptance"]) {
      const job = data.jobs[id];
      assert.equal(enabled(job.if, tag), true, `tag producer ${id}`);
      assert.equal(enabled(job.if, candidate), true, `candidate producer ${id}`);
      for (const step of job.steps) if (enabled(step.if, tag)) {
        assert.equal(enabled(step.if, candidate), true, `${id}/${step.name ?? step.uses ?? step.run}`);
      }
    }
  }
  const metadata = data.jobs["linux-x64"].steps.find((step) => step.name === "Validate release metadata and installer");
  assert.match(metadata.run, /if \[\[ "\$GITHUB_REF" == refs\/tags\/v\* \]\]/);
  assert.match(metadata.run, /else\s+pnpm test:release\s+fi\s+pnpm test:installer/);
  assert.match(data.jobs["macos-sign"].steps.find((step) => step.name === "Sign, notarize, and package macOS arm64").run, /--skip-build/);
  assert.doesNotMatch(data.jobs["macos-sign"].steps.map((step) => step.run ?? "").join("\n"), /--publish/);
});

test("qualification cannot publish, and tag pushes launch no release workflow", () => {
  const w = workflow("ci.yml"), jobs = w.jobs;
  assert.equal(w.on.push.tags, undefined);
  assert.equal(workflow("wasm-release.yml").on.push, undefined);
  assert.equal(jobs["publish-release"], undefined);
  assert.equal(jobs["recover-publish"], undefined);
  for (const ref of ["refs/heads/release-candidate", "refs/tags/v0.8.0"]) {
    const context = candidateContext(); context.github.ref = ref;
    assert.equal(enabled(jobs["publish-prepared"].if, context), false);
  }
  assert.equal(enabled(jobs["publish-prepared"].if, tagContext()), false);
  const ordinary = candidateContext(); ordinary.inputs = { ...inputs, qualify_release: false, candidate_sha: "" };
  assert.equal(enabled(jobs["native-product-acceptance"].if, ordinary), false);
});
test("prepared consumption never schedules producers and verification has no publication credentials", () => {
  const w = workflow("ci.yml"), jobs = w.jobs;
  assert.equal(w.on.workflow_dispatch.inputs.publish_prepared.default, false);
  for (const ref of ["refs/heads/release-control", "refs/tags/v0.8.0"]) for (const publish of [false, true]) {
    const context = { github: { event_name: "workflow_dispatch", ref }, inputs: {
      prepared_request: "explicit request", publish_prepared: publish, qualify_release: false,
      platform_smoke: false, candidate_sha: "", recovery_run_id: "", recovery_tag: "", native_targets: "all" } };
    const scheduled = new Set();
    for (const [id, job] of Object.entries(jobs)) {
      const needs = job.needs === undefined ? [] : Array.isArray(job.needs) ? job.needs : [job.needs];
      if (enabled(job.if, context) && (String(job.if).includes("always()") || needs.every(x => scheduled.has(x)))) scheduled.add(id);
    }
    assert.deepEqual([...scheduled], [publish ? "publish-prepared" : "verify-prepared"]);
  }
  assert.equal(jobs["verify-prepared"].environment, undefined);
  assert.deepEqual(jobs["verify-prepared"].permissions, { actions: "read", contents: "read" });
  assert.equal(jobs["publish-prepared"].environment, "sagejs-release");
  assert.equal(jobs["publish-prepared"].permissions["id-token"], "write");
  assert.equal(jobs["publish-prepared"].concurrency.group, "sagejs-production-publication");
  assert.match(w.concurrency.group, /inputs.publish_prepared.*publication.*validation/);
  for (const id of ["verify-prepared", "publish-prepared"]) {
    assert.equal(jobs[id].steps.find(step => step.uses?.startsWith("pnpm/action-setup@")).with.package_json_file, "control/package.json");
    assert.equal(jobs[id].steps.find(step => step.name === "Install control dependencies without building products")["working-directory"], "control");
    const commands = jobs[id].steps.map(x => x.run ?? "").join("\n");
    assert.match(commands, /pnpm install --frozen-lockfile --ignore-scripts/);
    assert.doesNotMatch(commands, /pnpm (?:build|test)|npm publish|git tag|gh workflow run|gh run rerun/);
    assert.match(commands, /publish-prepared.cjs/);
    assert.equal(jobs[id].needs, undefined);
  }
});

test("candidate admission precedes expensive work in all native/browser root jobs", () => {
  for (const [filename, kind, roots] of [["ci.yml", "native", ["routine"]], ["wasm-release.yml", "browser", ["node-oracle", "clean-build"]]]) {
    const data = workflow(filename);
    assert.equal(data.on.workflow_dispatch.inputs.qualify_release.default, false);
    for (const id of roots) {
      const steps = data.jobs[id].steps;
      const index = steps.findIndex((step) => step.run === `node scripts/release/candidate-mode.cjs ${kind}`);
      assert.ok(index >= 0);
      assert.equal(steps[index].if, undefined);
      assert.deepEqual(steps[index].env, { SAGEJS_RELEASE_INPUTS: "${{ toJSON(inputs) }}" });
      assert.ok(steps.slice(0, index).every((step) => !/pnpm install|pnpm build|source-mirror\.mjs fetch/.test(step.run ?? "")));
    }
  }
  const browser = workflow("wasm-release.yml");
  const attest = browser.jobs.reproducibility.steps.find((step) => step.uses?.startsWith("actions/attest-build-provenance@"));
  assert.equal(enabled(attest.if, candidateContext()), true);
  assert.equal(enabled(attest.if, tagContext()), true);
});

test("the real admission CLI checks Git HEAD and does not echo malformed input contents", () => {
  const actualSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const run = (value) => spawnSync(process.execPath, ["scripts/release/candidate-mode.cjs", "native"], { cwd: root, encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/candidate", GITHUB_SHA: actualSha, SAGEJS_RELEASE_INPUTS: value } });
  const passed = run(JSON.stringify({ ...inputs, candidate_sha: actualSha }));
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).candidateSha, actualSha);
  assert.notEqual(run(JSON.stringify(inputs)).status, 0);
  const malformed = run("{private-fixture");
  assert.notEqual(malformed.status, 0);
  assert.doesNotMatch(malformed.stderr, /private-fixture/);
});
