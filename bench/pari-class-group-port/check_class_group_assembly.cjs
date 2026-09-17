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
const BUCH2_SHA256 =
  "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac";
const BASE3_SHA256 =
  "5cbf4ebd6c70deb06cfd83f94b8d86368e60cd084f318a003a8ee14821e1cbea";

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

function parseTrace(trace) {
  const words = trace.trim().split(/\s+/);
  let at = 0;
  const number = () => Number(words[at++]);
  const integers = (count) => {
    const values = words.slice(at, at + count);
    at += count;
    assert.equal(values.length, count);
    return values;
  };
  const n = number();
  const active = number();
  const precision = number();
  const factorCount = number();
  const W = integers(n * n);
  const triples = integers(27);
  const matrix = [0, 1, 2].map((part) =>
    triples.filter((_, index) => index % 3 === part),
  );
  const C = integers(3 * n * 7);
  const factors = [];
  for (let index = 0; index < factorCount; index += 1) {
    factors.push({
      kind: number(),
      numerator: words[at++],
      denominator: words[at++],
      coordinates: integers(3),
      exponent: words[at++],
    });
  }
  const lengths = {
    D: n * n,
    U: n * n,
    Ui: n * n,
    V: n * n,
    Ur: n * n,
    Y: n * n,
    Uir: n * n,
    X: n * n,
    M1: n * active,
    M2: n * n,
  };
  const expected = Object.fromEntries(
    Object.entries(lengths).map(([name, length]) => [name, integers(length)]),
  );
  expected.invariants = integers(active);
  expected.classNumber = integers(1);
  expected.Ga = integers(3 * active * 7);
  expected.GD = integers(3 * active * 7);
  expected.ga = integers(3 * n * 7);
  assert.equal(at, words.length, "unparsed PARI trace words");
  const offsets = [0];
  // The fixture currently has one Smith generator; retain the generic packed
  // shape so a later authentic fixture can add more without changing the ABI.
  assert.equal(active, 1);
  offsets.push(factors.length);
  return {
    n,
    active,
    precision,
    W,
    matrix,
    C,
    packed: {
      offsets,
      kinds: factors.map((factor) => factor.kind),
      numerators: factors.map((factor) => factor.numerator),
      denominators: factors.map((factor) => factor.denominator),
      coordinates: factors.flatMap((factor) => factor.coordinates),
      exponents: factors.map((factor) => factor.exponent),
    },
    factors,
    expected,
  };
}

function bigintFixture(fixture) {
  const convert = (values) => values.map(BigInt);
  return {
    ...fixture,
    W: convert(fixture.W),
    matrix: fixture.matrix.map(convert),
    C: convert(fixture.C),
    packed: Object.fromEntries(
      Object.entries(fixture.packed).map(([name, values]) => [
        name,
        convert(values),
      ]),
    ),
    expected: Object.fromEntries(
      Object.entries(fixture.expected).map(([name, values]) => [
        name,
        convert(values),
      ]),
    ),
  };
}

