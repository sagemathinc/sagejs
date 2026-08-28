// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { compileFunction, Script } = require("node:vm");

const { ROOT, hotColdFixture, makeMap } = require(
  "./fixtures/optimizer-development/profile/helpers.cjs"
);
const {
  assembleValidatedOptimizerProfileReceipt,
  createPrivateProfileEventCollector,
  nodeProfileCapabilities,
  OptimizerProfileAuthenticationError,
  OptimizerProfileExecutionError,
  runAuthenticatedNodeProfile,
} = require("../dist/tools/optimizer-profiler.js");
const evidenceCommon = require("../tools/optimizer-development/common.cjs");
const evidenceIdentity = require("../tools/optimizer-development/identity.cjs");

function distribution(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    unit: "microseconds",
    samples,
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted.at(-1),
  };
}

function profileEnvelope(map) {
  const sourceBundle = evidenceIdentity.sourceBundleFromRecords([{
    path: map.source.identity.path,
    digest: map.source.identity.digest,
    bytes: map.source.bytes,
  }]);
  const { optimizerCatalog } = require("../dist/tools/python/optimizer/index.js");
  const compiler = evidenceIdentity.canonicalCompilerIdentity({
    root: ROOT,
    irSchema: "sagejs.optimizing-mathematics/v1",
    optimizerCatalog,
    optionsDigest: evidenceCommon.sha256(evidenceCommon.canonicalJson({
      level: "O2",
      language: "sage",
      sourceSampling: "v8-cpu",
    })),
  });
  const artifact = evidenceCommon.attachIdentity("sagejs.optimizer-artifact/v1", {
    kind: "node-source",
    receiptDigest: "4".repeat(64),
  });
  return {
    authority: "host-collector-with-private-evaluator-evidence",
    workload: {
      id: evidenceCommon.contentIdentity("sagejs.optimizer-test-reference/v1", { name: "hot" }),
    },
    sourceBundle,
    compiler,
    artifact,
    host: {
      platform: process.platform,
      architecture: process.arch,
      runtime: "node",
      runtimeVersion: process.version,
      engine: "v8",
      engineVersion: process.versions.v8,
    },
    capability: { runtime: "node", sourceSampling: "inspector-position-ticks" },
    configuration: {
      target: "generic",
      mode: "sage",
      capabilities: [],
      environmentDigest: "5".repeat(64),
    },
    outcome: { status: "success", error: null },
    output: {
      digest: "6".repeat(64),
      oracleResults: [{ id: "exact-output", status: "pass", digest: "6".repeat(64) }],
    },
    compilation: distribution([10, 11, 12]),
    execution: {
      cold: distribution([20, 21, 22]),
      warm: distribution([10, 11, 12]),
    },
    phases: [],
    optimizer: { reportDigest: "7".repeat(64), regions: [] },
    counters: { boundaryCrossings: 0, copiedBytes: 0, materializations: 0, allocations: 0 },
    resources: { liveBefore: 0, liveAfter: 0, highWater: 0 },
    overhead: {
      method: "paired-alternating",
      samplingIntervalMicroseconds: 100,
      baselineRunsMicroseconds: [100, 100, 100],
      instrumentedRunsMicroseconds: [110, 110, 110],
      medianRatio: 1.1,
      reviewedMaximumRatio: 1.75,
      status: "pass",
    },
  };
}

