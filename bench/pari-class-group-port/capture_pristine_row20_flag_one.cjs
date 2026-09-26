#!/usr/bin/env node
"use strict";

// Builds the compact authority producer against the pinned pristine PARI and
// performs one untimed, resource-bounded, cold-process flag-one call.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HERE = __dirname;
const SOURCE = path.join(HERE, "pari_compact_flag_one_row20_authority.c");
const ARCHIVE_SHA256 = "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const BUCH2_SHA256 = "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const LIMIT_BYTES = 4 * 1024 * 1024 * 1024;
const LIMIT_SECONDS = 600;

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function fileDigest(filename) { return sha256(fs.readFileSync(filename)); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function canonicalBytes(value) { return Buffer.from(JSON.stringify(canonical(value))); }

function main() {
  assert.equal(process.platform, "linux");
  const output = process.argv[2];
  assert(output, "usage: capture_pristine_row20_flag_one.cjs OUTPUT.json");
  const pariRoot = path.resolve(process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.SAGEJS_PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
  const buch2 = path.join(pariRoot, "src/basemath/buch2.c");
  const libraryDirectory = path.join(pariRoot, "Olinux-x86_64");
  const library = fs.realpathSync(path.join(libraryDirectory, "libpari.so"));
  assert.equal(fileDigest(archive), ARCHIVE_SHA256, "wrong pristine PARI archive");
  assert.equal(fileDigest(buch2), BUCH2_SHA256, "wrong pristine bnfinit source");

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-pristine-row20-flag-one-"));
  try {
    const executable = path.join(temporary, "authority");
    const compiler = process.env.CC || "cc";
    const compilerArgs = ["-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
      `-I${path.join(pariRoot, "src/headers")}`, `-I${libraryDirectory}`, SOURCE,
      `-L${libraryDirectory}`, `-Wl,-rpath,${libraryDirectory}`, "-lpari", "-lm", "-o", executable];
    const recordedCompilerArgs = ["-O3", "-Wall", "-Wextra", "-fno-strict-aliasing", "-DNDEBUG",
      "-I$PARI_ROOT/src/headers", "-I$PARI_ROOT/Olinux-x86_64",
      "bench/pari-class-group-port/pari_compact_flag_one_row20_authority.c",
      "-L$PARI_ROOT/Olinux-x86_64", "-Wl,-rpath,$PARI_ROOT/Olinux-x86_64", "-lpari", "-lm",
      "-o", "$TEMPORARY/authority"];
    const built = spawnSync(compiler, compilerArgs, { encoding: "utf8", timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024 });
    assert.equal(built.status, 0, built.stderr || String(built.error));

    const run = spawnSync("prlimit", [`--as=${LIMIT_BYTES}`, `--cpu=${LIMIT_SECONDS}`, executable], {
      encoding: "utf8", timeout: LIMIT_SECONDS * 1000, maxBuffer: 16 * 1024 * 1024,
      env: { PATH: process.env.PATH, LANG: "C", LC_ALL: "C", OMP_NUM_THREADS: "1",
        OMP_DYNAMIC: "FALSE", OPENBLAS_NUM_THREADS: "1" },
    });
    assert.equal(run.signal, null, `authority terminated by ${run.signal}`);
    assert.equal(run.status, 0, run.stderr || String(run.error));
    const record = JSON.parse(run.stdout);
    assert.equal(record.call.timed, false);

    const authority = {
      schema: "sagejs.pari-class-group/pristine-row20-flag-one-authority-v1",
      diagnosticOnly: true,
      qualifiedTiming: false,
      execution: { coldProcess: true, calls: 1, addressSpaceLimitBytes: String(LIMIT_BYTES),
        cpuLimitSeconds: String(LIMIT_SECONDS), wallTimeoutSeconds: String(LIMIT_SECONDS) },
      provenance: { archiveSha256: ARCHIVE_SHA256, buch2Sha256: BUCH2_SHA256,
        librarySha256: fileDigest(library), producerSourceSha256: fileDigest(SOURCE),
        executableSha256: fileDigest(executable), compiler, compilerArguments: recordedCompilerArgs },
      run: record,
    };
    const bytes = canonicalBytes(authority);
    fs.writeFileSync(output, Buffer.concat([bytes, Buffer.from("\n")]), { flag: "wx", mode: 0o444 });
    process.stdout.write(`${JSON.stringify({ output: path.resolve(output), bytes: bytes.length + 1,
      sha256: sha256(Buffer.concat([bytes, Buffer.from("\n")])) })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main();