function invocation(native, fixture, backend) {
  const n = fixture.n;
  const active = fixture.active;
  const size = n * n;
  const makeExact = (length, values = Array(length).fill(0n)) =>
    backend === "javascript"
      ? values.slice()
      : native.createIntegerBuffer(length, 1024, values);
  const makeState = (length) => Array(length).fill(77n);
  const matrices = Array.from({ length: 10 }, () => makeExact(size, Array(size).fill(77n)));
  const invariants = makeExact(n, Array(n).fill(77n));
  const classNumber = makeExact(1, [77n]);
  const Ga = makeExact(3 * active * 7, Array(3 * active * 7).fill(77n));
  const GD = makeExact(3 * active * 7, Array(3 * active * 7).fill(77n));
  const ga = makeExact(3 * n * 7, Array(3 * n * 7).fill(77n));
  const smithStates = [makeState(7), makeState(7), makeState(7), makeState(7), makeState(9)];
  const cxState = makeExact(8, [0n, 0n, -1n, -1n, 0n, 0n, 0n, 0n]);
  const assemblyState = makeState(8);
  const args = [
    ...fixture.matrix,
    fixture.W,
    fixture.C,
    fixture.packed.offsets,
    fixture.packed.kinds,
    fixture.packed.numerators,
    fixture.packed.denominators,
    fixture.packed.coordinates,
    fixture.packed.exponents,
    BigInt(n),
    BigInt(fixture.argumentActive ?? active),
    BigInt(fixture.precision),
    ...matrices,
    invariants,
    classNumber,
    Ga,
    GD,
    ga,
    makeExact(n),
    makeExact(size),
    makeExact(2 * size),
    ...smithStates,
    cxState,
    makeExact(3),
    makeExact(21),
    makeExact(21),
    makeExact(64),
    makeExact(64),
    makeExact(64),
    makeExact(64),
    makeExact(64),
    makeExact(64),
    makeExact(128),
    makeExact(3 * n * 7),
    makeExact(3 * active * 7),
    makeExact(3 * active * 7),
    makeExact(3 * n * 7),
    makeExact(3 * n * 7),
    makeExact(3 * active * 7),
    makeExact(3 * n * 7),
    assemblyState,
  ];
  return { args, matrices, invariants, classNumber, Ga, GD, ga, cxState, assemblyState };
}

function values(owner) {
  return Array.isArray(owner) ? owner : owner.toArray();
}

function checkResult(call, fixture, label) {
  const names = ["D", "U", "Ui", "V", "Ur", "Y", "Uir", "X", "M1", "M2"];
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const length = name === "M1" ? fixture.n * fixture.active : fixture.n * fixture.n;
    assert.deepEqual(
      values(call.matrices[index]).slice(0, length),
      fixture.expected[name],
      `${label}:${name}`,
    );
  }
  assert.deepEqual(
    values(call.invariants).slice(0, fixture.active),
    fixture.expected.invariants,
    `${label}:cyc`,
  );
  assert.deepEqual(values(call.classNumber), fixture.expected.classNumber, `${label}:h`);
  assert.deepEqual(values(call.Ga), fixture.expected.Ga, `${label}:Ga`);
  assert.deepEqual(values(call.GD), fixture.expected.GD, `${label}:GD`);
  assert.deepEqual(values(call.ga), fixture.expected.ga, `${label}:ga`);
  assert.deepEqual(values(call.assemblyState), [
    0n,
    BigInt(fixture.n),
    BigInt(fixture.active),
    0n,
    0n,
    BigInt((fixture.n - fixture.active) * fixture.n),
    BigInt(fixture.active),
    BigInt(fixture.n),
  ]);
}

