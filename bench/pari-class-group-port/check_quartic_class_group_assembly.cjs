"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function values(owner) {
  return Array.isArray(owner) ? owner : owner.toArray();
}
function transpose(values, n) {
  return Array.from({ length: n * n }, (_, at) => {
    const row = Math.floor(at / n);
    const column = at % n;
    return values[column * n + row];
  });
}

function parseTrace(trace) {
  const words = trace.trim().split(/\s+/);
  let at = 0;
  const number = () => Number(words[at++]);
  const integers = (count) => {
    const result = words.slice(at, at + count).map(BigInt);
    at += count;
    return result;
  };
  const n = number();
  const active = number();
  const precision = number();
  const W = integers(n * n);
  const C = integers(3 * n * 7);
  const names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"];
  const expected = Object.fromEntries(names.map((name) => [name, integers(n * n)]));
  expected.invariants = integers(active);
  expected.classNumber = integers(1);
  const generatorColumns = integers(active * 16);
  expected.G = generatorColumns.flatMap((_, generator) =>
    generator % 16 === 0
      ? transpose(generatorColumns.slice(generator, generator + 16), 4)
      : [],
  );
  expected.Ge = Array.from({ length: active }, () => ({
    factor: words[at++],
    exponent: BigInt(words[at++]),
  }));
  expected.Ga = integers(3 * active * 7);
  expected.GD = integers(3 * active * 7);
  expected.ga = integers(3 * n * 7);
  const primes = [];
  const tau = [];
  for (let generator = 0; generator < active; generator += 1) {
    primes.push(BigInt(words[at++]));
    tau.push(...integers(16));
  }
  assert.equal(at, words.length);
  return { n, active, precision, W, C, primes, tau, expected };
}

