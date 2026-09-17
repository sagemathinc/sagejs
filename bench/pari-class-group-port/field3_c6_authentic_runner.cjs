#!/usr/bin/env node
"use strict";

// Execute exactly one native embedding rebuild and exactly one native C6
// attempt.  Arithmetic lives in ordinary Python; this file owns only typed
// buffers, immutable ancestry, and transactional publication.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const embeddingPublisher = require("./field3_c6_embedding_owner_coordinator.cjs");

const C5_SCHEMA =
  "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1";
const C6_CANDIDATE_SCHEMA =
  "sagejs.pari-class-group/field3-c6-getfu-candidate-v1";
const C6_SCHEMA = "sagejs.pari-class-group/field3-c6-getfu-v1";
const SOURCE_SCHEMA =
  "sagejs.pari-class-group/field3-c6-factorback-source-v1";
const ATTEMPT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const ROOT = path.resolve(__dirname, "../..");

function fail(message) {
  throw new Error(`field3 authentic C6 runner: ${message}`);
}

function integerVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length)
    fail(`${label} has the wrong length`);
  return value.map((entry) => {
    const text = String(entry);
    if (!INTEGER.test(text) || (typeof entry === "number" && !Number.isSafeInteger(entry)))
      fail(`${label} contains a noncanonical integer`);
    return BigInt(text);
  });
}

function values(buffer) {
  return (buffer.toArray ? buffer.toArray() : Array.from(buffer)).map(BigInt);
}

function bits(entries, floor = 64, margin = 8) {
  let answer = floor;
  for (const entry of entries) {
    const magnitude = entry < 0n ? -entry : entry;
    answer = Math.max(answer, magnitude === 0n ? 1 : magnitude.toString(2).length + margin);
  }
  return answer;
}

function integerBuffer(api, entries, capacity = undefined) {
  const selected = entries.map(BigInt);
  return api.createIntegerBuffer(
    selected.length,
    capacity === undefined ? bits(selected) : capacity,
    selected,
  );
}

function zeroIntegerBuffer(api, length, capacity) {
  return api.createIntegerBuffer(length, capacity, Array(length).fill(0n));
}

function moduleApi(modulePath, name) {
  const resolved = path.resolve(modulePath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) fail(`${name} module is not a file`);
  const loaded = require(resolved)[name];
  if (!loaded || loaded.nativeAvailable !== true || typeof loaded.gmp !== "function")
    fail(`${name} does not expose the qualified GMP entry`);
  return {
    api: loaded,
    path: resolved,
    sha256: embeddingPublisher.sha(fs.readFileSync(resolved)),
  };
}

function publishValue(directory, stem, value) {
  return embeddingPublisher.atomicPublish(directory, stem, value);
}

function exactPrepared(owner) {
  // Publication performs the full field-specific checks.  This extraction is
  // only the typed ingress for the native call.
  return {
    polynomial: integerVector(owner.polynomial, 5, "prepared polynomial"),
    signature: integerVector(owner.signature, 2, "prepared signature"),
    basis: integerVector(owner.zk, 16, "prepared basis"),
    denominator: BigInt(owner.zkden),
    tensor: integerVector(owner.tensor, 64, "prepared tensor"),
  };
}

function runEmbedding(api, source, preparedSha256, moduleSha256, attemptId) {
  const exact = exactPrepared(source);
  const polynomial = integerBuffer(api, exact.polynomial);
  const signature = api.createInt64Buffer(exact.signature);
  const basis = integerBuffer(api, exact.basis);
  const tensor = integerBuffer(api, exact.tensor);
  const scratch = zeroIntegerBuffer(api, 48, 154112);
  const rootM = zeroIntegerBuffer(api, 4, 154112);
  const rootP = zeroIntegerBuffer(api, 4, 154112);
  const rootE = zeroIntegerBuffer(api, 4, 154112);
  const embeddingM = zeroIntegerBuffer(api, 16, 154112);
  const embeddingP = zeroIntegerBuffer(api, 16, 154112);
  const embeddingE = zeroIntegerBuffer(api, 16, 154112);
  const state = api.createInt64Buffer(Array(6).fill(777n));
  const status = api.gmp(
    polynomial,
    signature,
    basis,
    exact.denominator,
    tensor,
    153088n,
    scratch,
    rootM,
    rootP,
    rootE,
    embeddingM,
    embeddingP,
    embeddingE,
    state,
  );
  if (status !== 0n) fail("native embedding rebuild did not succeed");
  const roots = [];
  for (let index = 0; index < 4; index++)
    roots.push(values(rootM)[index], values(rootP)[index], values(rootE)[index]);
  const embedding = [];
  for (let index = 0; index < 16; index++)
    embedding.push(values(embeddingM)[index], values(embeddingP)[index], values(embeddingE)[index]);
  return {
    schema: embeddingPublisher.CANDIDATE_SCHEMA,
    runIdentity: embeddingPublisher.RUN,
    attemptId,
    preparedOwnerSha256: preparedSha256,
    nativeModuleSha256: moduleSha256,
    requestedBits: 153088,
    makeMRootPrecisionBits: 153152,
    makeMTruncation: false,
    roots: roots.map(String),
    embedding: embedding.map(String),
    state: values(state).map(String),
  };
}

