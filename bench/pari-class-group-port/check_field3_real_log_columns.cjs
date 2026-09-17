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
const COUNT = 28;
const TIMEOUT = 10 * 60 * 1000;
const ABORT_KIB = 3584 * 1024;
const HARD_KIB = 4096 * 1024;
const AUTHORITY_SHA =
  "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const INITIAL_SHA =
  "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const authorityPath =
  process.env.FIELD3_AUTHORITY ||
  `/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/authority-${AUTHORITY_SHA}.json`;
const initialPath =
  process.env.FIELD3_INITIAL ||
  `/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/initial-collector-fixtures-${INITIAL_SHA}.json`;
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
  assert.equal(authority.owners.packetNorms.length, 288);
  assert.equal(initial.expected[0].basisTable.length, 64);
  return { owner: authority.owners, initial };
}

function preparedOwner() {
  const text = run(process.execPath, [
    path.join(__dirname, "check_field3_high_precision_embeddings.cjs"),
    "--oracle",
  ]);
  const value = JSON.parse(text);
  assert.equal(value.runIdentity, "pari-2.17.4:nfinit192->nfnewprec153088:field3");
  assert.equal(value.requestedBits, TARGET);
  assert.equal(value.makeMRootPrecisionBits, TARGET + 64);
  assert.equal(value.makeMTruncation, false);
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
  return { text, value, independent };
}

