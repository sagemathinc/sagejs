"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const ARCHIVE_SHA256 =
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function oracle(pari, archive) {
  assert.equal(hash(fs.readFileSync(archive)), ARCHIVE_SHA256);
  const lib = path.join(pari, "Olinux-x86_64");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quartic-direct-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#include "pari.h"
#include "paripriv.h"
static void rr(GEN x){long e;if(typ(x)==t_INT){pari_printf("%Ps -1 0 ",x);return;}pari_printf("%Ps %ld %ld ",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void zz(GEN x){if(typ(x)==t_COMPLEX){printf("2 ");rr(gel(x,1));rr(gel(x,2));}else{printf("1 ");rr(x);printf("0 -1 0 ");}}
static void mat(GEN x){for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++)pari_printf("%Ps ",gcoeff(x,i,j));}
static void row4(GEN x){for(long i=1;i<=4;i++)for(long j=1;j<=4;j++)pari_printf("%Ps ",gcoeff(x,i,j));}
static void logs(GEN x,long c){for(long j=1;j<=c;j++)for(long i=1;i<=3;i++)zz(gcoeff(x,i,j));}
static GEN add0(GEN a,GEN t){return a?RgC_add(a,t):t;}
static GEN act0(GEN A,GEN x){GEN a;long i,l=lg(A),t=typ(A);if(t==t_MAT){a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=act0(gel(A,i),x);return a;}if(l==1)return cgetg(1,t_COL);a=NULL;for(i=1;i<l;i++){GEN c=gel(A,i);if(signe(c))a=add0(a,gmul(c,gel(x,i)));}return a?a:zerocol(lgcols(x)-1);}
static GEN diag0(GEN v,GEN x){long i,l=lg(v);GEN a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=gmul(gel(x,i),gel(v,i));return a;}
static void fac(GEN F){long n=lg(gel(F,1))-1;printf("%ld ",n);for(long i=1;i<=n;i++){GEN x=gcoeff(F,i,1);if(typ(x)==t_COL){printf("1 ");for(long k=1;k<=4;k++)pari_printf("%Ps ",gel(x,k));printf("1 ");}else{GEN a=x,d=gen_1;if(typ(x)==t_FRAC){a=gel(x,1);d=gel(x,2);}printf("0 ");pari_printf("%Ps 0 0 0 %Ps ",a,d);}pari_printf("%Ps ",gcoeff(F,i,2));}}
int main(void){pari_init(1200000000,10000);long bits=192;GEN b=bnfinit0(gp_read_str("x^4-200000002*x-200000002"),1,NULL,nbits2prec(bits)),nf=bnf_get_nf(b),M=nf_get_M(nf),W=gel(b,1),C=gel(b,4),Vb=gel(b,5),G=bnf_get_gen(b),Ge=gmael(b,9,4),U,V,Y,X;GEN D=ZM_snfall(W,&U,&V),D0=gcopy(D),V0=gcopy(V),Ui=ZM_inv(U,NULL),Ur=ZM_hnfdivrem(U,D,&Y),Uir=ZM_hnfdivrem(Ui,W,&X),M2=ZM_add(ZM_mul(X,Ur),ZM_mul(V,Y));long n=lg(W)-1,j,l;for(j=1;j<lg(D);j++)if(is_pm1(gcoeff(D,j,j)))break;l=j;GEN cyc=cgetg(l,t_VEC);for(j=1;j<l;j++)gel(cyc,j)=gcoeff(D,j,j);setlg(V,l);setlg(D,l);GEN M1=ZM_add(V,ZM_mul(X,D)),Ga=nfV_cxlog(nf,Ge,nbits2prec(bits)),GD=gsub(act0(M1,C),diag0(cyc,Ga)),ga=gsub(act0(M2,C),act0(Ur,Ga));printf("%ld %ld %ld ",n,l-1,bits);for(long r=1;r<=4;r++)for(long c=1;c<=4;c++){GEN q=gcoeff(M,3,c),v;if(r<=2)v=gcoeff(M,r,c);else if(typ(q)==t_COMPLEX)v=gel(q,r-2);else v=r==3?q:gen_0;rr(v);}mat(W);logs(C,n);row4(nf_get_roundG(nf));for(long i=1;i<=4;i++)for(long k=1;k<=4;k++){GEN v=tablemul_ei_ej(nf,i,k);for(long q=1;q<=4;q++)pari_printf("%Ps ",gel(v,q));}for(j=1;j<=3;j++)row4(idealhnf(nf,gel(Vb,j)));mat(D0);mat(U);mat(Ui);mat(V0);mat(Ur);mat(Y);mat(Uir);mat(X);mat(M1);mat(M2);for(j=1;j<l;j++)pari_printf("%Ps ",gel(cyc,j));pari_printf("%Ps ",bnf_get_no(b));for(j=1;j<=2;j++)row4(gel(G,j));for(j=1;j<l;j++)fac(gel(Ge,j));logs(Ga,l-1);logs(GD,l-1);logs(ga,n);putchar('\\n');pari_close();return 0;}`,
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
  const words = run(executable, []).trim().split(/\s+/);
  const take = (n) => {
    const answer = words.slice(take.at, take.at + n).map(BigInt);
    take.at += n;
    return answer;
  };
  take.at = 0;
  const n = Number(take(1)[0]);
  const active = Number(take(1)[0]);
  const precision = Number(take(1)[0]);
  const triples = take(48);
  const matrix = [0, 1, 2].map((k) => triples.filter((_, i) => i % 3 === k));
  const W = take(n * n);
  const C = take(21 * n);
  const roundedT2 = take(16);
  const table = take(64);
  const primes = [take(16), take(16), take(16)];
  const names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X"];
  const expected = Object.fromEntries(names.map((name) => [name, take(n * n)]));
  expected.M1 = take(n * active).concat(Array(n * (n - active)).fill(0n));
  expected.M2 = take(n * n);
  expected.invariants = take(active);
  expected.classNumber = take(1);
  expected.generators = [take(16), take(16)];
  const offsets = [0n], kinds = [], values = [], exponents = [];
  for (let generator = 0; generator < active; generator += 1) {
    const count = Number(take(1)[0]);
    for (let i = 0; i < count; i += 1) {
      kinds.push(...take(1));
      values.push(...take(5));
      exponents.push(...take(1));
    }
    offsets.push(BigInt(kinds.length));
  }
  Object.assign(expected, {
    offsets,
    kinds,
    values,
    exponents,
    Ga: take(21 * active),
    GD: take(21 * active),
    ga: take(21 * n),
  });
  assert.equal(take.at, words.length);
  return { n, active, precision, matrix, W, C, roundedT2, table, primes, expected, directory };
}

function values(owner) {
  return Array.isArray(owner) ? owner : owner.toArray();
}

function allocate(fn, backend, fixture, mutate = false) {
  const exact = (source, bits = 1536) =>
    backend === "javascript" || fn === null
      ? source.slice()
      : fn.createIntegerBuffer(source.length, bits, source);
  const z = (n, value = 0n, bits = 1536) => exact(Array(n).fill(value), bits);
  const i64 = (n) => Array(n).fill(0n);
  const f64 = (n) => Array(n).fill(0);
  const input = (source) => exact(source);
  const n = fixture.n, active = fixture.active;
  const primeSources = fixture.primes.map((p) => p.slice());
  if (mutate) primeSources[0][1] += 1n;
  const primes = primeSources.map((p) => input(p));
  const published = {
    generators: z(32, 77n), offsets: z(3, 77n), kinds: z(20, 77n),
    factorValues: z(100, 77n), exponents: z(20, 77n), invariants: z(n, 77n),
    classNumber: z(1, 77n), Ga: z(21 * active, 77n), GD: z(21 * active, 77n),
    ga: z(21 * n, 77n),
  };
  const smith = Array.from({ length: 10 }, () => z(n * n));
  const t2 = [
    z(16), z(4), z(4), z(52), z(20), z(4), z(16), z(16), z(16), z(16),
    z(5), z(4), z(16), z(16), z(16), z(16), z(16), z(16), z(16), z(16),
    z(48), z(48), z(48), z(12), z(12), z(12), z(4), z(7), z(12), z(12),
    z(12), z(4), z(4), z(4), z(4), z(12), z(12), z(12), z(12), z(4),
    f64(16), f64(16), f64(4), f64(16), z(4), f64(16), z(16), z(16), z(16),
    z(4), z(4), z(4), f64(4), f64(1), z(4),
  ];
  assert.equal(t2.length, 55, "quartic T2 workspace arity");
  const args = [
    ...fixture.matrix.map(input), input(fixture.W), input(fixture.C), ...primes,
    input(fixture.table), input(fixture.roundedT2), BigInt(n), BigInt(active),
    BigInt(fixture.precision), published.generators, published.offsets,
    published.kinds, published.factorValues, published.exponents,
    published.invariants, published.classNumber, published.Ga, published.GD,
    published.ga, ...smith, z(n), z(1), z(16), z(16), z(3), z(20), z(100),
    z(20), z(1), z(20), z(100), z(20), z(1), z(64), z(32), z(52), z(20),
    z(4), z(16), z(16), z(16), z(16), ...t2, z(2), z(16), z(16),
    z(4), z(1), z(52), z(20), z(4), z(21 * active), z(21 * active),
    z(21 * n), z(n), z(n * n), z(2 * n * n), ...Array.from({ length: 4 }, () => i64(7)),
    i64(9), z(9), z(4), z(21), z(21), ...Array.from({ length: 6 }, () => z(64)),
    z(128), z(21 * n), z(21 * active), z(21 * active), z(21 * n), z(21 * n),
    z(21 * active), z(21 * n), i64(8), i64(8),
  ];
  assert.equal(args.length, 149, `direct quartic root argument count ${args.map((x) => Array.isArray(x) ? x.length : "s").join(",")}`);
  return { args, published, smith };
}

function check(result, fixture, label) {
  const p = result.published, e = fixture.expected;
  assert.deepEqual(values(p.generators).slice(0, 16), e.generators[0], `${label}:G1`);
  assert.deepEqual(values(p.generators).slice(16, 32), e.generators[1], `${label}:G2`);
  assert.deepEqual(values(p.offsets), e.offsets, `${label}:offsets`);
  assert.deepEqual(values(p.kinds).slice(0, e.kinds.length), e.kinds, `${label}:kinds`);
  assert.deepEqual(values(p.factorValues).slice(0, e.values.length), e.values, `${label}:values`);
  assert.deepEqual(values(p.exponents).slice(0, e.exponents.length), e.exponents, `${label}:exponents`);
  assert.deepEqual(values(p.invariants).slice(0, fixture.active), e.invariants, `${label}:invariants`);
  assert.deepEqual(values(p.classNumber), e.classNumber, `${label}:class number`);
  assert.deepEqual(values(p.Ga), e.Ga, `${label}:Ga`);
  assert.deepEqual(values(p.GD), e.GD, `${label}:GD`);
  assert.deepEqual(values(p.ga), e.ga, `${label}:ga`);
}

function assertAtomic(result, label) {
  for (const [name, owner] of Object.entries(result.published)) {
    assert.ok(values(owner).every((value) => value === 77n), `${label}:${name} mutated`);
  }
}

(async () => {
  const pari = path.resolve(process.argv[2] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4");
  const archive = path.resolve(process.argv[3] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz");
  const fixture = oracle(pari, archive);
  assert.deepEqual(fixture.expected.offsets, [0n, 0n, 7n]);
  assert.deepEqual(fixture.expected.Uir.slice(0, 6), [1n, 0n, 0n, -2n, -1n, -1n]);

  const dynamic = allocate(null, "javascript", fixture);
  const payload = JSON.stringify(
    dynamic.args,
    (_, value) => typeof value === "bigint" ? value.toString() : value,
  );
  const python = `import importlib,json,sys\nsys.path[:0]=sys.argv[1:3]\ndef cv(x):\n if isinstance(x,list): return [cv(v) for v in x]\n if isinstance(x,str) and (x.isdigit() or (x.startswith('-') and x[1:].isdigit())): return int(x)\n return x\nraw=json.load(sys.stdin);a=cv(raw);f=importlib.import_module('bench.pari-class-group-port.quartic_direct_composition').pari_quartic_direct_class_group_assembly\nassert f(*a)==0\nb=cv(raw);b[5][1]+=1\ntry: f(*b);raise AssertionError('mutated CPython input accepted')\nexcept ValueError: pass\nassert all(all(v==77 for v in owner) for owner in b[13:23])\ndef enc(x): return [enc(v) for v in x] if isinstance(x,list) else str(x)\nprint(json.dumps(enc(a)))`;
  const dynamicArgs = JSON.parse(
    run("python3", ["-c", python, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], { input: payload }),
    (_, value) => typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : value,
  );
  dynamic.args = dynamicArgs;
  const publicStart = 13;
  Object.assign(dynamic.published, {
    generators: dynamicArgs[publicStart], offsets: dynamicArgs[publicStart + 1],
    kinds: dynamicArgs[publicStart + 2], factorValues: dynamicArgs[publicStart + 3],
    exponents: dynamicArgs[publicStart + 4], invariants: dynamicArgs[publicStart + 5],
    classNumber: dynamicArgs[publicStart + 6], Ga: dynamicArgs[publicStart + 7],
    GD: dynamicArgs[publicStart + 8], ga: dynamicArgs[publicStart + 9],
  });
  check(dynamic, fixture, "CPython");

  const built = await compileKernel({ sourcePath: path.join(__dirname, "quartic_direct_composition.py") });
  const fn = require(built.modulePath).pari_quartic_direct_class_group_assembly;
  assert.equal(fn.nativeAvailable, true);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const result = allocate(fn, backend, fixture);
    assert.equal(fn[backend](...result.args), 0n, backend);
    check(result, fixture, backend);
    const corrupted = allocate(fn, backend, fixture, true);
    assert.throws(() => fn[backend](...corrupted.args), /integrally|candidate|quartic/, `${backend}: mutation`);
    assertAtomic(corrupted, backend);
  }
  console.log(JSON.stringify({
    polynomial: "x^4-200000002*x-200000002",
    smithColumns: [["1", "0", "0"], ["-2", "-1", "-1"]],
    reductions: 7,
    factors: 7,
    classGroup: fixture.expected.invariants.map(String),
    backends: ["pristine PARI 2.17.4", "CPython", "javascript", "gmp", "tagged"],
    atomicMutationControl: true,
    coreSha256: hash(fs.readFileSync(built.coreSourcePath)),
    qualifiedTiming: false,
    directory: fixture.directory,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
