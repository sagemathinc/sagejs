#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { authenticatePreparedBundle } = require("./prepared_nf_authentication.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = "sagejs.pari-class-group/panel8-accepted-retry-owner-v1";
const FIELD_ID = "generated-sha256-0857fab7114ab0045f1b91601101549c7b8d854c5c999b91afcb190cd2863363";
const ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const valueDigest = (value) => sha256(JSON.stringify(canonical(value)));

function fail(message) { throw new Error(`panel8 accepted retry: ${message}`); }

function parseArguments(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--") || index + 1 >= argv.length) fail("invalid arguments");
    const key = argv[index].slice(2);
    if (Object.hasOwn(result, key)) fail(`duplicate --${key}`);
    result[key] = argv[index + 1];
  }
  const exact = ["w0", "w0-sha256", "collector", "collector-sha256", "continuation",
    "continuation-sha256", "analytic", "analytic-sha256", "driver", "driver-sha256",
    "append-trace", "append-trace-sha256", "output-dir"];
  if (Object.keys(result).sort().join("\0") !== exact.sort().join("\0")) {
    fail(`required arguments are ${exact.map((key) => `--${key}`).join(", ")}`);
  }
  return result;
}

function readAuthenticated(file, expected, label, immutable = true) {
  if (!/^[0-9a-f]{64}$/.test(expected)) fail(`${label} digest is invalid`);
  const info = fs.statSync(file);
  if (!info.isFile() || (immutable && (info.mode & 0o777) !== 0o444)) {
    fail(`${label} is not ${immutable ? "an immutable mode-0444 " : "a "}file`);
  }
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== expected) fail(`${label} digest changed`);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), path: path.resolve(file) };
}

function sourceSha(name) { return sha256(fs.readFileSync(path.join(__dirname, name))); }

function expectedAncestry(options, preparedAuthority) {
  return {
    preparedW0Sha256: options["w0-sha256"],
    preparedAuthoritySha256: preparedAuthority.sha256,
    collectorArtifactSha256: options["collector-sha256"],
    continuationArtifactSha256: options["continuation-sha256"],
    analyticArtifactSha256: options["analytic-sha256"],
    pristineDriverTraceSha256: options["driver-sha256"],
    enrichedAppendTraceSha256: options["append-trace-sha256"],
    translatedSourceSha256: sourceSha("prepared_class_group_resumable.py"),
    ownerSourceSha256: sourceSha("panel8_accepted_retry_owner.py"),
    pariArchiveSha256: ARCHIVE_SHA256,
    pariBuch2Sha256: BUCH2_SHA256,
  };
}

