"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/row19-class-group-principal-owner-v1";
const TERMINAL_SHA256 = "f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76";
const TERMINAL_COMPRESSED_SHA256 = "bfa7c4a68a2571e5c2663fb43b672d7dcaae36905262b0256a318e44221123dd";
const FIRST_SHA256 = "076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258";
const FIRST_COMPRESSED_SHA256 = "5145db1a710eb5e08618a73c741f3218a37c5b7c93d2cd2b94a8c19a4fd601e5";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));

function readGzipOwner(descriptor) {
  const compressed = fs.readFileSync(descriptor.path);
  assert.equal(sha(compressed), descriptor.compressedSha256);
  assert.equal(fs.statSync(descriptor.path).mode & 0o222, 0);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), descriptor.ownerSha256);
  return JSON.parse(plain);
}

function pythonProjectionHash(value) {
  const run = spawnSync("python3", ["-c",
    "import hashlib,json,sys;print(hashlib.sha256(json.dumps(json.load(sys.stdin),separators=(',',':')).encode()).hexdigest())"],
  { input: JSON.stringify(value), encoding: "utf8", timeout: 60_000 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return run.stdout.trim();
}

function verifyOwner(owner, ancestry) {
  assert.equal(owner.schema, SCHEMA);
  assert.deepEqual(owner.ancestry, ancestry);
  assert.equal(owner.presentation.classNumber, "39366");
  assert.deepEqual(owner.presentation.invariants,
    ["6", "3", "3", "3", "3", "3", "3", "3", "3"]);
  assert.equal(owner.generators.length, 9);
  const factorBase = owner.factorBase;
  assert.equal(factorBase.size, 424);
  assert.equal(factorBase.idealHnfs.length, 424);
  assert(factorBase.idealHnfs.every(ideal => ideal.length === 9));
  assert.equal(factorBase.norms.length, 424);
  assert.equal(factorBase.rationalPrimes.length, 424);
  assert.equal(factorBase.ramificationIndices.length, 424);
  assert.equal(factorBase.residueDegrees.length, 424);
  assert.equal(factorBase.inertFlags.length, 424);
  assert.equal(factorBase.generators.length, 424);
  assert(factorBase.generators.every(generator => generator.length === 3));
  assert.equal(factorBase.tau.length, 424);
  assert(factorBase.tau.every(matrix => matrix.length === 9));
  assert.equal(factorBase.selectedCatalogIndices.length, 424);
  assert.equal(factorBase.principalWitnessExponentCoordinates, "idealHnfs");
  const factorProjection = [factorBase.idealHnfs.flat(), factorBase.norms,
    factorBase.rationalPrimes, factorBase.ramificationIndices,
    factorBase.residueDegrees, factorBase.inertFlags,
    factorBase.generators.flat(), factorBase.tau.flat(),
    factorBase.selectedCatalogIndices].flat();
  assert.equal(sha(Buffer.from(factorProjection.join("\n"))),
    factorBase.projectionSha256);
  for (const generator of owner.generators) {
    const witness = generator.principalWitness;
    assert.equal(witness?.complete, true);
    assert.equal(witness?.exact, true);
    assert.equal(witness.rawRelationCoefficients.length, 430);
    assert.equal(witness.factorBaseExponents.length, 424);
    assert.deepEqual(witness.generatorPowerFactorBaseExponents,
      witness.factorBaseExponents);
    assert.equal(witness.generatorPowerFactorBaseEqualityExact, true);
    const expectedPower = Array(424).fill("0");
    let sourceCursor = 0;
    for (const exponent of generator.request) {
      if (exponent !== "0") {
        expectedPower[generator.sourceIndices[sourceCursor]] =
          String(BigInt(generator.order) * BigInt(exponent));
        sourceCursor += 1;
      }
    }
    assert.equal(sourceCursor, generator.sourceIndices.length);
    assert.deepEqual(witness.factorBaseExponents, expectedPower);
    assert.equal(sha(Buffer.from(witness.rawRelationCoefficients.join("\n"))),
      witness.rawRelationCoefficientsSha256);
    assert.equal(sha(Buffer.from(witness.factorBaseExponents.join("\n"))),
      witness.factorBaseExponentsSha256);
    assert.equal(witness.famatGenerators.length, witness.factorCount);
    assert.equal(witness.famatExponents.length, witness.factorCount);
  }
  const transform = owner.principalRelationTransform;
  assert.equal(transform.rows, 430);
  assert.equal(transform.columns, 430);
  assert.equal(transform.entries.length, 430 * 430);
  assert.equal(sha(Buffer.from(transform.entries.join("\n"))), transform.sha256);
  assert.equal(transform.firstStageFullValuationReplayExact, true);
  assert.equal(transform.terminalFullValuationReplayExact, true);
  assert.deepEqual(owner.archimedean.clg2.components,
    ["Ur", "ga", "GD", "Ge", "M1", "M2"]);
  assert.equal(owner.archimedean.Ge.length, 9);
  assert.equal(owner.archimedean.Ga.length, 126);
  assert.equal(owner.archimedean.GD.length, 126);
  assert.equal(owner.archimedean.ga.length, 126);
  assert(owner.archimedean.Ge.every(value => value.factorKinds.length === 0));
  assert.deepEqual(owner.archimedean.cleanarch, {
    precision: "192", sourceColumns: 424, publishedColumns: 424,
    state: ["0", "424", "424", "43"],
    cleanedSuffixSha256:
      "a12c73a2e5fb6cbbe7792a81818a4f3dcea7a5abf86c1d0565aef53a10c6ad0d",
  });
  assert.equal(owner.completion.principalRelationTransformComplete, true);
  assert.equal(owner.completion.principalIdealOrderWitnessesComplete, true);
  assert.equal(owner.completion.classArchimedeanAssemblyComplete, true);
  assert.equal(owner.completion.unitsJoined, false);
  assert.equal(owner.completion.oracleDataConsumed, false);
  assert.equal(owner.completion.publicComplete, false);
  return true;
}

function publishOwner(owner, outputDirectory) {
  const plain = Buffer.from(`${JSON.stringify(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory,
    `row19-class-group-principal-${ownerSha256}.json.gz`);
  try { fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(fs.readFileSync(destination), compressed);
  }
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

function buildOwner({ terminalDescriptor, firstDescriptor, prepared, prefix,
  preparedAuthoritySha256, outputDirectory }) {
  assert.equal(terminalDescriptor.ownerSha256, TERMINAL_SHA256);
  assert.equal(terminalDescriptor.compressedSha256, TERMINAL_COMPRESSED_SHA256);
  assert.equal(firstDescriptor.ownerSha256, FIRST_SHA256);
  assert.equal(firstDescriptor.compressedSha256, FIRST_COMPRESSED_SHA256);
  const terminal = readGzipOwner(terminalDescriptor);
  const first = readGzipOwner(firstDescriptor);
  const ancestry = { terminalOwnerSha256: TERMINAL_SHA256,
    terminalCompressedSha256: TERMINAL_COMPRESSED_SHA256,
    firstHnfOwnerSha256: FIRST_SHA256,
    firstHnfCompressedSha256: FIRST_COMPRESSED_SHA256,
    preparedAuthoritySha256,
    preparedProjectionSha256: hash(prepared), prefixSha256: hash(prefix),
    prefixProjectionSha256: pythonProjectionHash(prefix) };
  assert.equal(terminal.authority.preparedAuthoritySha256, preparedAuthoritySha256);
  assert.equal(terminal.authority.prefixSha256, ancestry.prefixSha256);
  const run = spawnSync("python3", ["-c", `
import runpy,sys
sys.path.extend(['src/lib','src/baselib','.'])
runpy.run_module('bench.pari-class-group-port.row19_class_group_principal_owner',run_name='__main__')`], {
    cwd: ROOT, input: JSON.stringify({ terminal, first, prepared, prefix, ancestry }),
    encoding: "utf8", timeout: 600_000, maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env,
      SAGEJS_NATIVE_CACHE_DIR: "/scratch/sagejs-native-cache-row19-principal-owner/cache",
      SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-native-cache-row19-principal-owner/root" },
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const owner = JSON.parse(run.stdout);
  verifyOwner(owner, ancestry);
  return { owner, receipt: publishOwner(owner, outputDirectory) };
}

function buildFreshOwner({ terminalDescriptor, firstDescriptor, prepared, prefix,
  preparedAuthoritySha256, outputDirectory }) {
  const terminal = readGzipOwner(terminalDescriptor);
  const first = readGzipOwner(firstDescriptor);
  assert.equal(first.schema, "sagejs.pari-class-group/row19-first-hnf-owner-v1");
  assert.equal(terminal.schema,
    "sagejs.pari-class-group/row19-terminal-continuation-owner-v1");
  const ancestry = { terminalOwnerSha256: terminalDescriptor.ownerSha256,
    terminalCompressedSha256: terminalDescriptor.compressedSha256,
    firstHnfOwnerSha256: firstDescriptor.ownerSha256,
    firstHnfCompressedSha256: firstDescriptor.compressedSha256,
    preparedAuthoritySha256,
    preparedProjectionSha256: hash(prepared), prefixSha256: hash(prefix),
    prefixProjectionSha256: pythonProjectionHash(prefix) };
  assert.equal(terminal.authority.preparedAuthoritySha256, preparedAuthoritySha256);
  assert.equal(terminal.authority.firstHnfOwnerSha256, firstDescriptor.ownerSha256);
  assert.equal(terminal.authority.prefixSha256, ancestry.prefixSha256);
  const program = `
import json,sys
sys.path.extend(['src/lib','src/baselib','.'])
from importlib import import_module
m=import_module('bench.pari-class-group-port.row19_class_group_principal_owner')
p=json.load(sys.stdin)
json.dump(m.compose_fresh_row19_class_group_principal_owner(
 p['terminal'],p['first'],p['prepared'],p['prefix'],p['ancestry'],p['expected']),
 sys.stdout,separators=(',',':'))`;
  const run = spawnSync("python3", ["-c", program], { cwd: ROOT,
    input: JSON.stringify({ terminal, first, prepared, prefix, ancestry,
      expected: firstDescriptor.ownerSha256 }), encoding: "utf8", timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  const owner = JSON.parse(run.stdout);
  verifyOwner(owner, ancestry);
  return { owner, receipt: publishOwner(owner, outputDirectory) };
}

module.exports = { SCHEMA, TERMINAL_SHA256, TERMINAL_COMPRESSED_SHA256,
  FIRST_SHA256, FIRST_COMPRESSED_SHA256, readGzipOwner, verifyOwner,
  publishOwner, buildFreshOwner, buildOwner };