function splitEmbedding(owner) {
  const flat = integerVector(owner.embedding, 48, "published embedding");
  return {
    real: [...flat.slice(0, 36)],
    imaginary: [
      ...Array.from({ length: 8 }, () => [0n, -1n, 0n]).flat(),
      ...flat.slice(36, 48),
    ],
  };
}

function allocateC6(api, c5, embedding) {
  const I = (length, capacity) => zeroIntegerBuffer(api, length, capacity);
  const exact = (key, length, floor = 64) => {
    const selected = integerVector(c5[key], length, `C5 ${key}`);
    return integerBuffer(api, selected, bits(selected, floor, 32));
  };
  const prepared = splitEmbedding(embedding);
  const tensor = integerVector(embedding.tensor, 64, "embedding tensor");
  return {
    args: [
      exact("cleanPacked", 42, 200000),
      exact("getfuFactor", 4),
      exact("preparedArchReal", 18, 200000),
      exact("preparedArchImag", 18, 200000),
      exact("preparedCleanReal", 18, 200000),
      exact("preparedCleanImag", 18, 200000),
      exact("rawUnitTransform", 602, 4096),
      integerBuffer(api, prepared.real, 200000),
      integerBuffer(api, prepared.imaginary, 200000),
      integerBuffer(api, tensor, bits(tensor, 64, 16)),
      BigInt(c5.precision),
      BigInt(c5.generation),
    ],
    matep: I(42, 200000),
    arch: I(42, 200000),
    factoredClean: I(42, 400000),
    archReal: I(18, 200000),
    archImag: I(18, 200000),
    cleanReal: I(18, 200000),
    cleanImag: I(18, 200000),
    exponentialReal: I(18, 400000),
    exponentialImag: I(18, 400000),
    splitMatrix: I(48, 1000000),
    splitRhs: I(24, 1000000),
    solveWork: I(48, 1000000),
    solveRhs: I(24, 1000000),
    solved: I(24, 1000000),
    rounded: I(8, 1000000),
    multiplication: I(16, 1000000),
    inverse: I(4, 1000000),
    candidateUnits: I(8, 1000000),
    normalizedFactor: I(4, 4096),
    candidateLogsReal: I(18, 200000),
    candidateLogsImag: I(18, 200000),
    getfuState: api.createInt64Buffer(Array(8).fill(0n)),
    pivots: api.createInt64Buffer(Array(4).fill(0n)),
    expCache: I(3, 400000),
    piCache: I(3, 200000),
    a: I(16385, 128),
    b: I(16385, 128),
    p: I(16385, 128),
    q: I(16385, 128),
    stack: I(105, 1000000),
    adjustedWraw: I(602, 4096),
    outputUnits: I(8, 1000000),
    outputLogsReal: I(18, 200000),
    outputLogsImag: I(18, 200000),
    outputFactor: I(4, 4096),
    outputWraw: I(602, 4096),
    state: api.createInt64Buffer(Array(12).fill(777n)),
  };
}

