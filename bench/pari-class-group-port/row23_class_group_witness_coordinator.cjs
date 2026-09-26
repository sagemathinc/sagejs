#!/usr/bin/env node
"use strict";

// Authenticated row-23 prepared field -> immutable cyclic class witness.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const SOURCE = path.join(HERE, "row23_class_group_witness.py");
const RELATION_SOURCE = path.join(HERE, "row23_connected_relation_hnf.py");
const SCHEMA = "sagejs.pari-class-group/row23-cyclic-class-witness-v1";
const PREPARED_SHA256 = "0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299";
const FACTOR_SHA256 = "b4fa7209eb9fcd86438dc8d1f0fac9d194a32535f612de97ed605da6ca2bf439";
const INTEGER = /^-?(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const arraySha = values => sha(Buffer.from(values.map(String).join("\n")));
const canonical = value => JSON.stringify(value);

class Row23ClassWitnessFailure extends Error {}
function fail(message) { throw new Row23ClassWitnessFailure(message); }
function strings(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner)).slice(0, length).map(String);
}
function numbers(owner, length = owner.length) { return strings(owner, length).map(Number); }
function integers(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) fail(`${label} has the wrong length`);
  return value.map((entry, index) => {
    if (!INTEGER.test(String(entry))) fail(`${label}[${index}] is not canonical`);
    return String(entry);
  });
}

function verifyOwner(owner, expectedAncestry = null) {
  if (!owner || owner.schema !== SCHEMA) fail("wrong row-23 class-witness schema");
  const ancestry = owner.ancestry || {};
  if (expectedAncestry && canonical(ancestry) !== canonical(expectedAncestry))
    fail("row-23 class-witness ancestry changed");
  const required = ["preparedAuthoritySha256", "factorOwnerSha256", "relationMatrixSha256",
    "principalGeneratorsSha256", "cleanupTransformSha256", "hnfTransformSha256",
    "hnfResultSha256", "hnfTailSha256", "terminalPermutationSha256",
    "selectedIdealSha256", "relationRootSourceSha256", "relationRootCoreSha256",
    "composerSourceSha256"];
  if (Object.keys(ancestry).sort().join("\0") !== required.sort().join("\0"))
    fail("row-23 class-witness ancestry is incomplete");
  for (const value of Object.values(ancestry)) if (!DIGEST.test(value)) fail("invalid ancestry digest");
  if (ancestry.preparedAuthoritySha256 !== PREPARED_SHA256 ||
      ancestry.factorOwnerSha256 !== FACTOR_SHA256) fail("row-23 upstream authority changed");

  const presentation = owner.presentation || {};
  if (canonical(presentation.W) !== '["6"]' || presentation.classNumber !== "6" ||
      canonical(presentation.invariants) !== '["6"]' || presentation.cyclic !== true)
    fail("row-23 cyclic presentation changed");
  const expectedMatrices = { D: ["6"], U: ["1"], Ui: ["1"], V: ["1"],
    Ur: ["1"], Y: ["0"], Uir: ["1"], X: ["0"], M1: ["1"], M2: ["0"] };
  if (canonical(presentation.matrices) !== canonical(expectedMatrices) ||
      Object.values(presentation.identities || {}).some(value => value !== true))
    fail("row-23 Smith transformations changed");
  if (canonical(presentation.states?.state) !== "[0,1,0,0,0,0,3]")
    fail("row-23 Smith state changed");

  const generator = owner.generator || {};
  const ideal = integers(generator.selectedIdealHnf, 25, "selected ideal");
  if (canonical(generator.presentationCoordinates) !== '["1"]' ||
      generator.terminalIndex !== 0 || generator.sourceIndex !== 0 ||
      generator.order !== "6" || canonical(generator.properDivisorsRejected) !== '["1","2","3"]' ||
      generator.exactOrderFromSmithPresentation !== true || ideal[0] !== "7" ||
      arraySha(ideal) !== ancestry.selectedIdealSha256)
    fail("row-23 selected generator changed");
  integers(generator.descriptor, 33, "selected descriptor");

  const genback = owner.genback || {};
  if (canonical(genback.request) !== '["1"]' || canonical(genback.sourceIndices) !== "[0]" ||
      canonical(genback.candidateIdealHnf) !== canonical(ideal) || genback.requestComplete !== true ||
      genback.degreeFiveIdealredExecuted !== false || genback.reducedRepresentativePublished !== false)
    fail("row-23 genback boundary changed");

  const witness = owner.compactPrincipalWitness || {};
  const coefficients = integers(witness.rawRelationCoefficients, 40, "relation coefficients");
  const exponents = integers(witness.factorBaseExponents, 31, "factor exponents");
  if (arraySha(coefficients) !== witness.rawRelationCoefficientsSha256 ||
      arraySha(exponents) !== witness.factorBaseExponentsSha256 ||
      canonical(exponents) !== canonical(["6", ...Array(30).fill("0")]) ||
      witness.factorCount !== witness.relationIndices?.length || witness.factorCount !== 22 ||
      witness.factorCount !== witness.relationExponents?.length ||
      witness.factorCount !== witness.principalGenerators?.length ||
      witness.coefficientCombinationExact !== true ||
      witness.expandedPrincipalGeneratorMaterialized !== false ||
      witness.degreeFiveIdealProductReplayComplete !== false)
    fail("row-23 compact principal witness changed");
  let support = [];
  coefficients.forEach((value, index) => { if (value !== "0") support.push(index); });
  if (canonical(support) !== canonical(witness.relationIndices) ||
      canonical(support.map(index => coefficients[index])) !== canonical(witness.relationExponents))
    fail("row-23 compact witness support changed");
  witness.principalGenerators.forEach((value, index) => integers(value, 5, `principal generator ${index}`));
  if (arraySha(witness.principalGenerators.flat()) !== witness.principalGeneratorsSha256)
    fail("row-23 compact principal generators changed");

  const completion = owner.completion || {};
  const expectedCompletion = { fullSmithTransformsComplete: true,
    inverseHnfDivisionsComplete: true, genbackRequestComplete: true,
    selectedGeneratorIdealComplete: true, reducedGeneratorIdealComplete: false,
    presentationOrderWitnessComplete: true, compactPrincipalWitnessComplete: true,
    degreeFiveIdealProductReplayComplete: false,
    analyticClassGroupCompletenessJoined: false, unitsComplete: false, publicComplete: false };
  if (canonical(completion) !== canonical(expectedCompletion) ||
      owner.provenance?.frozenAnswerInputs !== false ||
      owner.provenance?.postcomputeOracleConsumed !== false)
    fail("row-23 completion boundary changed");
  return true;
}

