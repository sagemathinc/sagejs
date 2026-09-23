#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized

// This checker deliberately stops at the post-HNF arithmetic boundary.  It
// proves that the live row-6 Gate-C owner determines analytic acceptance,
// regulator reconstruction, and the Smith invariants.  It does not claim the
// class-generator, principal-relation, fundamental-unit, or C7 contracts.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PREPARED = "/tmp/row6-prepared-projection.json";
const DEFAULT_GATE =
  "/tmp/sagejs-row6-gate-c-eQS861/owner/" +
  "row6-prepared-gate-c-6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98.json.gz";
const DEFAULT_FACTOR =
  "/tmp/sagejs-row6-factor-base-hy2P4R/owner/" +
  "row6-prepared-factor-base-1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef.json.gz";
const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json";

const PREPARED_FILE_SHA256 =
  "abfa328710a3d1c2e39b3893e6f6b6cf0214b7da7a101d5360502fe56c8ac58b";
const PREPARED_AUTHORITY_SHA256 =
  "1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0";
const GATE_SHA256 =
  "6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98";
const GATE_COMPRESSED_SHA256 =
  "526cf175619801919509bdf21d4296a31864876e3d563a3728678e66b80b813d";
const FACTOR_SHA256 =
  "1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef";
const FACTOR_COMPRESSED_SHA256 =
  "7ddf980ce29f730098464684533ca560c91d8465ab242e8d1762f5a4d4f505f6";
const W0_SHA256 =
  "2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5";
const EXPECTED_REGULATOR = [
  "3626834249414306903656792336633990244294399400949119764057",
  "192",
  "56",
];
const EXPECTED_UNIT_LATTICE = [
  "6", "0", "0", "6", "-2529485940798537", "-7",
  "60039863294012304", "70", "-14275683735510315", "-15",
  "-18707463945450123", "-35", "16197072521873160", "-30",
];

const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => JSON.stringify(value);

function parseArguments(argv) {
  const options = {
    prepared: DEFAULT_PREPARED,
    gate: DEFAULT_GATE,
    factor: DEFAULT_FACTOR,
    w0: DEFAULT_W0,
    outputDirectory: undefined,
    postcomputeOutput: undefined,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index], value = argv[index + 1];
    assert(value, `missing value for ${option}`);
    const key = {
      "--prepared": "prepared", "--gate": "gate", "--factor": "factor",
      "--w0": "w0", "--output-directory": "outputDirectory",
      "--postcompute-output": "postcomputeOutput",
    }[option];
    assert(key, `unknown option ${option}`);
    options[key] = path.resolve(value);
  }
  return options;
}

function readPrepared(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(sha256(bytes), PREPARED_FILE_SHA256,
    "prepared projection bytes changed");
  const value = JSON.parse(bytes);
  assert.equal(value.authoritySha256, PREPARED_AUTHORITY_SHA256);
  const auth = require("./prepared_nf_authentication.cjs");
  assert.equal(auth.authenticatePreparedNf(value.data).sha256,
    PREPARED_AUTHORITY_SHA256, "prepared mathematical authority changed");
  return { bytes, value };
}

function readGzipOwner(file, compressedDigest, plainDigest, schema) {
  const compressed = fs.readFileSync(file);
  assert.equal(sha256(compressed), compressedDigest, "compressed owner changed");
  assert.equal(fs.statSync(file).mode & 0o222, 0, "retained owner is mutable");
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha256(plain), plainDigest, "owner identity changed");
  const value = JSON.parse(plain);
  assert.equal(value.schema, schema);
  return { compressed, plain, value };
}

function validateResult(result) {
  assert.equal(result.schema,
    "sagejs.pari-class-group/row6-post1137-terminal-v1");
  assert.equal(result.status, 0);
  assert.equal(result.preparedAuthoritySha256, PREPARED_AUTHORITY_SHA256);
  assert.equal(result.gateOwnerSha256, GATE_SHA256);
  assert.equal(result.factorOwnerSha256, FACTOR_SHA256);
  assert.equal(result.fieldDiscriminant,
    "3555555555596888888888939555555555028");
  assert.equal(result.analyticPrimeCount, 6543);
  assert.deepEqual(result.analyticState, [12288, 1469]);
  assert.deepEqual(result.postHnfState, [0, 7, 1]);
  assert.deepEqual(result.multipleState, [0, 0, 135, 2]);
  assert.deepEqual(result.acceptanceState, [2, 0, 0]);
  assert.deepEqual(result.reconstructionState, [0, 5, 113, 2]);
  assert.deepEqual(result.regulator, EXPECTED_REGULATOR);
  assert.deepEqual(result.unitRelations, EXPECTED_UNIT_LATTICE);
  assert.equal(result.unitRelationsSha256,
    "109ba2182c61112037ac2ab5de03e25f55513ae673eda874b976d0ee0958bcca");
  assert.deepEqual(result.smithState, [0, 2, 0, 0, 0, 0]);
  assert.deepEqual(result.invariants, ["2", "2"]);
  assert.equal(result.classNumber, "4");
  assert.deepEqual(result.terminalState, [0, 0, 7, 0, 2, 1137, 0, 0, 2, 0]);
  assert.deepEqual(result.completeness, {
    fullSmithTransform: false,
    idealGeneratorWitnesses: false,
    principalRelationWitnesses: false,
  });
  return result;
}

