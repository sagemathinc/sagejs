#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const SOURCE = path.join(__dirname, "row6_phase6_resident_class_private.py");
const EXPORT = "pari_row6_phase6_resident_class_private";
const PREPARED = "/tmp/row6-prepared-projection.json";
const GATE = "/tmp/sagejs-row6-gate-c-eQS861/owner/" +
  "row6-prepared-gate-c-6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98.json.gz";
const FACTOR = "/tmp/sagejs-row6-factor-base-hy2P4R/owner/" +
  "row6-prepared-factor-base-1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef.json.gz";
const ANCESTRY = "/tmp/row6-ancestry.json";

const readGzip = filename => JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)));
const integer = (fn, length, capacity = 256, initial) => fn.createIntegerBuffer(
  length, capacity, initial === undefined ? undefined : initial.map(BigInt));
const int64 = (fn, length) => fn.createInt64Buffer(length);

async function main() {
  const prepared = JSON.parse(fs.readFileSync(PREPARED)).data;
  const gate = readGzip(GATE);
  const factor = readGzip(FACTOR);
  const ancestry = JSON.parse(fs.readFileSync(ANCESTRY));
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath)[EXPORT];
  assert.equal(fn.nativeAvailable, true);
  const descriptors = factor.selectedDescriptors;
  assert.equal(descriptors.length, 1130);
  const input = {
    manifest: { rows: 1130n, columns: 1137n, degree: 3n,
      kernel_columns: 7n, class_columns: 2n },
    terminal_h: integer(fn, 4, 16, gate.final.h),
    raw_relations: integer(fn, 1130 * 1137, 16, gate.final.relations),
    principal_generators: integer(fn, 3 * 1137, 256,
      gate.relationIdentity.generators),
    factor_ideals: integer(fn, 9 * 1130, 256, factor.factor.packetIdeals),
    factor_norms: integer(fn, 1130, 16, factor.factor.packetNorms),
    descriptor_generators: integer(fn, 3 * 1130, 16,
      descriptors.flatMap(row => row.generator)),
    descriptor_primes: integer(fn, 1130, 16, descriptors.map(row => row.p)),
    descriptor_e: integer(fn, 1130, 16, descriptors.map(row => row.e)),
    descriptor_f: integer(fn, 1130, 16, descriptors.map(row => row.f)),
    descriptor_inert: integer(fn, 1130, 16,
      descriptors.map(row => Number(row.inert))),
    multiplication_basis: integer(fn, 27, 256, prepared.basis_table),
    raw_to_unit_kernel: integer(fn, 7 * 1137, 256,
      ancestry.rawToUnitKernel),
    raw_to_presentation: integer(fn, 2 * 1137, 256,
      ancestry.rawToPresentation),
    active_rows: int64(fn, 2),
    factor_map: integer(fn, 2 * 1130, 16),
    class_state: int64(fn, 12),
  };
  const status = fn.gmp(...Object.values(input));
  const result = {
    compilerCacheKey: built.cacheKey,
    status: String(status),
    activeRows: Array.from(input.active_rows, Number),
    classState: Array.from(input.class_state, Number),
    factorMapNonzero: input.factor_map.toArray().flatMap(
      (value, index) => value === 0n ? [] : [[index, String(value)]]),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  assert.equal(result.status, "0");
  assert.deepEqual(result.activeRows, ancestry.state.activeFactorRows.map(Number));
  assert.deepEqual(result.factorMapNonzero, [[1092, "1"], [2224, "1"]]);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
