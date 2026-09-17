#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "field3_packed_class_cleanarch.py");
const precision = 192;
const columns = 2;
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 240_000,
    maxBuffer: 128 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};
const values = owner => Array.isArray(owner) ? owner
  : owner.toArray ? owner.toArray() : Array.from(owner);

function pariOracle(input, pari, archive) {
  assert.equal(sha256(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(sha256(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
  const quoted = input.map(value => `"${value}"`).join(",");
  source += String.raw`
static GEN f3_real(const char *m,long p,long e){GEN z=m[0]=='-'?negi(strtoi(m+1)):strtoi(m);if(p<0)return z;if(!signe(z))return real_0(nbits2prec(${precision}));return gmul2n(itor(z,nbits2prec(p)),e+1-p);}
static void f3_scalar(GEN x){long e=0;if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static void f3_entry(GEN x){if(typ(x)==t_COMPLEX){printf("[\"2\",");f3_scalar(gel(x,1));printf(",");f3_scalar(gel(x,2));printf("]");}else{printf("[\"1\",");f3_scalar(x);printf(",[\"0\",-1,0]]");}}
int main(void){
  static const char *v[]={${quoted}};pari_init(512000000,10000);GEN C=cgetg(${columns + 1},t_MAT);long k=0;
  for(long j=1;j<=${columns};j++){GEN c=cgetg(4,t_COL);for(long i=1;i<=3;i++){long kind=atol(v[k++]);GEN re=f3_real(v[k],atol(v[k+1]),atol(v[k+2]));k+=3;GEN im=f3_real(v[k],atol(v[k+1]),atol(v[k+2]));k+=3;gel(c,i)=kind==2?mkcomplex(re,im):re;}gel(C,j)=c;}
  GEN z=cleanarch(C,4,NULL,nbits2prec(${precision}));if(!z)return 2;printf("{\"cleaned\":[");
  for(long j=1;j<=${columns};j++)for(long i=1;i<=3;i++){if(j>1||i>1)putchar(',');f3_entry(gcoeff(z,i,j));}
  long add=nbits2extraprec(gexpo(C)+64)-gprecision(C);printf("],\"retry\":[1,%ld,%ld,%ld,%ld,%ld]}\n",(long)${precision},(long)${precision}+maxss(add,1),maxss(add,1),gexpo(C),gprecision(C));pari_close();return 0;}
`;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-field3-packed-cleanarch-"));
  const cPath = path.join(temporary, "oracle.c");
  const executable = path.join(temporary, "oracle");
  fs.writeFileSync(cPath, source);
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${library}`,
    cPath, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", executable]);
  return JSON.parse(run(executable, []));
}

function flatten(entries) {
  return entries.flatMap(([kind, real, imaginary]) =>
    [kind, ...real, ...imaginary]).map(BigInt);
}

function cpython(input, expected, retry) {
  const program = String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
m=importlib.import_module("bench.pari-class-group-port.field3_packed_class_cleanarch")
d=json.load(sys.stdin);src=list(map(int,d["input"]));want=list(map(int,d["expected"]));I=lambda n:[0]*n
scratch=I(len(src));out=[777]*len(src);state=I(7)
assert m.pari_field3_packed_class_cleanarch(src,2,192,I(3),I(512),I(512),I(512),I(512),I(1024),scratch,out,state)==0
assert out==want,next((i,out[i],want[i]) for i in range(len(out)) if out[i]!=want[i])
assert state[0:3]==[0,2,2]
held=out[:];retry=I(6)
assert m.pari_field3_cleanarch_retry_status(src,6,192,retry)==1
assert retry==d["retry"] and out==held
bad=src[:];bad[4]=1<<63;bad[5]=64;bad[6]=500;held=[777]*len(src);badstate=I(7)
assert m.pari_field3_packed_class_cleanarch(bad,2,192,I(3),I(512),I(512),I(512),I(512),I(1024),I(len(src)),held,badstate)==1
assert held==[777]*len(src) and badstate[2]==0
`;
  run("python3", ["-c", program, root, path.join(root, "src/lib")], {
    input: JSON.stringify({ input, expected: expected.map(String), retry }),
  });
}

(async () => {
  assert(process.argv.length === 5 ||
    (process.argv.length === 6 && process.argv[5] === "--cpython-only"),
  "usage: check_field3_live_packed_cleanarch.cjs LIVE_JOIN PARI_ROOT PARI_ARCHIVE [--cpython-only]");
  const joinPath = path.resolve(process.argv[2]);
  const pari = path.resolve(process.argv[3]);
  const archive = path.resolve(process.argv[4]);
  const joinedRaw = fs.readFileSync(joinPath);
  const joined = JSON.parse(joinedRaw);
  assert.deepEqual(Object.keys(joined).sort(), ["expected", "live"]);
  assert.deepEqual(joined.live.hnfState,
    [2, 17, 286, 0, 15, 1, 0, 303, 0]);
  assert.equal(joined.live.c.length, 42);
  assert.deepEqual(joined.expected.retained.indices, ["11", "2"]);
  assert.deepEqual(joined.expected.retained.primes, ["13", "3"]);
  // Only the live owner is consumed below. Existing class answers and suffix
  // expectations are deliberately not passed to either cleanarch backend.
  const input = joined.live.c;
  const oracle = pariOracle(input, pari, archive);
  const expected = flatten(oracle.cleaned);
  cpython(input, expected, oracle.retry);
  if (process.argv[5] === "--cpython-only") {
    console.log(JSON.stringify({
      field: 3, signature: [2, 1], sourceOwner: "field3_live_class_suffix.live.c",
      joinSha256: sha256(joinedRaw), sameRunPackedCells: input.length,
      backends: ["PARI-2.17.4", "CPython"], oracleRetry: oracle.retry,
    }));
    return;
  }

  const compilerPath = process.env.SAGEJS_NATIVE_TOOLCHAIN_ROOT
    ? path.join(path.resolve(process.env.SAGEJS_NATIVE_TOOLCHAIN_ROOT),
      "tools/native-kernel/compiler.cjs")
    : path.join(root, "tools/native-kernel/compiler.cjs");
  const { compileKernel } = require(compilerPath);
  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);
  const clean = module.pari_field3_packed_class_cleanarch;
  const retry = module.pari_field3_cleanarch_retry_status;
  assert(clean.nativeAvailable && retry.nativeAvailable);
  const summaries = {};
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const I = (length, data = Array(length).fill(0n)) => backend === "javascript"
      ? data.slice() : clean.createIntegerBuffer(length, 4352, data);
    const S = length => backend === "javascript" ? Array(length).fill(0n)
      : clean.createInt64Buffer(Array(length).fill(0n));
    const source = I(input.length, input.map(BigInt));
    const output = I(input.length, Array(input.length).fill(777n));
    const state = S(7);
    assert.equal(clean[backend](source, 2n, 192n, I(3), I(512), I(512), I(512),
      I(512), I(1024), I(input.length), output, state), 0n);
    assert.deepEqual(values(output), expected, `${backend}: packed cleanarch`);
    const retryState = S(6);
    assert.equal(retry[backend](source, 6n, 192n, retryState), 1n);
    assert.deepEqual(values(retryState), oracle.retry.map(BigInt), `${backend}: retry`);
    const changed = input.map(BigInt);
    changed[4] = 1n << 63n; changed[5] = 64n; changed[6] = 500n;
    const held = I(input.length, Array(input.length).fill(777n));
    const negativeState = S(7);
    assert.equal(clean[backend](I(changed.length, changed), 2n, 192n, I(3), I(512),
      I(512), I(512), I(512), I(1024), I(input.length), held, negativeState), 1n);
    assert.deepEqual(values(held), Array(input.length).fill(777n),
      `${backend}: negative mutation published output`);
    assert.equal(values(negativeState)[2], 0n);
    summaries[backend] = { state: values(state).map(String), negativeStatus: "1" };
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({
    field: 3, polynomial: "x^4 - 2000022*x - 2000042", signature: [2, 1],
    sourceOwner: "field3_live_class_suffix.live.c", sameRunPackedCells: input.length,
    columns, entries: 6, periods: ["2*pi", "2*pi", "4*pi"],
    joinSha256: sha256(joinedRaw), oracleRetry: oracle.retry,
    backends: ["PARI-2.17.4", "CPython", "javascript", "gmp", "tagged"],
    transactionalNegativeMutation: true, summaries, cacheKey: built.cacheKey,
  }));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
