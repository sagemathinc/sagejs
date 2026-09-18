"use strict";

// Bounded host adapter for the ordinary-Python row-6 terminal class owner.
// The ancestry producer is deliberately injected: this coordinator never
// substitutes a one-shot HNF transform for source-schedule reverse replay.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const OWNER_SCHEMA =
  "sagejs.pari-class-group/row6-terminal-class-owner-v1";

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function composeInMemory(gate, factor, prepared, ancestry) {
  const program = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(1000000)
sys.path.extend(['src/lib','src/baselib','bench/pari-class-group-port'])
m=importlib.import_module('bench.pari-class-group-port.row6_terminal_class_owner')
x=json.load(sys.stdin)
json.dump(m.compose_row6_terminal_class_owner(x['gate'],x['factor'],x['prepared'],x['ancestry']),sys.stdout,separators=(',',':'))
print()`;
  const run = spawnSync(
    "prlimit",
    [
      "--as=4294967296",
      "--rss=4294967296",
      "--cpu=600",
      "--",
      "python3",
      "-c",
      program,
    ],
    {
      cwd: ROOT,
      input: JSON.stringify({ gate, factor, prepared, ancestry }),
      encoding: "utf8",
      timeout: 600_000,
      maxBuffer: 512 * 1024 * 1024,
    },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout || String(run.error));
  const owner = JSON.parse(run.stdout);
  assert.equal(owner.schema, OWNER_SCHEMA);
  assert.deepEqual(owner.classWitness.classGroup, {
    classNumber: "4",
    invariants: ["2", "2"],
  });
  assert.equal(owner.principalAuthentication.principalEquations, 1137);
  assert.equal(owner.factorBaseAuthentication.reconstructedPrimeIdeals, 1130);
  assert.equal(owner.classWitness.witnesses.length, 2);
  return owner;
}

function writeImmutable(outputDirectory, owner) {
  const bytes = Buffer.from(`${JSON.stringify(owner)}\n`);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(
    outputDirectory,
    `row6-terminal-class-${sha256}.json`,
  );
  if (fs.existsSync(target)) {
    assert(fs.readFileSync(target).equals(bytes), "immutable owner collision");
    assert.equal(fs.statSync(target).mode & 0o222, 0, "owner became mutable");
  } else {
    fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o400 });
    fs.chmodSync(target, 0o444);
  }
  return { path: target, sha256, bytes: bytes.length };
}

function readJson(file) {
  const bytes = fs.readFileSync(file);
  const plain = file.endsWith(".gz") ? zlib.gunzipSync(bytes) : bytes;
  return JSON.parse(plain.toString("utf8"));
}

function main() {
  if (process.argv.length !== 7) {
    throw new Error(
      "usage: row6_terminal_class_coordinator.cjs GATE FACTOR PREPARED ANCESTRY OUTPUT_DIR",
    );
  }
  const [gatePath, factorPath, preparedPath, ancestryPath, outputDirectory] =
    process.argv.slice(2);
  const gate = readJson(gatePath);
  const factor = readJson(factorPath);
  const prepared = readJson(preparedPath);
  const ancestry = readJson(ancestryPath);
  const started = process.hrtime.bigint();
  const owner = composeInMemory(gate, factor, prepared, ancestry);
  const publication = writeImmutable(outputDirectory, owner);
  process.stdout.write(
    `${JSON.stringify({
      ...publication,
      schema: "sagejs.pari-class-group/row6-terminal-class-receipt-v1",
      ownerSchema: OWNER_SCHEMA,
      gateOwnerSha256: hash(gate),
      factorOwnerSha256: hash(factor),
      ancestrySha256: hash(ancestry),
      principalEquations: owner.principalAuthentication.principalEquations,
      reconstructedPrimeIdeals:
        owner.factorBaseAuthentication.reconstructedPrimeIdeals,
      classNumber: owner.classWitness.classGroup.classNumber,
      invariants: owner.classWitness.classGroup.invariants,
      elapsedNs: String(process.hrtime.bigint() - started),
      maxRssKiB: process.resourceUsage().maxRSS,
      limits: {
        addressSpaceGiB: 4,
        rssGiB: 4,
        cpuSeconds: 600,
        wallTimeoutSeconds: 600,
      },
    })}\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
}

module.exports = { OWNER_SCHEMA, composeInMemory, writeImmutable };
