#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "prepared_index_prime.py");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json";
const W0_SHA256 = "45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");

function descriptorOracle(event, prime) {
  return event.LP.values.filter(value => value.values[0].value === String(prime))
    .map(value => ({ e: Number(value.values[2].value), f: Number(value.values[3].value) }));
}

async function main() {
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  auth.authenticatePreparedNf(prepared);
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const built = await compileKernel({ sourcePath: SOURCE });
  const fn = require(built.modulePath).pari_prepared_index_prime_descriptors;
  assert.equal(fn.nativeAvailable, true);
  const buffer = (length, words = 16, values) =>
    fn.createIntegerBuffer(length, words, values?.map(BigInt));
  const table = buffer(125, 16, prepared.basis_table);
  const matrixM = buffer(25, 16, prepared.admission_matrix_m);
  const matrixP = buffer(25, 4, prepared.admission_matrix_p);
  const matrixE = buffer(25, 16, prepared.admission_matrix_e);
  const outputs = [];
  for (const prime of [2, 3, 47]) {
    const descriptors = buffer(5 * 33, 16), ranks = buffer(5, 4), state = buffer(4, 4);
    const count = Number(fn.gmp(table, 5n, BigInt(prime), 3n, matrixM, matrixP,
      matrixE, buffer(12000, 32), descriptors, ranks, state));
    const packed = descriptors.toArray().slice(0, count * 33).map(String);
    const es = [], fs = [];
    for (let i = 0; i < count; i += 1) {
      es.push(Number(packed[i * 33 + 1])); fs.push(Number(packed[i * 33 + 2]));
    }
    outputs.push({ prime, count, state: state.toArray().map(Number), es, fs,
      ranks: ranks.toArray().slice(0, count).map(Number), packed });
  }
  assert.deepEqual(outputs.map(x => [x.prime, x.count, x.fs]), [
    [2, 3, [1, 2, 2]], [3, 2, [1, 1]], [47, 3, [1, 2, 2]],
  ]);
  assert.deepEqual(outputs.map(x => x.es), [[1, 1, 1], [2, 3], [1, 1, 1]]);
  assert(outputs.every(x => x.state[0] === 0 && x.state[2] === x.count && x.state[3] === 33));

  // The frozen factor base retains every p=2 and p=3 descriptor, but only the
  // norm-47 member at p=47.  Compare the source ramification/residue metadata;
  // uniformizer representatives need not be byte-identical.
  const oracle = raw.events.find(event => event.event === "factor_base");
  assert.deepEqual(descriptorOracle(oracle, 2).map(x => x.f), [1, 2, 2]);
  assert.deepEqual(descriptorOracle(oracle, 3).map(x => x.f), [1, 1]);
  assert.deepEqual(descriptorOracle(oracle, 47), [{ e: 1, f: 1 }]);

  const before = table.toArray();
  assert.throws(() => fn.gmp(table, 6n, 2n, 3n, matrixM, matrixP, matrixE,
    buffer(12000, 32), buffer(5 * 33), buffer(5), buffer(4)),
  /prepared index-prime domain/);
  assert.deepEqual(table.toArray(), before);
  const normBuilt = await compileKernel({
    sourcePath: path.join(__dirname, "prime_embedding_norm.py"),
  });
  const norm = require(normBuilt.modulePath).pari_prepared_prime_embedding_norm;
  const exactM = Array.from({ length: 25 }, (_, index) => index % 5 === 0 ? 3n : 0n);
  const exactP = Array(25).fill(-1n);
  const exactE = Array(25).fill(0n);
  const normResult = norm.gmp(
    norm.createIntegerBuffer(25, 4, exactM),
    norm.createIntegerBuffer(25, 4, exactP),
    norm.createIntegerBuffer(25, 4, exactE),
    norm.createIntegerBuffer(5, 4, [2n, 2n, 2n, 2n, 2n]),
    norm.createIntegerBuffer(5, 4),
    norm.createIntegerBuffer(5, 4),
    norm.createIntegerBuffer(5, 4),
    5n,
    3n,
  );
  assert.deepEqual(normResult, [7776n, -(1n << 61n)]);

  const uniformizerBuilt = await compileKernel({
    sourcePath: path.join(__dirname, "prime_uniformizer.py"),
  });
  const uniformizer = require(
    uniformizerBuilt.modulePath
  ).pari_prepared_prime_uniformizer;
  const empty = () => uniformizer.createIntegerBuffer(0, 4);
  assert.throws(
    () => uniformizer.gmp(
      empty(), empty(), empty(), 5n, 1n, 0n, 2n, 1n, 3n,
      empty(), empty(), empty(), empty(), empty(), empty(), empty(), empty(),
      empty(), empty(), empty(), empty(), empty(),
    ),
    /prime uniformizer dimension frontier/,
  );
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/prepared-index-prime-check-v1",
    primes: outputs.map(x => ({ prime: x.prime, count: x.count, e: x.es, f: x.fs,
      state: x.state, packedSha256: sha(Buffer.from(JSON.stringify(x.packed))) })),
    totalDescriptors: outputs.reduce((sum, x) => sum + x.count, 0),
    preparedSha256: auth.authenticatePreparedNf(prepared).sha256,
    sourceSha256: sha(fs.readFileSync(SOURCE)),
    coreSha256: sha(fs.readFileSync(built.coreSourcePath)),
    malformedRejected: 2,
    exactDegreeFiveNorm: normResult.map(String),
    residueDegreeFourUniformizerRejected: true,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
