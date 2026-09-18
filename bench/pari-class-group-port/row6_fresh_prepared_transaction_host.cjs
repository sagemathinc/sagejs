"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const authentication = require("./prepared_nf_authentication.cjs");
const gateHost = require("./row6_prepared_gate_c_host.cjs");
const completeHost = require("./row6_terminal_transaction_host.cjs");
const semantic = require("./row6_prepared_semantic_authority.cjs");

const ROOT = path.resolve(__dirname, "../..");
const FACTOR_ROOT = path.join(__dirname,
  "check_row6_prepared_factor_base_root.cjs");
const INITIAL_ROOT = path.join(__dirname,
  "check_row6_prepared_initial_relations.cjs");
const PREPARED_AUTHORITY_SHA256 =
  "1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0";
const PREPARED_KEYS = ["admission_factorlimit", "admission_matrix_e",
  "admission_matrix_m", "admission_matrix_p", "admission_prime_limit",
  "admission_primes", "admission_products", "admission_real_count",
  "analytic_discriminant", "analytic_primes", "analytic_roots_of_unity",
  "basis_table", "n", "precision", "prep_index", "prep_invzk",
  "prep_polynomial", "prep_zk", "prep_zk_degrees", "prep_zkden",
  "preparation_embedding", "preparation_rounded_embedding"];
const ROWS = 1130, DEGREE = 3, PLACES = 3;

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha256(Buffer.from(JSON.stringify(value)));

function validatePrepared(prepared) {
  assert.deepEqual(Object.keys(prepared).sort(), PREPARED_KEYS);
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, PREPARED_AUTHORITY_SHA256,
    "prepared input is outside the reviewed row-6 corridor");
  return { authoritySha256: authority.sha256, data: structuredClone(prepared) };
}

function readOwner(receipt) {
  const compressed = fs.readFileSync(receipt.path);
  assert.equal(sha256(compressed), receipt.compressedSha256);
  assert.equal(fs.statSync(receipt.path).mode & 0o222, 0);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), receipt.ownerSha256);
  return JSON.parse(plain);
}

function runRoot(script, payload, label) {
  const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
    "--cpu=600", "--", process.execPath, script, "--root"], {
    cwd: ROOT, encoding: "utf8", input: JSON.stringify(payload), timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, `${label}: ${run.stderr || run.stdout || run.error}`);
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  return { owner: readOwner(receipt), receipt };
}

function buildPreparedOwners(preparedEnvelope, directory) {
  const factorResult = runRoot(FACTOR_ROOT, {
    outputDirectory: path.join(directory, "factor"),
    prepared: preparedEnvelope.data,
    preparedAuthoritySha256: preparedEnvelope.authoritySha256,
  }, "fresh factor-base root");
  const factor = factorResult.owner;
  const factorSemanticSha256 = semantic.semanticSha256(factor);
  const initialResult = runRoot(INITIAL_ROOT, {
    outputDirectory: path.join(directory, "initial"),
    prepared: preparedEnvelope.data,
    preparedAuthoritySha256: preparedEnvelope.authoritySha256,
    factorOwner: factorResult.receipt.path,
    factorOwnerSha256: factorResult.receipt.ownerSha256,
  }, "fresh initial-relation root");
  const initial = initialResult.owner;
  initial.authority.factorOwnerSemanticSha256 = factorSemanticSha256;
  return { factor, initial,
    factorSemanticSha256,
    initialSemanticSha256: semantic.semanticSha256(initial),
    telemetry: {
      factor: structuredClone(factor.execution),
      initial: structuredClone(initial.execution),
    } };
}

