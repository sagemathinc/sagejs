// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const TARGET = 153088;
const COLUMNS = 301;
const ROWS = 288;
const TIMEOUT_MS = 10 * 60 * 1000;
const HARD_RSS_KIB = 4 * 1024 * 1024;
const ABORT_RSS_KIB = 3584 * 1024;
const AUTHORITY_SHA = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const INITIAL_SHA = "81b9d3b237e781a697f0ae170554426b363ec2235297407be1deed38ebbbc6fe";
const durable = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const authorityPath = process.env.FIELD3_AUTHORITY ||
  path.join(durable, `authority-${AUTHORITY_SHA}.json`);
const initialPath = process.env.FIELD3_INITIAL ||
  path.join(durable, `initial-collector-fixtures-${INITIAL_SHA}.json`);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const values = (buffer) =>
  (buffer.toArray ? buffer.toArray() : Array.from(buffer)).map(BigInt);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
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
  const initial = JSON.parse(initialBytes).expected[0];
  assert.deepEqual(authority.state.slice(0, 3), [0, ROWS, COLUMNS]);
  return {
    generators: authority.owners.principalGenerators.map(BigInt),
    metadata: authority.owners.relationMetadata.map(BigInt),
    relations: authority.owners.relationRecords.map(BigInt),
    packetNorms: authority.owners.packetNorms.map(BigInt),
    tensor: initial.basisTable.map(BigInt),
  };
}

function determinant4(matrix) {
  const a = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => matrix[4 * column + row]));
  let sign = 1n;
  let denominator = 1n;
  for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
    if (a[pivotIndex][pivotIndex] === 0n) {
      const swap = a.findIndex((row, index) =>
        index > pivotIndex && row[pivotIndex] !== 0n);
      assert.notEqual(swap, -1);
      [a[pivotIndex], a[swap]] = [a[swap], a[pivotIndex]];
      sign = -sign;
    }
    const pivot = a[pivotIndex][pivotIndex];
    for (let row = pivotIndex + 1; row < 4; row += 1) {
      for (let column = pivotIndex + 1; column < 4; column += 1) {
        const numerator =
          a[row][column] * pivot -
          a[row][pivotIndex] * a[pivotIndex][column];
        assert.equal(numerator % denominator, 0n);
        a[row][column] = numerator / denominator;
      }
    }
    denominator = pivot;
  }
  return sign * a[3][3];
}

function authenticateNormConsequences(owner) {
  const norms = [];
  for (let column = 0; column < COLUMNS; column += 1) {
    const element = owner.generators.slice(4 * column, 4 * column + 4);
    const multiplication = Array.from({ length: 16 }, (_, entry) =>
      element.reduce(
        (sum, coefficient, basis) =>
          sum + coefficient * owner.tensor[16 * basis + entry],
        0n,
      ));
    const elementNorm = determinant4(multiplication);
    let idealNorm = 1n;
    for (let row = 0; row < ROWS; row += 1) {
      const exponent = owner.relations[column * ROWS + row];
      assert(exponent >= 0n);
      if (exponent !== 0n) idealNorm *= owner.packetNorms[row] ** exponent;
    }
    assert.equal(elementNorm < 0n ? -elementNorm : elementNorm, idealNorm);
    norms.push(elementNorm);
  }
  return sha(norms.map(String).join("\n"));
}

