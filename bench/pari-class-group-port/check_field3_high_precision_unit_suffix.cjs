"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const TARGET = 153088;
const TIMEOUT = 10 * 60 * 1000;
const ABORT_KIB = 3584 * 1024;
const HARD_KIB = 4096 * 1024;
const AUTHORITY_SHA = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const INITIAL_SHA = "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const authorityPath = process.env.FIELD3_AUTHORITY || `/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/authority-${AUTHORITY_SHA}.json`;
const initialPath = process.env.FIELD3_INITIAL || `/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/initial-collector-fixtures-${INITIAL_SHA}.json`;
const sha = (value) => createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function owners() {
  const authorityBytes = fs.readFileSync(authorityPath);
  const initialBytes = fs.readFileSync(initialPath);
  assert.equal(sha(authorityBytes), AUTHORITY_SHA);
  assert.equal(sha(initialBytes), INITIAL_SHA);
  const authority = JSON.parse(authorityBytes).authority;
  const initial = JSON.parse(initialBytes);
  assert.deepEqual(authority.state.slice(0, 3), [0, 288, 301]);
  assert.equal(authority.owners.principalGenerators.length, 1204);
  assert.equal(authority.owners.relationMetadata.length, 903);
  assert.equal(authority.owners.relationRecords.length, 86688);
  assert.equal(initial.expected[0].basisTable.length, 64);
  return { owner: authority.owners, basis: initial.expected[0].basisTable };
}

function pristineBoundary() {
  const pari = path.resolve(process.env.PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.env.PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz");
  assert.equal(sha(fs.readFileSync(archive)), "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field3-hp-boundary-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(source, `#include "pari.h"
int main(void){pari_init(268435456,10000);long d=0;GEN x=mplog2(${TARGET});pari_printf("%Ps %ld %ld\\n",mantissa_real(x,&d),bit_prec(x),expo(x));pari_close();return 0;}`);
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O2", "-I" + path.join(pari, "src/headers"), "-I" + library, source, "-L" + library, "-Wl,-rpath," + library, "-lpari", "-lm", "-o", executable]);
  const trace = run(executable, []);
  const [m, p, e] = trace.trim().split(/\s+/).map(BigInt);
  const expected = [];
  for (let place = 0; place < 3; place += 1) {
    expected.push(1n, m, p, e + (place === 2 ? 1n : 0n), 0n, -1n, 0n);
  }
  return { expected, traceSha256: sha(trace) };
}

const values = (buffer) =>
  (Array.isArray(buffer)
    ? buffer
    : buffer.toArray
      ? buffer.toArray()
      : Array.from(buffer)
  ).map(BigInt);

async function worker() {
  // PARI is used only here, before translated execution, to freeze the exact
  // packed scalar boundary.
  const boundary = pristineBoundary();
  const { owner, basis } = owners();
  const built = await compileKernel({ sourcePath: path.join(__dirname, "field3_high_precision_unit_suffix.py") });
  const api = require(built.modulePath).pari_field3_high_precision_scalar_log;
  assert(api.nativeAvailable);
  const I = (length, capacity, data = Array(length).fill(0n)) => api.createIntegerBuffer(length, capacity, data);
  const polynomial = I(5, 64, [-2000042n, -2000022n, 0n, 0n, 1n]);
  const multiplication = I(64, 64, basis.map(BigInt));
  const generators = I(1204, 4096, owner.principalGenerators.map(BigInt));
  const metadata = I(903, 64, owner.relationMetadata.map(BigInt));
  const records = I(86688, 64, owner.relationRecords.map(BigInt));
  const cache = I(3, 200000);
  const a = I(16385, 128), b = I(16385, 128), p = I(16385, 128), q = I(16385, 128);
  const stack = I(105, 1000000), scratch = I(21, 200000);
  const output = I(21, 200000, Array(21).fill(777n));
  const state = api.createInt64Buffer(Array(6).fill(777n));
  const call = (precision, chosenStack = stack, chosenPolynomial = polynomial) => api.gmp(chosenPolynomial, multiplication, generators, metadata, records, BigInt(precision), cache, a, b, p, q, chosenStack, scratch, output, state);
  const held = [values(output), values(state)];
  assert.throws(() => call(TARGET, I(104, 1000000)), /short field-3 high-precision owner or workspace/);
  assert.deepEqual([values(output), values(state)], held);
  assert.throws(() => call(153024), /unsupported field-3 high-precision target/);
  assert.deepEqual([values(output), values(state)], held);
  const wrong = I(5, 64, [-2000041n, -2000022n, 0n, 0n, 1n]);
  assert.throws(() => call(TARGET, stack, wrong), /wrong field-3 polynomial owner/);
  assert.deepEqual([values(output), values(state)], held);
  const started = process.hrtime.bigint();
  assert.equal(call(TARGET), 0n);
  const runMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  assert.deepEqual(values(output), boundary.expected);
  assert.deepEqual(values(state), [0n, 153088n, 1n, 26n, 301n, 300n]);
  // Exercise the ordinary CPython fallback's fail-closed preflight without
  // duplicating the multi-minute positive high-precision computation.
  const py = run("python3", ["-c", String.raw`
import importlib,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.field3_high_precision_unit_suffix')
held=[777]*21;state=[777]*6
try:m.pari_field3_high_precision_scalar_log([],[],[],[],[],153024,[],[],[],[],[],[],[],held,state)
except ValueError as e:assert str(e)=='unsupported field-3 high-precision target'
else:raise AssertionError('unsupported precision accepted')
assert held==[777]*21 and state==[777]*6
print('ok')
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")]);
  assert.equal(py.trim(), "ok");
  return {
    backend: "gmp",
    cpythonPreflight: true,
    exactPackedScalars: 6,
    publishedRelationColumns: 1,
    authenticatedScalarPrefix: 26,
    remainingRelationColumns: 300,
    outputSha256: sha(values(output).map(String).join("\n")),
    oracleTraceSha256: boundary.traceSha256,
    authoritySha256: AUTHORITY_SHA,
    initialOwnerSha256: INITIAL_SHA,
    runMilliseconds,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    addonBytes: fs.statSync(built.addonPath).size,
    transactionalRejection: true,
  };
}

function processTreeRss(rootPid) {
  const listing = spawnSync("ps", ["-e", "-o", "pid=,ppid=,rss="], { encoding: "utf8" });
  if (listing.status !== 0) return 0;
  const rows = listing.stdout.trim().split("\n").filter(Boolean).map((line) => line.trim().split(/\s+/).map(Number));
  const wanted = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) if (wanted.has(ppid) && !wanted.has(pid)) { wanted.add(pid); changed = true; }
  }
  return rows.reduce((sum, [pid, , rss]) => sum + (wanted.has(pid) ? rss : 0), 0);
}

