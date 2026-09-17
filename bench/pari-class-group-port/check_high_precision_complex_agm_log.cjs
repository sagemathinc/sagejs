// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const TARGET = 153088;
const TIMEOUT_MS = 10 * 60 * 1000;
const HARD_RSS_KIB = 4 * 1024 * 1024;
const ABORT_RSS_KIB = 3584 * 1024;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const values = (buffer) =>
  (buffer.toArray ? buffer.toArray() : Array.from(buffer)).map(BigInt);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function oracle() {
  const pari = path.resolve(
    process.env.PARI_ROOT || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4",
  );
  const archive = path.resolve(
    process.env.PARI_ARCHIVE ||
      "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz",
  );
  assert.equal(
    sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-complex-agm-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#include "pari.h"
GEN logagmcx(GEN,long);
static void emitr(GEN x){long d=0;pari_printf("%Ps %ld %ld ",mantissa_real(x,&d),bit_prec(x),expo(x));}
static void emitc(GEN x){emitr(gel(x,1));emitr(gel(x,2));}
int main(void){pari_init(1073741824,10000);long bits=${TARGET},p=nbits2prec(bits);GEN x[2];
 x[0]=mkcomplex(itor(stoi(3),p),itor(stoi(4),p));
 GEN polynomial=gp_read_str("x^4-2000022*x-2000042");
 GEN nf0=nfinit(polynomial,nbits2prec(192)),nf=nfnewprec(nf0,p);
 x[1]=gtofp(gcoeff(nf_get_M(nf),3,2),p);
 for(long i=0;i<2;i++){pari_sp av=avma;GEN y=logagmcx(x[i],p);emitc(x[i]);emitc(y);printf("\\n");avma=av;}
 pari_close();return 0;}`,
  );
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", [
    "-O2",
    "-I" + path.join(pari, "src/headers"),
    "-I" + library,
    source,
    "-L" + library,
    "-Wl,-rpath," + library,
    "-lpari",
    "-lm",
    "-o",
    executable,
  ]);
  const trace = run(executable, []);
  const rows = trace.trim().split("\n").map((line) =>
    line.trim().split(/\s+/).map(BigInt),
  );
  assert.equal(rows.length, 2);
  for (const row of rows) assert.equal(row.length, 12);
  return { rows, traceSha256: sha(trace) };
}

function allocate(api, rows) {
  const integer = (length, capacity) =>
    api.createIntegerBuffer(length, capacity, Array(length).fill(0n));
  return {
    inputs: api.createIntegerBuffer(
      6 * rows.length,
      200000,
      rows.flatMap((row) => row.slice(0, 6)),
    ),
    piCache: integer(3, 200000),
    logCache: integer(3, 200000),
    a: integer(16385, 128),
    b: integer(16385, 128),
    p: integer(16385, 128),
    q: integer(16385, 128),
    stack: integer(105, 1000000),
    scratch: integer(6 * rows.length, 200000),
    output: integer(6 * rows.length, 200000),
    state: api.createInt64Buffer(Array(4).fill(0n)),
  };
}

async function worker() {
  const reference = oracle();
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "high_precision_complex_agm_log.py"),
  });
  const module = require(built.modulePath);
  const api = module.pari_high_precision_complex_agm_log_batch;
  const direct = module.pari_complex_logarithm_agm;
  assert(api.nativeAvailable && direct.nativeAvailable);
  const input = reference.rows[0].slice(0, 6);
  const expectedOne = reference.rows[0].slice(6);
  const javascriptWorkspace = [
    Array(3).fill(0n),
    Array(3).fill(0n),
    ...Array.from({ length: 4 }, () => Array(16385).fill(0n)),
    Array(105).fill(0n),
  ];
  assert.deepEqual(
    direct.javascript(...input, BigInt(TARGET), ...javascriptWorkspace),
    expectedOne,
  );
  const cpython = run(
    "python3",
    [
      "-c",
      `import importlib,json,sys
sys.set_int_max_str_digits(0)
sys.path.append(${JSON.stringify(path.resolve(__dirname, "../..", "src/lib"))})
m=importlib.import_module('bench.pari-class-group-port.high_precision_complex_agm_log')
x=list(map(int,json.load(sys.stdin)))
w=[[0]*3,[0]*3]+[[0]*16385 for _ in range(4)]+[[0]*105]
print(json.dumps(list(map(str,m.pari_complex_logarithm_agm(*x,${TARGET},*w)))))`,
    ],
    { input: JSON.stringify(input.map(String)) },
  );
  assert.deepEqual(JSON.parse(cpython).map(BigInt), expectedOne);
  const storage = allocate(api, reference.rows);
  const heldOutput = values(storage.output);
  const heldState = values(storage.state);
  const call = (target = BigInt(TARGET), stack = storage.stack) =>
    api.gmp(
      storage.inputs,
      BigInt(reference.rows.length),
      target,
      storage.piCache,
      storage.logCache,
      storage.a,
      storage.b,
      storage.p,
      storage.q,
      stack,
      storage.scratch,
      storage.output,
      storage.state,
    );
  assert.throws(() => call(153024n), /unsupported high-precision/);
  assert.deepEqual(values(storage.output), heldOutput);
  assert.deepEqual(values(storage.state), heldState);
  assert.throws(
    () => call(BigInt(TARGET), api.createIntegerBuffer(104, 1000000)),
    /storage exhausted/,
  );
  assert.deepEqual(values(storage.output), heldOutput);
  assert.deepEqual(values(storage.state), heldState);
  const started = process.hrtime.bigint();
  assert.equal(call(), 0n);
  const runMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  const expected = reference.rows.flatMap((row) => row.slice(6));
  assert.deepEqual(values(storage.output), expected);
  assert.deepEqual(values(storage.state), [0n, BigInt(TARGET), 2n, 1n]);
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  for (const operation of ["mpz_mul", "mpz_sqrt", "mpz_fdiv_qr"]) {
    assert(core.includes(operation), `missing generated ${operation}`);
  }
  console.log(JSON.stringify({
    schema: "sagejs-high-precision-complex-agm-log-v1",
    pariVersion: "2.17.4",
    targetBits: TARGET,
    neutralCases: 1,
    authenticField3Cases: 1,
    authenticField3Embedding: "nf_get_M row 3 column 2 (complex x embedding)",
    authenticField3OwnerSha256:
      "e515b1795d3973f3cebf1e195993fdf1941891ab07670a182488f38c38788b17",
    packedRealTriplesBitExact: 2,
    packedImaginaryTriplesBitExact: 2,
    weightedLogConsumer: "2 * output real triple for the complex-place get_log_embed row",
    oracleTraceSha256: reference.traceSha256,
    outputSha256: sha(expected.map(String).join("\n")),
    runMilliseconds,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    addonBytes: fs.statSync(built.addonPath).size,
    cacheKey: built.cacheKey,
    generatedOperations: ["mpz_mul", "mpz_sqrt", "mpz_fdiv_qr"],
    dynamicOracles: { cpythonComplexValues: 1, javascriptComplexValues: 1 },
    transactionalRejections: 2,
  }));
}

function treeRss(root) {
  const result = spawnSync("ps", ["-e", "-o", "pid=,ppid=,rss="], { encoding: "utf8" });
  if (result.status !== 0) return 0;
  const rows = result.stdout.trim().split("\n").filter(Boolean)
    .map((line) => line.trim().split(/\s+/).map(Number));
  const wanted = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) if (wanted.has(ppid) && !wanted.has(pid)) {
      wanted.add(pid); changed = true;
    }
  }
  return rows.reduce((total, [pid, , rss]) => total + (wanted.has(pid) ? rss : 0), 0);
}

async function monitored() {
  return new Promise((resolve, reject) => {
    const child = spawn("prlimit", [`--as=${HARD_RSS_KIB * 1024}`, "--", process.execPath, __filename, "--worker"],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", peakRssKiB = 0, killed = false;
    const started = Date.now();
    const timer = setInterval(() => {
      peakRssKiB = Math.max(peakRssKiB, treeRss(child.pid));
      if (peakRssKiB > ABORT_RSS_KIB || Date.now() - started > TIMEOUT_MS) {
        killed = true; try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    }, 250);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearInterval(timer);
      if (killed || code !== 0) return reject(new Error(
        `complex AGM probe failed code=${code} signal=${signal} peakRssKiB=${peakRssKiB}\n${stderr}`));
      const result = JSON.parse(stdout.trim().split("\n").at(-1));
      result.peakAggregateRssKiB = peakRssKiB;
      result.wallMilliseconds = Date.now() - started;
      result.resourcePolicy = { abortGiB: 3.5, hardGiB: 4, timeoutSeconds: 600 };
      resolve(result);
    });
  });
}

(async () => {
  if (process.argv[2] === "--oracle") {
    console.log(JSON.stringify(oracle().rows.map((row) => row.map(String))));
    return;
  }
  if (process.argv[2] === "--worker") return worker();
  console.log(JSON.stringify(await monitored(), null, 2));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
