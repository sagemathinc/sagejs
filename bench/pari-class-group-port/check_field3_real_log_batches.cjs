"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const TARGET = 153088;
const TOTAL_COLUMNS = 301;
const SCALAR_COLUMNS = 26;
const MAX_BATCH_COLUMNS = 28;
const TIMEOUT = 10 * 60 * 1000;
const ABORT_KIB = 3584 * 1024;
const HARD_KIB = 4096 * 1024;
const RUN_IDENTITY = "pari-2.17.4:nfinit192->nfnewprec153088:field3";
const AUTHORITY_SHA =
  "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const INITIAL_SHA =
  "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const LEGACY_PREFIX_SHA =
  "09b0a20f1f059757ee3ed347f693fed92fb6749c2d46aac872abcffdd244fde8";
const PARI_ARCHIVE_SHA =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const LAYOUT =
  "source-column-major [real-place-0 triple, real-place-1 triple]; append weighted-complex triple to form 3x301 raw log order";
const durableDirectory =
  process.env.FIELD3_DURABLE_DIRECTORY ||
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const authorityPath =
  process.env.FIELD3_AUTHORITY ||
  path.join(durableDirectory, `authority-${AUTHORITY_SHA}.json`);
const initialPath =
  process.env.FIELD3_INITIAL ||
  path.join(durableDirectory, `initial-collector-fixtures-${INITIAL_SHA}.json`);
const legacyPrefixPath =
  process.env.FIELD3_REAL_LOG_PREFIX ||
  path.join(durableDirectory, `real-log-columns-${LEGACY_PREFIX_SHA}.json`);
const root = path.resolve(__dirname, "../..");
const pari = path.resolve(
  process.env.PARI_ROOT || "/home/user/upstream/pari-2.17.4",
);
const archive = path.resolve(
  process.env.PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const values = (buffer) =>
  (buffer.toArray ? buffer.toArray() : Array.from(buffer)).map(BigInt);
const packedSha = (entries) => sha(entries.map(String).join("\n"));

function argument(name, fallback) {
  const offset = process.argv.indexOf(name);
  if (offset < 0) return fallback;
  assert(offset + 1 < process.argv.length, `missing value for ${name}`);
  const result = Number(process.argv[offset + 1]);
  assert(Number.isSafeInteger(result), `invalid integer for ${name}`);
  return result;
}

function selectedRange() {
  const sourceStart = argument("--source-start", 0);
  const sourceCount = argument("--count", 28);
  assert(
    sourceStart >= 0 &&
      sourceStart < TOTAL_COLUMNS &&
      sourceCount >= 1 &&
      sourceCount <= MAX_BATCH_COLUMNS &&
      sourceStart + sourceCount <= TOTAL_COLUMNS,
    "invalid source_start,count batch",
  );
  return { sourceStart, sourceCount };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function authenticatedOwners() {
  const authorityBytes = fs.readFileSync(authorityPath);
  const initialBytes = fs.readFileSync(initialPath);
  assert.equal(sha(authorityBytes), AUTHORITY_SHA);
  assert.equal(sha(initialBytes), INITIAL_SHA);
  const authority = JSON.parse(authorityBytes).authority;
  const initial = JSON.parse(initialBytes);
  assert.deepEqual(authority.state.slice(0, 3), [0, 288, TOTAL_COLUMNS]);
  assert.equal(authority.owners.principalGenerators.length, 1204);
  assert.equal(authority.owners.relationMetadata.length, 903);
  assert.equal(authority.owners.relationRecords.length, 86688);
  assert.equal(authority.owners.packetNorms.length, 288);
  assert.equal(initial.expected[0].basisTable.length, 64);
  const sourceDigests = {
    principalGeneratorsSha256: packedSha(authority.owners.principalGenerators),
    relationMetadataSha256: packedSha(authority.owners.relationMetadata),
    relationRecordsSha256: packedSha(authority.owners.relationRecords),
  };
  return { owner: authority.owners, initial, sourceDigests };
}

function preparedOwner() {
  const text = run(process.execPath, [
    path.join(__dirname, "check_field3_high_precision_embeddings.cjs"),
    "--oracle",
  ]);
  const value = JSON.parse(text);
  assert.equal(value.runIdentity, RUN_IDENTITY);
  assert.equal(value.requestedBits, TARGET);
  assert.equal(value.makeMRootPrecisionBits, TARGET + 64);
  assert.equal(value.makeMTruncation, false);
  const capsule = {
    polynomial: value.polynomial,
    signature: value.signature,
    zkden: value.zkden,
    zk: value.zk,
    tensor: value.tensor,
    requestedBits: value.requestedBits,
    makeMRootPrecisionBits: value.makeMRootPrecisionBits,
    makeMTruncation: value.makeMTruncation,
    makeMRootState: value.roots,
  };
  const preparedOwnerSha256 = sha(JSON.stringify(capsule));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field3-real-log-owner-"));
  const ownerPath = path.join(directory, "owner.json");
  fs.writeFileSync(ownerPath, text);
  const independent = JSON.parse(
    run("python3", [
      path.join(__dirname, "check_field3_high_precision_embeddings.py"),
      ownerPath,
    ]),
  );
  assert.equal(independent.status, "pass");
  return { text, value, independent, preparedOwnerSha256 };
}

function pristineLogs(generators, sourceStart, sourceCount) {
  assert.equal(sha(fs.readFileSync(archive)), PARI_ARCHIVE_SHA);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field3-real-log-pari-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  const rows = Array.from({ length: sourceCount }, (_, localColumn) =>
    generators
      .slice(
        4 * (sourceStart + localColumn),
        4 * (sourceStart + localColumn + 1),
      )
      .map(String),
  );
  fs.writeFileSync(
    source,
    String.raw`#include "pari.h"
static void emit(GEN x){long d=0;pari_printf("%Ps %ld %ld\n",mantissa_real(x,&d),bit_prec(x),expo(x));}
int main(void){
  pari_init(1073741824,10000);
  long c[${sourceCount}][4]={${rows.map((row) => `{${row.join(",")}}`).join(",")}};
  GEN polynomial=gp_read_str("x^4-2000022*x-2000042");
  GEN nf0=nfinit(polynomial,nbits2prec(192));
  GEN nf=nfnewprec(nf0,nbits2prec(${TARGET}));
  GEN M=nf_get_M(nf);
  for(long local=0;local<${sourceCount};local++){
    long column=${sourceStart}+local;
    if(column<${SCALAR_COLUMNS}){
      GEN z=stoi(c[local][0]); GEN y=glog(z,nbits2prec(${TARGET})); emit(y);emit(y);
    }else{
      GEN v=cgetg(5,t_COL);
      for(long i=1;i<=4;i++)gel(v,i)=stoi(c[local][i-1]);
      GEN z=RgM_RgC_mul(M,v); emit(logr_abs(gel(z,1)));emit(logr_abs(gel(z,2)));
    }
  }
  pari_close();return 0;
}`,
  );
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", [
    "-O2",
    `-I${path.join(pari, "src/headers")}`,
    `-I${library}`,
    source,
    `-L${library}`,
    `-Wl,-rpath,${library}`,
    "-lpari",
    "-lm",
    "-o",
    executable,
  ]);
  const trace = run(executable, []);
  const triples = trace
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(BigInt));
  assert.equal(triples.length, 2 * sourceCount);
  for (const triple of triples) assert.equal(triple.length, 3);
  return { triples, traceSha256: sha(trace) };
}

