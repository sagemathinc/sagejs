#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { cpus, loadavg, release, tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { canonicalBasis } = require("../tools/number-field-maximal-order/exact.cjs");

if (process.platform === "win32") {
  throw new Error("the kernel lifecycle test covers Windows; this cross-oracle benchmark is Unix-only");
}

const root = resolve(__dirname, "..");
const prefix = resolve(process.env.SAGEJS_FLINT_PREFIX ||
  join(root, "packages", "flint", ".native", "prefix"));
const corpusPath = join(root, "test", "fixtures", "number-field-maximal-order-corpus.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const caseIds = [
  "motivating-degree-7",
  "sage-essential-discriminant",
  "lmfdb-3.1.431.1",
  "lmfdb-5.1.17161.1",
  "pari-2510",
  "pari-1710",
];
const caseById = new Map(corpus.cases.map((item) => [item.id, item]));
const cases = caseIds.map((id) => {
  const item = caseById.get(id);
  assert(item, `missing certified corpus case ${id}`);
  assert.equal(item.basis.state, "available", `${id} has no exact basis fixture`);
  return item;
});
const nativeRounds = [5000, 2000, 2000, 1000, 100, 50];
const pariRounds = [10000, 10000, 10000, 5000, 500, 250];
const heckeRounds = [20, 20, 20, 20, 10, 10];
const sampleCount = Number(process.env.SAGEJS_NF_ORDER_SAMPLES || 9);
const warmups = Number(process.env.SAGEJS_NF_ORDER_WARMUPS || 4);
assert(Number.isSafeInteger(sampleCount) && sampleCount >= 3);
assert(Number.isSafeInteger(warmups) && warmups >= 0);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: options.timeout || 300_000,
    env: {
      ...process.env,
      OPENBLAS_NUM_THREADS: "1",
      OMP_NUM_THREADS: "1",
      JULIA_NUM_THREADS: "1",
      ...options.env,
    },
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function readU64(buffer, offset) {
  return Number(buffer.readBigUInt64LE(offset));
}

function readInteger(buffer, state) {
  const header = buffer.readUInt32LE(state.offset);
  state.offset += 4;
  const negative = (header & 0x80000000) !== 0;
  const length = header & 0x7fffffff;
  assert(length <= buffer.length - state.offset, "truncated compact order integer");
  let value = 0n;
  for (let index = 0; index < length; index++) {
    value |= BigInt(buffer[state.offset + index]) << BigInt(8 * index);
  }
  state.offset += length;
  return negative ? -value : value;
}

function decodeOrder(hex) {
  const buffer = Buffer.from(hex, "hex");
  assert.equal(buffer.subarray(0, 8).toString("hex"), "534a4e464f010000");
  const degree = readU64(buffer, 8);
  const count = readU64(buffer, 56);
  assert.equal(count, 5 + degree * degree);
  const state = { offset: 64 };
  const values = Array.from({ length: count }, () => readInteger(buffer, state));
  assert.equal(state.offset, buffer.length);
  return {
    degree,
    status: readU64(buffer, 16),
    supplied: readU64(buffer, 24),
    resolved: readU64(buffer, 32),
    native: readU64(buffer, 40),
    unramified: readU64(buffer, 48),
    denominator: values[0],
    index: values[1],
    equationDiscriminant: values[2],
    orderDiscriminant: values[3],
    fallbackPrime: values[4],
    numerator: Array.from({ length: degree }, (_, row) =>
      values.slice(5 + row * degree, 5 + (row + 1) * degree)),
    bytes: buffer.length,
  };
}

function verifyNative(item, report) {
  const decoded = decodeOrder(report.payloadHex);
  assert.equal(decoded.degree, item.polynomial.degree);
  assert.equal(decoded.status, 0);
  assert.equal(decoded.supplied, item.localIndexFactors.length);
  assert.equal(decoded.resolved, item.localIndexFactors.length);
  assert.equal(decoded.index, BigInt(item.equationOrderIndex));
  assert.equal(decoded.equationDiscriminant, BigInt(item.equationDiscriminant));
  assert.equal(decoded.orderDiscriminant, BigInt(item.fieldDiscriminant));
  assert.equal(decoded.fallbackPrime, 0n);
  const canonical = canonicalBasis(decoded.numerator.map((row) =>
    row.map((entry) => `${entry}/${decoded.denominator}`)));
  assert.equal(
    canonical.digest,
    item.basis.digest,
    `${item.id} native lattice differs from the certified cross-family fixture`,
  );
  return decoded;
}

