"use strict";

// Host lifecycle for the authenticated row-21 prepared-input aggregate.
// Authentication, compilation, allocation, reset, projection, replay, and
// serialization are deliberately outside the one-call native clock.

const assert = require("node:assert/strict");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const source = require("./row21_phase6_prepared_aggregate_source.cjs");
const signature = require("./row21_phase6_connected_source.cjs").signature;
const unitHost = require("./row21_phase6_unit_host.cjs");

function save(owner) {
  if (owner.sizes && owner.limbs) {
    const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
    return () => { owner.sizes.set(sizes); owner.limbs.set(limbs); };
  }
  const values = owner.slice();
  return () => owner.set(values);
}
function view(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

async function prepareResident(inputPath) {
  source.materialize();
  // The nested factor-base host authenticates inputPath before any native
  // owner is allocated.  No answer-bearing fixture is accepted here.
  const unit = await unitHost.prepareResident(inputPath);
  const built = await compileKernel({ sourcePath: source.OUTPUT });
  const fn = require(built.modulePath)[source.EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const names = signature(source.OUTPUT, source.EXPORT);
  const aggregateState = fn.createInt64Buffer(6);
  const values = {};
  for (const { name } of names) {
    if (name === "aggregate_state") values[name] = aggregateState;
    else {
      assert(Object.hasOwn(unit.values, name), `missing row21 aggregate owner ${name}`);
      values[name] = unit.values[name];
    }
  }
  assert.deepEqual(names.map(({ name }) => name), Object.keys(values));
  return Object.freeze({
    ...unit,
    unit,
    built,
    fn,
    names,
    values,
    aggregateState,
    reset: Object.freeze([...unit.reset, save(aggregateState)]),
  });
}

function projection(resident) {
  const unit = unitHost.projection(resident);
  const aggregateState = Object.freeze(view(resident.aggregateState, 6));
  assert.deepEqual(aggregateState, ["0", "0", "8", "2", "1", "1"]);
  return Object.freeze({ ...unit, aggregateState });
}

function runInvocation(resident) {
  resident.reset.forEach(reset => reset());
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.names.map(
    ({ name }) => resident.values[name]));
  const stopped = process.hrtime.bigint();
  assert.equal(status, 0n);
  return Object.freeze({
    kernelNanoseconds: String(stopped - started),
    projection: projection(resident),
    boundary: Object.freeze({
      authenticatedPreparedInput: true,
      nativeCallsInsideClock: 1,
      filesystemInsideClock: false,
      subprocessesInsideClock: false,
      serializationInsideClock: false,
      allocationInsideClock: false,
      resetInsideClock: false,
      retainedAnswerOwnersAsInput: 0,
      retainedReplayOwnersAsInput: 0,
    }),
  });
}

module.exports = { prepareResident, projection, runInvocation };
