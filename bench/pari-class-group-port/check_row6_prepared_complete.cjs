#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_PREPARED = "/tmp/row6-prepared-projection.json";
const DEFAULT_GATE =
  "/tmp/sagejs-row6-gate-c-eQS861/owner/row6-prepared-gate-c-6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98.json.gz";
const DEFAULT_FACTOR =
  "/tmp/sagejs-row6-factor-base-hy2P4R/owner/row6-prepared-factor-base-1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef.json.gz";
const DEFAULT_W0 =
  "/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json";
const DEFAULT_OUTPUT = "/tmp/sagejs-row6-prepared-complete-owner";
const W0_SHA256 =
  "2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5";
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

function readInputs(payload) {
  const preparedBytes = fs.readFileSync(payload.preparedPath);
  const gateCompressed = fs.readFileSync(payload.gatePath);
  const factorCompressed = fs.readFileSync(payload.factorPath);
  const host = require("./row6_terminal_transaction_host.cjs");
  assert.equal(sha256(preparedBytes), host.PREPARED_SHA256);
  assert.equal(sha256(gateCompressed), host.GATE_COMPRESSED_SHA256);
  assert.equal(sha256(factorCompressed), host.FACTOR_COMPRESSED_SHA256);
  assert.equal(fs.statSync(payload.gatePath).mode & 0o222, 0);
  assert.equal(fs.statSync(payload.factorPath).mode & 0o222, 0);
  const prepared = JSON.parse(preparedBytes);
  const gate = JSON.parse(zlib.gunzipSync(gateCompressed));
  const factor = JSON.parse(zlib.gunzipSync(factorCompressed));
  host.validateOwners(prepared, gate, factor);
  return { host, prepared, gate, factor };
}

async function worker(payload) {
  const { host, prepared, gate, factor } = readInputs(payload);
  const receipt = await host.runPreparedComplete(
    prepared,
    gate,
    factor,
    payload.outputDirectory,
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

function rejectBoundaryMutations(prepared, gate, factor) {
  const host = require("./row6_terminal_transaction_host.cjs");
  let rejected = 0;
  const reject = (mutate) => {
    const values = {
      prepared: structuredClone(prepared),
      gate: structuredClone(gate),
      factor: structuredClone(factor),
    };
    mutate(values);
    assert.throws(() =>
      host.validateOwners(values.prepared, values.gate, values.factor));
    rejected += 1;
  };
  reject((x) => { x.prepared.authoritySha256 = "0".repeat(64); });
  reject((x) => { x.gate.final.relations[0] = "1"; });
  reject((x) => { x.factor.factor.packetIdeals[0] = "1"; });
  return rejected;
}

function postcomputeDifferential(w0Path) {
  const digest = spawnSync("sha256sum", [w0Path], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 600_000,
  });
  assert.equal(digest.status, 0, digest.stderr || String(digest.error));
  assert.equal(digest.stdout.split(/\s+/)[0], W0_SHA256);
  const query = spawnSync(
    "jq",
    [
      "-c",
      "{result:(.events[]|select(.event==\"result\")),units:(.events[]|select(.event==\"fundamental_units\")|{fu,regulator})}",
      w0Path,
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(query.status, 0, query.stderr || String(query.error));
  const oracle = JSON.parse(query.stdout);
  assert.deepEqual(oracle.result.invariants.map(String), ["2", "2"]);
  assert.equal(String(oracle.result.classNumber), "4");
  assert.equal(oracle.units.fu, null);
  return {
    classNumber: "4",
    fundamentalUnits: "not materialized",
    invariants: ["2", "2"],
    w0Sha256: W0_SHA256,
  };
}

function main() {
  if (process.argv[2] === "--worker") {
    return worker(JSON.parse(fs.readFileSync(0, "utf8")));
  }
  const preparedPath = path.resolve(process.argv[2] || DEFAULT_PREPARED);
  const gatePath = path.resolve(process.argv[3] || DEFAULT_GATE);
  const factorPath = path.resolve(process.argv[4] || DEFAULT_FACTOR);
  const w0Path = path.resolve(process.argv[5] || DEFAULT_W0);
  const outputDirectory = path.resolve(process.argv[6] || DEFAULT_OUTPUT);
  const { prepared, gate, factor } = readInputs({
    preparedPath,
    gatePath,
    factorPath,
  });
  let mutationsRejected = rejectBoundaryMutations(prepared, gate, factor);
  const run = spawnSync(
    "prlimit",
    [
      "--as=4294967296",
      "--rss=4294967296",
      "--cpu=600",
      "--",
      process.execPath,
      "--expose-gc",
      __filename,
      "--worker",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      input: JSON.stringify({ preparedPath, gatePath, factorPath, outputDirectory }),
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
    },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const receipt = JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(
    receipt.schema,
    "sagejs.pari-class-group/row6-prepared-complete-receipt-v1",
  );
  assert.equal(receipt.correspondenceComplete, true);
  assert.equal(receipt.publicComplete, false);
  assert.equal(receipt.frozenW0RuntimeInput, false);
  assert.equal(receipt.retainedOwnersRuntimeInputs, true);
  assert.deepEqual(receipt.classGroup, {
    invariantFactors: ["2", "2"],
    classNumber: "4",
  });
  assert.equal(receipt.unitMaterialization, "not_given(LARGE)");
  assert(receipt.maxRssKiB < 4 * 1024 * 1024);
  assert(BigInt(receipt.elapsedNs) < 600_000_000_000n);
  const bytes = fs.readFileSync(receipt.path);
  assert.equal(sha256(bytes), receipt.sha256);
  assert.equal(bytes.length, receipt.bytes);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const envelope = JSON.parse(bytes);
  assert.deepEqual(envelope.payload.classGroup.invariantFactors, ["2", "2"]);
  assert.equal(envelope.payload.classGroup.classNumber, "4");
  const changed = Buffer.from(bytes);
  changed[changed.length - 2] ^= 1;
  assert.notEqual(sha256(changed), receipt.sha256);
  mutationsRejected += 1 + receipt.mutationChecks;

  // The frozen trace is first admitted after the capped transaction exits.
  const differential = postcomputeDifferential(w0Path);
  console.log(JSON.stringify({
    ...receipt,
    mutationChecks: mutationsRejected,
    mutationsRejected,
    postcomputeDifferential: differential,
    limits: {
      addressSpaceBytes: 4 * 1024 ** 3,
      rssBytes: 4 * 1024 ** 3,
      cpuSeconds: 600,
      wallTimeoutSeconds: 600,
      nodeOldSpaceMiB: 3072,
    },
    runtimeInputs: [
      "authenticated prepared-nf projection",
      "immutable prepared factor-base owner",
      "immutable accepted Gate-C owner",
    ],
    excludedRuntimeInputs: [
      "W0",
      "post-1137 answer",
      "column ancestry answer",
      "class witness owner",
      "unit owner",
      "C7 envelope",
    ],
  }, null, 2));
}

Promise.resolve(main()).catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
