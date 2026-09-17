"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "class_relation_cleanarch_fixture.json")));
const sourceFixturePath = path.join(__dirname, fixture.source_fixture);
const sourceFixtureRaw = fs.readFileSync(sourceFixturePath);
const sourceFixture = JSON.parse(sourceFixtureRaw);
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 240000, maxBuffer: 64 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};
const canonical = (values) => JSON.stringify(values);

function pariOracle(input) {
  const archive = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4.tar.gz");
  const pari = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4");
  assert.equal(sha(fs.readFileSync(archive)), fixture.pari.archive_sha256);
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(sha(source), fixture.pari.buch2_sha256);
  const quoted = input.map((x) => `"${x}"`).join(",");
  source += String.raw`
static GEN cr_real(const char *m,long p,long e){GEN z=m[0]=='-'?negi(strtoi(m+1)):strtoi(m);if(p<0)return z;if(!signe(z))return real_0(nbits2prec(192));return gmul2n(itor(z,nbits2prec(p)),e+1-p);}
static void cr_scalar(GEN x){long e=0;if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static void cr_entry(GEN x){if(typ(x)==t_COMPLEX){printf("[\"2\",");cr_scalar(gel(x,1));printf(",");cr_scalar(gel(x,2));printf("]");}else{printf("[\"1\",");cr_scalar(x);printf(",[\"0\",-1,0]]");}}
int main(void){
  static const char *v[]={${quoted}};pari_init(512000000,10000);long cols=${fixture.columns};GEN C=cgetg(cols+1,t_MAT);long k=0;
  for(long j=1;j<=cols;j++){GEN c=cgetg(4,t_COL);for(long i=1;i<=3;i++){long kind=atol(v[k++]);GEN re=cr_real(v[k],atol(v[k+1]),atol(v[k+2]));k+=3;GEN im=cr_real(v[k],atol(v[k+1]),atol(v[k+2]));k+=3;gel(c,i)=kind==2?mkcomplex(re,im):re;}gel(C,j)=c;}
  GEN z=cleanarch(C,3,NULL,nbits2prec(${fixture.precision}));printf("{\"input\":[");for(long j=1;j<=cols;j++)for(long i=1;i<=3;i++){if(j>1||i>1)putchar(',');cr_entry(gcoeff(C,i,j));}printf("],\"cleaned\":[");for(long j=1;j<=cols;j++)for(long i=1;i<=3;i++){if(j>1||i>1)putchar(',');cr_entry(gcoeff(z,i,j));}
  long add=nbits2extraprec(gexpo(C)+64)-gprecision(C);printf("],\"retry\":[1,%ld,%ld,%ld,%ld,%ld]}\n",(long)${fixture.precision},(long)${fixture.precision}+maxss(add,1),maxss(add,1),gexpo(C),gprecision(C));pari_close();return 0;}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-cleanarch-"));
  const c = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(c, source);
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O2", "-I" + path.join(pari, "src/headers"), "-I" + library, c,
    "-L" + library, "-Wl,-rpath," + library, "-lpari", "-lm", "-o", executable]);
  const text = run(executable, []);
  fs.rmSync(directory, { recursive: true, force: true });
  return { text, value: JSON.parse(text) };
}

function flattenOracle(entries) {
  return entries.flatMap(([kind, real, imag]) => [kind, ...real, ...imag]).map(BigInt);
}

function pythonOracle(input, expected, retry) {
  const script = String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.class_relation_cleanarch')
d=json.load(sys.stdin);src=list(map(int,d['input']));want=list(map(int,d['expected']));I=lambda n:[0]*n
scratch=I(len(src));out=[777]*len(src);state=I(6)
assert m.pari_cleanarch_totally_real_cubic(src,d['columns'],d['precision'],I(3),I(512),I(512),I(512),I(512),I(1024),scratch,out,state)==0
assert out==want, next((i,out[i],want[i]) for i in range(len(out)) if out[i]!=want[i])
assert state[:3]==[0,d['columns'],d['columns']]
before=out[:];retry=I(6);assert m.pari_cleanarch_retry_action(src,3*d['columns'],d['precision'],retry)==1
assert retry==d['retry'] and out==before
low=src[:];low[4]=1<<63;low[5]=64;low[6]=500;held=[777]*len(src);lowstate=I(6)
assert m.pari_cleanarch_totally_real_cubic(low,d['columns'],d['precision'],I(3),I(512),I(512),I(512),I(512),I(1024),I(len(src)),held,lowstate)==1
assert held==[777]*len(src) and lowstate[0]==1 and lowstate[2]==0
bad=src[:];bad[2]=63
try:m.pari_cleanarch_totally_real_cubic(bad,d['columns'],d['precision'],I(3),I(512),I(512),I(512),I(512),I(1024),I(len(src)),[777]*len(src),I(6))
except ValueError:pass
else:raise AssertionError('bad packed precision accepted')
`;
  run("python3", ["-c", script, root, path.join(root, "src/lib")], {
    input: JSON.stringify({ input, expected, columns: fixture.columns, precision: fixture.precision, retry }),
  });
}