function validateBoundary(prepared, gate, factor) {
  const host = require("./row6_post1137_terminal_host.cjs");
  return host.validateInputs(gate, factor, prepared);
}

function rejectInputMutations(prepared, gate, factor) {
  let rejected = 0;
  const reject = (mutate) => {
    const p = structuredClone(prepared);
    const g = structuredClone(gate);
    const f = structuredClone(factor);
    mutate(p, g, f);
    assert.throws(() => validateBoundary(p, g, f));
    rejected += 1;
  };
  reject((p) => { p.authoritySha256 = "0".repeat(64); });
  reject((p) => { p.data.prep_polynomial[0] = "2000000000019"; });
  reject((_p, g) => { g.authority.preparedAuthoritySha256 = "0".repeat(64); });
  reject((_p, g) => { g.final.state[7] = 1136; });
  reject((_p, _g, f) => { f.authority.preparedAuthoritySha256 = "0".repeat(64); });
  reject((_p, _g, f) => { f.rootState[3] = "1129"; });
  return rejected;
}

function writeEnvelope(directory, result, execution) {
  fs.mkdirSync(directory, { recursive: true });
  const envelope = {
    schema: "sagejs.pari-class-group/row6-post1137-checkpoint-owner-v1",
    authority: {
      preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
      gateOwnerSha256: GATE_SHA256,
      factorOwnerSha256: FACTOR_SHA256,
    },
    execution,
    result,
    completeness: {
      analyticAcceptance: true,
      regulatorReconstruction: true,
      smithInvariants: true,
      fullSmithTransform: false,
      classGeneratorWitnesses: false,
      principalRelationWitnesses: false,
      fundamentalUnitReconstruction: false,
      c7Result: false,
      correspondenceComplete: false,
      publicComplete: false,
    },
  };
  const bytes = Buffer.from(`${canonical(envelope)}\n`);
  const digest = sha256(bytes);
  const destination = path.join(directory,
    `row6-post1137-checkpoint-${digest}.json`);
  fs.writeFileSync(destination, bytes, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, sha256: digest, bytes: bytes.length };
}

async function worker(payload) {
  const prepared = readPrepared(payload.preparedPath).value;
  const gate = readGzipOwner(payload.gatePath, GATE_COMPRESSED_SHA256,
    GATE_SHA256, "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1").value;
  const factor = readGzipOwner(payload.factorPath, FACTOR_COMPRESSED_SHA256,
    FACTOR_SHA256, "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1").value;
  validateBoundary(prepared, gate, factor);
  const host = require("./row6_post1137_terminal_host.cjs");
  const started = process.hrtime.bigint();
  const result = validateResult(await host.runRow6Post1137TerminalFromOwners(
    gate, factor, prepared));
  const elapsedNs = process.hrtime.bigint() - started;
  const receipt = writeEnvelope(payload.outputDirectory, result, {
    elapsedNs: String(elapsedNs), maxRssKiB: process.resourceUsage().maxRSS,
    addressSpaceCeilingBytes: "4294967296", rssCeilingBytes: "4294967296",
    cpuLimitSeconds: 600, wallTimeoutSeconds: 600, nodeOldSpaceMiB: 3072,
  });
  process.stdout.write(`${canonical(receipt)}\n`);
}

function validateEnvelope(envelope) {
  assert.equal(envelope.schema,
    "sagejs.pari-class-group/row6-post1137-checkpoint-owner-v1");
  assert.deepEqual(envelope.authority, {
    preparedAuthoritySha256: PREPARED_AUTHORITY_SHA256,
    gateOwnerSha256: GATE_SHA256,
    factorOwnerSha256: FACTOR_SHA256,
  });
  validateResult(envelope.result);
  assert.equal(envelope.completeness.correspondenceComplete, false);
  assert.equal(envelope.completeness.publicComplete, false);
  return envelope;
}

function readCheckpoint(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(fs.statSync(file).mode & 0o222, 0,
    "accepted checkpoint owner is mutable");
  const envelope = validateEnvelope(JSON.parse(bytes));
  return { bytes, envelope, sha256: sha256(bytes) };
}

function readOracleAfterCompute(w0Path) {
  const digest = spawnSync("sha256sum", [w0Path], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000,
  });
  assert.equal(digest.status, 0, digest.stderr || String(digest.error));
  assert.equal(digest.stdout.split(/\s+/)[0], W0_SHA256);
  const query = spawnSync("jq", ["-c",
    "{acceptance:(.events[]|select(.event==\"acceptance\")|" +
      "{code,h,exactR,lattice,rng})," +
    "units:(.events[]|select(.event==\"fundamental_units\")|" +
      "{A,U,CU,fu,regulator})," +
    "result:(.events[]|select(.event==\"result\"))}", w0Path], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(query.status, 0, query.stderr || String(query.error));
  return JSON.parse(query.stdout);
}