function verifyOwner(owner, expected = null) {
  assert.equal(owner.schema, SCHEMA, "wrong owner schema");
  assert.deepEqual(Object.keys(owner).sort(), ["ancestry", "field", "preparedBoundary",
    "pristineComparison", "retryPasses", "schema", "terminal", "upstreamAssumption"].sort());
  assert.equal(owner.field.id, FIELD_ID);
  assert.equal(owner.field.panelIndex, 8);
  assert.deepEqual(owner.field.polynomial, ["-20034", "-20018", "0", "0", "1"]);
  assert.deepEqual(owner.field.signature, [2, 1]);
  assert.deepEqual(Object.keys(owner.ancestry).sort(), ["analyticArtifactSha256",
    "collectorArtifactSha256", "continuationArtifactSha256", "enrichedAppendTraceSha256",
    "ownerSourceSha256", "pariArchiveSha256", "pariBuch2Sha256",
    "preparedAuthoritySha256", "preparedW0Sha256", "pristineDriverTraceSha256",
    "translatedSourceSha256"].sort());
  for (const value of Object.values(owner.ancestry)) assert.match(value, /^[0-9a-f]{64}$/);
  assert.equal(owner.ancestry.pariArchiveSha256, ARCHIVE_SHA256);
  assert.equal(owner.ancestry.pariBuch2Sha256, BUCH2_SHA256);
  if (expected) assert.deepEqual(owner.ancestry, expected, "owner ancestry detached");
  assert.deepEqual(owner.retryPasses.map((entry) => entry.relationCount), [150, 151, 152]);
  assert.deepEqual(owner.retryPasses.map((entry) => entry.status), [-200, -200, 0]);
  assert.deepEqual(owner.retryPasses.map((entry) => entry.driverTrace), [
    [150, 5, 0, 0, 10],
    [150, 5, 0, 0, 10, 151, 5, 1, 1, 10],
    [150, 5, 0, 0, 10, 151, 5, 1, 1, 10, 152, 0, 2, 2, 10],
  ]);
  assert.equal(owner.terminal.status, "accepted");
  assert.equal(owner.terminal.classNumber, "1");
  assert.deepEqual(owner.terminal.classInvariants, []);
  assert.deepEqual(owner.terminal.regulator,
    ["5535521411280883888340490680131024664251778663230538321703", "192", "27"]);
  assert.deepEqual(owner.terminal.relationRecordsShape, [143, 152]);
  assert.deepEqual(owner.terminal.generatorsShape, [4, 152]);
  assert.deepEqual(owner.terminal.logEmbeddingsShape, [3, 152]);
  assert.equal(owner.terminal.relationRecords.length, 143 * 152);
  assert.equal(owner.terminal.generators.length, 4 * 152);
  assert.equal(owner.terminal.packedLogEmbeddings.length, 7 * 3 * 152);
  assert.equal(owner.terminal.transformedLogs.length, 7 * 3 * 152);
  assert.deepEqual(owner.terminal.relationLatticeShape, [9, 2]);
  assert.equal(owner.terminal.relationLattice.length, 18);
  for (let index = 0; index < 3; index += 1) {
    const count = 150 + index;
    assert.equal(owner.retryPasses[index].recordsSha256,
      valueDigest(owner.terminal.relationRecords.slice(0, 143 * count)));
    assert.equal(owner.retryPasses[index].generatorsSha256,
      valueDigest(owner.terminal.generators.slice(0, 4 * count)));
    assert.equal(owner.retryPasses[index].logsSha256,
      valueDigest(owner.terminal.packedLogEmbeddings.slice(0, 7 * 3 * count)));
    assert.equal(owner.retryPasses[index].transformedLogs.length, 7 * 3 * count);
    assert.equal(owner.retryPasses[index].transformedLogsSha256,
      valueDigest(owner.retryPasses[index].transformedLogs));
    assert.equal(owner.retryPasses[index].transformedLogsSha256,
      owner.pristineComparison.transformedLogPrefixSha256[index]);
  }
  assert.deepEqual(owner.retryPasses[2].transformedLogs, owner.terminal.transformedLogs);
  assert.deepEqual(owner.pristineComparison.relationCounts, [150, 151, 152]);
  assert.deepEqual(owner.pristineComparison.acceptanceCodes, [1, 1, 0]);
  assert.deepEqual(owner.pristineComparison.exactRegulators, owner.pristineComparison.regulators);
  assert.deepEqual(owner.pristineComparison.exactRegulators[2], owner.terminal.regulator);
  assert.equal(owner.pristineComparison.transformedLogPrefixSha256.length, 3);
  for (const value of owner.pristineComparison.transformedLogPrefixSha256) {
    assert.match(value, /^[0-9a-f]{64}$/);
  }
  assert.equal(owner.pristineComparison.transformedLogPrefixSha256[2],
    valueDigest(owner.terminal.transformedLogs));
  assert.equal(owner.pristineComparison.terminalLatticeSha256,
    valueDigest(owner.terminal.relationLattice));
  assert.equal(owner.pristineComparison.allThreeExactPrefixesCompared, true);
  assert.equal(owner.pristineComparison.terminalStateCompared, true);
  return true;
}

