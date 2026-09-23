"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const emitter = require("./row23_phase6_aggregate_emitter.cjs");
const resident = require("./row23_phase6_resident_kernel_host.cjs");
const hnfHost = require("./row23_first_hnf_host.cjs");

const CACHE_ROOT = "/scratch/sagejs-native-cache-row23-phase6-aggregate-root";

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    let value = BigInt(raw);
    if (value < 0n) value = -value;
    result = Math.max(result,
      Math.ceil(Math.max(1, value.toString(2).length) / 64));
  }
  return result;
}

function integer(fn, length, capacity, values) {
  return fn.createIntegerBuffer(length, Math.max(capacity, words(values)),
    values === undefined ? undefined : values.map(BigInt));
}

function embedding(prepared) {
  const result = [];
  for (let column = 0; column < 5; column += 1)
    for (let row = 0; row < 5; row += 1) {
      const index = 5 * row + column;
      result.push(prepared.admission_matrix_m[index],
        prepared.admission_matrix_p[index], prepared.admission_matrix_e[index]);
    }
  return result;
}

async function compileAggregate() {
  const sourcePath = emitter.writeAggregateSource();
  const built = await compileKernel({ sourcePath, cacheRoot: CACHE_ROOT });
  const fn = require(built.modulePath).pari_row23_phase6_aggregate_root;
  assert(fn?.nativeAvailable, "row-23 aggregate root native module unavailable");
  return { sourcePath, built, fn };
}

async function runAggregate(inputPath = resident.DEFAULT_INPUT,
  { precompiledModulePath = process.env.SAGEJS_ROW23_AGGREGATE_MODULE || "" } = {}) {
  const retained = await resident.prepareResident(inputPath);
  const prefix = await hnfHost.runFirstHnf(retained.prepared,
    retained.factorOwner, { prepareOnly: true });
  let built;
  let fn;
  if (precompiledModulePath) {
    fn = require(precompiledModulePath).pari_row23_phase6_aggregate_root;
    assert(fn?.nativeAvailable,
      "precompiled row-23 aggregate root native module unavailable");
    built = { cacheKey: path.basename(path.dirname(precompiledModulePath)),
      modulePath: precompiledModulePath };
  } else ({ built, fn } = await compileAggregate());
  const prepared = retained.prepared;
  const extras = {
    analytic_polynomial: integer(fn, 6, 16, prepared.prep_polynomial),
    analytic_primes: integer(fn, 1230, 1, prepared.analytic_primes),
    analytic_prime_count: 1230n,
    analytic_discriminant: BigInt(prepared.analytic_discriminant),
    analytic_roots_of_unity: BigInt(prepared.analytic_roots_of_unity),
    catalog_workspace: integer(fn, 12000, 32),
    pattern_offsets: integer(fn, 1230, 2),
    pattern_counts: integer(fn, 1230, 2),
    pattern_degrees: integer(fn, 6150, 2),
    pattern_multiplicities: integer(fn, 6150, 2),
    suffix_embedding_matrix: integer(fn, 75, 4096, embedding(prepared)),
    suffix_work_arena: integer(fn, 6144, 32),
    suffix_exact_arena: integer(fn, 2574, 4096),
    output_units: integer(fn, 20, 4096, Array(20).fill(991)),
    output_norms: integer(fn, 4, 4096),
    output_class_number: integer(fn, 1, 32),
    output_invariants: integer(fn, 1, 32),
    suffix_state: fn.createInt64Buffer(24),
    aggregate_state: fn.createInt64Buffer(4),
  };
  const args = prefix.names.map(([name]) => prefix.values[name]);
  args.push(...Object.values(extras));
  const started = process.hrtime.bigint();
  const status = Number(fn.gmp(...args));
  const elapsedNanoseconds = String(process.hrtime.bigint() - started);
  const array = owner => owner.toArray ? owner.toArray() : Array.from(owner);
  return { status, elapsedNanoseconds,
    aggregateState: array(extras.aggregate_state).map(Number),
    suffixState: array(extras.suffix_state).map(Number),
    relationState: array(prefix.values.relation_state).map(String),
    chainState: array(prefix.values.chain_state).map(Number),
    hnfState: array(prefix.values.hnf_state).map(Number),
    classNumber: array(extras.output_class_number).map(String),
    invariants: array(extras.output_invariants).map(String),
    units: array(extras.output_units).map(String),
    norms: array(extras.output_norms).map(String),
    built: { cacheKey: built.cacheKey, modulePath: built.modulePath },
    ownerBytes: prefix.ownerBytes,
  };
}

module.exports = { CACHE_ROOT, compileAggregate, runAggregate };

if (require.main === module) runAggregate().then(result =>
  process.stdout.write(`${JSON.stringify(result)}\n`)
).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
