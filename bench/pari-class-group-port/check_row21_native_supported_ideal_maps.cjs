#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const oracle = require("./row21_arbitrary_ideal_map_owner.cjs");
const output = require("./class_unit_output_evidence_v2.cjs");

const SOURCE = process.argv[2] || "/scratch/sagejs-row21-final-owner-v2/" +
  "row21-final-92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03.json.gz";
const GP = process.argv[3] ||
  "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4/Olinux-x86_64/gp-dyn";
const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const SOURCE_PY = path.join(HERE, "row21_native_supported_ideal_maps.py");

function words(values, minimum = 4) {
  let result = minimum;
  for (const raw of values) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result,
      Math.ceil(Math.max(1, absolute.toString(2).length) / 64) + 2);
  }
  return result;
}

function buffer(fn, values, minimum = 4) {
  return fn.createIntegerBuffer(values.length, words(values, minimum),
    values.map(BigInt));
}

function zero(fn, length, capacity = 16) {
  return fn.createIntegerBuffer(length, capacity);
}

function buildInput(payload) {
  const factor = payload.factorBase.value.factorBase;
  const descriptors = factor.descriptors.map(record => record.map(BigInt));
  const primes = descriptors.map(record => record[0]);
  const e = descriptors.map(record => record[1]);
  const f = descriptors.map(record => record[2]);
  const inert = descriptors.map(record =>
    record.slice(3, 8).every(value => value === 0n) ? 1n : 0n);
  const tau = descriptors.flatMap(record => {
    const columnMajor = record.slice(8, 33);
    return Array.from({ length: 25 }, (_, index) => {
      const row = Math.floor(index / 5), column = index % 5;
      return columnMajor[column * 5 + row];
    });
  });
  const groupPrimes = [], offsets = [], counts = [];
  for (let position = 0; position < 24;) {
    const prime = primes[position], start = position;
    while (position < 24 && primes[position] === prime) position += 1;
    groupPrimes.push(prime); offsets.push(BigInt(start));
    counts.push(BigInt(position - start));
  }
  return { primes, e, f, inert, tau, groupPrimes, offsets, counts };
}

function factorNative(fn, input, ideal) {
  const exponents = zero(fn, 24, 8), state = zero(fn, 5, 16);
  const status = Number(fn.gmp(
    buffer(fn, ideal, 16), buffer(fn, input.primes), buffer(fn, input.e),
    buffer(fn, input.f), buffer(fn, input.inert), buffer(fn, input.tau, 16),
    buffer(fn, input.groupPrimes), buffer(fn, input.offsets),
    buffer(fn, input.counts), exponents, zero(fn, 25, 32), zero(fn, 25, 16),
    zero(fn, 25, 32), zero(fn, 25, 32), zero(fn, 5, 16), zero(fn, 5, 16),
    state, 24n, BigInt(input.groupPrimes.length)));
  return { status, exponents: exponents.toArray().map(Number),
    state: state.toArray().map(String) };
}

const PYTHON = String.raw`
import gzip,hashlib,importlib,json,sys
sys.path[:0]=[sys.argv[1],sys.argv[2]]
m=importlib.import_module('bench.pari-class-group-port.row21_native_supported_ideal_maps')
a=importlib.import_module('bench.pari-class-group-port.row23_degree5_correspondence')
p=json.load(gzip.open(sys.argv[3],'rt'))['payload']
r=m.replay_native_supported_maps(p)
s=m._source(p)
columns=lambda x:[[x[5*row+column] for row in range(5)] for column in range(5)]
cs=a._ideal_product(list(map(int,p['field']['multiplicationTable'])),columns(s['ideals'][0]),columns(s['ideals'][-1]))
product=[cs[column][row] for row in range(5) for column in range(5)]
print(json.dumps({'receipt':r,'product':list(map(str,product))},separators=(',',':')))
`;

async function main() {
  const raw = zlib.gunzipSync(fs.readFileSync(SOURCE));
  assert.equal(oracle.SOURCE_SHA256,
    "92d7ecc79647fed4c330e2d1a97f50420623843bcd4320a7322a7422f168eb03");
  const payload = JSON.parse(raw).payload;
  const python = spawnSync("python3", ["-c", PYTHON, ROOT,
    path.join(ROOT, "src/lib"), SOURCE], { cwd: ROOT, encoding: "utf8",
    timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(python.status, 0, python.stderr || String(python.error));
  const dynamic = JSON.parse(python.stdout);
  assert.equal(dynamic.receipt.nativeFactorBoundary, true);
  assert.equal(dynamic.receipt.factorBasePrimeRoundTrips, 24);
  assert.equal(dynamic.receipt.outOfSupportRejections, 2);

  const built = await compileKernel({ sourcePath: SOURCE_PY });
  const fn = require(built.modulePath).pari_row21_factor_supported_hnf;
  assert.equal(fn.nativeAvailable, true);
  const input = buildInput(payload);
  for (let index = 0; index < 24; index += 1) {
    const factored = factorNative(fn, input,
      payload.factorBase.value.factorBase.ideals[index]);
    assert.equal(factored.status, 0, `prime ideal ${index}: ${factored.state}`);
    assert.deepEqual(factored.exponents,
      Array.from({ length: 24 }, (_, position) => Number(position === index)));
  }
  const product = factorNative(fn, input, dynamic.product);
  assert.equal(product.status, 0, product.state.join(","));
  assert.deepEqual(product.exponents,
    Array.from({ length: 24 }, (_, index) => Number(index === 0 || index === 23)));

  const outside = 59n;
  const unsupported = Array.from({ length: 25 }, (_, index) =>
    index % 6 === 0 ? outside.toString() : "0");
  assert.notEqual(factorNative(fn, input, unsupported).status, 0);

  // PARI is only a differential test oracle here.  The native function above
  // has no PARI dependency and receives only the authenticated retained state.
  const request = { schema: oracle.REQUEST_SCHEMA,
    ideals: [
      { numeratorHnf: payload.factorBase.value.factorBase.ideals[0].map(String),
        denominator: "1" },
      { numeratorHnf: dynamic.product, denominator: "1" },
    ], combinePairs: [[0, 0]] };
  const reference = oracle.run({ sourcePath: SOURCE, request, gp: GP });
  assert.equal(reference.evidence.length, 3);
  assert.deepEqual(reference.evidence[0].normalizedNumeratorHnf,
    request.ideals[0].numeratorHnf);
  assert.deepEqual(reference.evidence[1].normalizedNumeratorHnf,
    request.ideals[1].numeratorHnf);
  assert(reference.evidence.every(entry => entry.classCoordinates.length === 0));

  const body = { ...dynamic.receipt };
  delete body.contentSha256;
  assert.equal(dynamic.receipt.contentSha256, output.sha256Canonical(body));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row21-native-supported-ideal-maps-check-v1",
    sourceSha256: oracle.SOURCE_SHA256,
    receiptSha256: output.sha256Canonical(dynamic.receipt),
    nativeAvailable: true,
    nativePrimeIdealRoundTrips: 24,
    nativeArbitraryProductRoundTrips: 1,
    outOfSupportRejected: true,
    externalPariUsedOnlyAsDifferentialOracle: true,
    claimedNativePathUsesExternalPari: false,
    maps: dynamic.receipt.maps,
    qualifiedTiming: false,
  })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