function publish(outputDirectory, value) {
  verifyOwner(value);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = sha256(bytes);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const destination = path.join(outputDirectory, `panel8-accepted-retry-${digest}.json`);
  if (fs.existsSync(destination)) {
    const info = fs.statSync(destination);
    if (!info.isFile() || (info.mode & 0o777) !== 0o444 ||
        sha256(fs.readFileSync(destination)) !== digest) fail("existing owner changed");
  } else {
    const temporary = path.join(outputDirectory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, bytes, { mode: 0o400, flag: "wx" });
      fs.chmodSync(temporary, 0o444);
      fs.renameSync(temporary, destination);
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  return { schema: SCHEMA, path: destination, sha256: digest, bytes: bytes.length };
}

function main() {
  const options = parseArguments(process.argv);
  const w0 = readAuthenticated(options.w0, options["w0-sha256"], "prepared W0", false);
  if (w0.value.schema !== "sagejs.pari-class-group/development-default-driver-trace-v1" ||
      w0.value.field?.id !== FIELD_ID || w0.value.field?.panelIndex !== 8) fail("wrong W0 field");
  const preparedAuthority = authenticatePreparedBundle(w0.value);
  const sources = [
    ["collector", "collector-sha256", "collector artifact"],
    ["continuation", "continuation-sha256", "continuation artifact"],
    ["analytic", "analytic-sha256", "analytic artifact"],
    ["driver", "driver-sha256", "pristine driver trace"],
    ["append-trace", "append-trace-sha256", "enriched append trace"],
  ];
  const loaded = Object.fromEntries(sources.map(([key, digest, label]) =>
    [key, readAuthenticated(options[key], options[digest], label)]));
  assert.deepEqual(loaded.driver.value, w0.value.events,
    "durable pristine driver trace differs from authenticated W0 events");
  const ancestry = expectedAncestry(options, preparedAuthority);

  // The existing source-only checker assembles only prepared inputs, poisons
  // outputs, and independently proves the three computed prefixes against the
  // enriched pristine trace.  The owner module then recomputes from that input
  // file and retains the resulting exact state.
  const replay = spawnSync("prlimit", ["--as=4294967296", "--", process.execPath,
    path.join(__dirname, "check_prepared_class_group_resumable.cjs"),
    loaded.continuation.path, loaded.analytic.path, loaded["append-trace"].path,
    loaded.collector.path, "--source-only"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1536" },
  });
  if (replay.status !== 0) fail((replay.stderr || `source replay exited ${replay.status}`).trim());
  const replaySummary = JSON.parse(replay.stdout);
  if (replaySummary.ownerBytes >= 2 * 1024 ** 3) fail("prepared owner estimate exceeds 2GiB");
  const inputs = path.join(replaySummary.artifactDirectory, "inputs.json");
  if (sha256(fs.readFileSync(inputs)) !==
      "039a5a66312081a568fc7afe02d93108c1389e1eee063419c39b3781c13b8ec6") {
    fail("source-only prepared input identity changed");
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel8-accepted-retry-"));
  const ancestryFile = path.join(temporary, "ancestry.json");
  fs.writeFileSync(ancestryFile, JSON.stringify(ancestry));
  try {
    const script = String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path.insert(0,sys.argv[1]);sys.path.append(sys.argv[2])
m=importlib.import_module('bench.pari-class-group-port.panel8_accepted_retry_owner')
inputs=json.load(open(sys.argv[3])); pristine=json.load(open(sys.argv[4])); ancestry=json.load(open(sys.argv[5]))
json.dump(m.compose_accepted_retry_owner(inputs,pristine['events'],ancestry),sys.stdout,separators=(',',':'))
sys.stdout.write('\n')
`;
    const computed = spawnSync("python3", ["-c", script, ROOT, path.join(ROOT, "src/lib"),
      inputs, options.w0, ancestryFile], {
      cwd: ROOT, encoding: "utf8", timeout: 180_000, maxBuffer: 256 * 1024 * 1024,
    });
    if (computed.status !== 0) fail((computed.stderr || `Python exited ${computed.status}`).trim());
    const owner = JSON.parse(computed.stdout);
    verifyOwner(owner, ancestry);
    process.stdout.write(`${JSON.stringify(publish(options["output-dir"], owner))}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(replaySummary.artifactDirectory, { recursive: true, force: true });
  }
}

module.exports = { FIELD_ID, SCHEMA, valueDigest, verifyOwner };
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
