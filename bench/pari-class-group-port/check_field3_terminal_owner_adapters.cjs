#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { composeUnit } = require("./field3_terminal_owner_adapters.cjs");

const script = path.join(__dirname, "field3_terminal_owner_adapters.cjs");
const sourceChecker = path.join(__dirname, "check_field3_terminal_source_owners.cjs");
const field = "x^4-2000022*x-2000042";
const runIdentity = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const arrayHash = (values) => hash(Buffer.from(values.join("\n")));
const residentAuthoritySha256 =
  "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const liveClassJoinSha256 =
  "b8df9b99acb501d8ea0faf3034c1059d451ffd84180735c89c982b0f014da814";
const protocolOwnerSha256 =
  "892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72";

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
  const serializerCheck = spawnSync(process.execPath, [sourceChecker], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(serializerCheck.status, 0, serializerCheck.stderr);
  const serializerQualification = JSON.parse(serializerCheck.stdout);
  assert.equal(serializerQualification.schema,
    "field3-terminal-source-owners-check-v1");
  assert.equal(serializerQualification.authenticHighPrecisionRun, false);
  assert.match(serializerQualification.relationOwnerSha256, /^[0-9a-f]{64}$/);
  assert.match(serializerQualification.classOwnerSha256, /^[0-9a-f]{64}$/);
  const transform = Array(301 * 15).fill("0");
  const raw = Array.from({ length: 602 }, (_, index) => String((index % 11) - 5));
  transform.splice(0, 301, ...raw.slice(0, 301));
  transform.splice(301, 301, ...raw.slice(301));
  const rawOwnerSha256 = "d".repeat(64);
  const full15Value = {
    schema: "sagejs.pari-class-group/field3-full-terminal-ancestry-v1",
    field, runIdentity, transformShape: [301, 15], terminalShape: [3, 15],
    unitColumns: 13, classColumns: 2, targetBits: 153088,
    rawOwnerSha256, protocolOwnerSha256,
    authorityOwnerSha256: residentAuthoritySha256, transform,
    packedA: Array.from({ length: 273 }, (_, index) => String(index - 136)),
    terminalH: ["2", "0", "0", "2"],
    packedCe: Array.from({ length: 42 }, (_, index) => String(1000 + index)),
  };
  const full15 = immutable(temporary, "full15", full15Value);
  const c3OwnerSha256 = "8".repeat(64);
  const c3Hash = Array.from({ length: 4 }, (_, index) => {
    const word = BigInt(`0x${c3OwnerSha256.slice(16 * index, 16 * index + 16)}`);
    return String(word >= (1n << 63n) ? word - (1n << 64n) : word);
  });
  const c5Value = {
    schema: "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1",
    field, runIdentity, precision: 384, generation: 1,
    fullTerminalOwnerSha256: full15.sha256,
    c3OwnerSha256, acceptedC4OwnerSha256: "1".repeat(64),
    c3Hash, c3Latches: ["23", "29"],
    state: [0, 384, 3, 0, 0, 0, 0, 1, -1, 1, 301, 13, 2, 2, 15],
    acceptanceState: [0, 1, 384, 1],
    u1Shape: [13, 2], u1: ["1", ...Array(12).fill("0"), "0", "1", ...Array(11).fill("0")],
    u2Shape: [2, 2], u2: ["1", "0", "0", "1"],
    finalTransformShape: [13, 2],
    finalTransform: ["1", ...Array(12).fill("0"), "0", "1", ...Array(11).fill("0")],
    rawUnitTransformShape: [301, 2], rawUnitTransform: raw,
    getfuFactorShape: [2, 2], getfuFactor: ["1", "2", "0", "-1"],
  };
  const c5 = immutable(temporary, "c5", c5Value);
  const mask = 1;
  const adjusted = raw.map((value, index) =>
    index < 301 ? String(-BigInt(value)) : value);
  const c6Value = {
    schema: "sagejs.pari-class-group/field3-c6-getfu-v1",
    field, runIdentity, precision: 384, generation: 1,
    status: "success", reason: null, c5OwnerSha256: c5.sha256,
    embeddingOwnerSha256: "b".repeat(64), candidateSha256: "c".repeat(64),
    state: [0, 384, 1, 2, 1, -1, 512, 301, 0, -1, 1, 602],
    inverseMask: mask, unitNorms: ["-1", "1"],
    units: ["1", "2", "3", "4", "5", "6", "7", "8"],
    logsReal: Array(18).fill("0"), logsImag: Array(18).fill("0"),
    adjustedFactor: ["-1", "-2", "0", "-1"], adjustedWraw: adjusted,
  };
  const c6 = immutable(temporary, "c6", c6Value);
  const factorbackSourceValue = {
    schema: "sagejs.pari-class-group/field3-c6-factorback-source-v1",
    field, runIdentity, precision: 384, generation: 1,
    c5OwnerSha256: c5.sha256, c6OwnerSha256: c6.sha256,
    embeddingOwnerSha256: c6Value.embeddingOwnerSha256,
    relationOwnerSha256: "9".repeat(64),
    principalGenerators: Array(1204).fill("0"),
    relationRecords: Array(86688).fill("0"),
    multiplicationBasis: Array(64).fill("0"),
    rawUnitTransform: raw,
    sourceRawLogs: Array(6321).fill("0"),
    preparedCleanReal: Array(18).fill("0"), preparedCleanImag: Array(18).fill("0"),
    embeddingReal: Array(36).fill("0"), embeddingImag: Array(36).fill("0"),
    logPrecision: 384, twoPi: ["1", "1", "0"],
    phasePeriodMultipliers: ["1", "1", "2"], phaseToleranceExponent: -376,
  };
  const factorbackSource = immutable(temporary, "factorback-source",
    factorbackSourceValue);
  const factorbackValue = {
    schema: "sagejs.pari-class-group/field3-c6-factorback-receipt-v1",
    field, runIdentity, precision: 384, generation: 1,
    sourceOwnerSha256: factorbackSource.sha256, c5OwnerSha256: c5.sha256,
    c6OwnerSha256: c6.sha256,
    embeddingOwnerSha256: factorbackSourceValue.embeddingOwnerSha256,
    relationOwnerSha256: factorbackSourceValue.relationOwnerSha256,
    inverseMask: mask,
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
    "--factorback-source", factorbackSource.path,
    "--factorback-source-sha256", factorbackSource.sha256,
    "--factorback", factorback.path, "--factorback-sha256", factorback.sha256];
  const firstUnit = readReceipt(run(unitArgs));
  const secondUnit = readReceipt(run(unitArgs));
  assert.deepEqual(secondUnit.receipt, firstUnit.receipt);
  assert.equal(firstUnit.value.accepted, true);
  assert.equal(firstUnit.value.units[0].inverseChosen, true);
  assert.equal(firstUnit.value.units[0].torsionSign, -1);
  assert.deepEqual(firstUnit.value.factoredTransform, adjusted);
  const wrap = (owner) => ({ value: structuredClone(owner.value), sha256: owner.sha256 });
  {
    const highC5 = wrap(c5); const highC6 = wrap(c6);
    const highSource = wrap(factorbackSource); const highReceipt = wrap(factorback);
    highC5.value.precision = 153088;
    highC5.value.state[1] = 153088; highC5.value.acceptanceState[2] = 153088;
    highC6.value.precision = 153088; highC6.value.state[1] = 153088;
    highC6.value.state[6] = 16385;
    highSource.value.precision = 153088; highSource.value.logPrecision = 153088;
    highReceipt.value.precision = 153088;
    const high = composeUnit(wrap(full15), highC5, highC6,
      highSource, highReceipt);
    assert.equal(high.accepted, true);
    assert.equal(high.precision, 153088);
  }
  {
    const changed = wrap(c5); changed.value.acceptanceState[3] = 0;
    assert.throws(() => composeUnit(wrap(full15), changed, wrap(c6),
      wrap(factorbackSource), wrap(factorback)), /analytic acceptance/);
  }
  {
    const changed = wrap(c6); changed.value.candidateSha256 = "x";
    assert.throws(() => composeUnit(wrap(full15), wrap(c5), changed,
      wrap(factorbackSource), wrap(factorback)), /candidate owner/);
  }

  const notGivenValue = { ...c6Value, status: "not_given", reason: "PRECI",
    state: [3, 384, 1, 0, 0, -1, 512, 301, 0, 0, 0, 0],
    inverseMask: 0, unitNorms: [], units: [], logsReal: [], logsImag: [],
    adjustedFactor: [], adjustedWraw: [] };
  const notGiven = immutable(temporary, "c6-not-given", notGivenValue);
  const compactIdentity = Array.from({ length: 64 }, (_, index) =>
    index < 16 && index % 5 === 0 ? "1" : "0");
  const compactRelationValue = {
    schema: "sagejs.pari-class-group/field3-full-owner-authority-v1",
    field, runIdentity, residentAuthoritySha256, liveClassJoinSha256,
    shape: [288, 301], degree: 4, exactOwnersAreAuthority: true,
    principalGeneratorsAreExact: true,
    exactOwners: {
      relationRecords: Array(288 * 301).fill("0"),
      principalGenerators: Array.from({ length: 4 * 301 }, (_, index) =>
        index % 4 === 0 ? "1" : "0"),
      basisTable: compactIdentity,
    },
    replay: { principalRelationsExact: true, relations: 301, factorBaseSize: 288 },
    assumptions: { pari2174Correspondence: true, upstreamBoundsAssumed: true,
      publicCompletion: false },
  };
  const compactRelation = immutable(temporary, "compact-relation", compactRelationValue);
  const notGivenResult = readReceipt(run([...commonArgs("unit", full15, output),
    "--c5", c5.path, "--c5-sha256", c5.sha256,
    "--c6", notGiven.path, "--c6-sha256", notGiven.sha256,
    "--relation", compactRelation.path, "--relation-sha256", compactRelation.sha256]));
  assert.equal(notGivenResult.value.accepted, false);
  assert.equal(notGivenResult.value.status, "not_given");
  assert.equal(notGivenResult.value.reason, "PRECI");
  assert.deepEqual(notGivenResult.value.units, []);
  assert.equal(notGivenResult.value.compactAccepted, true);
  assert.deepEqual(notGivenResult.value.factoredTransform, raw);
  assert.deepEqual(notGivenResult.value.norms, ["1", "1"]);
  assert.equal(notGivenResult.value.proof.principalIdealOne, true);
  {
    const changed = wrap(notGiven); changed.value.state[0] = 2;
    assert.throws(() => composeUnit(wrap(full15), wrap(c5), changed,
      null, null, wrap(compactRelation)),
      /not_given state/);
  }
  {
    const changed = wrap(compactRelation);
    changed.value.exactOwners.relationRecords[0] = "1";
    assert.throws(() => composeUnit(wrap(full15), wrap(c5), wrap(notGiven),
      null, null, changed), /relation kernel/);
  }
  {
    const changed = wrap(c5);
    changed.value.finalTransform[0] = "2";
    assert.throws(() => composeUnit(wrap(full15), changed, wrap(notGiven),
      null, null, wrap(compactRelation)), /W=T\*U/);
  }
  {
    const changed = wrap(compactRelation);
    changed.value.exactOwners.principalGenerators[0] = "0";
    assert.throws(() => composeUnit(wrap(full15), wrap(c5), wrap(notGiven),
      null, null, changed), /principal generator is zero/);
  }

  const records = Array(288 * 301).fill("0");
  for (let column = 0; column < 301; column += 1)
    records[288 * column + (column % 288)] = String(column + 1);
  const generators = Array.from({ length: 4 * 301 }, (_, index) =>
    index % 4 === 0 ? String(Math.floor(index / 4) + 1) : "0");
  const metadata = Array.from({ length: 903 }, (_, index) => String(index));
  const outerPermutation = ["11", "2", ...Array.from({ length: 286 },
    (_, index) => String(index + 1))];
  const relationValue = {
    schema: "sagejs.pari-class-group/field3-full-owner-authority-v1",
    field, runIdentity, residentAuthoritySha256, liveClassJoinSha256,
    shape: [288, 301], degree: 4, exactOwnersAreAuthority: true,
    principalGeneratorsAreExact: true,
    exactOwners: { relationRecords: records, principalGenerators: generators,
      packetIdeals: Array(288 * 16).fill("0"), packetNorms: Array(288).fill("1"),
      packetIds: Array.from({ length: 288 }, (_, index) => String(index)),
      relationMetadata: metadata, outerPermutation, basisTable: Array(64).fill("0") },
    replay: { principalRelationsExact: true, relations: 301, factorBaseSize: 288,
      nonzeroRelationEntries: 301, maximumRelationSupport: 1,
      selectedPermutationPrefix: outerPermutation.slice(0, 2),
      relationRecordsSha256: arrayHash(records),
      principalGeneratorsSha256: arrayHash(generators),
      relationMetadataSha256: arrayHash(metadata) },
    assumptions: { pari2174Correspondence: true, upstreamBoundsAssumed: true,
      publicCompletion: false },
  };
  const relation = immutable(temporary, "relation", relationValue);
  const identity = Array.from({ length: 16 }, (_, index) =>
    index % 5 === 0 ? "1" : "0");
  const descriptorGenerators = ["1", "0", "0", "0", "0", "1", "0", "0"];
  const antiuniformizers = ["0", "1", "0", "0", "0", "0", "1", "0"];
  const retainedWitness = {
    indices: ["11", "2"], primes: ["13", "3"], generators: descriptorGenerators,
    antiuniformizers, tau: [...identity, ...identity],
    order: ["2", "0", "0", "2"], m1: ["-1", "0", "0", "-1"],
    offsets: ["0", "1", "2"], kinds: ["0", "0"],
    numerators: ["1", "1"], denominators: ["13", "3"], exponents: ["1", "1"],
    generatorIdeals: Array(32).fill("0"), generatedIdeals: Array(32).fill("0"),
    relationExponents: ["2", "0", "0", "2"], invariants: ["2", "2"],
    classNumber: ["4"], state: ["0", ...Array(11).fill("1")],
    uir: ["-1", "0", "0", "-1"], computedM1: ["-1", "0", "0", "-1"],
  };
  const B = Array.from({ length: 572 }, (_, index) => String(index % 19));
  const classValue = {
    schema: "sagejs.pari-class-group/field3-live-class-suffix-owner-v1",
    field, runIdentity, fullTerminalOwnerSha256: full15.sha256,
    relationAuthoritySha256: relation.sha256, residentAuthoritySha256,
    liveClassJoinSha256, rawOwnerSha256, protocolOwnerSha256, precision: 153088,
    W: full15Value.terminalH, packedC: full15Value.packedCe,
    B,
    invariants: ["2", "2"], classNumber: "4",
    Vbase: [{ packetIndex: "11", prime: "13",
      generator: descriptorGenerators.slice(0, 4),
      antiuniformizer: antiuniformizers.slice(0, 4), tau: identity },
      { packetIndex: "2", prime: "3", generator: descriptorGenerators.slice(4),
        antiuniformizer: antiuniformizers.slice(4), tau: identity }],
    orderPrincipalFactorback: [{ packetIndex: "11", packetExponent: "2",
      relationExponents: transform.slice(13 * 301, 14 * 301) },
      { packetIndex: "2", packetExponent: "2",
        relationExponents: transform.slice(14 * 301, 15 * 301) }],
    retainedWitness,
    replay: { smithExact: true, descriptorReplay: true, principalFactorsExact: true,
      selectedPermutationPrefix: ["11", "2"], wholePermutationCompared: false,
      terminalBExact: true, selectedIdealsExact: true, orderPrincipalIdealsExact: true },
    BDefinition: { layout: "column-major 2x286 reduced trailing block",
      equation: "C_B[j] = g_perm[2+j] + sum_i B[i,j]*g_perm[i]",
      checkpointSha256: arrayHash(B) },
    assumptions: { pari2174Correspondence: true, upstreamBoundsAssumed: true,
      publicCompletion: false },
  };
  const classOwner = immutable(temporary, "class", classValue);
  const liveArgs = [...commonArgs("live", full15, output),
    "--relation", relation.path, "--relation-sha256", relation.sha256,
    "--class", classOwner.path, "--class-sha256", classOwner.sha256];
  const live = readReceipt(run(liveArgs));
  assert.equal(live.value.relationPrincipals.length, 301);
  assert.deepEqual(live.value.Vbase[0].antiuniformizer,
    antiuniformizers.slice(0, 4));
  assert.equal(live.value.proof.BDefinition.checkpointSha256, arrayHash(B));

  const before = fs.readdirSync(output).sort();
  let rejected = 0;
  const mutations = [
    ["factorback digest", unitArgs.map((value, index) =>
      unitArgs[index - 1] === "--factorback-sha256" ? "0".repeat(64) : value)],
    ["missing factorback", unitArgs.slice(0, -8)],
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
  rejectedOwner("live-terminal-B", classOwner,
    (v) => { v.B[0] = String(BigInt(v.B[0]) + 1n); }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("live-raw-ancestry", classOwner,
    (v) => { v.rawOwnerSha256 = "e".repeat(64); }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("live-antiuniformizer", classOwner,
    (v) => { v.Vbase[0].antiuniformizer[0] = "2"; }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("live-tau", classOwner,
    (v) => { v.Vbase[0].tau[0] = "2"; }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("live-order-factorback", classOwner,
    (v) => { v.orderPrincipalFactorback[0].relationExponents[0] = "1"; },
    liveArgs, "--class", "--class-sha256");
  rejectedOwner("live-replay", classOwner,
    (v) => { v.replay.terminalBExact = false; }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("live-relation", relation,
    (v) => { v.exactOwners.relationRecords[0] = "2"; }, liveArgs,
    "--relation", "--relation-sha256");
  rejectedOwner("live-source", relation,
    (v) => { v.residentAuthoritySha256 = "e".repeat(64); }, liveArgs,
    "--relation", "--relation-sha256");
  rejectedOwner("live-missing-B-definition", classOwner,
    (v) => { delete v.BDefinition; }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("live-missing-antiuniformizer", classOwner,
    (v) => { delete v.Vbase[0].antiuniformizer; }, liveArgs,
    "--class", "--class-sha256");
  rejectedOwner("live-missing-protocol-ancestry", classOwner,
    (v) => { delete v.protocolOwnerSha256; }, liveArgs,
    "--class", "--class-sha256");
  const changedC6Value = structuredClone(c6.value);
  changedC6Value.adjustedWraw[0] = "99";
  const changedC6 = immutable(temporary, "bad-c6-sign", changedC6Value);
  const changedSignSourceValue = structuredClone(factorbackSource.value);
  changedSignSourceValue.c6OwnerSha256 = changedC6.sha256;
  const changedSignSource = immutable(temporary, "bad-c6-sign-source",
    changedSignSourceValue);
  const changedFactorbackValue = structuredClone(factorback.value);
  changedFactorbackValue.c6OwnerSha256 = changedC6.sha256;
  changedFactorbackValue.sourceOwnerSha256 = changedSignSource.sha256;
  const changedFactorback = immutable(temporary, "bad-c6-sign-factorback",
    changedFactorbackValue);
  const changedSignArgs = unitArgs.slice();
  changedSignArgs[changedSignArgs.indexOf("--c6") + 1] = changedC6.path;
  changedSignArgs[changedSignArgs.indexOf("--c6-sha256") + 1] = changedC6.sha256;
  changedSignArgs[changedSignArgs.indexOf("--factorback-source") + 1] =
    changedSignSource.path;
  changedSignArgs[changedSignArgs.indexOf("--factorback-source-sha256") + 1] =
    changedSignSource.sha256;
  changedSignArgs[changedSignArgs.indexOf("--factorback") + 1] = changedFactorback.path;
  changedSignArgs[changedSignArgs.indexOf("--factorback-sha256") + 1] =
    changedFactorback.sha256;
  run(changedSignArgs, false); rejected += 1;
  assert.deepEqual(fs.readdirSync(output).sort(), before, "C5/C6 sign identity");
  rejectedOwner("bad-factorback-proof", factorback,
    (v) => { v.verified.exactFactorback = false; }, unitArgs,
    "--factorback", "--factorback-sha256");
  for (const [name, mutate] of [
    ["wrong-factorback-receipt-embedding", (value) => {
      value.embeddingOwnerSha256 = "f".repeat(64);
    }],
    ["missing-factorback-receipt-embedding", (value) => {
      delete value.embeddingOwnerSha256;
    }],
    ["wrong-factorback-receipt-relation", (value) => {
      value.relationOwnerSha256 = "f".repeat(64);
    }],
    ["missing-factorback-receipt-relation", (value) => {
      delete value.relationOwnerSha256;
    }],
  ]) rejectedOwner(name, factorback, mutate, unitArgs,
    "--factorback", "--factorback-sha256");
  const changedSource = structuredClone(factorbackSource.value);
  changedSource.rawUnitTransform[0] = "99";
  const changedSourceOwner = immutable(temporary, "bad-factorback-source", changedSource);
  const badSourceArgs = unitArgs.slice();
  badSourceArgs[badSourceArgs.indexOf("--factorback-source") + 1] = changedSourceOwner.path;
  badSourceArgs[badSourceArgs.indexOf("--factorback-source-sha256") + 1] =
    changedSourceOwner.sha256;
  run(badSourceArgs, false); rejected += 1;
  assert.deepEqual(fs.readdirSync(output).sort(), before, "factorback source ancestry");
  for (const [name, mutate] of [
    ["wrong-factorback-source-c6", (value) => { value.c6OwnerSha256 = "f".repeat(64); }],
    ["missing-factorback-source-c6", (value) => { delete value.c6OwnerSha256; }],
    ["wrong-factorback-source-embedding", (value) => {
      value.embeddingOwnerSha256 = "f".repeat(64);
    }],
    ["missing-factorback-source-embedding", (value) => {
      delete value.embeddingOwnerSha256;
    }],
    ["invalid-factorback-source-relation", (value) => {
      value.relationOwnerSha256 = "wrong";
    }],
    ["missing-factorback-source-relation", (value) => {
      delete value.relationOwnerSha256;
    }],
  ]) {
    const sourceValue = structuredClone(factorbackSource.value);
    mutate(sourceValue);
    const sourceOwner = immutable(temporary, name, sourceValue);
    const receiptValue = structuredClone(factorback.value);
    receiptValue.sourceOwnerSha256 = sourceOwner.sha256;
    const receiptOwner = immutable(temporary, `${name}-receipt`, receiptValue);
    const changedArgs = unitArgs.slice();
    changedArgs[changedArgs.indexOf("--factorback-source") + 1] = sourceOwner.path;
    changedArgs[changedArgs.indexOf("--factorback-source-sha256") + 1] =
      sourceOwner.sha256;
    changedArgs[changedArgs.indexOf("--factorback") + 1] = receiptOwner.path;
    changedArgs[changedArgs.indexOf("--factorback-sha256") + 1] =
      receiptOwner.sha256;
    run(changedArgs, false); rejected += 1;
    assert.deepEqual(fs.readdirSync(output).sort(), before, name);
  }
  const duplicate = Buffer.from('{"schema":"x","schema":"y"}\n');
  const duplicateOwner = immutable(temporary, "duplicate", null, duplicate);
  const duplicateArgs = unitArgs.slice();
  duplicateArgs[duplicateArgs.indexOf("--factorback-source") + 1] = duplicateOwner.path;
  duplicateArgs[duplicateArgs.indexOf("--factorback-source-sha256") + 1] =
    duplicateOwner.sha256;
  run(duplicateArgs, false); rejected += 1;
  assert.deepEqual(fs.readdirSync(output).sort(), before);

  console.log(JSON.stringify({
    schema: "field3-terminal-owner-adapters-check-v1",
    unitSuccess: true, unitNotGiven: "PRECI", liveStatus: "success",
    mutationsRejected: rejected,
    serializerQualification: { relationOwnerSha256:
      serializerQualification.relationOwnerSha256,
    classOwnerSha256: serializerQualification.classOwnerSha256 },
    publication: "atomic-idempotent-content-addressed-mode0444",
    fixtureAnswersUsed: false,
  }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