function monitored() {
  return new Promise((resolve, reject) => {
    const child = spawn("prlimit", [`--as=${HARD_KIB * 1024}`, "--", process.execPath, __filename, "--worker"], {
      detached: true,
      env: { ...process.env, SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-field3-hp-unit-cache" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", peak = 0, stopped = false;
    const started = Date.now();
    const timer = setInterval(() => {
      peak = Math.max(peak, processTreeRss(child.pid));
      if (peak > ABORT_KIB || Date.now() - started > TIMEOUT) {
        stopped = true;
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    }, 250);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearInterval(timer);
      if (stopped || code !== 0) return reject(new Error(`probe failed code=${code} signal=${signal} peak=${peak}\n${stderr}`));
      const result = JSON.parse(stdout.trim().split("\n").at(-1));
      result.peakAggregateRssKiB = peak;
      result.wallMilliseconds = Date.now() - started;
      result.resourcePolicy = { abortGiB: 3.5, hardGiB: 4, timeoutSeconds: 600 };
      resolve(result);
    });
  });
}

(async () => {
  if (process.argv[2] === "--worker") return console.log(JSON.stringify(await worker()));
  const result = await monitored();
  console.log(JSON.stringify({
    schema: "sagejs-field3-high-precision-unit-suffix-v1",
    field: "x^4-2000022*x-2000042",
    targetBits: TARGET,
    boundaryBeforeTranslatedExecution: true,
    reusedResident192BitFloats: false,
    acceptedLatticeDerived: false,
    stoppingCut: {
      completed: "first authentic scalar relation-log column",
      missing: "high-precision mixed-quartic embedding rebuild, arbitrary AGM logarithms for 300 columns, and the exact 301x13 accepted-column transform",
    },
    result,
  }, null, 2));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