(async () => {
  const pari = path.resolve(process.argv[2]);
  const archive = path.resolve(process.argv[3]);
  const lib = path.join(pari, "Olinux-x86_64");
  assert.equal(hash(fs.readFileSync(archive)), ARCHIVE_SHA256);
  assert.equal(
    hash(run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"])),
    BUCH2_SHA256,
  );
  assert.equal(
    hash(run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/base3.c"])),
    BASE3_SHA256,
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-class-assembly-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#include "pari.h"
#include "paripriv.h"
static void scalar(GEN x) { long e; if (typ(x)==t_INT) { pari_printf("%Ps -1 0 ",x); return; } pari_printf("%Ps %ld %ld ",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x)); }
static void entry(GEN x) { if (typ(x)==t_COMPLEX) { printf("2 ");scalar(gel(x,1));scalar(gel(x,2)); } else { printf("1 ");scalar(x);printf("0 -1 0 "); } }
static void imat(GEN x) { for(long j=1;j<lg(x);j++)for(long i=1;i<lg(gel(x,j));i++)pari_printf("%Ps ",gcoeff(x,i,j)); }
static void lmat(GEN x,long columns) { for(long j=1;j<=columns;j++)for(long i=1;i<lg(gel(x,j));i++)entry(gcoeff(x,i,j)); }
static GEN add0(GEN a,GEN t){return a?RgC_add(a,t):t;}
static GEN act0(GEN A,GEN x){GEN a;long i,l=lg(A),t=typ(A);if(t==t_MAT){a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=act0(gel(A,i),x);return a;}if(l==1)return cgetg(1,t_COL);a=NULL;for(i=1;i<l;i++){GEN c=gel(A,i);if(signe(c))a=add0(a,gmul(c,gel(x,i)));}return a?a:zerocol(lgcols(x)-1);}
static GEN diag0(GEN v,GEN x){long i,l=lg(v);GEN a=cgetg(l,t_MAT);for(i=1;i<l;i++)gel(a,i)=gmul(gel(x,i),gel(v,i));return a;}
int main(void){pari_init(256000000,10000);long bits=192;GEN P=gp_read_str("x^3-200*x+7"),bnf=bnfinit0(P,1,NULL,nbits2prec(bits)),nf=bnf_get_nf(bnf),W=gel(bnf,1),C=gel(bnf,4),Ge=gmael(bnf,9,4),U,V,D=ZM_snfall(W,&U,&V),Dout=gcopy(D),Vout=gcopy(V),Ui=ZM_inv(U,NULL),Y,X,Ur=ZM_hnfdivrem(U,D,&Y),Uir=ZM_hnfdivrem(Ui,W,&X),M2=ZM_add(ZM_mul(X,Ur),ZM_mul(V,Y));long n=lg(W)-1,j,l;for(j=1;j<lg(D);j++)if(is_pm1(gcoeff(D,j,j)))break;l=j;long active=l-1;GEN cyc=cgetg(l,t_VEC);for(j=1;j<l;j++)gel(cyc,j)=gcoeff(D,j,j);setlg(V,l);setlg(D,l);GEN M1=ZM_add(V,ZM_mul(X,D)),Ga=nfV_cxlog(nf,Ge,nbits2prec(bits)),GD=gsub(act0(M1,C),diag0(cyc,Ga)),ga=gsub(act0(M2,C),act0(Ur,Ga));long factors=0;for(j=1;j<=active;j++)factors+=lg(gel(gel(Ge,j),1))-1;printf("%ld %ld %ld %ld ",n,active,bits,factors);imat(W);GEN EM=nf_get_M(nf);for(long r=1;r<=3;r++)for(long c=1;c<=3;c++)scalar(gcoeff(EM,r,c));lmat(C,n);for(j=1;j<=active;j++){GEN fa=gel(Ge,j),G=gel(fa,1),E=gel(fa,2);for(long k=1;k<lg(G);k++){GEN z=nf_to_scalar_or_basis(nf,gel(G,k));if(typ(z)==t_FRAC){printf("0 ");pari_printf("%Ps %Ps 0 0 0 ",gel(z,1),gel(z,2));}else if(typ(z)==t_INT){printf("0 ");pari_printf("%Ps 1 0 0 0 ",z);}else{printf("1 0 1 ");for(long q=1;q<=3;q++){if(typ(gel(z,q))!=t_INT)return 9;pari_printf("%Ps ",gel(z,q));}}pari_printf("%Ps ",gel(E,k));}}imat(Dout);imat(U);imat(Ui);imat(Vout);imat(Ur);imat(Y);imat(Uir);imat(X);imat(M1);imat(M2);for(j=1;j<=active;j++)pari_printf("%Ps ",gel(cyc,j));pari_printf("%Ps ",ZV_prod(cyc));lmat(Ga,active);lmat(GD,active);lmat(ga,n);putchar('\\n');pari_close();return 0;}`,
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
  const fixture = bigintFixture(parseTrace(trace));
  assert.deepEqual(
    fixture.factors.map((factor) => [factor.kind, factor.coordinates, factor.exponent]),
    [
      [0, ["0", "0", "0"], "1"],
      [0, ["0", "0", "0"], "1"],
      [1, ["-17", "1", "0"], "-1"],
      [0, ["0", "0", "0"], "1"],
    ],
    "authentic genback famat changed",
  );

  const python = `import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.class_group_assembly').pari_class_group_assembly
r=json.load(sys.stdin); n=r['n']; active=r['active']; size=n*n
cv=lambda xs:list(map(int,xs)); mats=[[77]*size for _ in range(10)]; inv=[77]*n; h=[77]; Ga=[77]*(21*active); GD=[77]*(21*active); ga=[77]*(21*n)
ss=[[77]*7 for _ in range(4)]+[[77]*9]; cs=[0,0,-1,-1,0,0,0,0]; state=[77]*8
args=[*map(cv,r['matrix']),cv(r['W']),cv(r['C']),*[cv(r['packed'][k]) for k in ['offsets','kinds','numerators','denominators','coordinates','exponents']],n,active,r['precision'],*mats,inv,h,Ga,GD,ga,[0]*n,[0]*size,[0]*(2*size),*ss,cs,[0]*3,[0]*21,[0]*21,*[[0]*64 for _ in range(6)],[0]*128,[0]*(21*n),[0]*(21*active),[0]*(21*active),[0]*(21*n),[0]*(21*n),[0]*(21*active),[0]*(21*n),state]
assert f(*args)==0
names=['D','U','Ui','V','Ur','Y','Uir','X','M1','M2']
for i,name in enumerate(names):
 length=n*active if name=='M1' else size
 assert mats[i][:length]==cv(r['expected'][name]),(name,mats[i][:length],r['expected'][name])
assert inv[:active]==cv(r['expected']['invariants']);assert h==cv(r['expected']['classNumber']);assert Ga==cv(r['expected']['Ga']);assert GD==cv(r['expected']['GD']);assert ga==cv(r['expected']['ga']);assert state==[0,n,active,0,0,(n-active)*n,active,n]
print(json.dumps({'sourceMode':'cpython','classNumber':h[0],'active':active}))`;
  const payload = JSON.parse(
    JSON.stringify(fixture, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
  const pythonResult = JSON.parse(
    run(
      "python3",
      [
        "-c",
        python,
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "../../src/lib"),
      ],
      { input: JSON.stringify(payload) },
    ),
  );

  const sourcePath = path.join(__dirname, "class_group_assembly.py");
  const built = await compileKernel({ sourcePath });
  const native = require(built.modulePath).pari_class_group_assembly;
  assert(native.nativeAvailable);
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath, "utf8"), /napi_call_function|PyObject_Call|v8::/);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const call = invocation(native, fixture, backend);
    assert.equal(native[backend](...call.args), 0n, backend);
    checkResult(call, fixture, backend);
  }

  // Publication failures: shape mismatch, invalid HNF, malformed Ge, and the
  // exact low-precision frontier must retain all final archimedean sentinels.
  let mutations = 0;
  for (const mutate of [
    (f) => (f.argumentActive = 0),
    (f) => (f.W[0] = 0n),
    (f) => (f.packed.denominators[0] = 0n),
    (f) => {
      for (let column = 0; column < 3; column++) f.matrix[1][column] = 64n;
    },
  ]) {
    const changed = structuredClone(fixture);
    mutate(changed);
    const call = invocation(native, changed, "javascript");
    let failed = false;
    try {
      const status = native.javascript(...call.args);
      failed = status !== 0n;
    } catch {
      failed = true;
    }
    assert(failed, `mutation ${mutations} accepted`);
    assert.deepEqual(values(call.Ga), Array(call.Ga.length).fill(77n));
    assert.deepEqual(values(call.GD), Array(call.GD.length).fill(77n));
    assert.deepEqual(values(call.ga), Array(call.ga.length).fill(77n));
    mutations += 1;
  }

  console.log(
    JSON.stringify({
      fixture: "x^3-200*x+7",
      classNumber: pythonResult.classNumber,
      smithDimension: fixture.n,
      activeGenerators: fixture.active,
      authenticGeFactors: fixture.factors.length,
      backends: ["PARI", "CPython", "javascript", "gmp", "tagged"],
      mutationRejections: mutations,
      traceSha256: hash(trace),
      sourceSha256: hash(fs.readFileSync(sourcePath)),
      coreBytes: fs.statSync(built.coreSourcePath).size,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
