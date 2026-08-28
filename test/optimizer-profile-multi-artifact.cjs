// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Script } = require("node:vm");

const { hotColdFixture } = require(
  "./fixtures/optimizer-development/profile/helpers.cjs",
);
const {
  OptimizerProfileAuthenticationError,
  runAuthenticatedNodeProfile,
} = require("../dist/tools/optimizer-profiler.js");

function conserved(accounting) {
  return accounting.total ===
    accounting.attributed + accounting.ambiguous + accounting.unmatched;
}

test("multiple declared artifacts authenticate and attribute by exact scriptId", async () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const root = hotColdFixture(20_000_000, `sagejs-profile:///root-${suffix}.js`);
  const lazy = hotColdFixture(20_000_000, `sagejs-profile:///lazy/module-${suffix}.js`);
  let registry;
  const observation = await runAuthenticatedNodeProfile({
    map: root.map,
    javascript: root.javascript,
    samplingIntervalMicros: 100,
    execute(artifacts) {
      registry = artifacts;
      artifacts.declare(lazy.map, lazy.javascript);
      new Script(root.javascript, { filename: root.url }).runInThisContext();
      new Script(lazy.javascript, { filename: lazy.url }).runInThisContext();
      new Script("for (let i = 0; i < 100000; i += 1) Math.imul(i, i);", {
        filename: `sagejs-runtime:///unmapped-${suffix}.js`,
      }).runInThisContext();
    },
  });

  assert.equal(observation.artifacts.length, 2);
  assert.deepEqual(
    observation.artifacts.map((artifact) => artifact.url),
    [root.url, lazy.url],
  );
  assert.deepEqual(
    observation.evidence.sampling.scripts.map((artifact) => artifact.url),
    [lazy.url, root.url].sort(),
  );
  assert.equal(observation.evidence.sampling.mapBindings.length, 2);
  assert.ok(conserved(observation.sampleAccounting));
  assert.ok(conserved(observation.positionTickAccounting));
  const sourceIds = new Set(observation.attribution.map((item) =>
    item.identity.sourceUnitId ?? item.identity.id));
  assert.ok(sourceIds.has(root.map.source.identity.id));
  assert.ok(sourceIds.has(lazy.map.source.identity.id));
  assert.throws(
    () => registry.declare(lazy.map, lazy.javascript),
    (error) => error instanceof OptimizerProfileAuthenticationError &&
      error.reasonCode === "evidence.stale-artifact",
  );
});

test("a declared artifact that V8 never parses fails closed", async () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const root = hotColdFixture(10, `sagejs-profile:///root-missing-${suffix}.js`);
  const missing = hotColdFixture(10, `sagejs-profile:///lazy/missing-${suffix}.js`);
  await assert.rejects(
    runAuthenticatedNodeProfile({
      map: root.map,
      javascript: root.javascript,
      execute(artifacts) {
        artifacts.declare(missing.map, missing.javascript);
        new Script(root.javascript, { filename: root.url }).runInThisContext();
      },
    }),
    (error) => error instanceof OptimizerProfileAuthenticationError &&
      error.reasonCode === "evidence.unmatched-sample" &&
      /no script was parsed/.test(error.message),
  );
});

test("conflicting dynamic declarations fail before a second script is parsed", async () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const root = hotColdFixture(10, `sagejs-profile:///root-conflict-${suffix}.js`);
  let conflict;
  const observation = await runAuthenticatedNodeProfile({
    map: root.map,
    javascript: root.javascript,
    execute(artifacts) {
      new Script(root.javascript, { filename: root.url }).runInThisContext();
      try {
        artifacts.declare(root.map, root.javascript);
      } catch (error) {
        conflict = error;
      }
    },
  });
  assert.equal(observation.artifacts.length, 1);
  assert.ok(conflict instanceof OptimizerProfileAuthenticationError);
  assert.equal(conflict.reasonCode, "evidence.ambiguous-attribution");
});