function runC6(api, c5, embedding, c5Sha256, embeddingSha256, moduleSha256, attemptId) {
  const w = allocateC6(api, c5, embedding);
  const work = [
    w.matep, w.arch, w.factoredClean, w.archReal, w.archImag, w.cleanReal,
    w.cleanImag, w.exponentialReal, w.exponentialImag, w.splitMatrix,
    w.splitRhs, w.solveWork, w.solveRhs, w.solved, w.rounded,
    w.multiplication, w.inverse, w.candidateUnits, w.normalizedFactor,
    w.candidateLogsReal, w.candidateLogsImag, w.getfuState, w.pivots,
    w.expCache, w.piCache, w.a, w.b, w.p, w.q, w.stack, w.adjustedWraw,
    w.outputUnits, w.outputLogsReal, w.outputLogsImag, w.outputFactor,
    w.outputWraw, w.state,
  ];
  const status = Number(api.gmp(...w.args, ...work));
  if (![0, 2, 3].includes(status)) fail("native C6 returned an invalid status");
  const success = status === 0;
  const candidate = {
    schema: C6_CANDIDATE_SCHEMA,
    field: c5.field,
    runIdentity: c5.runIdentity,
    attemptId,
    c5OwnerSha256: c5Sha256,
    embeddingOwnerSha256: embeddingSha256,
    nativeModuleSha256: moduleSha256,
    precision: Number(c5.precision),
    generation: Number(c5.generation),
    status,
    factorDeterminant: String(BigInt(c5.getfuFactor[0]) * BigInt(c5.getfuFactor[3]) - BigInt(c5.getfuFactor[1]) * BigInt(c5.getfuFactor[2])),
    state: values(w.state).map(String),
    roundedUnits: success ? values(w.rounded).map(String) : [],
    units: success ? values(w.outputUnits).map(String) : [],
    logsReal: success ? values(w.outputLogsReal).map(String) : [],
    logsImag: success ? values(w.outputLogsImag).map(String) : [],
    adjustedFactor: success ? values(w.outputFactor).map(String) : [],
    adjustedWraw: success ? values(w.outputWraw).map(String) : [],
  };
  return { candidate, piCache: values(w.piCache) };
}

function coordinateC6(c5Owner, embeddingOwner, candidateOwner, outputDirectory) {
  const coordinator = path.join(__dirname, "field3_high_precision_getfu_coordinator.cjs");
  const result = spawnSync(process.execPath, [
    coordinator,
    "--c5-owner", c5Owner.path,
    "--c5-sha256", c5Owner.sha256,
    "--embedding-owner", embeddingOwner.path,
    "--embedding-sha256", embeddingOwner.sha256,
    "--candidate", candidateOwner.path,
    "--candidate-sha256", candidateOwner.sha256,
    "--output-dir", outputDirectory,
  ], { cwd: ROOT, encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) fail((result.stderr || `C6 coordinator exited ${result.status}`).trim());
  return JSON.parse(result.stdout);
}

function relationOwners(relation) {
  const owners = relation.authority?.owners || relation.owners;
  if (!owners || typeof owners !== "object") fail("relation authority has no owners");
  const generators = integerVector(owners.principalGenerators, 1204, "principal generators");
  const records = integerVector(owners.relationRecords, 86688, "relation records");
  const metadata = integerVector(owners.relationMetadata, 903, "relation metadata");
  for (let column = 0; column < 301; column++) {
    if (metadata[3 * column] !== BigInt(column + 1) || metadata[3 * column + 1] !== 0n || metadata[3 * column + 2] !== 0n)
      fail("relation source ordering changed");
  }
  return { generators, records };
}

function factorbackSource(c5Owner, c6Owner, embeddingOwner, relationOwner, piCache) {
  const c5 = c5Owner.value;
  const c6 = c6Owner.value;
  if (c6.schema !== C6_SCHEMA || c6.status !== "success")
    fail("factorback source requires successful C6 publication");
  const relations = relationOwners(relationOwner.value);
  const packed = splitEmbedding(embeddingOwner.value);
  if (piCache.length !== 3 || piCache[0] <= 0n || piCache[1] !== BigInt(c5.precision))
    fail("successful C6 did not retain the required pi authority");
  return {
    schema: SOURCE_SCHEMA,
    field: c5.field,
    runIdentity: c5.runIdentity,
    precision: Number(c5.precision),
    generation: Number(c5.generation),
    c5OwnerSha256: c5Owner.sha256,
    c6OwnerSha256: c6Owner.sha256,
    embeddingOwnerSha256: embeddingOwner.sha256,
    relationOwnerSha256: relationOwner.sha256,
    principalGenerators: relations.generators.map(String),
    relationRecords: relations.records.map(String),
    multiplicationBasis: integerVector(embeddingOwner.value.tensor, 64, "embedding tensor").map(String),
    rawUnitTransform: integerVector(c5.rawUnitTransform, 602, "C5 raw Wraw").map(String),
    preparedCleanReal: integerVector(c5.preparedCleanReal, 18, "C5 clean real").map(String),
    preparedCleanImag: integerVector(c5.preparedCleanImag, 18, "C5 clean imaginary").map(String),
    embeddingReal: packed.real.map(String),
    embeddingImag: packed.imaginary.map(String),
    logPrecision: Number(c5.precision),
    twoPi: [piCache[0].toString(), piCache[1].toString(), (piCache[2] + 1n).toString()],
    phasePeriodMultipliers: ["1", "1", "2"],
    phaseToleranceExponent: 9 - Number(c5.precision),
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length)
      fail("invalid arguments");
    options[argv[index].slice(2)] = argv[index + 1];
  }
  const required = [
    "attempt-id", "prepared-owner", "prepared-sha256", "c5-owner", "c5-sha256",
    "relation-owner", "relation-sha256", "embedding-module", "c6-module", "output-dir",
  ];
  if (Object.keys(options).sort().join("\0") !== required.sort().join("\0"))
    fail(`required arguments are ${required.map((key) => `--${key}`).join(", ")}`);
  if (!ATTEMPT.test(options["attempt-id"])) fail("invalid attempt identity");
  return options;
}