function flattenIntegerMatrix(matrix) {
  assert.equal(matrix.kind, "matrix");
  return matrix.values.flatMap((column) => column.values.map((value) => {
    assert.equal(value.kind, "integer");
    return String(value.value);
  }));
}

function main() {
  if (process.argv[2] === "--worker") {
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  }
  const options = parseArguments(process.argv.slice(2));
  const prepared = readPrepared(options.prepared).value;
  const gate = readGzipOwner(options.gate, GATE_COMPRESSED_SHA256, GATE_SHA256,
    "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1").value;
  const factor = readGzipOwner(options.factor, FACTOR_COMPRESSED_SHA256, FACTOR_SHA256,
    "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1").value;
  validateBoundary(prepared, gate, factor);
  let mutationsRejected = rejectInputMutations(prepared, gate, factor);

  let checkpoint;
  if (options.postcomputeOutput) {
    // A previously computed host result may be sealed without rerunning the
    // expensive compiler.  This path is explicitly postcompute evidence; it
    // does not claim a capped timing measurement.
    const postcomputeBytes = fs.readFileSync(options.postcomputeOutput);
    const result = validateResult(JSON.parse(postcomputeBytes));
    const directory = options.outputDirectory ||
      fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-post1137-check-"));
    const receipt = writeEnvelope(directory, result, {
      acceptedPostcomputeOutput: path.resolve(options.postcomputeOutput),
      acceptedPostcomputeSha256: sha256(postcomputeBytes),
      cappedExecutionMeasured: false,
    });
    checkpoint = readCheckpoint(receipt.path);
    assert.equal(checkpoint.sha256, receipt.sha256);
  } else {
    const directory = options.outputDirectory ||
      fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-post1137-check-"));
    const run = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296",
      "--cpu=600", "--", process.execPath, "--expose-gc", __filename, "--worker"], {
      cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 8 * 1024 * 1024,
      input: canonical({ preparedPath: options.prepared, gatePath: options.gate,
        factorPath: options.factor, outputDirectory: directory }),
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
    });
    assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
    const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
    checkpoint = readCheckpoint(receipt.path);
    assert.equal(checkpoint.sha256, receipt.sha256);
    assert.equal(checkpoint.bytes.length, receipt.bytes);
    assert(checkpoint.envelope.execution.maxRssKiB < 4 * 1024 * 1024);
    assert(BigInt(checkpoint.envelope.execution.elapsedNs) < 600_000_000_000n);
  }

  const changedAuthority = structuredClone(checkpoint.envelope);
  changedAuthority.authority.gateOwnerSha256 = "0".repeat(64);
  assert.throws(() => validateEnvelope(changedAuthority));
  mutationsRejected += 1;
  const changedResult = structuredClone(checkpoint.envelope);
  changedResult.result.classNumber = "8";
  assert.throws(() => validateResult(changedResult.result));
  mutationsRejected += 1;
  const changedBytes = Buffer.from(checkpoint.bytes);
  changedBytes[changedBytes.length - 2] ^= 1;
  assert.notEqual(sha256(changedBytes), checkpoint.sha256);
  mutationsRejected += 1;

  // This is intentionally the first access to W0 in the main computation.
  const oracle = readOracleAfterCompute(options.w0);
  assert.equal(oracle.acceptance.code, 0);
  assert.equal(String(oracle.acceptance.h), "4");
  assert.deepEqual([
    String(oracle.acceptance.exactR.mantissa),
    String(oracle.acceptance.exactR.precision),
    String(oracle.acceptance.exactR.exponent),
  ], EXPECTED_REGULATOR);
  assert.deepEqual(flattenIntegerMatrix(oracle.acceptance.lattice),
    EXPECTED_UNIT_LATTICE);
  assert.deepEqual(oracle.result.invariants.map(String), ["2", "2"]);
  assert.equal(String(oracle.result.classNumber), "4");
  assert.equal(oracle.units.fu, null);
  assert.deepEqual([oracle.units.A.values.length,
    oracle.units.A.values[0].values.length], [2, 3]);
  assert.deepEqual([oracle.units.U.values.length,
    oracle.units.U.values[0].values.length], [2, 7]);
  assert.equal(oracle.units.CU.values.length, 0);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/row6-post1137-check-v1",
    owner: checkpoint.envelope,
    ownerSha256: checkpoint.sha256,
    ownerBytes: checkpoint.bytes.length,
    mutationsRejected,
    postcomputeDifferential: {
      w0Sha256: W0_SHA256, analyticAcceptance: true,
      classNumber: "4", invariants: ["2", "2"],
      regulator: EXPECTED_REGULATOR,
      compactFundamentalUnitShape: [7, 2],
      fundamentalUnitsMaterialized: false,
    },
    runtimeInputs: ["authenticated prepared projection", "immutable Gate-C owner",
      "immutable factor-base owner"],
    excludedRuntimeInputs: ["W0", "class generators", "class witnesses",
      "fundamental-unit transform", "C7 result"],
  }, null, 2));
}

Promise.resolve(main()).catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