function integer(api, length, capacity, data = Array(length).fill(0n)) {
  return api.createIntegerBuffer(length, capacity, data);
}

function publishReadOnly(name, bytes) {
  fs.mkdirSync(durableDirectory, { recursive: true });
  const durablePath = path.join(durableDirectory, name);
  const digest = sha(bytes);
  if (fs.existsSync(durablePath)) {
    assert.equal(sha(fs.readFileSync(durablePath)), digest);
    assert.equal(fs.statSync(durablePath).mode & 0o777, 0o444);
  } else {
    const temporary = `${durablePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, bytes, { mode: 0o400, flag: "wx" });
    fs.renameSync(temporary, durablePath);
    fs.chmodSync(durablePath, 0o444);
  }
  return { durablePath, sha256: digest, bytes: Buffer.byteLength(bytes) };
}

function legacyCapsule(packedTriples, preparedOwnerSha256) {
  return {
    schema: "sagejs.pari-class-group/field3-real-log-column-owner-v1",
    runIdentity: RUN_IDENTITY,
    targetBits: TARGET,
    sourceColumns: 28,
    totalColumns: TOTAL_COLUMNS,
    scalarColumns: SCALAR_COLUMNS,
    nonscalarColumns: 2,
    realPlaces: 2,
    layout: LAYOUT,
    packedTriples,
    authoritySha256: AUTHORITY_SHA,
    preparedOwnerSha256,
  };
}

async function worker(sourceStart, sourceCount) {
  const { owner, initial, sourceDigests } = authenticatedOwners();
  const prepared = preparedOwner();
  const oracle = pristineLogs(owner.principalGenerators, sourceStart, sourceCount);
  assert.deepEqual(
    prepared.value.tensor.map(BigInt),
    initial.expected[0].basisTable.map(BigInt),
  );

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "field3_real_log_columns.py"),
  });
  const module = require(built.modulePath);
  const api = module.pari_field3_real_log_columns_batch;
  assert(api.nativeAvailable);
  const polynomial = integer(api, 5, 64, prepared.value.polynomial.map(BigInt));
  const signature = api.createInt64Buffer(prepared.value.signature.map(BigInt));
  const basis = integer(api, 16, 64, prepared.value.zk.map(BigInt));
  const multiplication = integer(api, 64, 64, prepared.value.tensor.map(BigInt));
  const generators = integer(api, 1204, 4096, owner.principalGenerators.map(BigInt));
  const metadata = integer(api, 903, 64, owner.relationMetadata.map(BigInt));
  const records = integer(api, 86688, 64, owner.relationRecords.map(BigInt));
  const embeddingScratch = integer(api, 48, 154112);
  const rootM = integer(api, 4, 154112);
  const rootP = integer(api, 4, 154112);
  const rootE = integer(api, 4, 154112);
  const embeddingM = integer(api, 16, 154112);
  const embeddingP = integer(api, 16, 154112);
  const embeddingE = integer(api, 16, 154112);
  const embeddingState = api.createInt64Buffer(Array(6).fill(0n));
  const piCache = integer(api, 3, 200000);
  const logCache = integer(api, 3, 200000);
  const a = integer(api, 16385, 128);
  const b = integer(api, 16385, 128);
  const p = integer(api, 16385, 128);
  const q = integer(api, 16385, 128);
  const stack = integer(api, 105, 1000000);
  const coordinates = integer(api, 4, 4096);
  const scratch = integer(api, 6 * sourceCount, 200000);
  const output = integer(
    api,
    6 * sourceCount,
    200000,
    Array(6 * sourceCount).fill(777n),
  );
  const state = api.createInt64Buffer(Array(10).fill(777n));
  const call = (
    selectedStart = BigInt(sourceStart),
    selectedCount = BigInt(sourceCount),
    selectedTarget = BigInt(TARGET),
    selectedMetadata = metadata,
    selectedOutput = output,
  ) =>
    api.gmp(
      polynomial,
      signature,
      basis,
      37n,
      multiplication,
      generators,
      selectedMetadata,
      records,
      selectedTarget,
      selectedStart,
      selectedCount,
      embeddingScratch,
      rootM,
      rootP,
      rootE,
      embeddingM,
      embeddingP,
      embeddingE,
      embeddingState,
      piCache,
      logCache,
      a,
      b,
      p,
      q,
      stack,
      coordinates,
      scratch,
      selectedOutput,
      state,
    );

  const held = [values(output), values(state)];
  assert.throws(() => call(-1n), /invalid field-3 real-log source range/);
  assert.throws(() => call(300n, 2n), /invalid field-3 real-log source range/);
  assert.throws(
    () => call(BigInt(sourceStart), BigInt(sourceCount), 153024n),
    /unsupported field-3 real-log target/,
  );
  const badMetadata = owner.relationMetadata.map(BigInt);
  badMetadata[3 * 100] += 1n;
  assert.throws(
    () =>
      call(
        BigInt(sourceStart),
        BigInt(sourceCount),
        BigInt(TARGET),
        integer(api, 903, 64, badMetadata),
      ),
    /wrong field-3 source column order/,
  );
  assert.throws(
    () =>
      call(
        BigInt(sourceStart),
        BigInt(sourceCount),
        BigInt(TARGET),
        metadata,
        integer(api, 6 * sourceCount - 1, 200000),
      ),
    /short field-3 real-log owner or workspace/,
  );
  assert.deepEqual([values(output), values(state)], held);

  const started = process.hrtime.bigint();
  assert.equal(call(), 0n);
  const runMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  const expected = oracle.triples.flat();
  const actual = values(output);
  assert.deepEqual(actual, expected);
  const scalarCount = Math.max(
    0,
    Math.min(sourceStart + sourceCount, SCALAR_COLUMNS) - sourceStart,
  );
  assert.deepEqual(values(state), [
    0n,
    BigInt(TARGET),
    BigInt(sourceStart),
    BigInt(sourceCount),
    BigInt(scalarCount),
    BigInt(sourceCount - scalarCount),
    BigInt(2 * sourceCount),
    values(state)[7],
    values(state)[8],
    BigInt(TOTAL_COLUMNS),
  ]);
  assert.equal(values(state)[7] + values(state)[8], BigInt(2 * sourceCount));

  const packedTriples = actual.map(String);
  let legacyPrefixProof = null;
  if (sourceStart === 0 && sourceCount === 28) {
    const legacyBytes = fs.readFileSync(legacyPrefixPath);
    assert.equal(sha(legacyBytes), LEGACY_PREFIX_SHA);
    const reconstructed = Buffer.from(
      `${JSON.stringify(
        legacyCapsule(packedTriples, prepared.preparedOwnerSha256),
      )}\n`,
    );
    assert(legacyBytes.equals(reconstructed));
    legacyPrefixProof = {
      path: legacyPrefixPath,
      sha256: LEGACY_PREFIX_SHA,
      byteIdentical: true,
      semanticCells: packedTriples.length,
    };
  }

  const capsule = {
    schema: "sagejs.pari-class-group/real-log-column-batch-v1",
    runIdentity: RUN_IDENTITY,
    targetBits: TARGET,
    sourceStart,
    sourceCount,
    sourceStop: sourceStart + sourceCount,
    totalColumns: TOTAL_COLUMNS,
    scalarColumns: scalarCount,
    nonscalarColumns: sourceCount - scalarCount,
    realPlaces: 2,
    layout: LAYOUT,
    packedTriples,
    authoritySha256: AUTHORITY_SHA,
    initialOwnerSha256: INITIAL_SHA,
    preparedOwnerSha256: prepared.preparedOwnerSha256,
    sourceDigests,
  };
  const capsuleBytes = `${JSON.stringify(capsule)}\n`;
  const capsuleSha256 = sha(capsuleBytes);
  const published = publishReadOnly(
    `real-log-batch-${sourceStart}-${sourceCount}-${capsuleSha256}.json`,
    capsuleBytes,
  );
  return {
    owner: {
      schema: capsule.schema,
      runIdentity: RUN_IDENTITY,
      sourceStart,
      sourceCount,
      sourceStop: sourceStart + sourceCount,
      layout: LAYOUT,
      ...published,
    },
    result: {
      backend: "gmp",
      exactPackedTriples: 2 * sourceCount,
      exactPackedCells: 6 * sourceCount,
      scalarColumns: scalarCount,
      nonscalarColumns: sourceCount - scalarCount,
      signsHandledAsLogAbs: true,
      agmLogs: Number(values(state)[7]),
      seriesLogs: Number(values(state)[8]),
      independentEmbedding: prepared.independent,
      transactionalRejections: 5,
      authoritySha256: AUTHORITY_SHA,
      initialOwnerSha256: INITIAL_SHA,
      preparedOwnerSha256: prepared.preparedOwnerSha256,
      sourceDigests,
      pariTraceSha256: oracle.traceSha256,
      outputSha256: packedSha(expected),
      capsuleSha256,
      legacyPrefixProof,
      runMilliseconds,
      coreBytes: fs.statSync(built.coreSourcePath).size,
      addonBytes: fs.statSync(built.addonPath).size,
      cacheKey: built.cacheKey,
    },
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
  return rows.reduce(
    (sum, [pid, , rss]) => sum + (wanted.has(pid) ? rss : 0),
    0,
  );
}

function monitored(sourceStart, sourceCount) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "prlimit",
      [
        `--as=${HARD_KIB * 1024}`,
        "--",
        process.execPath,
        __filename,
        "--worker",
        "--source-start",
        String(sourceStart),
        "--count",
        String(sourceCount),
      ],
      {
        detached: true,
        env: {
          ...process.env,
          SAGEJS_NATIVE_CACHE_ROOT:
            process.env.SAGEJS_NATIVE_CACHE_ROOT ||
            "/scratch/sagejs-field3-real-log-batch-cache",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let peak = 0;
    let stopped = false;
    const started = Date.now();
    const timer = setInterval(() => {
      peak = Math.max(peak, processTreeRss(child.pid));
      if (peak > ABORT_KIB || Date.now() - started > TIMEOUT) {
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
            `field3 real-log batch failed code=${code} signal=${signal} peak=${peak}\n${stderr}`,
          ),
        );
        return;
      }
      const result = JSON.parse(stdout.trim().split("\n").at(-1));
      result.result.peakAggregateRssKiB = peak;
      result.result.wallMilliseconds = Date.now() - started;
      result.result.resourcePolicy = {
        abortGiB: 3.5,
        hardGiB: 4,
        timeoutSeconds: 600,
      };
      resolve(result);
    });
  });
}

(async () => {
  const { sourceStart, sourceCount } = selectedRange();
  if (process.argv.includes("--worker")) {
    console.log(JSON.stringify(await worker(sourceStart, sourceCount)));
    return;
  }
  const value = await monitored(sourceStart, sourceCount);
  const receipt = {
    schema: "sagejs-field3-real-log-batch-receipt-v1",
    field: "x^4-2000022*x-2000042",
    targetBits: TARGET,
    complete: false,
    ...value,
  };
  const receiptBytes = `${JSON.stringify(receipt, null, 2)}\n`;
  const receiptSha256 = sha(receiptBytes);
  receipt.receipt = publishReadOnly(
    `real-log-batch-receipt-${sourceStart}-${sourceCount}-${receiptSha256}.json`,
    receiptBytes,
  );
  console.log(JSON.stringify(receipt, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