function publish(owner, directory) {
  verifyOwner(owner, owner.ancestry);
  const plain = Buffer.from(`${canonical(owner)}\n`), ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row23-cyclic-class-witness-${ownerSha256}.json.gz`);
  if (fs.existsSync(destination)) {
    if ((fs.statSync(destination).mode & 0o777) !== 0o444 ||
        sha(zlib.gunzipSync(fs.readFileSync(destination))) !== ownerSha256)
      fail("existing immutable row-23 class witness changed");
  } else {
    const temporary = path.join(directory, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, compressed, { flag: "wx", mode: 0o400 });
      fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444);
    } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { schema: SCHEMA, path: destination, ownerSha256,
    compressedSha256: sha(compressed), bytes: plain.length, compressedBytes: compressed.length };
}

function compose(projection, ancestry) {
  const program = String.raw`import importlib,json,sys
sys.path.extend(['src/lib','src/baselib','.'])
m=importlib.import_module('bench.pari-class-group-port.row23_class_group_witness')
p=json.load(sys.stdin);print(json.dumps(m.compose_row23_class_group_witness(p['projection'],p['ancestry']),separators=(',',':'))) `;
  const run = spawnSync("python3", ["-c", program], { cwd: ROOT,
    input: JSON.stringify({ projection, ancestry }), encoding: "utf8", timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) fail((run.stderr || `Python exited ${run.status}`).trim());
  return JSON.parse(run.stdout);
}

async function run(payload) {
  if (!payload || canonical(Object.keys(payload).sort()) !==
      canonical(["outputDirectory", "prepared", "preparedAuthoritySha256"]))
    fail("unreviewed row-23 class-witness payload");
  const auth = require("./prepared_nf_authentication.cjs");
  const authority = auth.authenticatePreparedNf(payload.prepared);
  if (authority.sha256 !== PREPARED_SHA256 || payload.preparedAuthoritySha256 !== PREPARED_SHA256)
    fail("row-23 prepared authority changed");
  const factorCoordinator = require("./row23_factor_base_coordinator.cjs");
  const factorDirectory = fs.mkdtempSync("/scratch/sagejs-row23-class-witness-factor-");
  const factor = await factorCoordinator.run({ prepared: payload.prepared,
    preparedAuthoritySha256: PREPARED_SHA256, outputDirectory: factorDirectory });
  if (factor.ownerSha256 !== FACTOR_SHA256) fail("row-23 factor owner changed");
  const host = require("./row23_first_hnf_host.cjs");
  const live = await host.runFirstHnf(payload.prepared, factor.owner);
  if (live.status !== 0) fail("row-23 first HNF did not complete");
  const relationMatrix = strings(live.values.hnf_original, 31 * 40);
  assert.deepEqual(relationMatrix, strings(live.values.relation_records, 31 * 40),
    "HNF input is not the live relation owner");
  const principalGenerators = strings(live.values.generators, 5 * 40);
  const cleanupTransform = strings(live.values.hnf_transform, 40 * 40);
  const hnfTransform = strings(live.values.hnf_hnf_transform, 13 * 13);
  const terminalH = strings(live.values.hnf_result_h, 1);
  const terminalB = strings(live.values.hnf_result_b, 30);
  const terminalPermutation = strings(live.values.hnf_perm, 31);
  const ideal = factor.owner.factorBase.ideals[0].map(String);
  const ancestry = {
    preparedAuthoritySha256: PREPARED_SHA256,
    factorOwnerSha256: factor.ownerSha256,
    relationMatrixSha256: arraySha(relationMatrix),
    principalGeneratorsSha256: arraySha(principalGenerators),
    cleanupTransformSha256: arraySha(cleanupTransform),
    hnfTransformSha256: arraySha(hnfTransform),
    hnfResultSha256: arraySha(terminalH),
    hnfTailSha256: arraySha(terminalB),
    terminalPermutationSha256: arraySha(terminalPermutation),
    selectedIdealSha256: arraySha(ideal),
    relationRootSourceSha256: sha(fs.readFileSync(RELATION_SOURCE)),
    relationRootCoreSha256: sha(fs.readFileSync(live.built.coreSourcePath)),
    composerSourceSha256: sha(fs.readFileSync(SOURCE)),
  };
  const projection = {
    dimensions: { degree: 5, factorRows: 31, relations: 40,
      assemblyRows: 4, assemblyColumns: 13 },
    states: { relation: live.relationState.map(Number), chain: live.chainState,
      hnf: live.hnfState, assembly: numbers(live.values.hnf_assembly_state, 6),
      final: numbers(live.values.hnf_final_state, 7),
      diagonal: numbers(live.values.hnf_diagonal, 4) },
    factor: { selectedDescriptor: factor.owner.factorBase.descriptors[0].map(String),
      selectedIdealHnf: ideal, norm: String(factor.owner.factorBase.norms[0]) },
    relations: { matrix: relationMatrix, principalGenerators },
    hnf: { cleanupTransform, hnfTransform,
      fullH: strings(live.values.hnf_full_h, 4 * 13), W: terminalH, B: terminalB,
      terminalPermutation },
  };
  const owner = compose(projection, ancestry);
  verifyOwner(owner, ancestry);
  return { ...publish(owner, payload.outputDirectory), owner, projection, ancestry };
}

module.exports = { FACTOR_SHA256, PREPARED_SHA256, Row23ClassWitnessFailure,
  SCHEMA, compose, publish, run, verifyOwner };
