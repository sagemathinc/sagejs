#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const script = path.join(__dirname, "field3_terminal_owner_adapters.cjs");
const field = "x^4-2000022*x-2000042";
const runIdentity = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function immutable(directory, name, value, bytes = null) {
  const selected = path.join(directory, `${name}.json`);
  const encoded = bytes ?? Buffer.from(`${JSON.stringify(value)}\n`);
  fs.writeFileSync(selected, encoded, { mode: 0o444 });
  return { path: selected, sha256: hash(encoded), value };
}
function run(args, success = true) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8", timeout: 60_000, maxBuffer: 128 * 1024 * 1024,
  });
  if (success) assert.equal(result.status, 0, result.stderr);
  else assert.notEqual(result.status, 0, result.stdout);
  return result;
}
function commonArgs(operation, full15, output) {
  return ["--operation", operation, "--full15", full15.path,
    "--full15-sha256", full15.sha256, "--output-dir", output];
}
function readReceipt(result) {
  const receipt = JSON.parse(result.stdout);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  assert.equal(hash(fs.readFileSync(receipt.path)), receipt.sha256);
  return { receipt, value: JSON.parse(fs.readFileSync(receipt.path, "utf8")) };
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-terminal-adapters-"));
try {
  const output = path.join(temporary, "out");
  const full15Value = {
    schema: "sagejs.pari-class-group/field3-full-terminal-ancestry-v1",
    field, runIdentity, transformShape: [301, 15], terminalShape: [3, 15],
    unitColumns: 13, classColumns: 2,
    packedA: Array.from({ length: 273 }, (_, index) => String(index - 136)),
    terminalH: ["2", "0", "0", "2"],
    packedCe: Array.from({ length: 42 }, (_, index) => String(1000 + index)),
  };
  const full15 = immutable(temporary, "full15", full15Value);
  const raw = Array.from({ length: 602 }, (_, index) => String((index % 11) - 5));
  const c5Value = {
    schema: "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1",
    field, runIdentity, precision: 153088, generation: 1,
    fullTerminalOwnerSha256: full15.sha256,
    state: [0, 153088, 3, 0, 0, 0, 0, 1, -1, 1, 301, 13, 2, 2, 15],
    rawUnitTransform: raw, getfuFactor: ["1", "2", "0", "-1"],
  };
  const c5 = immutable(temporary, "c5", c5Value);
  const mask = 1;
  const adjusted = raw.map((value, index) =>
    index < 301 ? String(-BigInt(value)) : value);
  const c6Value = {
    schema: "sagejs.pari-class-group/field3-c6-getfu-v1",
    field, runIdentity, precision: 153088, generation: 1,
    status: "success", reason: null, c5OwnerSha256: c5.sha256,
    inverseMask: mask, unitNorms: ["-1", "1"],
    units: ["1", "2", "3", "4", "5", "6", "7", "8"],
    logsReal: Array(18).fill("0"), logsImag: Array(18).fill("0"),
    adjustedFactor: ["-1", "-2", "0", "-1"], adjustedWraw: adjusted,
  };
  const c6 = immutable(temporary, "c6", c6Value);
  const factorbackValue = {
    schema: "sagejs.pari-class-group/field3-c6-factorback-receipt-v1",
    field, runIdentity, precision: 153088, generation: 1,
    sourceOwnerSha256: "1".repeat(64), c5OwnerSha256: c5.sha256,
    c6OwnerSha256: c6.sha256, inverseMask: mask,
    columns: [
      { column: 0, inverseChosen: true, factorbackNorm: -1,
        materializedNorm: -1, torsionSign: -1 },
      { column: 1, inverseChosen: false, factorbackNorm: 1,
        materializedNorm: 1, torsionSign: 1 },
    ],
    verified: { relationKernel: true, exactFactorback: true,
      principalIdealOne: true, torsionPlusMinusOne: true, normAndInverse: true,
      logLattice: true },
    counts: { relations: 301, relationRows: 288, units: 2, logCells: 42 },
  };
  const factorback = immutable(temporary, "factorback", factorbackValue);
  const unitArgs = [...commonArgs("unit", full15, output),
    "--c5", c5.path, "--c5-sha256", c5.sha256,
    "--c6", c6.path, "--c6-sha256", c6.sha256,
    "--factorback", factorback.path, "--factorback-sha256", factorback.sha256];
  const firstUnit = readReceipt(run(unitArgs));
  const secondUnit = readReceipt(run(unitArgs));
  assert.deepEqual(secondUnit.receipt, firstUnit.receipt);
  assert.equal(firstUnit.value.accepted, true);
  assert.equal(firstUnit.value.units[0].inverseChosen, true);
  assert.equal(firstUnit.value.units[0].torsionSign, -1);
  assert.deepEqual(firstUnit.value.factoredTransform, adjusted);

  const notGivenValue = { ...c6Value, status: "not_given", reason: "PRECI",
    inverseMask: 0, unitNorms: [], units: [], logsReal: [], logsImag: [],
    adjustedFactor: [], adjustedWraw: [] };
  const notGiven = immutable(temporary, "c6-not-given", notGivenValue);
  const notGivenResult = readReceipt(run([...commonArgs("unit", full15, output),
    "--c5", c5.path, "--c5-sha256", c5.sha256,
    "--c6", notGiven.path, "--c6-sha256", notGiven.sha256]));
  assert.equal(notGivenResult.value.accepted, false);
  assert.equal(notGivenResult.value.status, "not_given");
  assert.equal(notGivenResult.value.reason, "PRECI");
  assert.deepEqual(notGivenResult.value.units, []);

  const records = Array(288 * 301).fill("0");
  for (let column = 0; column < 301; column += 1)
    records[288 * column + (column % 288)] = String(column + 1);
  const generators = Array.from({ length: 4 * 301 }, (_, index) =>
    index % 4 === 0 ? String(Math.floor(index / 4) + 1) : "0");
  const relationValue = {
    schema: "sagejs.pari-class-group/field3-full-owner-authority-v1",
    field, runIdentity, exactOwnersAreAuthority: true,
    principalGeneratorsAreExact: true,
    exactOwners: { relationRecords: records, principalGenerators: generators },
  };
  const relation = immutable(temporary, "relation", relationValue);
  const identity = Array.from({ length: 16 }, (_, index) =>
    index % 5 === 0 ? "1" : "0");
  const classValue = {
    schema: "sagejs.pari-class-group/field3-live-class-suffix-owner-v1",
    field, runIdentity, fullTerminalOwnerSha256: full15.sha256,
    relationAuthoritySha256: relation.sha256, precision: 153088,
    W: full15Value.terminalH, packedC: full15Value.packedCe,
    B: Array.from({ length: 572 }, (_, index) => String(index % 19)),
    invariants: ["2", "2"], classNumber: "4",
    Vbase: [{ packetIndex: "11", prime: "13", tau: identity },
      { packetIndex: "2", prime: "3", tau: identity }],
    replay: { smithExact: true, descriptorReplay: true, principalFactorsExact: true },
  };
  const classOwner = immutable(temporary, "class", classValue);
  const liveArgs = [...commonArgs("live", full15, output),
    "--relation", relation.path, "--relation-sha256", relation.sha256,
    "--class", classOwner.path, "--class-sha256", classOwner.sha256];
  const firstLive = readReceipt(run(liveArgs));
  assert.deepEqual(readReceipt(run(liveArgs)).receipt, firstLive.receipt);
  assert.equal(firstLive.value.relationPrincipals.length, 301);
  assert.deepEqual(firstLive.value.relationPrincipals[19].divisor,
    records.slice(19 * 288, 20 * 288));
  assert.deepEqual(firstLive.value.relationPrincipals[19].exactFactor.powerBasis,
    generators.slice(19 * 4, 20 * 4));
  assert.deepEqual(firstLive.value.torsion.generator, ["-1", "0", "0", "0"]);

  const before = fs.readdirSync(output).sort();
  let rejected = 0;
  const mutations = [
    ["factorback digest", unitArgs.map((value, index) =>
      unitArgs[index - 1] === "--factorback-sha256" ? "0".repeat(64) : value)],
    ["missing factorback", unitArgs.slice(0, -4)],
  ];
  for (const [label, args] of mutations) {
    run(args, false); rejected += 1;
    assert.deepEqual(fs.readdirSync(output).sort(), before, label);
  }
  function rejectedOwner(name, base, mutate, args, flag, digestFlag) {
    const changed = structuredClone(base.value); mutate(changed);
    const owner = immutable(temporary, name, changed);
    const replaced = args.slice();
    replaced[replaced.indexOf(flag) + 1] = owner.path;
    replaced[replaced.indexOf(digestFlag) + 1] = owner.sha256;
    run(replaced, false); rejected += 1;
    assert.deepEqual(fs.readdirSync(output).sort(), before, name);
  }
  const changedC6Value = structuredClone(c6.value);
  changedC6Value.adjustedWraw[0] = "99";
  const changedC6 = immutable(temporary, "bad-c6-sign", changedC6Value);
  const changedFactorbackValue = structuredClone(factorback.value);
  changedFactorbackValue.c6OwnerSha256 = changedC6.sha256;
  const changedFactorback = immutable(temporary, "bad-c6-sign-factorback",
    changedFactorbackValue);
  const changedSignArgs = unitArgs.slice();
  changedSignArgs[changedSignArgs.indexOf("--c6") + 1] = changedC6.path;
  changedSignArgs[changedSignArgs.indexOf("--c6-sha256") + 1] = changedC6.sha256;
  changedSignArgs[changedSignArgs.indexOf("--factorback") + 1] = changedFactorback.path;
  changedSignArgs[changedSignArgs.indexOf("--factorback-sha256") + 1] =
    changedFactorback.sha256;
  run(changedSignArgs, false); rejected += 1;
  assert.deepEqual(fs.readdirSync(output).sort(), before, "C5/C6 sign identity");
  rejectedOwner("bad-factorback-proof", factorback,
    (v) => { v.verified.exactFactorback = false; }, unitArgs,
    "--factorback", "--factorback-sha256");
  rejectedOwner("bad-live-W", classOwner, (v) => { v.W[0] = "3"; }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("bad-live-relation", relation,
    (v) => { v.exactOwnersAreAuthority = false; }, liveArgs,
    "--relation", "--relation-sha256");
  rejectedOwner("bad-live-smith", classOwner,
    (v) => { v.replay.smithExact = false; }, liveArgs,
    "--class", "--class-sha256");
  const duplicate = Buffer.from('{"schema":"x","schema":"y"}\n');
  const duplicateOwner = immutable(temporary, "duplicate", null, duplicate);
  const duplicateArgs = liveArgs.slice();
  duplicateArgs[duplicateArgs.indexOf("--relation") + 1] = duplicateOwner.path;
  duplicateArgs[duplicateArgs.indexOf("--relation-sha256") + 1] = duplicateOwner.sha256;
  run(duplicateArgs, false); rejected += 1;
  assert.deepEqual(fs.readdirSync(output).sort(), before);

  console.log(JSON.stringify({
    schema: "field3-terminal-owner-adapters-check-v1",
    unitSuccess: true, unitNotGiven: "PRECI", liveSuccess: true,
    relationPrincipals: 301, mutationsRejected: rejected,
    publication: "atomic-idempotent-content-addressed-mode0444",
    fixtureAnswersUsed: false,
  }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