function pristineOracle(pari, archive) {
  assert.equal(hash(fs.readFileSync(archive)), ARCHIVE_SHA256);
  const lib = path.join(pari, "Olinux-x86_64");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quartic-assembly-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#include "pari.h"
#include "paripriv.h"
static void scalar(GEN x){long e;if(typ(x)==t_INT){pari_printf("%Ps -1 0 ",x);return;}pari_printf("%Ps %ld %ld ",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void entry(GEN x){if(typ(x)==t_COMPLEX){printf("2 ");scalar(gel(x,1));scalar(gel(x,2));}else{printf("1 ");scalar(x);printf("0 -1 0 ");}}
static void imat(GEN x){for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++)pari_printf("%Ps ",gcoeff(x,i,j));}
static void lmat(GEN x,long c){for(long j=1;j<=c;j++)for(long i=1;i<lg(gel(x,j));i++)entry(gcoeff(x,i,j));}
static void rmat(GEN x,long n){for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)pari_printf("%Ps ",gcoeff(x,i,j));}
static GEN add0(GEN a,GEN t){return a?RgC_add(a,t):t;}
static GEN act0(GEN A,GEN x){GEN a;long i,l=lg(A),t=typ(A);if(t==t_MAT){a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=act0(gel(A,i),x);return a;}if(l==1)return cgetg(1,t_COL);a=NULL;for(i=1;i<l;i++){GEN c=gel(A,i);if(signe(c))a=add0(a,gmul(c,gel(x,i)));}return a?a:zerocol(lgcols(x)-1);}
static GEN diag0(GEN v,GEN x){long i,l=lg(v);GEN a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=gmul(gel(x,i),gel(v,i));return a;}
int main(void){
  pari_init(512000000,10000);long bits=192;
  GEN b=bnfinit0(gp_read_str("x^4-2000022*x-2000042"),1,NULL,nbits2prec(bits));
  GEN nf=bnf_get_nf(b),W=gel(b,1),C=gel(b,4),Vbase=gel(b,5),Ge=gmael(b,9,4),G=bnf_get_gen(b);
  GEN U,V,D=ZM_snfall(W,&U,&V),D0=gcopy(D),V0=gcopy(V),Ui=ZM_inv(U,NULL),Y,X;
  GEN Ur=ZM_hnfdivrem(U,D,&Y),Uir=ZM_hnfdivrem(Ui,W,&X),M2=ZM_add(ZM_mul(X,Ur),ZM_mul(V,Y));
  long n=lg(W)-1,j,l;for(j=1;j<lg(D);j++)if(is_pm1(gcoeff(D,j,j)))break;l=j;
  GEN cyc=cgetg(l,t_VEC);for(j=1;j<l;j++)gel(cyc,j)=gcoeff(D,j,j);setlg(V,l);setlg(D,l);
  GEN M1=ZM_add(V,ZM_mul(X,D));
  GEN Ga=nfV_cxlog(nf,Ge,nbits2prec(bits));
  GEN GD=gsub(act0(M1,C),diag0(cyc,Ga)),ga=gsub(act0(M2,C),act0(Ur,Ga));
  if(l-1!=2) return 2;
  for(j=1;j<l;j++){
    GEN F=gel(Ge,j);
    GEN A=idealhnf(nf,idealmul(nf,gel(G,j),nffactorback(nf,gel(F,1),gel(F,2))));
    GEN B=idealhnf(nf,idealpow(nf,gel(Vbase,j),gen_m1));
    if(!gequal(A,B)) return 3;
    if(!gequal(ZM_ZC_mul(Uir,gel(D,j)),ZM_ZC_mul(W,gel(M1,j)))) return 4;
  }
  printf("%ld %ld %ld ",n,l-1,bits);imat(W);lmat(C,n);
  imat(D0);imat(U);imat(Ui);imat(V0);imat(Ur);imat(Y);imat(Uir);imat(X);imat(M1);imat(M2);
  for(j=1;j<l;j++)pari_printf("%Ps ",gel(cyc,j));pari_printf("%Ps ",bnf_get_no(b));
  for(j=1;j<l;j++)imat(gel(G,j));
  for(j=1;j<l;j++){GEN F=gel(Ge,j);pari_printf("%Ps %Ps ",gcoeff(F,1,1),gcoeff(F,1,2));}
  lmat(Ga,l-1);lmat(GD,l-1);lmat(ga,n);
  for(j=1;j<l;j++){GEN P=gel(Vbase,j);pari_printf("%Ps ",pr_get_p(P));rmat(pr_get_tau(P),4);}
  putchar('\\n');pari_close();return 0;
}`,
  );
  run("cc", [
    "-O2",
    `-I${path.join(pari, "src/headers")}`,
    `-I${lib}`,
    source,
    `-L${lib}`,
    `-Wl,-rpath,${lib}`,
    "-lpari",
    "-lm",
    "-o",
    executable,
  ]);
  const trace = run(executable, []);
  return { fixture: parseTrace(trace), trace, directory };
}

function allocate(native, fixture, backend) {
  const n = fixture.n;
  const active = fixture.active;
  const exact = (length, fill = 0n) => {
    const initial = Array(length).fill(fill);
    return backend === "javascript"
      ? initial
      : native.createIntegerBuffer(length, 1536, initial);
  };
  const z = (length) => exact(length);
  const matrices = Array.from({ length: 10 }, () => exact(n * n, 77n));
  const generatorIdeals = exact(active * 16, 77n);
  const generatedIdeals = z(active * 16);
  const relationExponents = exact(n * active, 77n);
  const offsets = exact(active + 1, 77n);
  const kinds = exact(active, 77n);
  const numerators = exact(active, 77n);
  const denominators = exact(active, 77n);
  const exponents = exact(active, 77n);
  const invariants = exact(n, 77n);
  const classNumber = exact(1, 77n);
  const Ga = exact(3 * active * 7, 77n);
  const GD = exact(3 * active * 7, 77n);
  const ga = exact(3 * n * 7, 77n);
  const states = Array.from({ length: 4 }, () => Array(7).fill(77n));
  const smithState = Array(9).fill(77n);
  const cxState = Array(3).fill(77n);
  const connectionState = Array(8).fill(77n);
  const args = [
    fixture.W,
    fixture.C,
    fixture.primes,
    fixture.tau,
    BigInt(n),
    BigInt(active),
    generatorIdeals,
    generatedIdeals,
    relationExponents,
    offsets,
    kinds,
    numerators,
    denominators,
    exponents,
    z(16),
    z(16),
    z(52),
    z(20),
    z(4),
    ...matrices,
    invariants,
    classNumber,
    Ga,
    GD,
    ga,
    z(n),
    z(n * n),
    z(2 * n * n),
    ...states,
    smithState,
    cxState,
    z(3 * active * 7),
    z(3 * active * 7),
    z(3 * n * 7),
    z(3 * n * 7),
    z(3 * active * 7),
    z(3 * n * 7),
    connectionState,
  ];
  return {
    args,
    matrices,
    generatorIdeals,
    relationExponents,
    offsets,
    kinds,
    numerators,
    denominators,
    exponents,
    invariants,
    classNumber,
    Ga,
    GD,
    ga,
    connectionState,
  };
}

function check(call, fixture, label) {
  const want = fixture.expected;
  const names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"];
  for (let i = 0; i < names.length; i += 1) {
    assert.deepEqual(values(call.matrices[i]), want[names[i]], `${label}:${names[i]}`);
  }
  assert.deepEqual(values(call.generatorIdeals), want.G, `${label}:G`);
  assert.deepEqual(values(call.relationExponents), want.Uir, `${label}:Uir columns`);
  assert.deepEqual(values(call.offsets), [0n, 1n, 2n], `${label}:Ge offsets`);
  assert.deepEqual(values(call.kinds), [0n, 0n], `${label}:Ge kinds`);
  assert.deepEqual(values(call.numerators), [1n, 1n], `${label}:Ge numerators`);
  assert.deepEqual(values(call.denominators), fixture.primes, `${label}:Ge denominators`);
  assert.deepEqual(values(call.exponents), [1n, 1n], `${label}:Ge exponents`);
  assert.deepEqual(values(call.invariants), want.invariants, `${label}:invariants`);
  assert.deepEqual(values(call.classNumber), want.classNumber, `${label}:class number`);
  assert.deepEqual(values(call.Ga), want.Ga, `${label}:Ga`);
  assert.deepEqual(values(call.GD), want.GD, `${label}:GD`);
  assert.deepEqual(values(call.ga), want.ga, `${label}:ga`);
  assert.deepEqual(call.connectionState, [0n, 0n, 2n, 2n, 4n, 0n, 2n, 2n]);
}

(async () => {
  const pari = path.resolve(
    process.argv[2] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4",
  );
  const archive = path.resolve(
    process.argv[3] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz",
  );
  const { fixture, trace, directory } = pristineOracle(pari, archive);
  assert.equal(fixture.n, 2);
  assert.equal(fixture.active, 2);
  assert.deepEqual(fixture.primes, [13n, 3n]);
  assert.deepEqual(fixture.expected.invariants, [2n, 2n]);
  assert.deepEqual(fixture.expected.classNumber, [4n]);
  assert.deepEqual(fixture.expected.Ge, [
    { factor: "1/13", exponent: 1n },
    { factor: "1/3", exponent: 1n },
  ]);

  const payload = JSON.stringify(fixture, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  const python = `import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.quartic_class_group_assembly').pari_mixed_quartic_class_group_assembly
r=json.load(sys.stdin);cv=lambda a:list(map(int,a));n=r['n'];a=r['active'];z=lambda k:[0]*k
m=[[77]*(n*n) for _ in range(10)];G=[77]*(a*16);Gt=z(a*16);rel=[77]*(n*a);off=[77]*(a+1);k=[77]*a;num=[77]*a;den=[77]*a;ex=[77]*a;inv=[77]*n;h=[77];Ga=[77]*(3*a*7);GD=[77]*(3*a*7);ga=[77]*(3*n*7);ss=[[77]*7 for _ in range(4)];st=[77]*9;cx=[77]*3;cs=[77]*8
args=[cv(r['W']),cv(r['C']),cv(r['primes']),cv(r['tau']),n,a,G,Gt,rel,off,k,num,den,ex,z(16),z(16),z(52),z(20),z(4),*m,inv,h,Ga,GD,ga,z(n),z(n*n),z(2*n*n),*ss,st,cx,z(3*a*7),z(3*a*7),z(3*n*7),z(3*n*7),z(3*a*7),z(3*n*7),cs]
assert f(*args)==0
enc=lambda x:[enc(v) for v in x] if isinstance(x,list) else ({q:enc(v) for q,v in x.items()} if isinstance(x,dict) else str(x))
print(json.dumps(enc({'m':m,'G':G,'rel':rel,'off':off,'k':k,'num':num,'den':den,'ex':ex,'inv':inv,'h':h,'Ga':Ga,'GD':GD,'ga':ga,'cs':cs})))`;
  const dynamic = JSON.parse(
    run(
      "python3",
      [
        "-c",
        python,
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "../../src/lib"),
      ],
      { input: payload },
    ),
    (_, value) =>
      typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : value,
  );
  const dynamicCall = {
    matrices: dynamic.m,
    generatorIdeals: dynamic.G,
    relationExponents: dynamic.rel,
    offsets: dynamic.off,
    kinds: dynamic.k,
    numerators: dynamic.num,
    denominators: dynamic.den,
    exponents: dynamic.ex,
    invariants: dynamic.inv,
    classNumber: dynamic.h,
    Ga: dynamic.Ga,
    GD: dynamic.GD,
    ga: dynamic.ga,
    connectionState: dynamic.cs,
  };
  check(dynamicCall, fixture, "cpython");

  if (process.env.SAGEJS_ORACLE_ONLY === "1" || process.argv.includes("--source-only")) {
    console.log(JSON.stringify({
      fixture: "x^4-2000022*x-2000042",
      classGroup: [2, 2],
      backends: ["PARI", "CPython"],
      traceSha256: hash(trace),
      artifactDirectory: directory,
      qualifiedTiming: false,
    }));
    return;
  }

  const sourcePath = path.join(__dirname, "quartic_class_group_assembly.py");
  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const built = await compileKernel({ sourcePath });
  const native = require(built.modulePath).pari_mixed_quartic_class_group_assembly;
  assert(native.nativeAvailable);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const call = allocate(native, fixture, backend);
    assert.equal(native[backend](...call.args), 0n, backend);
    check(call, fixture, backend);
  }
  const failed = allocate(native, fixture, "javascript");
  failed.args[2] = [1n, 3n];
  assert.throws(() => native.javascript(...failed.args), /invalid mixed-quartic prime/);
  assert.deepEqual(values(failed.generatorIdeals), Array(32).fill(77n));
  assert.doesNotMatch(
    fs.readFileSync(built.coreSourcePath, "utf8"),
    /napi_call_function|PyObject_Call|v8::/,
  );
  console.log(JSON.stringify({
    fixture: "x^4-2000022*x-2000042",
    classGroup: [2, 2],
    backends: ["PARI", "CPython", "javascript", "gmp", "tagged"],
    traceSha256: hash(trace),
    sourceSha256: hash(fs.readFileSync(sourcePath)),
    coreBytes: fs.statSync(built.coreSourcePath).size,
    artifactDirectory: directory,
    qualifiedTiming: false,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
