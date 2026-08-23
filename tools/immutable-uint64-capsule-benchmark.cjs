"use strict";

const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const runtime = require("../dist/tools/immutable-uint64-capsule.js");

const uniqueCount = 64;
const itemCount = 1000;
const itemWords = 8;
const warmups = 5;
const samples = 21;
const repetitions = 25;
const sourceModel = "benchmark-source-model/v1";
const sourceFormat = "benchmark-source-row/v1";
const destinationModel = "benchmark-destination-model/v1";
const destinationFormat = "benchmark-destination-batch/v1";

const unique = Array.from({ length: uniqueCount }, (_, row) => {
  const owner = Object.freeze({ row });
  const values = BigUint64Array.from(
    { length: itemWords },
    (_, column) => BigInt(row * 100 + column),
  );
  const capsule = runtime.createImmutableUInt64Capsule(
    values,
    owner,
    sourceModel,
    sourceFormat,
    1,
  );
  return { owner, capsule };
});
const rows = Array.from(
  { length: itemCount },
  (_, index) => unique[index % uniqueCount],
);
const sourceOwners = Object.freeze(rows.map((row) => row.owner));
const preassembled = new BigUint64Array(itemCount * itemWords);
for (let index = 0; index < itemCount; index += 1) {
  const source = unique[index % uniqueCount];
  const values = runtime.copyImmutableUInt64Capsule(
    source.capsule,
    source.owner,
    sourceModel,
    sourceFormat,
    1,
  );
  preassembled.set(values, index * itemWords);
}

function directPublication() {
  const owner = Object.freeze({});
  const capsule = runtime.createImmutableUInt64Capsule(
    preassembled,
    owner,
    destinationModel,
    destinationFormat,
    itemCount,
  );
  return { owner, capsule };
}

function authenticatedGather() {
  const owner = Object.freeze({});
  const capsule = runtime.gatherImmutableUInt64Capsules(
    owner,
    sourceOwners,
    sourceModel,
    sourceFormat,
    1,
    itemWords,
    destinationModel,
    destinationFormat,
    itemCount,
  );
  return { owner, capsule };
}

function explicitCopyPublication() {
  const values = new BigUint64Array(itemCount * itemWords);
  for (let index = 0; index < itemCount; index += 1) {
    const source = rows[index];
    values.set(
      runtime.copyImmutableUInt64Capsule(
        source.capsule,
        source.owner,
        sourceModel,
        sourceFormat,
        1,
      ),
      index * itemWords,
    );
  }
  const owner = Object.freeze({});
  const capsule = runtime.createImmutableUInt64Capsule(
    values,
    owner,
    destinationModel,
    destinationFormat,
    itemCount,
  );
  return { owner, capsule };
}

let retained;
function medianMilliseconds(operation) {
  for (let warmup = 0; warmup < warmups; warmup += 1) {
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      retained = operation();
    }
  }
  const timings = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const started = performance.now();
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      retained = operation();
    }
    timings.push((performance.now() - started) / repetitions);
  }
  timings.sort((left, right) => left - right);
  return timings[Math.floor(timings.length / 2)];
}

const directMs = medianMilliseconds(directPublication);
const gatherMs = medianMilliseconds(authenticatedGather);
const explicitMs = medianMilliseconds(explicitCopyPublication);
const gathered = authenticatedGather();
const copied = runtime.copyImmutableUInt64Capsule(
  gathered.capsule,
  gathered.owner,
  destinationModel,
  destinationFormat,
  itemCount,
);
assert.equal(copied.length, itemCount * itemWords);
assert.equal(copied[0], 0n);
assert.equal(copied[8], 100n);
assert.equal(copied[(itemCount - 1) * itemWords + 7], 3907n);

const gatherToDirect = gatherMs / directMs;
process.stdout.write(`${JSON.stringify({
  schema: "sagejs.immutable-uint64-capsule-gather-benchmark/v1",
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  workload: {
    item_count: itemCount,
    unique_source_count: uniqueCount,
    item_words: itemWords,
    warmups,
    samples,
    repetitions_per_sample: repetitions,
  },
  medians_ms: {
    direct_batch_publication: directMs,
    authenticated_gather: gatherMs,
    explicit_copy_publication: explicitMs,
  },
  ratios: {
    gather_to_direct_publication: gatherToDirect,
    explicit_copy_to_gather: explicitMs / gatherMs,
  },
  approaches_single_publication: gatherToDirect <= 3,
}, null, 2)}\n`);