function compileWitness(temporary) {
  const executable = join(temporary, "number-field-order-resource-witness");
  const libraries = [
    "libflint.a",
    "libopenblas.a",
    "libmpc.a",
    "libmpfr.a",
    "libgmp.a",
  ].map((name) => join(prefix, "lib", name));
  run(process.env.CC || "cc", [
    "-std=c11",
    "-O3",
    "-Wall",
    "-Wextra",
    "-Werror",
    `-I${join(root, "packages", "flint", "include")}`,
    `-I${join(prefix, "include")}`,
    join(root, "bench", "number-field-order-resource-witness.c"),
    ...libraries,
    "-lm",
    "-lpthread",
    "-o",
    executable,
  ], { timeout: 120_000 });
  return executable;
}

function benchmarkNative(executable) {
  return cases.map((item, caseIndex) => {
    const samplesUs = [];
    let last;
    for (let sample = 0; sample < sampleCount; sample++) {
      last = JSON.parse(run(executable, [
        String(caseIndex),
        String(warmups),
        String(nativeRounds[caseIndex]),
      ]));
      samplesUs.push(last.meanUs);
    }
    const decoded = verifyNative(item, last);
    const profile = JSON.parse(run(executable, [
      "--profile",
      String(caseIndex),
      String(nativeRounds[caseIndex]),
    ]));
    return {
      id: item.id,
      boundary: "sealed fmpz polynomial + fmpz prime hints -> compact canonical HNF resource",
      warmups,
      roundsPerSample: nativeRounds[caseIndex],
      samplesUs,
      medianUs: median(samplesUs),
      payloadBytes: decoded.bytes,
      exact: true,
      stageMeanUs: profile.stageMeanUs,
    };
  });
}

function gpPolynomial(item) {
  return `Polrev([${item.polynomial.coefficients.join(",")}])`;
}

function benchmarkPari(temporary) {
  return cases.map((item, caseIndex) => {
    const script = join(temporary, `pari-${caseIndex}.gp`);
    const samplePrint = Array.from(
      { length: sampleCount },
      (_, index) => `if(${index + 1}>1,print1(","));print1(samples[${index + 1}]);`,
    ).join("\n");
    writeFileSync(script, [
      `T=${gpPolynomial(item)};`,
      `for(i=1,${warmups},nfbasis(T));`,
      `samples=vector(${sampleCount});`,
      `for(s=1,${sampleCount},started=getwalltime();for(i=1,${pariRounds[caseIndex]},nfbasis(T));samples[s]=(getwalltime()-started)*1000.0/${pariRounds[caseIndex]});`,
      `D=nfdisc(T);`,
      `print1("{\\\"id\\\":\\\"${item.id}\\\",\\\"samplesUs\\\":[");`,
      samplePrint,
      `print1("],\\\"fieldDiscriminant\\\":\\\"");print1(D);print("\\\"}");`,
    ].join("\n"));
    const raw = run("gp", ["-fq", script]);
    const result = JSON.parse(raw.split("\n").at(-1));
    assert.equal(BigInt(result.fieldDiscriminant), BigInt(item.fieldDiscriminant));
    return {
      id: item.id,
      boundary: "PARI nfbasis(T) on an already constructed polynomial",
      warmups,
      roundsPerSample: pariRounds[caseIndex],
      samplesUs: result.samplesUs,
      medianUs: median(result.samplesUs),
      exact: true,
    };
  });
}

function juliaPolynomial(item) {
  return item.polynomial.coefficients
    .map((coefficient, exponent) => `ZZ(${JSON.stringify(coefficient)})*x^${exponent}`)
    .join("+");
}

