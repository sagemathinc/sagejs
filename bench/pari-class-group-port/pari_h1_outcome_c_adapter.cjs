"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { digest } = require("./h1_outcome_c_worker.cjs");

const FIELD_ID = "pari-2.17.4:x^3-20018*x+20034";
const ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const CORRESPONDENCE_COMPLETE_STATUS = "pari-correspondence-complete-internal-h1";
const SOURCE_PATH = path.join(__dirname, "pari_h1_outcome_c_adapter.c");

function fileDigest(filename) {
  return crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function exactKeys(value, keys, name) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${name} has unexpected fields`);
}

function validatePreparedInput(preparedInput) {
  assert.equal(preparedInput.schema, "sagejs.pari-class-group/sanitized-prepared-h1-v1");
  assert.equal(preparedInput.fieldId, FIELD_ID);
  assert(preparedInput.input && typeof preparedInput.input === "object");
  assert.deepEqual(
    preparedInput.input.prep_polynomial.map(String),
    ["20034", "-20018", "0", "1"],
    "prepared polynomial changed",
  );
}

let buildCache = null;

function buildHelper() {
  if (buildCache !== null) return buildCache;
  assert.equal(process.platform, "linux", "authentic PARI timing is currently Linux-only");
  const pariRoot = path.resolve(
    process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  );
  const pariArchive = path.resolve(
    process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  assert.equal(fileDigest(pariArchive), ARCHIVE_SHA256, "wrong pristine PARI 2.17.4 archive");
  assert.equal(
    fileDigest(path.join(pariRoot, "src/basemath/buch2.c")),
    BUCH2_SHA256,
    "PARI bnfinit source differs from the pinned 2.17.4 archive",
  );
  const libraryDirectory = path.join(pariRoot, "Olinux-x86_64");
  const libraryPath = fs.realpathSync(path.join(libraryDirectory, "libpari.so"));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-pari-h1-outcome-c-"));
  const executable = path.join(directory, "pari-h1-outcome-c-adapter");
  const compiler = process.env.CC || "cc";
  const args = [
    "-O3", "-Wall", "-fno-strict-aliasing", "-DNDEBUG",
    `-I${path.join(pariRoot, "src/headers")}`,
    `-I${libraryDirectory}`,
    SOURCE_PATH,
    `-L${libraryDirectory}`,
    `-Wl,-rpath,${libraryDirectory}`,
    "-lpari", "-lm", "-o", executable,
  ];
  const built = spawnSync(compiler, args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(built.status, 0, built.stderr || String(built.error));
  buildCache = Object.freeze({
    pariRoot,
    pariArchive,
    libraryDirectory,
    libraryPath,
    librarySha256: fileDigest(libraryPath),
    sourceSha256: fileDigest(SOURCE_PATH),
    executable,
    executableSha256: fileDigest(executable),
    compiler,
    arguments: args,
  });
  return buildCache;
}

class HelperClient {
  constructor(build) {
    this.build = build;
    this.lines = [];
    this.waiters = [];
    this.stderr = "";
    this.closed = false;
    this.child = spawn(build.executable, [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        LANG: "C",
        LC_ALL: "C",
      },
    });
    this.buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", chunk => { this.stderr += chunk; });
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk;
      for (;;) {
        const newline = this.buffer.indexOf("\n");
        if (newline < 0) break;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        const waiter = this.waiters.shift();
        if (waiter) waiter.resolve(line);
        else this.lines.push(line);
      }
    });
    this.exit = new Promise(resolve => this.child.once("exit", (code, signal) => {
      this.closed = true;
      const error = new Error(
        `PARI h1 helper exited (${code ?? signal}): ${this.stderr}`,
      );
      while (this.waiters.length) this.waiters.shift().reject(error);
      resolve({ code, signal });
    }));
  }

  nextLine() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    assert.equal(this.closed, false, `PARI h1 helper is closed: ${this.stderr}`);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async ready() {
    const line = await this.nextLine();
    assert(line.startsWith("READY "), `PARI h1 helper did not become ready: ${line}`);
    const record = JSON.parse(line.slice(6));
    exactKeys(record, [
      "schema", "fieldId", "pariVersion", "precisionBits",
    ], "PARI ready record");
    assert.deepEqual(record, {
      schema: 1,
      fieldId: FIELD_ID,
      pariVersion: ["2", "17", "4"],
      precisionBits: "192",
    });
  }

  async run(seed) {
    assert.match(seed, /^(0|[1-9][0-9]*)$/);
    this.child.stdin.write(`RUN ${seed}\n`);
    const record = JSON.parse(await this.nextLine());
    exactKeys(record, ["result", "rng", "work"], "PARI run record");
    return record;
  }

  async close() {
    if (this.closed) return;
    this.child.stdin.end("CLOSE\n");
    const { code, signal } = await this.exit;
    assert.equal(signal, null);
    assert.equal(code, 0, this.stderr);
  }
}

async function independentReplay(build, seed) {
  const client = new HelperClient(build);
  await client.ready();
  const record = await client.run(seed);
  await client.close();
  return record;
}

async function preparePreparedH1({ implementation, seed, preparedInput }) {
  assert.equal(implementation, "pari");
  validatePreparedInput(preparedInput);
  const build = buildHelper();
  // This authority run occurs in a separate process. Its nfinit and bnfinit
  // cannot warm or mutate the timed helper.
  const replayRecord = await independentReplay(build, seed);
  const client = new HelperClient(build);
  await client.ready(); // nfinit is now complete; h1_outcome_c_worker has not started its clock.
  return { build, client, replayRecord, seed };
}

async function runPreparedH1({ implementation, seed, preparedInput, preparedState }) {
  assert.equal(implementation, "pari");
  validatePreparedInput(preparedInput);
  assert(preparedState && preparedState.client instanceof HelperClient);
  assert.equal(seed, preparedState.seed);
  const record = await preparedState.client.run(seed);
  assert.deepEqual(record, preparedState.replayRecord, "timed PARI result changed under cold replay");
  const authoritySha256 = digest({
    schema: "sagejs.pari-class-group/h1-cold-replay-authority-v1",
    result: record.result,
    rng: record.rng,
    work: record.work,
  });
  return {
    correspondenceComplete: true,
    result: record.result,
    replay: {
      status: "cold-replay-authenticated",
      resultSha256: digest(record.result),
      authoritySha256,
    },
    rng: record.rng,
    work: record.work,
    terminalStatus: CORRESPONDENCE_COMPLETE_STATUS,
  };
}

async function closePreparedH1(preparedState) {
  if (preparedState?.client) await preparedState.client.close();
}

module.exports = {
  FIELD_ID,
  buildHelper,
  closePreparedH1,
  preparePreparedH1,
  runPreparedH1,
  stageMode: "whole-root-only",
  validatePreparedInput,
};
