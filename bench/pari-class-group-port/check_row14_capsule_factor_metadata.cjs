#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const {
  authenticatePreparedBundle,
  normalizePreparedBundle,
} = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-14-aa0aa6152d8cf26c.json";
const W0_SHA256 = "13f7e37fe4ba3c610e2c4340c243fa9da398b8d32a272b3c450525c287afe18a";
const CAPSULE_SHA256 = "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1";
const ROWS = 799;
const DEGREE = 4;
const TARGET = 806;
const RECORD_RESERVE = 8110;
// Comparison-only W0 events[7].ideal export for jid 799. It is never emitted
// as host input; the native packet must match after column-to-row conversion.
const W0_JID799_IDEAL_COLUMN_MAJOR = [
  5953n, 0n, 0n, 0n, 1517n, 1n, 0n, 0n,
  1005n, 0n, 1n, 0n, 4996n, 0n, 0n, 1n,
];
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function capsule(directory) {
  if (process.env.SAGEJS_ROW14_CAPSULE) {
    const bytes = fs.readFileSync(process.env.SAGEJS_ROW14_CAPSULE);
    assert.equal(sha(bytes), CAPSULE_SHA256);
    return JSON.parse(zlib.gunzipSync(bytes));
  }
  const run = spawnSync(process.execPath, [
    path.join(__dirname, "row14_initial_capsule_coordinator.cjs"),
    "--pristine-w0", W0,
    "--pristine-sha256", W0_SHA256,
    "--output-dir", directory,
  ], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const receipt = JSON.parse(run.stdout);
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(receipt.sha256, CAPSULE_SHA256);
  assert.equal(sha(bytes), CAPSULE_SHA256);
  return JSON.parse(zlib.gunzipSync(bytes));
}

function integer(value, label) {
  assert(value && value.kind === "integer", `${label} is not an integer`);
  assert.match(value.value, /^-?(0|[1-9][0-9]*)$/, `${label} is not canonical`);
  return BigInt(value.value);
}

function values(value, kind, length, label) {
  assert(value && value.kind === kind && Array.isArray(value.values), `${label} has wrong kind`);
  if (length !== undefined) assert.equal(value.values.length, length, `${label} has wrong length`);
  return value.values;
}

function descriptors(value) {
  return value.map((descriptor, index) => {
    const entries = values(descriptor, "vector", 5, `descriptor ${index}`);
    const generator = values(entries[1], "column", DEGREE, `descriptor ${index} generator`)
      .map((entry, i) => integer(entry, `descriptor ${index} generator ${i}`));
    const columns = values(entries[4], "matrix", DEGREE, `descriptor ${index} tau`);
    const tau = columns.flatMap((column, j) =>
      values(column, "column", DEGREE, `descriptor ${index} tau column ${j}`)
        .map((entry, i) => integer(entry, `descriptor ${index} tau ${j},${i}`)));
    return {
      p: integer(entries[0], `descriptor ${index} p`), generator,
      e: integer(entries[2], `descriptor ${index} e`),
      f: integer(entries[3], `descriptor ${index} f`), tau,
    };
  });
}

function strings(value) {
  return Array.from(value, entry => String(entry));
}

function columnToRowMatrices(value, degree) {
  const square = degree * degree;
  assert.equal(value.length % square, 0);
  const out = Array(value.length);
  for (let matrix = 0; matrix < value.length / square; matrix += 1)
    for (let row = 0; row < degree; row += 1)
      for (let column = 0; column < degree; column += 1)
        out[matrix * square + row * degree + column] =
          value[matrix * square + column * degree + row];
  return out;
}

function expectedInitialRelations(primes, offsets, counts, complete, e) {
  const result = [];
  for (let group = 0; group < primes.length; group += 1) if (complete[group] !== 0n) {
    const entries = [];
    for (let j = 0; j < Number(counts[group]); j += 1) {
      const row = Number(offsets[group]) + j;
      entries.push([row, String(e[row])]);
    }
    result.push({ entries, sourceNz: entries[0][0] + 1,
      multiplier: String(primes[group]), origin: 0, automorphism: 0 });
  }
  return result;
}

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row14-factor-metadata-"));
  try {
    const value = capsule(temporary);
    assert.equal(value.schema, "sagejs.pari-class-group/row14-initial-capsule-v1");
    assert.deepEqual(value.exclusions, ["post-initial relation candidates",
      "post-initial relation snapshots", "HNF matrices and transforms",
      "class-group and class-number answers", "regulator and unit answers",
      "acceptance and terminal events"]);
    const prepared = normalizePreparedBundle(value);
    const preparedAuthority = authenticatePreparedBundle(value);
    assert.equal(Number(prepared.n), DEGREE);
    const descriptor = descriptors(value.factorBaseDescriptors);
    assert.equal(descriptor.length, ROWS);
    const rationalPrimes = values(value.sourceSchedule.factorBase.rationalPrimes,
      "small-vector", 487, "rational primes").map(BigInt);
    const permutation = values(value.sourceSchedule.factorBase.permutation,
      "small-vector", ROWS, "factor permutation").map(BigInt);
    const subfactor = values(value.sourceSchedule.factorBase.subfactor,
      "small-vector", 4, "subfactor").map(BigInt);
    assert.deepEqual(value.sourceSchedule.firstSearch.search,
      value.sourceSchedule.factorBase.permutation);
    assert.deepEqual(value.sourceSchedule.firstSearch.subfactor,
      value.sourceSchedule.factorBase.subfactor);

    const built = await compileKernel({
      sourcePath: path.join(__dirname, "row14_capsule_factor_metadata.py"),
    });
    const module = require(built.modulePath);
    const fn = module.pari_row14_capsule_factor_metadata;
    assert.equal(fn.nativeAvailable, true);
    const buffer = (length, initial = undefined, words = 4) =>
      fn.createIntegerBuffer(length, words, initial);
    const square = DEGREE * DEGREE;
    const table = prepared.basis_table.map(BigInt);
    const p = descriptor.map(item => item.p);
    const generator = descriptor.flatMap(item => item.generator);
    const e = descriptor.map(item => item.e);
    const f = descriptor.map(item => item.f);
    assert(f.every(value => value < BigInt(DEGREE)),
      "row-14 factor base unexpectedly contains an inert degree-four descriptor");
    assert(descriptor.every(item => item.generator.some(value => value !== 0n)),
      "row-14 factor base unexpectedly contains a zero generator");
    const inertFlags = Array(ROWS).fill(0n);
    const sourceTau = descriptor.flatMap(item => item.tau);
    const output = {
      offsets: buffer(rationalPrimes.length), counts: buffer(rationalPrimes.length),
      complete: buffer(rationalPrimes.length), relationPrimes: buffer(ROWS),
      relationE: buffer(ROWS), relationF: buffer(ROWS), tau: buffer(ROWS * square),
      packetIdeals: buffer(ROWS * square), packetNorms: buffer(ROWS),
      searchIdeals: buffer(ROWS),
    };
    const scratch = [buffer(DEGREE), buffer(square), buffer(square), buffer(DEGREE),
      buffer(square)];
    const result = fn.gmp(buffer(table.length, table), buffer(ROWS, p),
      buffer(generator.length, generator), buffer(ROWS, e), buffer(ROWS, f),
      buffer(sourceTau.length, sourceTau), buffer(rationalPrimes.length, rationalPrimes),
      buffer(ROWS, permutation), buffer(subfactor.length, subfactor), BigInt(DEGREE),
      output.offsets, output.counts, output.complete, output.relationPrimes,
      output.relationE, output.relationF, output.tau, output.packetIdeals,
      output.packetNorms, output.searchIdeals, ...scratch);
    assert.deepEqual(result, [BigInt(ROWS), 42n]);

    const offsets = output.offsets.toArray(), counts = output.counts.toArray();
    const complete = output.complete.toArray(), derivedE = output.relationE.toArray();
    assert.deepEqual(output.relationPrimes.toArray(), p);
    assert.deepEqual(derivedE, e);
    assert.deepEqual(output.relationF.toArray(), f);
    assert.deepEqual(output.tau.toArray(), columnToRowMatrices(sourceTau, DEGREE));
    assert.deepEqual(output.searchIdeals.toArray(), permutation);
    assert.deepEqual(output.packetIdeals.toArray().slice(-square),
      columnToRowMatrices(W0_JID799_IDEAL_COLUMN_MAJOR, DEGREE),
      "live jid 799 packet changed from the frozen source ideal");
    assert.deepEqual(expectedInitialRelations(rationalPrimes, offsets, counts, complete, derivedE),
      value.initialRelations, "fresh complete-group initialization changed");

    const volumeBuild = await compileKernel({ sourcePath: path.join(__dirname, "ball_volume.py") });
    const scale = require(volumeBuild.modulePath).pari_small_norm_scale.gmp(BigInt(DEGREE));
    let factorProduct = 1n;
    for (const prime of rationalPrimes) factorProduct *= prime;
    const metadata = {
      schema: "sagejs.pari-class-group/row14-connected-factor-metadata-v1",
      authority: { capsuleSha256: CAPSULE_SHA256,
        preparedAuthoritySha256: preparedAuthority.sha256,
        tauAuthority: "authenticated-initial-factor-descriptor-column-to-row" },
      policy: {
        degree: DEGREE, precision: Number(prepared.precision), rows: ROWS,
        target: TARGET, additional: TARGET - ROWS, recordReserve: RECORD_RESERVE,
        need: value.sourceSchedule.initialization.need,
        Nrelid: value.sourceSchedule.initialization.Nrelid, failLimit: 800,
        C1: value.sourceSchedule.factorBase.C1, C2: value.sourceSchedule.factorBase.C2,
        scale, hnfK0: subfactor.length,
      },
      prepared,
      factor: {
        rationalPrimes: strings(rationalPrimes), groupOffsets: strings(offsets),
        groupCounts: strings(counts), groupComplete: strings(complete),
        relationPrimes: strings(output.relationPrimes.toArray()),
        ramification: strings(derivedE), residueDegrees: strings(output.relationF.toArray()),
        generators: strings(generator), inertFlags: strings(inertFlags),
        groupTau: strings(output.tau.toArray()),
        packetIds: Array.from({ length: ROWS }, (_, i) => String(i + 1)),
        packetIdeals: strings(output.packetIdeals.toArray()),
        packetNorms: strings(output.packetNorms.toArray()),
        factorProduct: String(factorProduct), permutation: strings(permutation),
        subfactor: strings(subfactor), searchIdeals: strings(output.searchIdeals.toArray()),
      },
    };
    const metadataSha256 = sha(Buffer.from(JSON.stringify(metadata)));
    process.stdout.write(`${JSON.stringify({ metadata, metadataSha256,
      coreSha256: sha(fs.readFileSync(built.coreSourcePath)), initialRelations: 42,
      authenticatedTauMatrices: ROWS, livePacketIdeals: ROWS,
      packetConstructionDifferential:
        "construct_primes=0 packets equal construct_primes=1 pari_prime_ideal_hnf outputs",
      tauReconstructionExcluded: "exact ramified antiuniformizer selection is outside the capsule" })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
