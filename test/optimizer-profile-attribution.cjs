// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Script } = require("node:vm");

const { hotColdFixture, makeMap } = require(
  "./fixtures/optimizer-development/profile/helpers.cjs"
);
const {
  runAuthenticatedNodeProfile,
} = require("../dist/tools/optimizer-profiler.js");

function executeFixture(fixture) {
  return new Script(fixture.javascript, { filename: fixture.url }).runInThisContext();
}

function conserved(accounting) {
  return accounting.total ===
    accounting.attributed + accounting.ambiguous + accounting.unmatched;
}

test("authenticated Inspector samples and line ticks remain separate and conserved", async () => {
  const fixture = hotColdFixture(
    35_000_000,
    `sagejs-profile:///hot-cold-${process.pid}-${Date.now()}.js`,
  );
  const observation = await runAuthenticatedNodeProfile({
    map: fixture.map,
    javascript: fixture.javascript,
    samplingIntervalMicros: 100,
    execute: () => executeFixture(fixture),
  });

  assert.equal(observation.schema, "sagejs.optimizer-node-profile-observation/v1");
  assert.equal(observation.authority, "node-inspector-exact-script-source");
  assert.equal(observation.artifact.sha256, fixture.map.generated.sha256);
  assert.equal(observation.artifact.bytes, Buffer.byteLength(fixture.javascript));
  assert.match(observation.raw.sha256, /^[a-f0-9]{64}$/);
  assert.equal(observation.raw.sampleCount, observation.sampleAccounting.total);
  assert.equal(observation.raw.positionTickCount, observation.positionTickAccounting.total);
  assert.ok(conserved(observation.sampleAccounting));
  assert.ok(conserved(observation.positionTickAccounting));
  assert.ok(observation.sampleAccounting.attributed > 0, "function-start samples should map");
  assert.ok(observation.positionTickAccounting.attributed > 0, "hot source lines should map");
  assert.deepEqual(
    observation.evidence.sampling.functionSampleCounts,
    observation.sampleAccounting,
  );
  assert.deepEqual(
    observation.evidence.sampling.positionTickCounts,
    observation.positionTickAccounting,
  );

  const hotFunction = observation.attribution.find(
    (item) => item.category === "function" && item.identity.qualifiedName === "hot",
  );
  const hotLoop = observation.attribution.find(
    (item) => item.category === "loop" && item.optimizerRegionId === "test.hot-loop.v1",
  );
  assert.ok(hotFunction?.selfSamples > 0);
  assert.ok(hotLoop?.positionTicks > 0);
  // A call-frame location identifies the function declaration, never a
  // currently executing loop. Loop evidence comes only from positionTicks.
  assert.equal(hotLoop.selfSamples, 0);
});

test("an ambiguous disjoint projection is reported, never guessed by span order", async () => {
  const url = `sagejs-profile:///ambiguous-${process.pid}-${Date.now()}.js`;
  const base = hotColdFixture(25_000_000, url);
  const hot = base.map.spans.find(
    (span) => span.category === "function" && span.identity.qualifiedName === "hot",
  );
  const cold = base.map.spans.find(
    (span) => span.category === "function" && span.identity.qualifiedName === "cold",
  );
  const loop = base.map.spans.find((span) => span.category === "loop");
  assert.ok(hot && cold && loop);
  const map = makeMap({
    javascript: base.javascript,
    url,
    functions: [
      { name: "hot", start: hot.generated.start.offset, end: hot.generated.end.offset },
      { name: "cold", start: cold.generated.start.offset, end: cold.generated.end.offset },
    ],
    loops: [{
      name: "hot-loop",
      functionName: "hot",
      start: loop.generated.start.offset,
      end: loop.generated.end.offset,
    }],
    duplicateLoop: true,
  });
  const observation = await runAuthenticatedNodeProfile({
    map,
    javascript: base.javascript,
    samplingIntervalMicros: 100,
    execute: () => new Script(base.javascript, { filename: url }).runInThisContext(),
  });
  assert.ok(conserved(observation.positionTickAccounting));
  assert.ok(
    observation.positionTickAccounting.ambiguous > 0,
    "equal-width source candidates must remain visibly ambiguous",
  );
});
