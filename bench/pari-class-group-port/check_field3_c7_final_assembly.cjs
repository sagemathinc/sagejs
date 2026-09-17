#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "field3_c7_final_assembly.py");
const coordinator = path.join(__dirname, "field3_c7_final_assembly_coordinator.cjs");
const field = "x^4-2000022*x-2000042";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function exactZeroEntry() {
  return ["1", "0", "-1", "0", "0", "-1", "0"];
}
function packedCe() {
  const result = [];
  const leading = 1n << 191n;
  for (let column = 0; column < 2; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      const mantissa = leading + BigInt(column * 3 + row) * (1n << 120n);
      result.push("1", String(mantissa), "192", String(-4 + row), "0", "-1", "0");
    }
  }
  return result;
}
function owners() {
  const permutation = [11, 2];
  for (let value = 1; value <= 288; value += 1) {
    if (value !== 11 && value !== 2) permutation.push(value);
  }
  const relations = Array(288 * 301).fill("0");
  relations[10] = "2";
  relations[288 + 1] = "2";
  const transform = Array(301 * 15).fill("0");
  transform[13 * 301] = "1";
  transform[14 * 301 + 1] = "1";
  const A = Array.from({ length: 13 * 3 }, exactZeroEntry).flat();
  const Ce = packedCe();
  const full15 = {
    schema: "sagejs.pari-class-group/field3-full-terminal-ancestry-v1",
    field,
    transform,
    terminalH: ["2", "0", "0", "2"],
    terminalPermutation: permutation.map(String),
    terminalState: [2, 15, 286, 0, 13, 3, 0, 301, 0],
    packedA: A,
    packedCe: Ce,
    packedTerminal: [...A, ...Ce],
  };
  const full15Sha256 = hash(Buffer.from(`${JSON.stringify(full15)}\n`));
  const c3OwnerSha256 = "8".repeat(64);
  const c3Hash = Array.from({ length: 4 }, (_, index) => {
    const word = BigInt(`0x${c3OwnerSha256.slice(16 * index, 16 * index + 16)}`);
    return String(word >= (1n << 63n) ? word - (1n << 64n) : word);
  });
  const c3Latches = ["23", "29"];
  const acceptedC4OwnerSha256 = "1".repeat(64);
  const acceptanceState = ["0", "1", "192", "1"];
  const regulator = {
    schema: "sagejs.pari-class-group/field3-analytic-accepted-owner-v1",
    field,
    accepted: true,
    precision: "192", generation: "1",
    regulator: ["7", "192", "-3"],
    classNumber: "4",
    denominator: "1",
    relations: Array(26).fill("0"),
    acceptedC4OwnerSha256,
    fullTerminalOwnerSha256: full15Sha256,
    c3OwnerSha256, fieldOwnerSha256: "d".repeat(64),
    catalogOwnerSha256: "e".repeat(64), c3Hash, c3Latches,
    analyticOwnerState: ["6144", "1", "2", "3", "4", "5"],
    multipleState: ["0", "0", "192", "1"],
    acceptanceState,
    computeRState: ["0", "0", "0", "0", "1", "192"],
    assumptions: { pariAnalyticBounds: true, grh: false },
  };
  const unit = {
    schema: "sagejs.pari-class-group/field3-c5-c6-unit-owner-v1",
    field,
    accepted: true,
    status: "success",
    reason: null,
    precision: 192,
    generation: 1,
    packedA: A,
    c3Hash, c3Latches, acceptanceState,
    units: [
      { column: 0, powerBasis: ["1", "1", "0", "0"], norm: "1",
        inverseChosen: false, torsionSign: 1, exactFactorback: true },
      { column: 1, powerBasis: ["1", "0", "1", "0"], norm: "1",
        inverseChosen: true, torsionSign: -1, exactFactorback: true },
    ],
    factoredTransformShape: [301, 2],
    factoredTransform: Array(602).fill("0"),
    adjustedFactorShape: [2, 2],
    adjustedFactor: ["1", "0", "0", "-1"],
    norms: ["1", "1"],
    ancestry: {
      full15OwnerSha256: full15Sha256, c5OwnerSha256: "2".repeat(64),
      c6OwnerSha256: "3".repeat(64), embeddingOwnerSha256: "4".repeat(64),
      c3OwnerSha256, acceptedC4OwnerSha256,
      candidateSha256: "5".repeat(64), factorbackSourceOwnerSha256: "6".repeat(64),
      factorbackReceiptSha256: "7".repeat(64),
    },
    proof: {
      relationKernel: true, exactFactorback: true, principalIdealOne: true,
      torsionPlusMinusOne: true, normAndInverse: true, logLattice: true,
      inverseMask: 2,
      columns: [
        { column: 0, inverseChosen: false, factorbackNorm: 1,
          materializedNorm: 1, torsionSign: 1 },
        { column: 1, inverseChosen: true, factorbackNorm: 1,
          materializedNorm: 1, torsionSign: -1 },
      ],
    },
    assumptions: { exactFactorbackVerified: true,
      signInverseMaterializationVerified: true, publicCompletion: false },
  };
  const identity = Array.from({ length: 16 }, (_, index) =>
    index % 5 === 0 ? "1" : "0",
  );
  const principals = [];
  for (let relation = 0; relation < 301; relation += 1) {
    principals.push({
      relation,
      divisor: relations.slice(relation * 288, (relation + 1) * 288),
      exactFactor: { powerBasis: [String(relation + 1), "0", "0", "0"],
        source: "authenticated-principal-generator" },
    });
  }
  const live = {
    schema: "sagejs.pari-class-group/field3-live-final-owner-v1",
    field,
    precision: "192",
    W: ["2", "0", "0", "2"],
    packedC: Ce,
    B: Array.from({ length: 572 }, (_, index) => String(index % 17)),
    Vbase: [
      { prime: "3", tau: identity },
      { prime: "5", tau: identity },
    ],
    relationRecords: relations,
    relationPrincipals: principals,
    torsion: { order: "2", generator: ["-1", "0", "0", "0"] },
    ancestry: { full15OwnerSha256: full15Sha256,
      relationAuthoritySha256: "9".repeat(64), classAuthoritySha256: "a".repeat(64) },
    assumptions: { exactRelationAuthority: true, exactClassReplay: true,
      publicCompletion: false, syntheticQualification: true },
  };
  return { full15, regulator, unit, live };
}
function immutableOwner(directory, name, value) {
  const file = path.join(directory, `${name}.json`);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  fs.writeFileSync(file, bytes, { mode: 0o444 });
  return { file, sha256: hash(bytes) };
}
function coordinatorArgs(files, output) {
  return [
    coordinator,
    "--operation", "prepare",
    "--full15", files.full15.file, "--full15-sha256", files.full15.sha256,
    "--regulator", files.regulator.file, "--regulator-sha256", files.regulator.sha256,
    "--unit", files.unit.file, "--unit-sha256", files.unit.sha256,
    "--live", files.live.file, "--live-sha256", files.live.sha256,
    "--output-dir", output,
  ];
}