function load(options, name, label) {
  return embeddingPublisher.loadOwner(options[`${name}-owner`], options[`${name}-sha256`], label);
}

function main(argv = process.argv) {
  const options = parseArguments(argv);
  const outputDirectory = path.resolve(options["output-dir"]);
  const prepared = load(options, "prepared", "prepared owner");
  const c5 = load(options, "c5", "C5 owner");
  const relation = load(options, "relation", "relation authority");
  if (c5.value.schema !== C5_SCHEMA || c5.value.runIdentity !== embeddingPublisher.RUN || Number(c5.value.precision) !== 153088 || Number(c5.value.generation) < 1)
    fail("C5 owner is not the authentic field3 generation");
  const embeddingModule = moduleApi(options["embedding-module"], "pari_field3_high_precision_embeddings");
  const c6Module = moduleApi(options["c6-module"], "pari_field3_high_precision_getfu");

  const embeddingCandidateValue = runEmbedding(
    embeddingModule.api, prepared.value, prepared.sha256,
    embeddingModule.sha256, options["attempt-id"],
  );
  const embeddingCandidate = publishValue(outputDirectory, "field3-native-embedding-candidate", embeddingCandidateValue);
  const embeddingOwner = embeddingPublisher.publishEmbedding(
    prepared,
    { value: embeddingCandidateValue, sha256: embeddingCandidate.sha256 },
    outputDirectory,
  );

  const c6Attempt = runC6(
    c6Module.api, c5.value, embeddingOwner.value, c5.sha256,
    embeddingOwner.sha256, c6Module.sha256, options["attempt-id"],
  );
  const c6Candidate = publishValue(outputDirectory, "field3-c6-getfu-candidate", c6Attempt.candidate);
  const c6Result = coordinateC6(
    c5,
    { path: embeddingOwner.path, sha256: embeddingOwner.sha256 },
    c6Candidate,
    outputDirectory,
  );
  const c6Published = embeddingPublisher.loadOwner(c6Result.path, c6Result.sha256, "published C6 owner");
  let source = null;
  if (c6Result.status === "success") {
    source = publishValue(
      outputDirectory,
      "field3-c6-factorback-source",
      factorbackSource(c5, c6Published, embeddingOwner, relation, c6Attempt.piCache),
    );
  }
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/field3-c6-authentic-attempt-v1",
    attemptId: options["attempt-id"],
    preparedOwnerSha256: prepared.sha256,
    c5OwnerSha256: c5.sha256,
    relationOwnerSha256: relation.sha256,
    embeddingModuleSha256: embeddingModule.sha256,
    c6ModuleSha256: c6Module.sha256,
    embeddingOwner: { path: embeddingOwner.path, sha256: embeddingOwner.sha256 },
    candidate: { path: c6Candidate.path, sha256: c6Candidate.sha256 },
    c6Owner: { path: c6Result.path, sha256: c6Result.sha256, status: c6Result.status, reason: c6Result.reason },
    factorbackSource: source && { path: source.path, sha256: source.sha256 },
  })}\n`);
}

module.exports = {
  SOURCE_SCHEMA,
  allocateC6,
  factorbackSource,
  parseArguments,
  relationOwners,
  runC6,
  runEmbedding,
  splitEmbedding,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
