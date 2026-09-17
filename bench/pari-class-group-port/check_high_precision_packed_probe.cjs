"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const TARGET_BITS = 153088;
const RSS_ABORT_KIB = 3584 * 1024;
const RSS_HARD_KIB = 4096 * 1024;
const TIMEOUT_MS = 10 * 60 * 1000;
const sha = (value) => createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function pristineOracle(stage) {
  const pari = path.resolve(
    process.env.PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  );
  const archive = path.resolve(
    process.env.PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  assert.equal(
    sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  assert.equal(
    sha(fs.readFileSync(path.join(pari, "src/basemath/trans1.c"))),
    "287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835",
  );
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-high-packed-oracle-"),
  );
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#include "pari.h"
static void emit(GEN x){long d=0;if(!signe(x))printf("0 0 %ld\\n",expo(x));else pari_printf("%Ps %ld %ld\\n",mantissa_real(x,&d),bit_prec(x),expo(x));}
int main(void){pari_init(268435456,10000);long bits=${TARGET_BITS};pari_sp av=avma;GEN p=mppi(bits),l=mplog2(bits),e=mpexp(l);emit(p);emit(l);emit(e);if(${stage === "complex" ? 1 : 0}){GEN s,c,one=itor(gen_1,nbits2prec(bits));mpsincos(one,&s,&c);emit(mulrr(e,c));emit(mulrr(e,s));}avma=av;pari_close();return 0;}`,
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
  const values = trace.trim().split(/\s+/).map(BigInt);
  assert.equal(values.length, stage === "complex" ? 15 : 9);
  return { values, traceSha256: sha(trace) };
}

const values = (buffer) =>
  (Array.isArray(buffer)
    ? buffer
    : buffer.toArray
      ? buffer.toArray()
      : Array.from(buffer)
  ).map(BigInt);

function allocate(api, outputLength) {
  const integer = (length, capacity) =>
    api.createIntegerBuffer(length, capacity, Array(length).fill(0n));
  return {
    piCache: integer(3, 200000),
    logCache: integer(3, 200000),
    a: integer(16385, 128),
    b: integer(16385, 128),
    p: integer(16385, 128),
    q: integer(16385, 128),
    stack: integer(105, 1000000),
    output: integer(outputLength, 200000),
    state: api.createInt64Buffer(Array(4).fill(0n)),
  };
}

async function worker(stage) {
  assert(["real", "complex"].includes(stage));
  const oracle = pristineOracle(stage);
  const buildStart = process.hrtime.bigint();
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "high_precision_packed_probe.py"),
  });
  const buildMilliseconds = Number(process.hrtime.bigint() - buildStart) / 1e6;
  const module = require(built.modulePath);
  const api =
    stage === "real"
      ? module.pari_high_precision_real_probe
      : module.pari_high_precision_complex_probe;
  assert(api.nativeAvailable);
  const outputLength = stage === "real" ? 9 : 15;
  const storage = allocate(api, outputLength);
  const heldOutput = values(storage.output);
  const heldState = values(storage.state);
  assert.throws(
    () =>
      api.gmp(
        BigInt(TARGET_BITS),
        storage.piCache,
        storage.logCache,
        storage.a,
        storage.b,
        storage.p,
        storage.q,
        api.createIntegerBuffer(104, 1000000),
        storage.output,
        storage.state,
      ),
    /requires 105 entries/,
  );
  assert.deepEqual(values(storage.output), heldOutput);
  assert.deepEqual(values(storage.state), heldState);
  const runStart = process.hrtime.bigint();
  assert.equal(
    api.gmp(
      BigInt(TARGET_BITS),
      storage.piCache,
      storage.logCache,
      storage.a,
      storage.b,
      storage.p,
      storage.q,
      storage.stack,
      storage.output,
      storage.state,
    ),
    0n,
  );
  const runMilliseconds = Number(process.hrtime.bigint() - runStart) / 1e6;
  const actual = values(storage.output);
  assert.deepEqual(actual, oracle.values);
  assert.deepEqual(values(storage.state), [
    stage === "real" ? 1n : 2n,
    BigInt(TARGET_BITS),
    16384n,
    105n,
  ]);
  assert.throws(
    () =>
      api.gmp(
        153024n,
        storage.piCache,
        storage.logCache,
        storage.a,
        storage.b,
        storage.p,
        storage.q,
        storage.stack,
        storage.output,
        storage.state,
      ),
    /unsupported high-precision probe target/,
  );
  assert.deepEqual(values(storage.output), actual);
  return {
    stage,
    targetBits: TARGET_BITS,
    backend: "gmp",
    exactPackedTriples: outputLength / 3,
    outputSha256: sha(actual.map(String).join("\n")),
    oracleTraceSha256: oracle.traceSha256,
    buildMilliseconds,
    runMilliseconds,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    addonBytes: fs.statSync(built.addonPath).size,
    cacheKey: built.cacheKey,
    transactionalUndersizeRejection: true,
    rejectedNonTargetPrecision: 153024,
  };
}

function processTreeRss(rootPid) {
  const listing = spawnSync("ps", ["-e", "-o", "pid=,ppid=,rss="], {
    encoding: "utf8",
  });
  if (listing.status !== 0) return 0;
  const rows = listing.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.trim().split(/\s+/).map(Number));
  const wanted = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) {
      if (wanted.has(ppid) && !wanted.has(pid)) {
        wanted.add(pid);
        changed = true;
      }
    }
  }
  return rows.reduce((sum, [pid, , rss]) => sum + (wanted.has(pid) ? rss : 0), 0);
}

function monitored(stage) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "prlimit",
      [
        `--as=${RSS_HARD_KIB * 1024}`,
        "--",
        process.execPath,
        __filename,
        "--worker",
        stage,
      ],
      {
        detached: true,
        env: {
          ...process.env,
          SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-high-packed-cache",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let peakRssKiB = 0;
    let stopped = false;
    const started = Date.now();
    const timer = setInterval(() => {
      const rss = processTreeRss(child.pid);
      peakRssKiB = Math.max(peakRssKiB, rss);
      if (rss > RSS_ABORT_KIB || Date.now() - started > TIMEOUT_MS) {
        stopped = true;
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
    }, 250);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearInterval(timer);
      if (stopped || code !== 0) {
        reject(
          new Error(
            `${stage} probe failed code=${code} signal=${signal} peakRssKiB=${peakRssKiB}\n${stderr}`,
          ),
        );
        return;
      }
      const lines = stdout.trim().split("\n");
      const result = JSON.parse(lines.at(-1));
      result.peakAggregateRssKiB = peakRssKiB;
      result.wallMilliseconds = Date.now() - started;
      result.resourcePolicy = {
        abortGiB: 3.5,
        hardGiB: RSS_HARD_KIB / (1024 * 1024),
        timeoutSeconds: TIMEOUT_MS / 1000,
        oneBackendAtATime: true,
      };
      resolve(result);
    });
  });
}

(async () => {
  if (process.argv[2] === "--worker") {
    console.log(JSON.stringify(await worker(process.argv[3])));
    return;
  }
  const stages = process.argv[2] ? [process.argv[2]] : ["real", "complex"];
  const results = [];
  for (const stage of stages) results.push(await monitored(stage));
  console.log(
    JSON.stringify(
      {
        schema: "sagejs-high-precision-packed-probe-v1",
        pariVersion: "2.17.4",
        targetBits: TARGET_BITS,
        neutralInputs: ["pi", "log(2)", "exp(log(2))", "exp(log(2)+i)"],
        results,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