(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-c7-"));
  try {
    const values = owners();
    const files = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, immutableOwner(temporary, name, value)]),
    );
    const output = path.join(temporary, "out");
    const first = JSON.parse(run(process.execPath, coordinatorArgs(files, output)));
    const second = JSON.parse(run(process.execPath, coordinatorArgs(files, output)));
    assert.deepEqual(second, first);
    assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
    const envelope = JSON.parse(fs.readFileSync(first.path));
    assert.equal(envelope.publicComplete, false);
    assert.equal(envelope.coldReplayCapable, true);
    assert.deepEqual(envelope.classGroup.invariants, [2, 2]);
    assert.equal(envelope.classGroup.classNumber, 4);
    assert.equal(envelope.generatorSquareWitnesses.length, 2);
    assert.equal(envelope.generatorSquareWitnesses[0].physicalDivisorImage[10], 2);
    assert.equal(envelope.generatorSquareWitnesses[1].physicalDivisorImage[1], 2);
    assert.deepEqual(envelope.classGroup.matrices.Uir, [-1, 0, 0, -1]);
    const replayArgs = [
      coordinator,
      "--operation", "replay",
      "--full15", files.full15.file, "--full15-sha256", files.full15.sha256,
      "--regulator", files.regulator.file, "--regulator-sha256", files.regulator.sha256,
      "--unit", files.unit.file, "--unit-sha256", files.unit.sha256,
      "--live", files.live.file, "--live-sha256", files.live.sha256,
      "--envelope", first.path, "--envelope-sha256", first.sha256,
    ];
    const replay = JSON.parse(run(process.execPath, replayArgs));
    assert.equal(replay.coldReplay, true);
    assert.equal(replay.publicComplete, false);

    // Authentication mutation: changed bytes under the admitted digest fail
    // before Python runs and cannot publish a partial envelope.
    const before = new Set(fs.readdirSync(output));
    const rejectedDigest = spawnSync(
      process.execPath,
      coordinatorArgs({ ...files, live: { ...files.live, sha256: "0".repeat(64) } }, output),
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(rejectedDigest.status, 0);
    assert.deepEqual(new Set(fs.readdirSync(output)), before);

    // Semantic mutations use newly authenticated files and exercise linkage,
    // exact-principal, analytic-acceptance, and descriptor rejection.
    const mutations = [
      ["Tclass", "full15", (value) => { value.transform[13 * 301] = "2"; }],
      ["H", "full15", (value) => { value.terminalH[0] = "3"; }],
      ["Ce", "full15", (value) => { value.packedCe[1] = String(BigInt(value.packedCe[1]) + 1n); }],
      ["regulator", "regulator", (value) => { value.accepted = false; }],
      ["regulator C4 ancestry", "regulator", (value) => { value.acceptedC4OwnerSha256 = "0".repeat(64); }],
      ["regulator full15 ancestry", "regulator", (value) => { value.fullTerminalOwnerSha256 = "0".repeat(64); }],
      ["regulator C3 ancestry", "regulator", (value) => { value.c3OwnerSha256 = "0".repeat(64); }],
      ["regulator C3 hash", "regulator", (value) => { value.c3Hash[0] = "0"; }],
      ["regulator C3 latch", "regulator", (value) => { value.c3Latches[0] = "0"; }],
      ["regulator acceptance", "regulator", (value) => { value.acceptanceState[3] = "0"; }],
      ["regulator compute_R", "regulator", (value) => { value.computeRState[4] = "0"; }],
      ["unit A", "unit", (value) => { value.packedA[0] = "2"; }],
      ["unit C4 ancestry", "unit", (value) => { value.ancestry.acceptedC4OwnerSha256 = "0".repeat(64); }],
      ["unit status", "unit", (value) => { value.status = "not_given"; }],
      ["unit norm", "unit", (value) => { value.norms[0] = "2"; }],
      ["unit transform", "unit", (value) => { value.factoredTransform.pop(); }],
      ["unit ancestry", "unit", (value) => { value.ancestry.full15OwnerSha256 = "f".repeat(64); }],
      ["unit proof", "unit", (value) => { value.proof.exactFactorback = false; }],
      ["principal divisor", "live", (value) => { value.relationPrincipals[0].divisor[0] = "1"; }],
      ["principal factor", "live", (value) => { value.relationPrincipals[0].exactFactor.powerBasis[0] = "0"; }],
      ["live ancestry", "live", (value) => { value.ancestry.full15OwnerSha256 = "b".repeat(64); }],
      ["Vbase", "live", (value) => { value.Vbase[0].prime = "1"; }],
    ];
    for (const [label, ownerName, mutate] of mutations) {
      const changed = structuredClone(values[ownerName]);
      mutate(changed);
      const changedFile = immutableOwner(temporary, `bad-${label.replaceAll(" ", "-")}`, changed);
      const changedFiles = { ...files, [ownerName]: changedFile };
      const rejected = spawnSync(process.execPath, coordinatorArgs(changedFiles, output), {
        cwd: root,
        encoding: "utf8",
        timeout: 240_000,
      });
      assert.notEqual(rejected.status, 0, `${label} mutation accepted`);
      assert.deepEqual(new Set(fs.readdirSync(output)), before, `${label} published output`);
    }

    if (process.env.FIELD3_C7_SKIP_NATIVE !== "1") {
      // The native leaf is independently executable through generated JS. Its
      // inputs are generated above rather than copied from an answer fixture.
      const compilerRoot = process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root;
      const { compileKernel } = require(path.join(compilerRoot, "tools/native-kernel/compiler.cjs"));
      const built = await compileKernel({ sourcePath });
      const api = require(built.modulePath).pari_field3_retain_generator_square_witnesses;
      assert(api.nativeAvailable);
      const relationRecords = values.live.relationRecords.map(BigInt);
      const transform = values.full15.transform.map(BigInt);
      const H = values.full15.terminalH.map(BigInt);
      const permutation = values.full15.terminalPermutation.map(BigInt);
      const exponentOutput = Array(602).fill(77n);
      const imageOutput = Array(576).fill(77n);
      const state = Array(8).fill(77n);
      assert.equal(api.javascript(
        relationRecords, transform, H, permutation,
        Array(602).fill(0n), Array(576).fill(0n), exponentOutput, imageOutput, state,
      ), 0n);
      assert.deepEqual(state, [0n, 301n, 288n, 13n, 2n, 602n, 576n, 15n]);
      const changed = transform.slice(); changed[13 * 301] += 1n;
      const held = Array(8).fill(77n);
      assert.equal(api.javascript(
        relationRecords, changed, H, permutation,
        Array(602).fill(0n), Array(576).fill(0n), Array(602).fill(77n),
        Array(576).fill(77n), held,
      ), 1n);
      assert.deepEqual(held, Array(8).fill(77n));
    }
    console.log(JSON.stringify({
      schema: "field3-c7-final-assembly-check-v1",
      cpython: true,
      javascript: process.env.FIELD3_C7_SKIP_NATIVE !== "1",
      mutations: mutations.length + 1,
      publication: "atomic-idempotent-0444",
      coldReplay: true,
      publicComplete: false,
    }));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