test("private route events are lexical, validated, counted, and immutable", async () => {
  const url = `sagejs-profile:///private-events-${process.pid}-${Date.now()}.js`;
  const javascript = [
    "function publish(observer) {",
    "  globalThis.__forged_optimizer_observer__ = () => undefined;",
    "  observer('math.test-region.v1', 'test.machine-loop', 'selected-static-entry');",
    "  return Object.prototype.hasOwnProperty.call(globalThis, 'observer');",
    "}",
    "publish(observer);",
  ].join("\n");
  const functionEnd = javascript.indexOf("\npublish(observer)");
  const map = makeMap({
    javascript,
    url,
    functions: [{ name: "publish", start: 0, end: functionEnd }],
  });
  const events = createPrivateProfileEventCollector();
  const before = Object.getOwnPropertyNames(globalThis);
  const observation = await runAuthenticatedNodeProfile({
    map,
    javascript,
    privateEvents: events,
    execute() {
      const program = compileFunction(javascript, ["observer"], { filename: url });
      return program(events.observer);
    },
  });
  try {
    assert.deepEqual(
      Object.getOwnPropertyNames(globalThis).filter((key) => key === "observer"),
      before.filter((key) => key === "observer"),
    );
    assert.equal(observation.privateEvents.authority, "private-lexical-capability");
    assert.equal(observation.privateEvents.count, 1);
    assert.equal(observation.privateEvents.countsByOutcome["selected-static-entry"], 1);
    assert.deepEqual(observation.privateEvents.events[0], {
      sequence: 0,
      regionId: "math.test-region.v1",
      kind: "test.machine-loop",
      outcome: "selected-static-entry",
    });
    assert.ok(Object.isFrozen(observation.privateEvents));
    assert.ok(Object.isFrozen(observation.privateEvents.events));
    assert.ok(Object.isFrozen(observation.privateEvents.events[0]));
    assert.throws(() => {
      observation.privateEvents.events[0].outcome = "guarded-fast";
    }, TypeError);
  } finally {
    delete globalThis.__forged_optimizer_observer__;
  }

  assert.throws(
    () => events.observer("x", "y", "invented-route"),
    /invalid optimizer profile event outcome/,
  );
});

test("zero-trip route evidence is an authenticated event outside the loop", async () => {
  const url = `sagejs-profile:///zero-trip-${process.pid}-${Date.now()}.js`;
  const javascript = [
    "const count = 0;",
    "if (count === 0) observer('math.zero-trip.v1', 'test.machine-loop', 'zero-trip');",
    "for (let index = 0; index < count; index += 1) { throw new Error('unreachable'); }",
  ].join("\n");
  const map = makeMap({ javascript, url, functions: [] });
  const events = createPrivateProfileEventCollector();
  const observation = await runAuthenticatedNodeProfile({
    map,
    javascript,
    privateEvents: events,
    execute() {
      return compileFunction(javascript, ["observer"], { filename: url })(events.observer);
    },
  });
  assert.equal(observation.privateEvents.countsByOutcome["zero-trip"], 1);
  assert.equal(observation.evidence.runtime.routeEventCounts.unmatched, 1);
  assert.equal(observation.evidence.runtime.routeEvents[0].outcome, "zero-trip");
});

test("stale generated JavaScript is rejected before any execution", async () => {
  const fixture = hotColdFixture(1, `sagejs-profile:///stale-${Date.now()}.js`);
  let executed = false;
  await assert.rejects(
    runAuthenticatedNodeProfile({
      map: fixture.map,
      javascript: `${fixture.javascript}\n// changed`,
      execute() {
        executed = true;
      },
    }),
    (error) => {
      assert.ok(error instanceof OptimizerProfileAuthenticationError);
      assert.equal(error.reasonCode, "evidence.stale-artifact");
      assert.match(error.message, /stale optimizer profile map/);
      assert.throws(() => {
        error.reasonCode = "evidence.unmatched-sample";
      }, TypeError);
      return true;
    },
  );
  assert.equal(executed, false);
});

test("a second script with the claimed URL makes attribution fail closed", async () => {
  const fixture = hotColdFixture(10, `sagejs-profile:///duplicate-${Date.now()}.js`);
  await assert.rejects(
    runAuthenticatedNodeProfile({
      map: fixture.map,
      javascript: fixture.javascript,
      execute() {
        new Script("void 0;", { filename: fixture.url }).runInThisContext();
        return new Script(fixture.javascript, { filename: fixture.url }).runInThisContext();
      },
    }),
    (error) => {
      assert.ok(error instanceof OptimizerProfileAuthenticationError);
      assert.equal(error.reasonCode, "evidence.ambiguous-attribution");
      assert.match(error.message, /2 scripts used the claimed URL/);
      return true;
    },
  );
});

