#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/row19-buchall-end-result-v1";
const TERMINAL_SCHEMA = "sagejs.pari-class-group/row19-terminal-continuation-owner-v1";
const FIRST_SCHEMA = "sagejs.pari-class-group/row19-first-hnf-owner-v1";
const CLASS_SCHEMA = "sagejs.pari-class-group/row19-class-group-principal-owner-v1";
const UNIT_SCHEMA = "sagejs.pari-class-group/row19-live-unit-result-v1";
const TERMINAL_SHA256 = "f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76";
const TERMINAL_COMPRESSED_SHA256 = "bfa7c4a68a2571e5c2663fb43b672d7dcaae36905262b0256a318e44221123dd";
const FIRST_SHA256 = "076d334e302d880b2a7da80366fe492d62b118e2a495f15c422908137aa66258";
const FIRST_COMPRESSED_SHA256 = "5145db1a710eb5e08618a73c741f3218a37c5b7c93d2cd2b94a8c19a4fd601e5";
const UNIT_SHA256 = "ee4828c398ad0b59446e669ac24c1fb482bfc4f7226cf83a92b4f1b67ae44ea9";
const UNIT_COMPRESSED_SHA256 = "3c6b50dd3372bf8e7a840a2de5d0ae4933dba3cd09e02198e67288337601a326";
const CLASS_SHA256 = "1a080b32e3f54e10eb9d525bc0dae139e22d3b1f63defbe332dc0e193f1632e1";
const CLASS_COMPRESSED_SHA256 = "8984679d4f8451192d803fef7787235e74f541c2c86a018e0d8584aff2f016ab";
const CLASS_TRANSFORM_SHA256 = "21ecc1bbcda3511c8af06d6e387f039d6ebee29c0db57aa8131c06136acdec95";
const REVOKED_FINAL_SHA256 = "743ff9279196ffe64a55b843bbdf77c54e7590fc524bfee7491db1528263271c";
const SUPERSEDED_CLASS_SHA256 = new Set([
  "2c056ce2462cb856872ab9946eff6ec62431c1fcbd443d4df50d054d984fc4ff",
  "f1f6e278a517792a2ab7cfc62c61e0d47349f40413bf29e5eb7e9a84cf6e3bed",
  "30f66ba9ef70a6bb7db464728114d84354b04b8666e4e373615781b9b7175a67",
]);
const SUPERSEDED_CLASS_TRANSFORM_SHA256 = new Set([
  "b90156bb99c9268ae9933e3bd58700f3fa9aed351230b72fbd21c16a8223f76a",
]);
const FIELD_ID = "3.1.1086061775432017340256300.107";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;

class Row19FinalResultFailure extends Error {}
function fail(message) { throw new Row19FinalResultFailure(message); }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(
    key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hashValue(value) { return sha(Buffer.from(canonical(value))); }
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}
function strictParse(bytes, label) {
  const program = String.raw`import json,sys
def strict(pairs):
 out={}
 for key,value in pairs:
  if key in out: raise ValueError('duplicate JSON key: '+key)
  out[key]=value
 return out
value=json.load(sys.stdin,object_pairs_hook=strict)
if not isinstance(value,dict): raise ValueError('not an object')
json.dump(value,sys.stdout,separators=(',',':'))`;
  const parsed = spawnSync("python3", ["-c", program], { cwd: ROOT, input: bytes,
    encoding: "utf8", timeout: 60_000, maxBuffer: 128 * 1024 * 1024 });
  if (parsed.status !== 0) fail(`${label} is not strict JSON`);
  return JSON.parse(parsed.stdout);
}
function readGzip(descriptor, label, expectedSchema, fixed = null) {
  if (!descriptor || !descriptor.path || !SHA256.test(descriptor.ownerSha256 || "") ||
      !SHA256.test(descriptor.compressedSha256 || "")) fail(`${label} descriptor is incomplete`);
  if (fixed && (descriptor.ownerSha256 !== fixed.owner ||
      descriptor.compressedSha256 !== fixed.compressed)) fail(`${label} digest changed`);
  const filename = path.resolve(descriptor.path);
  const compressed = fs.readFileSync(filename);
  if (sha(compressed) !== descriptor.compressedSha256 || (fs.statSync(filename).mode & 0o222))
    fail(`${label} compressed owner changed`);
  const plain = zlib.gunzipSync(compressed);
  if (sha(plain) !== descriptor.ownerSha256) fail(`${label} owner digest changed`);
  const owner = strictParse(plain, label);
  if (owner.schema !== expectedSchema) fail(`${label} schema changed`);
  return { owner, plain };
}