function pristineLogs(generators) {
  assert.equal(
    sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field3-real-log-pari-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  const rows = Array.from({ length: COUNT }, (_, column) =>
    generators.slice(4 * column, 4 * column + 4).map(String),
  );
  fs.writeFileSync(
    source,
    String.raw`#include "pari.h"
static void emit(GEN x){long d=0;pari_printf("%Ps %ld %ld\n",mantissa_real(x,&d),bit_prec(x),expo(x));}
int main(void){
  pari_init(1073741824,10000);
  long c[${COUNT}][4]={${rows.map((row) => `{${row.join(",")}}`).join(",")}};
  GEN polynomial=gp_read_str("x^4-2000022*x-2000042");
  GEN nf0=nfinit(polynomial,nbits2prec(192));
  GEN nf=nfnewprec(nf0,nbits2prec(${TARGET}));
  GEN M=nf_get_M(nf);
  for(long column=0;column<${COUNT};column++){
    if(column<26){
      GEN z=stoi(c[column][0]);
      GEN y=glog(z,nbits2prec(${TARGET}));
      emit(y);emit(y);
    }else{
      GEN v=cgetg(5,t_COL);
      for(long i=1;i<=4;i++)gel(v,i)=stoi(c[column][i-1]);
      GEN z=RgM_RgC_mul(M,v);
      emit(logr_abs(gel(z,1)));emit(logr_abs(gel(z,2)));
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
  assert.equal(triples.length, 2 * COUNT);
  for (const triple of triples) assert.equal(triple.length, 3);
  return { triples, traceSha256: sha(trace) };
}

function determinant(matrix) {
  const a = matrix.map((row) => [...row]);
  let denominator = 1n;
  let sign = 1n;
  for (let pivot = 0; pivot < 3; pivot += 1) {
    let chosen = pivot;
    while (chosen < 4 && a[chosen][pivot] === 0n) chosen += 1;
    assert(chosen < 4, "singular generator multiplication matrix");
    if (chosen !== pivot) {
      [a[pivot], a[chosen]] = [a[chosen], a[pivot]];
      sign = -sign;
    }
    const value = a[pivot][pivot];
    for (let row = pivot + 1; row < 4; row += 1) {
      for (let column = pivot + 1; column < 4; column += 1) {
        a[row][column] =
          (a[row][column] * value - a[row][pivot] * a[pivot][column]) /
          denominator;
      }
    }
    denominator = value;
  }
  return sign * a[3][3];
}

function power(base, exponent) {
  let result = 1n;
  let x = base;
  let n = exponent;
  while (n > 0n) {
    if (n & 1n) result *= x;
    x *= x;
    n >>= 1n;
  }
  return result;
}

function exactNorms(owner, tensor) {
  const generators = owner.principalGenerators.map(BigInt);
  const records = owner.relationRecords.map(BigInt);
  const norms = owner.packetNorms.map(BigInt);
  const result = [];
  for (let relation = 0; relation < 301; relation += 1) {
    const coefficients = generators.slice(4 * relation, 4 * relation + 4);
    const matrix = Array.from({ length: 4 }, () => Array(4).fill(0n));
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        for (let basis = 0; basis < 4; basis += 1) {
          matrix[row][column] +=
            coefficients[basis] * tensor[16 * basis + 4 * column + row];
        }
      }
    }
    const exact = determinant(matrix);
    let factored = 1n;
    for (let packet = 0; packet < 288; packet += 1) {
      factored *= power(norms[packet], records[288 * relation + packet]);
    }
    assert.equal(exact < 0n ? -exact : exact, factored, `norm ${relation}`);
    result.push(exact);
  }
  return result;
}

function integer(api, length, capacity, data = Array(length).fill(0n)) {
  return api.createIntegerBuffer(length, capacity, data);
}

async function worker() {
  const { owner, initial } = owners();
  const prepared = preparedOwner();
  const oracle = pristineLogs(owner.principalGenerators);
  const tensor = prepared.value.tensor.map(BigInt);
  assert.deepEqual(tensor, initial.expected[0].basisTable.map(BigInt));
  const norms = exactNorms(owner, tensor);

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "field3_real_log_columns.py"),
  });
  const module = require(built.modulePath);
  const api = module.pari_field3_real_log_columns;
  assert(api.nativeAvailable);
  const polynomial = integer(api, 5, 64, prepared.value.polynomial.map(BigInt));
  const signature = api.createInt64Buffer(prepared.value.signature.map(BigInt));
  const basis = integer(api, 16, 64, prepared.value.zk.map(BigInt));
  const multiplication = integer(api, 64, 64, tensor);
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
  const scratch = integer(api, 6 * COUNT, 200000);
  const output = integer(api, 6 * COUNT, 200000, Array(6 * COUNT).fill(777n));
  const state = api.createInt64Buffer(Array(8).fill(777n));
  const call = (
    target = BigInt(TARGET),
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
      target,
      BigInt(COUNT),
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
  assert.throws(() => call(153024n), /unsupported field-3 real-log target/);
  assert.deepEqual([values(output), values(state)], held);
  const badMetadata = [...owner.relationMetadata.map(BigInt)];
  badMetadata[3 * 100] += 1n;
  assert.throws(
    () => call(BigInt(TARGET), integer(api, 903, 64, badMetadata)),
    /wrong field-3 source column order/,
  );
  assert.deepEqual([values(output), values(state)], held);
  assert.throws(
    () => call(BigInt(TARGET), metadata, integer(api, 6 * COUNT - 1, 200000)),
    /short field-3 real-log owner or workspace/,
  );
  assert.deepEqual([values(output), values(state)], held);

  const started = process.hrtime.bigint();
  assert.equal(call(), 0n);
  const runMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  const expected = oracle.triples.flat();
  assert.deepEqual(values(output), expected);
  assert.deepEqual(values(state).slice(0, 6), [
    0n,
    153088n,
    BigInt(COUNT),
    26n,
    BigInt(COUNT - 26),
    BigInt(2 * COUNT),
  ]);
  const expectedEmbedding = Array.from({ length: 16 }, (_, index) =>
    prepared.value.embedding.slice(3 * index, 3 * index + 3).map(BigInt),
  );
  assert.deepEqual(
    values(embeddingM).map((mantissa, index) => [
      mantissa,
      values(embeddingP)[index],
      values(embeddingE)[index],
    ]),
    expectedEmbedding,
  );

  // Positive dynamic checks use the already-computed log(2) cache and avoid
  // duplicating the multi-minute full prefix.  Both paths execute the same
  // ordinary Python source body as the native graph.
  const first = oracle.triples[0];
  const direct = module.pari_field3_real_log_abs;
  const one = 1n << BigInt(TARGET - 1);
  const workspace = [
    Array(3).fill(0n),
    values(logCache),
    ...Array.from({ length: 4 }, () => Array(16385).fill(0n)),
    Array(105).fill(0n),
  ];
  assert.deepEqual(direct.javascript(one, 153088n, 1n, ...workspace), first);
  const cpython = JSON.parse(
    run(
      "python3",
      [
        "-c",
        String.raw`import decimal,importlib,json,sys
sys.set_int_max_str_digits(0);sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.field3_real_log_columns')
q=json.load(sys.stdin);w=[[0]*3,list(map(int,q['cache']))]+[[0]*16385 for _ in range(4)]+[[0]*105]
print(json.dumps(list(map(str,m.pari_field3_real_log_abs(1<<153087,153088,1,*w)))))`,
        root,
        path.join(root, "src/lib"),
      ],
      {
        input: JSON.stringify({ cache: values(logCache).map(String) }),
        env: { ...process.env, PYTHONPATH: "" },
      },
    ),
  ).map(BigInt);
  assert.deepEqual(cpython, first);

  const capsule = {
    schema: "sagejs.pari-class-group/field3-real-log-column-owner-v1",
    runIdentity: prepared.value.runIdentity,
    targetBits: TARGET,
    sourceColumns: COUNT,
    totalColumns: 301,
    scalarColumns: 26,
    nonscalarColumns: COUNT - 26,
    realPlaces: 2,
    layout:
      "source-column-major [real-place-0 triple, real-place-1 triple]; append weighted-complex triple to form 3x301 raw log order",
    packedTriples: values(output).map(String),
    authoritySha256: AUTHORITY_SHA,
    preparedOwnerSha256: sha(
      JSON.stringify({
        polynomial: prepared.value.polynomial,
        signature: prepared.value.signature,
        zkden: prepared.value.zkden,
        zk: prepared.value.zk,
        tensor: prepared.value.tensor,
        requestedBits: prepared.value.requestedBits,
        makeMRootPrecisionBits: prepared.value.makeMRootPrecisionBits,
        makeMTruncation: prepared.value.makeMTruncation,
        makeMRootState: prepared.value.roots,
      }),
    ),
  };
  const capsuleBytes = `${JSON.stringify(capsule)}\n`;
  const capsuleSha256 = sha(capsuleBytes);
  const durableDirectory =
    "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
  const durablePath = path.join(
    durableDirectory,
    `real-log-columns-${capsuleSha256}.json`,
  );
  fs.mkdirSync(durableDirectory, { recursive: true });
  if (fs.existsSync(durablePath)) {
    assert.equal(sha(fs.readFileSync(durablePath)), capsuleSha256);
  } else {
    const temporary = `${durablePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, capsuleBytes, { mode: 0o400 });
    fs.renameSync(temporary, durablePath);
    fs.chmodSync(durablePath, 0o444);
  }
  return {
    owner: {
      schema: capsule.schema,
      runIdentity: capsule.runIdentity,
      layout: capsule.layout,
      durablePath,
      sha256: capsuleSha256,
      bytes: Buffer.byteLength(capsuleBytes),
    },
    result: {
      backend: "gmp",
      exactPackedTriples: 2 * COUNT,
      exactPackedCells: 6 * COUNT,
      scalarColumns: 26,
      nonscalarColumns: COUNT - 26,
      remainingColumns: 301 - COUNT,
      extrapolatedFullRunMinutes: runMilliseconds * (301 / COUNT) / 60000,
      signsHandledAsLogAbs: true,
      agmLogs: Number(values(state)[6]),
      seriesLogs: Number(values(state)[7]),
      exactNormIdentities: norms.length,
      normSha256: sha(norms.map(String).join("\n")),
      embeddingPackedTriplesBitExact: 16,
      independentEmbedding: prepared.independent,
      dynamicOracles: { cpython: 1, javascript: 1 },
      transactionalRejections: 3,
      authoritySha256: AUTHORITY_SHA,
      initialOwnerSha256: INITIAL_SHA,
      pariTraceSha256: oracle.traceSha256,
      outputSha256: sha(expected.map(String).join("\n")),
      capsuleSha256,
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

function monitored() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "prlimit",
      [`--as=${HARD_KIB * 1024}`, "--", process.execPath, __filename, "--worker"],
      {
        detached: true,
        env: {
          ...process.env,
          SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-field3-real-log-cache",
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
            `field3 real-log probe failed code=${code} signal=${signal} peak=${peak}\n${stderr}`,
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
  if (process.argv[2] === "--worker") {
    console.log(JSON.stringify(await worker()));
    return;
  }
  const value = await monitored();
  console.log(
    JSON.stringify(
      {
        schema: "sagejs-field3-real-log-columns-result-v1",
        field: "x^4-2000022*x-2000042",
        targetBits: TARGET,
        complete: false,
        stoppingCut: {
          completed: `${COUNT} source-order columns, including both real places, all 26 scalars, and 2 nonscalars`,
          missing: `${301 - COUNT} source-order columns; no complex component, HNF transform, regulator, or answer-derived data`,
        },
        ...value,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