async function buildGateOwner(prepared, factor, initial) {
  gateHost.validateBoundary(prepared, factor, initial);
  const started = process.hrtime.bigint();
  const live = await gateHost.runPreparedGateC(prepared, factor, initial);
  const elapsedNs = process.hrtime.bigint() - started;
  const records = live.collectorValues.relation_records.toArray()
    .slice(0, ROWS * 1137).map(String);
  const logs = live.collectorValues.log_embeddings.toArray()
    .slice(0, 7 * PLACES * 1137).map(String);
  const checkpoints = live.checkpoints.map(checkpoint => ({
    columns: checkpoint.columns,
    state: checkpoint.state,
    hashes: {
      relations: hash(records.slice(0, ROWS * checkpoint.columns)),
      logs: hash(logs.slice(0, 7 * PLACES * checkpoint.columns)),
      h: hash(checkpoint.h), dep: hash(checkpoint.dep), b: hash(checkpoint.b),
      c: hash(checkpoint.c), perm: hash(checkpoint.perm),
    },
  }));
  const relationHashes = live.collectorValues.relation_hashes.toArray()
    .slice(0, 1137).map(String);
  const metadata = live.collectorValues.relation_metadata.toArray()
    .slice(0, 3 * 1137).map(String);
  const generators = live.collectorValues.generators.toArray()
    .slice(0, DEGREE * 1137).map(String);
  const final = live.checkpoints.at(-1);
  const gate = {
    schema: "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1",
    authority: {
      preparedAuthoritySha256: prepared.authoritySha256,
      factorOwnerSemanticSha256: semantic.semanticSha256(factor),
      initialOwnerSemanticSha256: semantic.semanticSha256(initial),
    },
    field: factor.field,
    execution: { elapsedNs: String(elapsedNs), maxRssKiB: process.resourceUsage().maxRSS,
      addressSpaceCeilingBytes: "4294967296", cpuLimitSeconds: 600,
      wallTimeoutSeconds: 600, nodeOldSpaceMiB: 3072 },
    relationState: ["1137", "11420", "0", "0", "1137", "1137"],
    collectionPasses: live.collectionPasses,
    passTrace: live.passTrace,
    checkpoints,
    relationIdentity: { hashes: relationHashes, metadata, generators },
    final: { state: final.state, h: final.h, dep: final.dep, b: final.b,
      c: final.c, perm: final.perm, relations: records, logs },
    capacity: { logicalRows: ROWS, logicalColumns: 1137,
      retainedRelationCells: records.length, retainedLogCells: logs.length,
      retainedSelectedHnfCells: final.h.length + final.dep.length + final.b.length,
      fullGlobalTransformCells: 0, historicalCheckpointMatricesRetained: 0,
      ownerBytesUpperBound: live.ownerBytesUpperBound },
    publication: { relationCollectionComplete: true, hnfComplete: true,
      acceptanceExecuted: false, classGroupConstructed: false,
      boundaryMutationsRejected: 0 },
  };
  return gate;
}

async function runFreshPrepared(prepared, outputDirectory) {
  const preparedEnvelope = validatePrepared(prepared);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),
    "sagejs-row6-fresh-prepared-"));
  fs.chmodSync(temporary, 0o700);
  try {
    const built = buildPreparedOwners(preparedEnvelope, temporary);
    const gate = await buildGateOwner(preparedEnvelope, built.factor, built.initial);
    const gateTelemetry = structuredClone(gate.execution);
    const completed = await completeHost.runPreparedComplete(
      preparedEnvelope, gate, built.factor, outputDirectory);
    const { elapsedNs, stageElapsedNs, maxRssKiB, ...neutralReceipt } = completed;
    return {
      ...neutralReceipt,
      schema: "sagejs.pari-class-group/row6-fresh-prepared-receipt-v1",
      freshPreparedExecution: true,
      retainedRuntimeInputs: false,
      retainedOwnersRuntimeInputs: false,
      frozenW0RuntimeInput: false,
      runtimeInputs: ["authenticated normalized prepared-nf data"],
      semanticAuthority: {
        schema: semantic.SCHEMA,
        factorSha256: semantic.semanticSha256(built.factor),
        initialSha256: semantic.semanticSha256(built.initial),
        gateSha256: semantic.semanticSha256(gate),
      },
      untrustedTelemetryRetainedInternally: Boolean(
        built.telemetry.factor && built.telemetry.initial && gateTelemetry),
    };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

module.exports = { buildGateOwner, buildPreparedOwners, runFreshPrepared,
  validatePrepared };
