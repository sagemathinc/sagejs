// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createLazySagejsCapabilityApi, loadSagejsCapabilityApi } =
  require("../dist/tools/capability-api.js");

test("capability catalogue loads once on query, not construction", () => {
  let calls = 0;
  const real = loadSagejsCapabilityApi();
  const lazy = createLazySagejsCapabilityApi(() => { calls++; return real; });
  assert.equal(calls, 0);
  assert.ok(Object.isFrozen(lazy));
  assert.deepEqual(Object.keys(lazy), Object.keys(real));
  assert.equal(calls, 0);
  assert.strictEqual(lazy.sagejs_capabilities(), real.sagejs_capabilities());
  assert.strictEqual(lazy.report, real.report);
  assert.ok(Object.isFrozen(lazy.report.capabilities));
  const family = real.report.capabilities[0].family;
  assert.deepEqual(lazy.sagejs_capabilities(family), real.sagejs_capabilities(family));
  for (const tag of Object.keys(real.report.workflow_aliases)) {
    assert.deepEqual(lazy.workflow(tag), real.workflow(tag));
  }
  assert.throws(() => lazy.workflow("not-a-workflow"), RangeError);
  assert.throws(() => lazy.sagejs_capabilities(42), RangeError);
  assert.deepEqual(lazy.sagejs_capabilities("not-a-family"),
    real.sagejs_capabilities("not-a-family"));
  assert.equal(calls, 1);
});

test("failed capability loads propagate and do not cache partial state", () => {
  let calls = 0;
  const error = new Error("invalid catalogue");
  const lazy = createLazySagejsCapabilityApi(() => { calls++; throw error; });
  for (const query of [() => lazy.report, () => lazy.workflow("x"),
    () => lazy.sagejs_capabilities()]) assert.throws(query, e => e === error);
  assert.equal(calls, 3);
});

test("ordinary CLI evaluation never queries the capability catalogue", () => {
  const { spawnSync } = require("node:child_process");
  const { join } = require("node:path");
  const child = spawnSync(process.execPath, ["-e", `
    const api = require('./dist/tools/capability-api.js');
    const create = api.createLazySagejsCapabilityApi;
    let installed = 0;
    api.createLazySagejsCapabilityApi = () => {
      installed++;
      return create(() => { throw Error('unexpected catalogue query'); });
    };
    process.on('exit', () => require('node:assert/strict').equal(installed, 1));
    process.argv = [process.argv[0], require('node:path').resolve('bin/sagejs')];
    require('./bin/sagejs');
  `], { cwd: join(__dirname, ".."), input: "print(2^100)\n",
    encoding: "utf8", timeout: 30_000,
    env: { ...process.env, SAGEJS_USE_SOURCE: "1" } });
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "1267650600228229401496703205376");
});