const values = (x) => Array.isArray(x) ? x : x.toArray ? x.toArray() : Array.from(x);

(async () => {
  assert.equal(sha(sourceFixtureRaw), fixture.source_fixture_sha256);
  const item = sourceFixture.cases[0];
  assert.equal(item.polynomial, "x^3-20018*x+20034");
  assert.equal(item.columns, fixture.columns);
  const input = item.accepted_arch;
  const oracle = pariOracle(input);
  const expected = flattenOracle(oracle.value.cleaned);
  if (process.argv.includes("--print-fixture")) {
    console.log(JSON.stringify({ oracle_trace_sha256: sha(oracle.text), cleaned_sha256: sha(canonical(expected.map(String))), retry: oracle.value.retry, firstInput: oracle.value.input.slice(0, 3), first: oracle.value.cleaned.slice(0, 3) }));
    return;
  }
  assert.equal(sha(oracle.text), fixture.oracle_trace_sha256);
  assert.equal(sha(canonical(expected.map(String))), fixture.cleaned_sha256);
  assert.deepEqual(oracle.value.retry, fixture.retry);
  pythonOracle(input, expected.map(String), oracle.value.retry);
  const built = await compileKernel({ sourcePath: path.join(__dirname, "class_relation_cleanarch.py") });
  const mod = require(built.modulePath);
  const clean = mod.pari_cleanarch_totally_real_cubic;
  const retry = mod.pari_cleanarch_retry_action;
  assert(clean.nativeAvailable && retry.nativeAvailable);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const I = (n, data = Array(n).fill(0n)) => backend === "javascript" ? data.slice() : clean.createIntegerBuffer(n, 4096, data);
    const S = (n) => backend === "javascript" ? Array(n).fill(0n) : clean.createInt64Buffer(Array(n).fill(0n));
    const src = I(input.length, input.map(BigInt));
    const scratch = I(input.length), output = I(input.length), state = S(6);
    assert.equal(clean[backend](src, BigInt(fixture.columns), BigInt(fixture.precision), I(3), I(512), I(512), I(512), I(512), I(1024), scratch, output, state), 0n);
    assert.deepEqual(values(output), expected);
    const before = values(output);
    const retryState = S(6);
    assert.equal(retry[backend](src, BigInt(3 * fixture.columns), BigInt(fixture.precision), retryState), 1n);
    assert.deepEqual(values(retryState), fixture.retry.map(BigInt));
    assert.deepEqual(values(output), before);
    const lowData = input.map(BigInt);
    lowData[4] = 1n << 63n; lowData[5] = 64n; lowData[6] = 500n;
    const low = I(input.length, lowData), held = I(input.length, Array(input.length).fill(777n));
    const lowState = S(6);
    assert.equal(clean[backend](low, BigInt(fixture.columns), BigInt(fixture.precision), I(3), I(512), I(512), I(512), I(512), I(1024), I(input.length), held, lowState), 1n);
    assert.deepEqual(values(held), Array(input.length).fill(777n));
    assert.equal(values(lowState)[0], 1n);
    assert.equal(values(lowState)[2], 0n);
  }
  console.log(JSON.stringify({ cases: 1, entries: 3 * fixture.columns, backends: ["cpython", "javascript", "gmp", "tagged"], transactionalRetry: true, cacheKey: built.cacheKey }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