function validateTerminal(owner) {
  if (owner.classNumber !== "39366" ||
      JSON.stringify(owner.state) !== "[9,15,415,0,6,7,0,430,0]" ||
      JSON.stringify(owner.acceptanceState) !== "[2,0,0]" ||
      owner.publication?.collectionComplete !== true ||
      owner.publication?.terminalHnfComplete !== true ||
      owner.publication?.acceptanceComplete !== true ||
      owner.publication?.oracleDataConsumed !== false) fail("terminal completion changed");
  integers(owner.result?.W, 81, "terminal W");
  integers(owner.result?.C, 14 * 430, "terminal C");
  integers(owner.result?.perm, 424, "terminal permutation");
  integers(owner.relationIdentity?.records, 424 * 430, "retained relations");
  integers(owner.relationIdentity?.logs, 14 * 430, "retained raw logs");
  integers(owner.relationIdentity?.generators, 3 * 430, "retained generators");
  if (!Array.isArray(owner.relationIdentity?.hashes) ||
      !Array.isArray(owner.relationIdentity?.metadata) ||
      owner.relationIdentity.hashes.length !== 430 ||
      owner.relationIdentity.metadata.length !== 3 * 430)
    fail("terminal relation identity changed");
  integers(owner.regulator, 3, "regulator");
}
function validateUnit(owner) {
  if (owner.fieldId !== FIELD_ID || owner.ancestry?.terminalOwnerSha256 !== TERMINAL_SHA256 ||
      owner.ancestry?.terminalCompressedSha256 !== TERMINAL_COMPRESSED_SHA256 ||
      owner.outcome?.status !== "success" || owner.outcome?.correspondenceComplete !== true ||
      owner.outcome?.usedFrozenW0 !== false || owner.outcome?.expandedCoordinatesRequired !== false ||
      owner.compactAlgebraicUnit?.representation !==
        "signed-product-of-principal-relation-generators" ||
      owner.compactAlgebraicUnit?.relationDependencyVerified !== true ||
      owner.compactAlgebraicUnit?.principalIdeal !== "1" ||
      owner.compactAlgebraicUnit?.principalIdealVerified !== true ||
      owner.compactAlgebraicUnit?.exactNorm !== "1" ||
      owner.compactAlgebraicUnit?.exactInverseNorm !== "1" ||
      owner.compactAlgebraicUnit?.inverseVerified !== true ||
      owner.logCertificate?.regulatorMatched !== true ||
      owner.logCertificate?.productFormulaVerified !== true ||
      owner.materialization?.tag !== "not_given" ||
      owner.materialization?.matchedFlagZero !== true ||
      owner.materialization?.compactFactoredUnitsRetained !== true)
    fail("rank-one unit owner changed");
  const exponents = integers(owner.compactAlgebraicUnit.relationExponents, 430,
    "unit exponents");
  const inverse = integers(owner.compactAlgebraicUnit.inverseRelationExponents, 430,
    "inverse unit exponents");
  if (inverse.some((value, index) => value !== String(-BigInt(exponents[index]))))
    fail("unit inverse changed");
  for (const name of ["unitReal", "unitImaginary"]) {
    if (!Array.isArray(owner.logCertificate[name]) || owner.logCertificate[name].length !== 2)
      fail(`unit ${name} changed`);
    owner.logCertificate[name].forEach((pair, index) =>
      integers(pair, 2, `unit ${name} ${index}`));
  }
  for (const name of ["regulator", "regulatorResidual", "productFormulaResidual"])
    integers(owner.logCertificate[name], 2, `unit ${name}`);
}
function validateClass(owner, terminal) {
  if (owner.ancestry?.terminalOwnerSha256 !== TERMINAL_SHA256 ||
      owner.ancestry?.firstHnfOwnerSha256 !== FIRST_SHA256 ||
      owner.ancestry?.firstHnfCompressedSha256 !== FIRST_COMPRESSED_SHA256 ||
      owner.ancestry?.preparedAuthoritySha256 !== terminal.authority?.preparedAuthoritySha256 ||
      owner.completion?.principalIdealOrderWitnessesComplete !== true ||
      owner.completion?.classArchimedeanAssemblyComplete !== true ||
      owner.completion?.oracleDataConsumed !== false) fail("principal class owner is incomplete");
  const presentation = owner.presentation || {};
  if (presentation.classNumber !== "39366" ||
      JSON.stringify(presentation.invariants) !== '["6","3","3","3","3","3","3","3","3"]')
    fail("class invariants changed");
  const matrices = presentation.matrices || {};
  for (const name of ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"])
    integers(matrices[name], 81, `class ${name}`);
  if (!Array.isArray(owner.generators) || owner.generators.length !== 9)
    fail("class generator count changed");
  owner.generators.forEach((generator, index) => {
    integers(generator.reducedRepresentative?.idealHnf, 9, `class ideal ${index}`);
    if (String(generator.order) !== presentation.invariants[index])
      fail(`generator order ${index} changed`);
    if (generator.orderWitness?.exact !== true || generator.principalWitness?.exact !== true ||
        generator.principalWitness?.complete !== true) fail(`generator witness ${index} incomplete`);
    integers(generator.orderWitness.presentationRelation, 9,
      `generator presentation witness ${index}`);
    const raw = integers(generator.principalWitness.rawRelationCoefficients, 430,
      `generator raw witness ${index}`);
    const factors = integers(generator.principalWitness.factorBaseExponents, 424,
      `generator factor witness ${index}`);
    const generatorPower = integers(
      generator.principalWitness.generatorPowerFactorBaseExponents, 424,
      `generator-power witness ${index}`);
    const expectedPower = Array(424).fill("0");
    let sourceCursor = 0;
    integers(generator.request, 9, `generator request ${index}`).forEach(exponent => {
      if (exponent !== "0") {
        const sourceIndex = Number(integers(generator.sourceIndices,
          generator.sourceIndices.length, `generator source indices ${index}`)[sourceCursor]);
        if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= 424)
          fail(`generator source index ${index} changed`);
        expectedPower[sourceIndex] = String(BigInt(generator.order) * BigInt(exponent));
        sourceCursor += 1;
      }
    });
    if (generator.principalWitness.rawRelationCoefficientsSha256 !==
          sha(Buffer.from(raw.join("\n"))) ||
        generator.principalWitness.factorBaseExponentsSha256 !==
          sha(Buffer.from(factors.join("\n"))) ||
        generator.principalWitness.generatorPowerFactorBaseEqualityExact !== true ||
        canonical(generatorPower) !== canonical(factors) ||
        canonical(expectedPower) !== canonical(factors) ||
        sourceCursor !== generator.sourceIndices.length ||
        generator.principalWitness.famatGenerators?.length !==
          generator.principalWitness.factorCount ||
        generator.principalWitness.famatExponents?.length !==
          generator.principalWitness.factorCount)
      fail(`generator principal witness ${index} changed`);
  });
  const transform = owner.principalRelationTransform || {};
  const entries = integers(transform.entries, 430 * 430, "principal relation transform");
  if (SUPERSEDED_CLASS_TRANSFORM_SHA256.has(transform.sha256))
    fail("superseded principal relation transform is revoked");
  if (transform.rows !== 430 || transform.columns !== 430 ||
      transform.sha256 !== CLASS_TRANSFORM_SHA256 ||
      transform.sha256 !== sha(Buffer.from(entries.join("\n"))) ||
      transform.firstStageFullValuationReplayExact !== true ||
      transform.terminalFullValuationReplayExact !== true)
    fail("principal relation transform changed");
  const factorBase = owner.factorBase || {};
  integers(factorBase.terminalSourceIndices, 9, "selected factor-base source indices");
  integers(factorBase.selectedCatalogIndices, 424, "factor-base catalog indices");
  for (const name of ["norms", "rationalPrimes", "ramificationIndices", "residueDegrees",
    "inertFlags"]) integers(factorBase[name], 424, `factor-base ${name}`);
  if (factorBase.size !== 424 || factorBase.principalWitnessExponentCoordinates !== "idealHnfs" ||
      !Array.isArray(factorBase.idealHnfs) || factorBase.idealHnfs.length !== 424 ||
      factorBase.idealHnfs.some((ideal, index) => {
        try { integers(ideal, 9, `factor-base ideal ${index}`); return false; }
        catch { return true; }
      }) || !Array.isArray(factorBase.generators) || factorBase.generators.length !== 424 ||
      factorBase.generators.some((generator, index) => {
        try { integers(generator, 3, `factor-base generator ${index}`); return false; }
        catch { return true; }
      }) || !Array.isArray(factorBase.tau) || factorBase.tau.length !== 424 ||
      factorBase.tau.some((matrix, index) => {
        try { integers(matrix, 9, `factor-base tau ${index}`); return false; }
        catch { return true; }
      }) || !SHA256.test(factorBase.projectionSha256 || "") ||
      !SHA256.test(factorBase.selectedIdealSha256 || ""))
    fail("factor base changed");
  if (!Array.isArray(owner.archimedean?.Ge) || owner.archimedean.Ge.length !== 9 ||
      integers(owner.archimedean?.Ga, 126, "Ga").length !== 126 ||
      integers(owner.archimedean?.GD, 126, "GD").length !== 126 ||
      integers(owner.archimedean?.ga, 126, "ga").length !== 126 ||
      canonical(owner.archimedean?.clg2?.components) !==
        canonical(["Ur", "ga", "GD", "Ge", "M1", "M2"]))
    fail("final class retained owner is incomplete");
}