function benchmarkHecke(temporary) {
  const script = join(temporary, "hecke.jl");
  const invocations = cases.map((item, index) =>
    `run_case(${JSON.stringify(item.id)}, ${juliaPolynomial(item)}, ${heckeRounds[index]})`,
  ).join("\n");
  writeFileSync(script, `
using Hecke
Zx, x = polynomial_ring(ZZ, "x")

function run_case(id, polynomial, rounds)
  for warmup in 1:${warmups}
    K, _ = number_field(polynomial, "a", cached = false)
    maximal_order(K)
  end
  samples = Float64[]
  for sample in 1:${sampleCount}
    fields = [number_field(polynomial, "a", cached = false)[1] for _ in 1:rounds]
    started = time_ns()
    for K in fields
      maximal_order(K)
    end
    push!(samples, Float64(time_ns() - started) / 1000.0 / rounds)
    fields = nothing
    GC.gc()
  end
  K, _ = number_field(polynomial, "a", cached = false)
  O = maximal_order(K)
  println(id, "|", join(samples, ","), "|", discriminant(O), "|", index(O))
end

${invocations}
`);
  const output = run("julia", [
    "--startup-file=no",
    "--project=/home/user/upstream/Hecke.jl",
    script,
  ], { timeout: 600_000 });
  const byId = new Map();
  for (const line of output.split("\n")) {
    const [id, samplesText, discriminant, index] = line.trim().split("|");
    if (!caseIds.includes(id)) continue;
    const item = caseById.get(id);
    assert.equal(BigInt(discriminant), BigInt(item.fieldDiscriminant));
    assert.equal(BigInt(index), BigInt(item.equationOrderIndex));
    const samplesUs = samplesText.split(",").map(Number);
    assert.equal(samplesUs.length, sampleCount);
    byId.set(id, {
      id,
      boundary: "Hecke maximal_order(K) on fresh preconstructed fields",
      warmups,
      roundsPerSample: heckeRounds[caseIds.indexOf(id)],
      samplesUs,
      medianUs: median(samplesUs),
      exact: true,
    });
  }
  assert.equal(byId.size, cases.length, `incomplete Hecke report:\n${output}`);
  return caseIds.map((id) => byId.get(id));
}

function commandOutput(command, args) {
  try {
    return run(command, args, { timeout: 30_000 });
  } catch (error) {
    return `unavailable: ${error.message}`;
  }
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-order-resource-bench-"));
try {
  const executable = compileWitness(temporary);
  const native = benchmarkNative(executable);
  const pari = benchmarkPari(temporary);
  const hecke = benchmarkHecke(temporary);
  const comparisons = caseIds.map((id, index) => {
    const bestReferenceUs = Math.min(pari[index].medianUs, hecke[index].medianUs);
    return {
      id,
      nativeUs: native[index].medianUs,
      pariNfbasisUs: pari[index].medianUs,
      heckeCoreUs: hecke[index].medianUs,
      bestReferenceUs,
      nativeToBestReference: native[index].medianUs / bestReferenceUs,
    };
  });
  const flintArchive = readFileSync(join(prefix, "lib", "libflint.a"));
  const report = {
    schema: "sagejs.number-field-order-resource-cross-oracle-benchmark/v1",
    commit: run("git", ["rev-parse", "HEAD"]),
    corpus: {
      path: "test/fixtures/number-field-maximal-order-corpus.json",
      schemaVersion: corpus.schemaVersion,
      manifestDigest: corpus.manifestDigest,
      caseDigests: Object.fromEntries(cases.map((item) => [item.id, item.polynomial.digest])),
    },
    environment: {
      platform: `${process.platform}-${process.arch}`,
      osRelease: release(),
      cpu: cpus()[0]?.model || "unknown",
      loadAverageAtReport: loadavg(),
      node: process.version,
      compiler: commandOutput(process.env.CC || "cc", ["--version"]).split("\n")[0],
      flint: "3.6.0",
      pari: commandOutput("gp", ["--version-short"]),
      julia: commandOutput("julia", ["--version"]),
      hecke: "0.39.21 @ eab7e5566e56d8864fe9cd7b895811ab9df2fe32",
      nemo: "0.56.1 @ 1dcc3625f1899332c52660f6eb074352aa3e7f40",
      openblasThreads: 1,
      flintArchiveSha256: createHash("sha256").update(flintArchive).digest("hex"),
    },
    policy: {
      sampleCount,
      warmups,
      retainedAcrossSamples: false,
      implementationFamilies: {
        native: "Sage.js direct FLINT-storage Round-2 resource",
        pari: "PARI nfbasis",
        hecke: "Hecke independent BSD-licensed maximal-order core",
      },
      caveat: "Native receives certified local index-prime hints; PARI and Hecke perform their ordinary direct complete-basis operations. Field/polynomial construction is outside every timed boundary.",
    },
    native,
    pari,
    hecke,
    comparisons,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