function pristineReference(owner) {
  const pari = path.resolve(process.env.PARI_ROOT || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(
    process.env.PARI_ARCHIVE || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  assert.equal(
    sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  // All 26 scalar/real-axis source objects, all four non-axis quadrants, one
  // near-axis cancellation case, and the terminal source column.
  const selected = [
    ...Array.from({ length: 26 }, (_, index) => index),
    26, 27, 32, 34, 184, 300,
  ];
  const rows = selected.map((column) => [
    column,
    ...owner.generators.slice(4 * column, 4 * column + 4).map(Number),
  ]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "field3-complex-columns-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(source, String.raw`#include "pari.h"
static const long rows[][5] = {${rows.map((row) => `{${row.join(",")}}`).join(",")}};
static void integer(GEN x){pari_printf("\"%Ps\"",x);}
static void scalar(GEN x){long e=0;if(typ(x)==t_INT){integer(x);printf(",\"-1\",\"0\"");}else{if(!signe(x))printf("\"0\"");else integer(mantissa_real(x,&e));printf(",\"%ld\",\"%ld\"",signe(x)?bit_prec(x):0,expo(x));}}
static void component(GEN x,long imag){if(typ(x)==t_COMPLEX)scalar(gel(x,imag?2:1));else if(imag)scalar(gen_0);else scalar(x);}
static void basis(GEN zk,long n){putchar('[');for(long j=1;j<=n;j++)for(long i=0;i<n;i++){if(j>1||i)putchar(',');integer(polcoef_i(gel(zk,j),i,-1));}putchar(']');}
static void matrix(GEN M,long n,long r1){putchar('[');for(long row=1;row<=r1+2*((n-r1)/2);row++)for(long col=1;col<=n;col++){if(row>1||col>1)putchar(',');GEN z=gcoeff(M,row<=r1?row:r1+(row-r1+1)/2,col);component(z,row>r1&&(row-r1)%2==0);}putchar(']');}
static void pair(GEN x){putchar('[');component(x,0);putchar(',');component(x,1);putchar(']');}
int main(void){pari_init(1073741824,10000);long bits=${TARGET},prec=nbits2prec(bits);GEN pol=gp_read_str("x^4-2000022*x-2000042");GEN nf0=nfinit(pol,nbits2prec(192));GEN zk=nf_get_zkprimpart(nf0),nf=nfnewprec(nf0,prec),M=nf_get_M(nf);GEN probe=cgetg(5,t_COL);for(long j=1;j<=4;j++)gel(probe,j)=stoi(rows[26][j]);GEN probeZ=gel(RgM_RgC_mul(M,probe),3),scalarLog=glog(stoi(2),prec),probeLog=glog(probeZ,prec);printf("{\"requestedBits\":%ld,\"scalarLogBits\":%ld,\"nonAxisInputBits\":%ld,\"nonAxisLogBits\":%ld,\"basis\":",bits,bit_prec(scalarLog),precision(probeZ),bit_prec(gel(probeLog,1)));basis(zk,4);printf(",\"embedding\":");matrix(M,4,2);printf(",\"rows\":[");
for(long k=0;k<(long)(sizeof(rows)/sizeof(rows[0]));k++){if(k)putchar(',');long col=rows[k][0];GEN z;if(col<26)z=stoi(rows[k][1]);else{GEN c=cgetg(5,t_COL);for(long j=1;j<=4;j++)gel(c,j)=stoi(rows[k][j]);z=gel(RgM_RgC_mul(M,c),3);}GEN y=glog(z,prec),raw=gmul2n(y,1);printf("{\"column\":%ld,\"principal\":",col);pair(y);printf(",\"rawKind\":%ld,\"raw\":",typ(raw)==t_COMPLEX?2L:1L);pair(raw);putchar('}');}puts("]}");pari_close();return 0;}
`);
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", [
    "-O2", `-I${path.join(pari, "src/headers")}`, `-I${library}`,
    source, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm",
    "-o", executable,
  ]);
  const trace = run(executable, []);
  return { value: JSON.parse(trace), traceSha256: sha(trace), selected };
}

function flattenReference(row) {
  const principal = row.principal.map(BigInt);
  const rawPair = row.raw.map(BigInt);
  return {
    principal,
    raw: [BigInt(row.rawKind), ...rawPair],
  };
}

function allocate(api, owner, reference) {
  const integer = (length, capacity, data = Array(length).fill(0n)) =>
    api.createIntegerBuffer(length, capacity, data);
  const triples = reference.embedding.map(BigInt);
  return {
    polynomial: integer(5, 64, [-2000042n, -2000022n, 0n, 0n, 1n]),
    basis: integer(16, 64, reference.basis.map(BigInt)),
    embeddingM: integer(16, 200000,
      Array.from({ length: 16 }, (_, index) => triples[3 * index])),
    embeddingP: integer(16, 200000,
      Array.from({ length: 16 }, (_, index) => triples[3 * index + 1])),
    embeddingE: integer(16, 200000,
      Array.from({ length: 16 }, (_, index) => triples[3 * index + 2])),
    embeddingState: api.createInt64Buffer([0n, 153088n, 153152n, 153664n, 2n, 1n]),
    generators: integer(1204, 64, owner.generators),
    metadata: integer(903, 64, owner.metadata),
    relations: integer(86688, 64, owner.relations),
    piCache: integer(3, 200000),
    logCache: integer(3, 200000),
    a: integer(16385, 128), b: integer(16385, 128),
    p: integer(16385, 128), q: integer(16385, 128),
    stack: integer(105, 1000000),
    scratch: integer(52, 200000),
    principal: integer(24, 200000, Array(24).fill(777n)),
    raw: integer(28, 200000, Array(28).fill(777n)),
    state: api.createInt64Buffer(Array(9).fill(777n)),
  };
}

function argumentsFor(storage, start, count, target = TARGET, metadata = storage.metadata) {
  return [
    storage.polynomial, storage.basis, 37n,
    storage.embeddingM, storage.embeddingP, storage.embeddingE,
    storage.embeddingState, storage.generators, metadata, storage.relations,
    BigInt(start), BigInt(count), BigInt(target), storage.piCache,
    storage.logCache, storage.a, storage.b, storage.p, storage.q, storage.stack,
    storage.scratch, storage.principal, storage.raw, storage.state,
  ];
}

async function worker() {
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const owner = owners();
  const normConsequencesSha256 = authenticateNormConsequences(owner);
  // PARI is fully consumed before translated execution starts.
  const reference = pristineReference(owner);
  assert.equal(reference.value.requestedBits, TARGET);
  assert.equal(reference.value.scalarLogBits, TARGET);
  assert.equal(reference.value.nonAxisInputBits, TARGET + 64);
  assert.equal(reference.value.nonAxisLogBits, TARGET + 64);
  const expected = new Map(reference.value.rows.map((row) =>
    [row.column, flattenReference(row)]));
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "field3_complex_log_columns.py"),
  });
  const module = require(built.modulePath);
  const api = module.pari_field3_complex_log_columns;
  const direct = module._pari_field3_complex_log_one;
  assert(api.nativeAvailable && direct.nativeAvailable);
  const storage = allocate(api, owner, reference.value);

  const held = [values(storage.principal), values(storage.raw), values(storage.state)];
  assert.throws(() => api.gmp(...argumentsFor(storage, 0, 1, 153024)),
    /unsupported field-3 complex-log target/);
  assert.deepEqual([values(storage.principal), values(storage.raw), values(storage.state)], held);
  const badMetadataValues = owner.metadata.slice();
  badMetadataValues[0] = 2n;
  const badMetadata = api.createIntegerBuffer(903, 64, badMetadataValues);
  assert.throws(() => api.gmp(...argumentsFor(storage, 0, 1, TARGET, badMetadata)),
    /wrong field-3 relation source order/);
  assert.deepEqual([values(storage.principal), values(storage.raw), values(storage.state)], held);

  const actual = new Map();
  const execute = (start, count) => {
    assert.equal(api.gmp(...argumentsFor(storage, start, count)), 0n);
    const principal = values(storage.principal);
    const raw = values(storage.raw);
    for (let local = 0; local < count; local += 1) {
      actual.set(start + local, {
        principal: principal.slice(6 * local, 6 * local + 6),
        raw: raw.slice(7 * local, 7 * local + 7),
      });
    }
  };
  const started = process.hrtime.bigint();
  for (let start = 0; start < 26; start += 4) execute(start, Math.min(4, 26 - start));
  for (const column of [26, 27, 32, 34, 184, 300]) execute(column, 1);
  const runMilliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  for (const column of reference.selected) assert.deepEqual(actual.get(column), expected.get(column));

  // One authentic non-axis column follows the identical ordinary Python and
  // JavaScript graph.  This does not consume a second PARI oracle.
  const directArguments = [
    values(storage.embeddingM), values(storage.embeddingP), values(storage.embeddingE),
    owner.generators, 26n, BigInt(TARGET),
    Array(3).fill(0n), Array(3).fill(0n),
    ...Array.from({ length: 4 }, () => Array(16385).fill(0n)),
    Array(105).fill(0n),
  ];
  const wanted = [2n, ...expected.get(26).principal];
  assert.deepEqual(direct.javascript(...directArguments), wanted);
  const cpython = run("python3", ["-c", String.raw`
import decimal,importlib,json,sys
sys.set_int_max_str_digits(0)
sys.path[:0]=[sys.argv[1],sys.argv[2]]
q=json.load(sys.stdin);m=importlib.import_module('bench.pari-class-group-port.field3_complex_log_columns')
w=[[0]*3,[0]*3]+[[0]*16385 for _ in range(4)]+[[0]*105]
print(json.dumps(list(map(str,m._pari_field3_complex_log_one(*[list(map(int,x)) for x in q[:4]],26,153088,*w)))))
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], {
    input: JSON.stringify([
      values(storage.embeddingM).map(String), values(storage.embeddingP).map(String),
      values(storage.embeddingE).map(String), owner.generators.map(String),
    ]),
  });
  assert.deepEqual(JSON.parse(cpython).map(BigInt), wanted);

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  for (const operation of ["mpz_mul", "mpz_sqrt", "mpz_fdiv_qr"]) {
    assert(core.includes(operation));
  }
  const durableValue = {
    schema: "sagejs-field3-complex-log-prefix-owner-v1",
    field: "x^4-2000022*x-2000042",
    targetBits: TARGET,
    sourceAuthoritySha256: AUTHORITY_SHA,
    sourceInitialOwnerSha256: INITIAL_SHA,
    pariOracleTraceSha256: reference.traceSha256,
    columns: reference.selected.map((column) => ({
      column,
      principal: actual.get(column).principal.map(String),
      raw: actual.get(column).raw.map(String),
    })),
    remainingSchedule: {
      columns: 301,
      batchWidth: 4,
      starts: "0,4,...,300",
      finalCount: 1,
    },
  };
  const durableBytes = Buffer.from(JSON.stringify(durableValue) + "\n");
  const durableSha256 = sha(durableBytes);
  const durableDirectory = path.join(durable, "translated-log-columns");
  const durablePath = path.join(
    durableDirectory, `complex-log-prefix-${durableSha256}.json`);
  fs.mkdirSync(durableDirectory, { recursive: true });
  if (fs.existsSync(durablePath)) {
    assert.equal(sha(fs.readFileSync(durablePath)), durableSha256);
  } else {
    const temporary = `${durablePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, durableBytes, { flag: "wx" });
    fs.renameSync(temporary, durablePath);
  }
  return {
    schema: "sagejs-field3-complex-log-columns-v1",
    field: "x^4-2000022*x-2000042",
    targetBits: TARGET,
    authoritySha256: AUTHORITY_SHA,
    initialOwnerSha256: INITIAL_SHA,
    normConsequences: 301,
    normConsequencesSha256,
    exactPariDifferentialColumns: reference.selected,
    exactPariDifferentialCount: reference.selected.length,
    scalarAxisColumnsCovered: 26,
    nonAxisQuadrantsCovered: 4,
    nearAxisCancellationColumns: [184],
    terminalColumnsCovered: [300],
    oracleTraceSha256: reference.traceSha256,
    outputSha256: sha(reference.selected.flatMap((column) => [
      ...actual.get(column).principal, ...actual.get(column).raw,
    ]).map(String).join("\n")),
    durablePrefixOwner: { path: durablePath, sha256: durableSha256 },
    dynamicOracles: { cpythonColumns: 1, javascriptColumns: 1 },
    native: { backend: "gmp", runMilliseconds, cacheKey: built.cacheKey },
    transactionalRejections: 2,
    fullSchedule: {
      columns: 301,
      batchWidth: 4,
      batches: 76,
      starts: "0,4,...,300",
      finalCount: 1,
    },
  };
}

function treeRss(rootPid) {
  const listing = spawnSync("ps", ["-e", "-o", "pid=,ppid=,rss="], { encoding: "utf8" });
  if (listing.status !== 0) return 0;
  const rows = listing.stdout.trim().split("\n").filter(Boolean)
    .map((line) => line.trim().split(/\s+/).map(Number));
  const wanted = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) if (wanted.has(ppid) && !wanted.has(pid)) {
      wanted.add(pid); changed = true;
    }
  }
  return rows.reduce((sum, [pid, , rss]) => sum + (wanted.has(pid) ? rss : 0), 0);
}

function monitored() {
  return new Promise((resolve, reject) => {
    const child = spawn("prlimit", [`--as=${HARD_RSS_KIB * 1024}`, "--", process.execPath,
      __filename, "--worker"], {
      detached: true,
      env: { ...process.env, SAGEJS_NATIVE_CACHE_ROOT: "/scratch/sagejs-field3-complex-columns-cache" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", peakAggregateRssKiB = 0, stopped = false;
    const started = Date.now();
    const timer = setInterval(() => {
      peakAggregateRssKiB = Math.max(peakAggregateRssKiB, treeRss(child.pid));
      if (peakAggregateRssKiB > ABORT_RSS_KIB || Date.now() - started > TIMEOUT_MS) {
        stopped = true;
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
    }, 250);
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearInterval(timer);
      if (stopped || code !== 0) return reject(new Error(
        `field3 complex-column probe failed code=${code} signal=${signal} peak=${peakAggregateRssKiB}\n${stderr}`));
      const result = JSON.parse(stdout.trim().split("\n").at(-1));
      result.peakAggregateRssKiB = peakAggregateRssKiB;
      result.wallMilliseconds = Date.now() - started;
      result.resourcePolicy = { abortGiB: 3.5, hardGiB: 4, timeoutSeconds: 600 };
      resolve(result);
    });
  });
}

(async () => {
  if (process.argv[2] === "--norm-only") {
    const owner = owners();
    return console.log(JSON.stringify({
      normConsequences: 301,
      normConsequencesSha256: authenticateNormConsequences(owner),
    }));
  }
  if (process.argv[2] === "--worker") return console.log(JSON.stringify(await worker()));
  console.log(JSON.stringify(await monitored(), null, 2));
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