function verifyFullValuationReplay(first, terminal, classOwner) {
  const program = String.raw`import importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.row19_class_group_principal_owner')
p=json.load(sys.stdin)
records=[int(value) for value in p['terminal']['relationIdentity']['records']]
first_transform=m._first_relation_transform(p['first'],records)
terminal_transform=m._terminal_relation_transform(first_transform,p['first'],p['terminal'])
expected=[int(value) for value in p['classOwner']['principalRelationTransform']['entries']]
if terminal_transform != expected: raise AssertionError('terminal transform changed')
print(json.dumps({'firstRows':424,'firstColumns':423,'firstCells':424*423,
 'terminalRows':424,'terminalColumns':430,'terminalCells':424*430},separators=(',',':')))`;
  const run = spawnSync("python3", ["-c", program], { cwd: ROOT,
    input: JSON.stringify({ first, terminal, classOwner }), encoding: "utf8",
    timeout: 600_000, maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env,
      PYTHONPYCACHEPREFIX: "/scratch/sagejs-row19-final-replay-cache/pycache",
      SAGEJS_NATIVE_CACHE_DIR: "/scratch/sagejs-native-cache-row19-final-replay/cache",
      SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-native-cache-row19-final-replay/root" } });
  if (run.status !== 0)
    fail(`full first/terminal valuation replay failed: ${run.stderr || run.error || run.status}`);
  const receipt = strictParse(Buffer.from(run.stdout), "full valuation replay receipt");
  if (receipt.firstCells !== 424 * 423 || receipt.terminalCells !== 424 * 430)
    fail("full valuation replay dimensions changed");
  return receipt;
}

function verifyTerminalValuationIdentity(classOwner, terminal) {
  const records = integers(terminal.relationIdentity.records, 424 * 430,
    "terminal valuation records").map(BigInt);
  const transform = integers(classOwner.principalRelationTransform.entries, 430 * 430,
    "terminal provenance transform").map(BigInt);
  const permutation = integers(terminal.result.perm, 424,
    "terminal valuation permutation").map(value => Number(value) - 1);
  const w = integers(terminal.result.W, 81, "terminal valuation W").map(BigInt);
  const b = integers(terminal.result.B, 9 * 415, "terminal valuation B").map(BigInt);
  for (let column = 0; column < 430; column += 1) {
    const coefficients = transform.slice(column * 430, (column + 1) * 430);
    for (let logicalRow = 0; logicalRow < 424; logicalRow += 1) {
      const recordRow = permutation[logicalRow];
      let actual = 0n;
      for (let relation = 0; relation < 430; relation += 1) {
        const coefficient = coefficients[relation];
        if (coefficient !== 0n)
          actual += records[relation * 424 + recordRow] * coefficient;
      }
      let expected = 0n;
      if (column >= 6 && column < 15 && logicalRow < 9)
        expected = w[(column - 6) * 9 + logicalRow];
      else if (column >= 15) {
        const source = column - 15;
        if (logicalRow < 9) expected = b[source * 9 + logicalRow];
        else if (logicalRow === 9 + source) expected = 1n;
      }
      if (actual !== expected)
        fail(`terminal 424x430 valuation identity changed at (${logicalRow},${column})`);
    }
  }
  return true;
}

function compose(descriptors) {
  if (!descriptors?.classOwner) {
    fail("missing raw-to-terminal principal-relation/class owner");
  }
  if (SUPERSEDED_CLASS_SHA256.has(descriptors.classOwner.ownerSha256))
    fail("superseded principal class owner is revoked");
  if (descriptors.classOwner.ownerSha256 !== CLASS_SHA256 ||
      descriptors.classOwner.compressedSha256 !== CLASS_COMPRESSED_SHA256)
    fail("principal class owner is not the corrected authority");
  const terminal = readGzip(descriptors.terminal, "terminal", TERMINAL_SCHEMA,
    { owner: TERMINAL_SHA256, compressed: TERMINAL_COMPRESSED_SHA256 }).owner;
  const unit = readGzip(descriptors.unit, "rank-one unit", UNIT_SCHEMA,
    { owner: UNIT_SHA256, compressed: UNIT_COMPRESSED_SHA256 }).owner;
  const classRead = readGzip(descriptors.classOwner, "principal class", CLASS_SCHEMA);
  let classApi;
  try { classApi = require("./row19_class_group_principal_coordinator.cjs"); }
  catch (error) { throw new Row19FinalResultFailure("principal class replay authority unavailable", { cause: error }); }
  if (typeof classApi.verifyOwner !== "function") fail("principal class replay authority changed");
  classApi.verifyOwner(classRead.owner, classRead.owner.ancestry);
  let unitApi;
  try { unitApi = require("./row19_live_unit_result_coordinator.cjs"); }
  catch (error) { throw new Row19FinalResultFailure("unit replay authority unavailable", { cause: error }); }
  if (typeof unitApi.verifyOwner !== "function") fail("unit replay authority changed");
  unitApi.verifyOwner(unit, unit.ancestry);
  validateTerminal(terminal); validateUnit(unit); validateClass(classRead.owner, terminal);
  if (unit.ancestry.relationsSha256 !== sha(Buffer.from(JSON.stringify(
      terminal.relationIdentity.records))) ||
      unit.ancestry.logsSha256 !== sha(Buffer.from(JSON.stringify(
        terminal.relationIdentity.logs))) ||
      unit.ancestry.generatorsSha256 !== sha(Buffer.from(JSON.stringify(
        terminal.relationIdentity.generators))) ||
      unit.ancestry.regulatorSha256 !== sha(Buffer.from(JSON.stringify(terminal.regulator))))
    fail("unit/terminal projection join changed");
  const classOwner = classRead.owner;
  const payload = {
    schema: SCHEMA,
    ancestry: {
      terminalOwnerSha256: descriptors.terminal.ownerSha256,
      terminalCompressedSha256: descriptors.terminal.compressedSha256,
      classOwnerSha256: descriptors.classOwner.ownerSha256,
      classCompressedSha256: descriptors.classOwner.compressedSha256,
      unitOwnerSha256: descriptors.unit.ownerSha256,
      unitCompressedSha256: descriptors.unit.compressedSha256,
      firstHnfOwnerSha256: classOwner.ancestry.firstHnfOwnerSha256,
      firstHnfCompressedSha256: classOwner.ancestry.firstHnfCompressedSha256,
    },
    field: { id: FIELD_ID, definingPolynomial: ["-51050867718180330", "0", "0", "1"],
      coefficientOrder: "ascending", degree: 3, signature: [1, 1],
      preparedAuthoritySha256: terminal.authority.preparedAuthoritySha256 },
    classGroup: {
      classNumber: classOwner.presentation.classNumber,
      invariants: classOwner.presentation.invariants,
      generatorIdealHnfs: classOwner.generators.map(
        generator => generator.reducedRepresentative.idealHnf),
      exactOrderWitnesses: classOwner.generators.map(generator => ({
        presentation: generator.orderWitness, principal: generator.principalWitness })),
    },
    unitGroup: {
      rank: 1, regulator: terminal.regulator, torsionOrder: "2",
      torsionGenerator: ["-1", "0", "0"],
      compactFundamentalUnit: unit.compactAlgebraicUnit,
      regulatorCertificate: unit.logCertificate,
      materialization: unit.materialization,
    },
    internals: {
      transforms: classOwner.presentation.matrices,
      principalRelationTransform: classOwner.principalRelationTransform,
      valuationReplay: { firstStageRows: 424, firstStageColumns: 423,
        firstStageFullIdentityExact:
          classOwner.principalRelationTransform.firstStageFullValuationReplayExact,
        terminalRows: 424, terminalColumns: 430,
        terminalFullIdentityExact:
          classOwner.principalRelationTransform.terminalFullValuationReplayExact,
        generatorPowerIdentities: 9,
        generatorPowerFactorBaseEqualitiesExact: classOwner.generators.every(
          generator => generator.principalWitness.generatorPowerFactorBaseEqualityExact) },
      Ge: classOwner.archimedean.Ge, Ga: classOwner.archimedean.Ga,
      GD: classOwner.archimedean.GD, ga: classOwner.archimedean.ga,
      clg2: classOwner.archimedean.clg2,
    },
    retained: {
      factorBase: classOwner.factorBase,
      relations: terminal.relationIdentity.records,
      rawLogs: terminal.relationIdentity.logs,
      principalGenerators: terminal.relationIdentity.generators,
      relationHashes: terminal.relationIdentity.hashes,
      relationMetadata: terminal.relationIdentity.metadata,
      terminalW: terminal.result.W, terminalC: terminal.result.C,
      terminalPermutation: terminal.result.perm, terminalB: terminal.result.B,
      terminalDep: terminal.result.dep,
    },
    assumptions: {
      grhAndRelationBounds: "upstream-assumed",
      factorBaseSelection: "upstream-assumed",
      pariCorrespondence: "PARI-2.17.4-buchall",
      independentSageCertification: false,
      status: "complete-internal-upstream-assumed-result",
    },
    sourceBoundary: { usedW0RuntimeData: false, retainedLiveOwners: true,
      qualifiedTiming: false, expandedFundamentalUnit: false,
      expandedFundamentalUnitReason: "PARI flag-zero not_given(LARGE)",
      lazyPublicMaterializations: ["makeunits", "makematal", "makecycgen"] },
    completion: { buchallEndEquivalent: true, classGroupComplete: true,
      unitsComplete: true, correspondenceComplete: true, internalComplete: true,
      certifiedClassUnitComputation: false, publicAdapterComplete: false },
  };
  const material = { ancestry: hashValue(payload.ancestry), classGroup: hashValue(payload.classGroup),
    unitGroup: hashValue(payload.unitGroup),
    internals: hashValue(payload.internals), retained: hashValue(payload.retained),
    assumptions: hashValue(payload.assumptions), field: hashValue(payload.field),
    sourceBoundary: hashValue(payload.sourceBoundary), completion: hashValue(payload.completion) };
  return { ...payload, materialDigests: material,
    sealSha256: hashValue({ payload, materialDigests: material }) };
}

function verifyOwner(owner, expectedAncestry = null) {
  if (!owner || owner.schema !== SCHEMA) fail("wrong row-19 final schema");
  if (expectedAncestry && canonical(owner.ancestry) !== canonical(expectedAncestry))
    fail("final ancestry changed");
  const payload = structuredClone(owner); delete payload.materialDigests; delete payload.sealSha256;
  const material = { ancestry: hashValue(owner.ancestry), classGroup: hashValue(owner.classGroup),
    unitGroup: hashValue(owner.unitGroup),
    internals: hashValue(owner.internals), retained: hashValue(owner.retained),
    assumptions: hashValue(owner.assumptions), field: hashValue(owner.field),
    sourceBoundary: hashValue(owner.sourceBoundary), completion: hashValue(owner.completion) };
  if (canonical(material) !== canonical(owner.materialDigests) ||
      owner.sealSha256 !== hashValue({ payload, materialDigests: material }))
    fail("final result seal changed");
  if (owner.classGroup?.classNumber !== "39366" || owner.classGroup?.generatorIdealHnfs?.length !== 9 ||
      owner.unitGroup?.rank !== 1 || owner.unitGroup?.torsionOrder !== "2" ||
      owner.sourceBoundary?.usedW0RuntimeData !== false ||
      owner.assumptions?.independentSageCertification !== false ||
      owner.sourceBoundary?.expandedFundamentalUnitReason !== "PARI flag-zero not_given(LARGE)" ||
      canonical(owner.completion) !== canonical({ buchallEndEquivalent: true,
        classGroupComplete: true, unitsComplete: true, correspondenceComplete: true,
        internalComplete: true, certifiedClassUnitComputation: false,
        publicAdapterComplete: false })) fail("final result semantics changed");
  return true;
}

function publish(owner, outputDir) {
  verifyOwner(owner, owner.ancestry);
  const plain = Buffer.from(`${JSON.stringify(owner)}\n`); const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  fs.mkdirSync(outputDir, { recursive: true });
  const destination = path.join(outputDir, `row19-buchall-end-${ownerSha256}.json.gz`);
  try { fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 }); }
  catch (error) { if (error.code !== "EEXIST") throw error;
    if (!fs.readFileSync(destination).equals(compressed)) fail("existing final result changed"); }
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

function replay(descriptors, resultDescriptor) {
  if (resultDescriptor.ownerSha256 === REVOKED_FINAL_SHA256)
    fail("revoked row-19 final result");
  const finalRead = readGzip(resultDescriptor, "final result", SCHEMA);
  const expected = compose(descriptors);
  const classOwner = readGzip(descriptors.classOwner, "principal class replay",
    CLASS_SCHEMA).owner;
  const terminal = readGzip(descriptors.terminal, "terminal replay", TERMINAL_SCHEMA,
    { owner: TERMINAL_SHA256, compressed: TERMINAL_COMPRESSED_SHA256 }).owner;
  const first = readGzip(descriptors.first, "first-HNF replay", FIRST_SCHEMA,
    { owner: FIRST_SHA256, compressed: FIRST_COMPRESSED_SHA256 }).owner;
  verifyFullValuationReplay(first, terminal, classOwner);
  verifyTerminalValuationIdentity(classOwner, terminal);
  verifyOwner(finalRead.owner, expected.ancestry);
  if (canonical(finalRead.owner) !== canonical(expected))
    fail("final result does not replay from its authenticated owners");
  return finalRead.owner;
}

function argumentsOf(argv) {
  const values = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(values, key)) fail(`duplicate --${key}`);
    values[key] = argv[index + 1];
  }
  return values;
}
function descriptor(options, prefix, fixed = null) {
  const names = [`${prefix}-owner`, `${prefix}-sha256`, `${prefix}-compressed-sha256`];
  if (names.every(name => !options[name])) return null;
  if (names.some(name => !options[name])) fail(`incomplete --${prefix} descriptor`);
  const value = { path: options[names[0]], ownerSha256: options[names[1]],
    compressedSha256: options[names[2]] };
  if (fixed && (value.ownerSha256 !== fixed.owner || value.compressedSha256 !== fixed.compressed))
    fail(`${prefix} fixed digest changed`);
  return value;
}
function main() {
  const options = argumentsOf(process.argv);
  const expected = ["terminal-owner", "terminal-sha256", "terminal-compressed-sha256",
    "unit-owner", "unit-sha256", "unit-compressed-sha256", "class-owner",
    "class-sha256", "class-compressed-sha256", "output-dir"];
  if (Object.keys(options).some(key => !expected.includes(key))) fail("unknown argument");
  if (!options["output-dir"]) fail("missing --output-dir");
  const descriptors = {
    terminal: descriptor(options, "terminal", { owner: TERMINAL_SHA256,
      compressed: TERMINAL_COMPRESSED_SHA256 }),
    unit: descriptor(options, "unit", { owner: UNIT_SHA256, compressed: UNIT_COMPRESSED_SHA256 }),
    classOwner: descriptor(options, "class"),
  };
  if (!descriptors.terminal || !descriptors.unit) fail("missing terminal or unit descriptor");
  const owner = compose(descriptors);
  process.stdout.write(`${JSON.stringify(publish(owner, path.resolve(options["output-dir"])))}\n`);
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
module.exports = { CLASS_SCHEMA, Row19FinalResultFailure, SCHEMA, compose, publish,
  CLASS_SHA256, CLASS_COMPRESSED_SHA256, REVOKED_FINAL_SHA256,
  FIRST_SHA256, FIRST_COMPRESSED_SHA256,
  UNIT_SHA256, UNIT_COMPRESSED_SHA256, TERMINAL_SHA256, TERMINAL_COMPRESSED_SHA256,
  readGzip, replay, verifyFullValuationReplay, verifyOwner,
  verifyTerminalValuationIdentity };
