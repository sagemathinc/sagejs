// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { attachIdentity, sha256 } = require("../tools/optimizer-development/common.cjs");
const contracts = require("../tools/optimization-engine/contracts.cjs");
const service = require("../tools/optimization-engine/epoch-service.cjs");

const id = (name) => `sha256:${sha256(name)}`;
const digest = (name) => sha256(name);

function workload() {
  return contracts.createDocument("workload", {
    authority: {
      kind: "reviewed-contract",
      producer: "test.epoch-service",
      validatedInputIds: [],
    },
    sourceClosureId: id("workload-source"),
    title: "Epoch fixture workload",
    owner: "optimization-engine",
    role: "representative",
    publicEntry: {
      path: "bench/fixture.py",
      name: "public.fixture",
      mode: "sage",
      outputBoundary: "complete result",
    },
    runner: { path: "bench/fixture.cjs", argv: [], environment: [] },
    corpus: { id: "fixture", digest: digest("corpus"), provenance: "fixture" },
    oracles: [{
      id: "exact", kind: "invariant", digest: digest("oracle"), provenance: "fixture",
    }],
    phases: [{
      id: "production", label: "production", parentId: null,
      timing: "inclusive", mayOverlap: false,
    }],
    protocol: {
      warmupRuns: 1, repetitions: 11, timeoutMilliseconds: 1000,
      reset: "process", preparation: "warm-prepared",
    },
    platforms: ["linux-x64"],
    browsers: [],
    instrumentation: ["inclusive-timer"],
    materiality: { minimumWorstPairFraction: 0.1, minimumPairs: 11 },
  });
}

function fixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-epoch-service-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist/build-receipt.json"), "fixture receipt\n");
  return root;
}

function inspectors(state) {
  const closure = attachIdentity(service.SOURCE_CLOSURE_SCHEMA, {
    records: [{
      path: "src/fixture.py", mode: "100644", objectId: "1".repeat(40),
      kind: "regular-file", bytes: 7, digest: digest("source"),
    }],
  });
  const output = attachIdentity(service.OUTPUT_MANIFEST_SCHEMA, {
    records: [{
      path: "dist/compiler.js", kind: "file", mode: 0o644,
      bytes: 8, digest: digest("output"),
    }],
  });
  return {
    revisionInspector: () => ({
      commit: state.commit,
      tree: state.tree,
      clean: state.clean,
      status: state.clean ? "" : " M src/fixture.py\n",
    }),
    buildInspector: () => ({ current: state.buildCurrent, reason: "fixture" }),
    closureInspector: () => state.closureChanged
      ? attachIdentity(service.SOURCE_CLOSURE_SCHEMA, { records: [] })
      : closure,
    outputInspector: () => state.outputChanged
      ? attachIdentity(service.OUTPUT_MANIFEST_SCHEMA, { records: [] })
      : output,
    receiptDigestInspector: () => state.receiptChanged
      ? digest("changed receipt") : digest("fixture receipt\n"),
    closure,
    output,
  };
}

function createFixtureEpoch(root, state, buildCounter) {
  const observed = inspectors(state);
  return service.createEpoch({
    root,
    workloads: [workload()],
    components: [],
    profiler: { protocolId: id("profiler"), calibrationId: id("calibration") },
    build: true,
    runCommand: () => {
      buildCounter.count += 1;
      return { status: 0 };
    },
    revisionInspector: observed.revisionInspector,
    buildInspector: observed.buildInspector,
    closureInspector: observed.closureInspector,
    outputInspector: observed.outputInspector,
  });
}

test("one epoch build serves at least five isolated lane scratch consumers", (t) => {
  const root = fixtureRoot(t);
  const storeRoot = path.join(root, "shared-store");
  const state = {
    commit: "1".repeat(40), tree: "2".repeat(40), clean: true,
    buildCurrent: true, closureChanged: false, outputChanged: false, receiptChanged: false,
  };
  const buildCounter = { count: 0 };
  const created = createFixtureEpoch(root, state, buildCounter);
  assert.equal(buildCounter.count, 1);
  const lanes = ["capability", "semantics", "alternatives", "workload", "adjudication"];
  const directories = lanes.map((laneId) => service.allocateLaneScratch({
    epoch: created.epoch, laneId, root, storeRoot,
  }));
  assert.equal(new Set(directories).size, 5);
  assert.equal(directories.every((directory) => fs.existsSync(directory)), true);
});
test("tracked edits, commits, build outputs, and receipts invalidate the epoch", (t) => {
  const root = fixtureRoot(t);
  const initial = {
    commit: "1".repeat(40), tree: "2".repeat(40), clean: true,
    buildCurrent: true, closureChanged: false, outputChanged: false, receiptChanged: false,
  };
  const created = createFixtureEpoch(root, initial, { count: 0 });
  const check = (state) => service.epochBindings({
    epoch: created.epoch,
    root,
    ...inspectors(state),
  });
  assert.equal(check(initial).state, "exact-current");
  assert.equal(check({ ...initial, clean: false }).actionable, false);
  assert.equal(check({ ...initial, commit: "3".repeat(40) }).actionable, false);
  assert.equal(check({ ...initial, closureChanged: true }).actionable, false);
  assert.equal(check({ ...initial, outputChanged: true }).actionable, false);
  assert.equal(check({ ...initial, receiptChanged: true }).actionable, false);
  assert.equal(check({ ...initial, buildCurrent: false }).actionable, false);
});

test("logical epoch identity survives checkout relocation", (t) => {
  const left = fixtureRoot(t);
  const right = fixtureRoot(t);
  const state = {
    commit: "1".repeat(40), tree: "2".repeat(40), clean: true,
    buildCurrent: true, closureChanged: false, outputChanged: false, receiptChanged: false,
  };
  const leftEpoch = createFixtureEpoch(left, state, { count: 0 }).epoch;
  const rightEpoch = createFixtureEpoch(right, state, { count: 0 }).epoch;
  assert.equal(leftEpoch.id, rightEpoch.id);
});

test("unsafe and symlinked shared store roots fail closed", (t) => {
  const root = fixtureRoot(t);
  const state = {
    commit: "1".repeat(40), tree: "2".repeat(40), clean: true,
    buildCurrent: true, closureChanged: false, outputChanged: false, receiptChanged: false,
  };
  const created = createFixtureEpoch(root, state, { count: 0 });
  assert.throws(() => service.allocateLaneScratch({
    epoch: created.epoch, laneId: "lane", root, storeRoot: "/",
  }), /unsafe store root/);
  const target = path.join(root, "target");
  const linked = path.join(root, "linked");
  fs.mkdirSync(target);
  fs.symlinkSync(target, linked);
  assert.throws(() => service.allocateLaneScratch({
    epoch: created.epoch, laneId: "lane", root, storeRoot: linked,
  }), /symbolic link/);
});