test("absence of an exact parsed artifact has the stable unmatched reason", async () => {
  const fixture = hotColdFixture(10, `sagejs-profile:///missing-${Date.now()}.js`);
  await assert.rejects(
    runAuthenticatedNodeProfile({
      map: fixture.map,
      javascript: fixture.javascript,
      execute() {
        return new Script("void 0;", { filename: "sagejs-profile:///other.js" })
          .runInThisContext();
      },
    }),
    (error) => {
      assert.ok(error instanceof OptimizerProfileAuthenticationError);
      assert.equal(error.reasonCode, "evidence.unmatched-sample");
      assert.match(error.message, /no script was parsed/);
      return true;
    },
  );
});

test("execution errors carry the authenticated immutable profile receipt", async () => {
  const url = `sagejs-profile:///throw-${process.pid}-${Date.now()}.js`;
  const javascript = [
    "observer('math.throw.v1', 'test.throw', 'selected-static-entry');",
    "throw new RangeError('intentional profile failure');",
  ].join("\n");
  const map = makeMap({ javascript, url, functions: [] });
  const events = createPrivateProfileEventCollector();
  await assert.rejects(
    runAuthenticatedNodeProfile({
      map,
      javascript,
      privateEvents: events,
      execute() {
        return compileFunction(javascript, ["observer"], { filename: url })(events.observer);
      },
    }),
    (error) => {
      assert.ok(error instanceof OptimizerProfileExecutionError);
      assert.equal(error.observation.execution.status, "threw");
      assert.equal(error.observation.execution.error.name, "RangeError");
      assert.equal(error.observation.privateEvents.count, 1);
      assert.ok(Object.isFrozen(error.observation));
      return true;
    },
  );
});

test("authenticated observations assemble through the frozen evidence validator", async () => {
  const fixture = hotColdFixture(
    10_000_000,
    `sagejs-profile:///validated-${process.pid}-${Date.now()}.js`,
  );
  const observation = await runAuthenticatedNodeProfile({
    map: fixture.map,
    javascript: fixture.javascript,
    samplingIntervalMicros: 100,
    execute() {
      return new Script(fixture.javascript, { filename: fixture.url }).runInThisContext();
    },
  });
  const receipt = assembleValidatedOptimizerProfileReceipt(
    profileEnvelope(fixture.map),
    observation,
  );
  assert.equal(receipt.schema, "sagejs.optimizer-profile-receipt/v1");
  assert.match(receipt.id, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(receipt.sampling.functionSampleCounts, observation.sampleAccounting);
  assert.ok(Object.isFrozen(receipt));
});

test("capabilities do not pretend browser source sampling is portable", () => {
  const capabilities = nodeProfileCapabilities();
  assert.equal(capabilities.node.supported, true);
  assert.equal(capabilities.node.sourceSampling, "exact-script-source-authenticated");
  assert.equal(capabilities.browser.supported, false);
  assert.equal(capabilities.browser.sourceSampling, "unavailable");
  assert.ok(Object.isFrozen(capabilities));
});

test("real evaluator preserves completion values and rejects raw JavaScript", async () => {
  const { createKernelEvaluatorAsync } = require("../dist/tools/kernel-evaluator.js");
  const evaluator = await createKernelEvaluatorAsync({ mode: "sage", onOutput() {} });
  try {
    const result = await evaluator.profile("2 + 3", {
      filename: "test/fixtures/optimizer-development/profile/completion.sage",
      language: "sage",
      samplingIntervalMicros: 500,
    });
    assert.equal(result.evaluation.repr, "5");
    assert.equal(
      result.observation.sampling.scope,
      "cold-generated-javascript-load-and-execution",
    );
    await assert.rejects(
      evaluator.profile("%js 2 + 3", {
        filename: "test/fixtures/optimizer-development/profile/raw-js.sage",
      }),
      /optimizer profiling rejects raw `%js` regions/,
    );
  } finally {
    evaluator.close();
  }
});
