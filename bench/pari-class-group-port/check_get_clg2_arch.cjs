"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

(async () => {
  const pari = path.resolve(process.argv[2]);
  const archive = path.resolve(process.argv[3]);
  const lib = path.join(pari, "Olinux-x86_64");
  assert.equal(
    hash(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  const upstream = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/buch2.c",
  ]);
  assert.equal(hash(upstream), "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
  assert.equal(upstream, fs.readFileSync(path.join(pari, "src/basemath/buch2.c"), "utf8"));

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-get-clg2-arch-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    String.raw`#include "pari.h"
#include "paripriv.h"
static GEN add_arch(GEN a, GEN t) { return a ? RgC_add(a,t) : t; }
static GEN act_arch_copy(GEN A, GEN x) {
  GEN a; long i, l = lg(A), tA = typ(A);
  if (tA == t_MAT) {
    a = cgetg(l, t_MAT);
    for (i = 1; i < l; i++) gel(a,i) = act_arch_copy(gel(A,i), x);
    return a;
  }
  if (l == 1) return cgetg(1, t_COL);
  a = NULL;
  if (tA == t_VECSMALL) {
    for (i = 1; i < l; i++) { long c = A[i]; if (c) a = add_arch(a, gmulsg(c,gel(x,i))); }
  } else {
    for (i = 1; i < l; i++) { GEN c = gel(A,i); if (signe(c)) a = add_arch(a, gmul(c,gel(x,i))); }
  }
  return a ? a : zerocol(lgcols(x)-1);
}
static GEN diagact_arch_copy(GEN v, GEN x) {
  long i, l = lg(v); GEN a = cgetg(l, t_MAT);
  for (i = 1; i < l; i++) gel(a,i) = gmul(gel(x,i),gel(v,i));
  return a;
}
static void emit_scalar(GEN x) {
  long e;
  if (typ(x) == t_INT) { pari_printf("\"%Ps\",\"-1\",\"0\"",x); return; }
  pari_printf("\"%Ps\",\"%ld\",\"%ld\"",
    signe(x) ? mantissa_real(x,&e) : gen_0,
    signe(x) ? bit_prec(x) : 0, expo(x));
}
static void emit_entry(GEN x) {
  if (typ(x) == t_COMPLEX) {
    printf("\"2\","); emit_scalar(gel(x,1)); putchar(','); emit_scalar(gel(x,2));
  } else {
    printf("\"1\","); emit_scalar(x); printf(",\"0\",\"-1\",\"0\"");
  }
}
static void emit_log_matrix(GEN x) {
  long i, j; int first = 1; putchar('[');
  for (j = 1; j < lg(x); j++) for (i = 1; i < lg(gel(x,j)); i++) {
    if (!first) putchar(','); first = 0; emit_entry(gcoeff(x,i,j));
  }
  putchar(']');
}
static void emit_zmatrix(GEN x) {
  long i, j; int first = 1; putchar('[');
  for (j = 1; j < lg(x); j++) for (i = 1; i < lg(gel(x,j)); i++) {
    if (!first) putchar(','); first = 0; pari_printf("\"%Ps\"",gcoeff(x,i,j));
  }
  putchar(']');
}
static void emit_zvector(GEN x) {
  long i; putchar('[');
  for (i = 1; i < lg(x); i++) { if (i > 1) putchar(','); pari_printf("\"%Ps\"",gel(x,i)); }
  putchar(']');
}
int main(void) {
  pari_init(256000000,10000);
  GEN polynomial = gp_read_str("x^3-10*x^2-30*x-195");
  GEN bnf = bnfinit0(polynomial,1,NULL,nbits2prec(192));
  GEN nf = bnf_get_nf(bnf), cyc = bnf_get_cyc(bnf), C = gel(bnf,4);
  GEN clg2 = gel(bnf,9), Ur = gel(clg2,1), stored_ga = gel(clg2,2);
  GEN stored_GD = gel(clg2,3), Ge = gel(clg2,4), M1 = gel(clg2,5), M2 = gel(clg2,6);
  long j, active = lg(cyc)-1, inner = lgcols(M1)-1, rows = lgcols(C)-1;
  GEN C0 = cgetg(inner+1,t_MAT);
  for (j = 1; j <= inner; j++) gel(C0,j) = gel(C,j);
  GEN Ga = cgetg(active+1,t_MAT);
  for (j = 1; j <= active; j++) {
    gel(Ga,j) = nf_cxlog(nf,gel(Ge,j),nf_get_prec(nf));
    if (!gel(Ga,j)) return 3;
  }
  if (active != inner) return 4;
  GEN GD = gsub(act_arch_copy(M1,C0),diagact_arch_copy(cyc,Ga));
  GEN ga = gsub(act_arch_copy(M2,C0),act_arch_copy(Ur,Ga));
  if (!gequal(GD,stored_GD) || !gequal(ga,stored_ga)) return 5;
  printf("{\"polynomial\":\"x^3-10*x^2-30*x-195\",\"rows\":%ld,\"inner\":%ld,\"active\":%ld,",rows,inner,active);
  printf("\"C\":"); emit_log_matrix(C0); printf(",\"M1\":"); emit_zmatrix(M1);
  printf(",\"cyc\":"); emit_zvector(cyc); printf(",\"Ga\":"); emit_log_matrix(Ga);
  printf(",\"M2\":"); emit_zmatrix(M2); printf(",\"Ur\":"); emit_zmatrix(Ur);
  printf(",\"GD\":"); emit_log_matrix(GD); printf(",\"ga\":"); emit_log_matrix(ga);
  puts("}"); pari_close(); return 0;
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
  const fixture = JSON.parse(trace);
  const names = ["C", "M1", "cyc", "Ga", "M2", "Ur", "GD", "ga"];
  for (const name of names) fixture[name] = fixture[name].map(BigInt);

  const python = String.raw`import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.get_clg2_arch').pari_get_clg2_arch
r=json.load(sys.stdin)
v={k:list(map(int,r[k])) for k in ('C','M1','cyc','Ga','M2','Ur','GD','ga')}
gd=[77]*len(v['GD']);ga=[77]*len(v['ga']);gw=[0]*len(gd);cw=[0]*len(ga);uw=[0]*len(ga)
assert f(v['C'],v['M1'],v['cyc'],v['Ga'],v['M2'],v['Ur'],r['rows'],r['inner'],r['active'],gd,ga,gw,cw,uw)==0
assert gd==v['GD'];assert ga==v['ga']
# Both result owners may alias their corresponding log inputs: publication is delayed.
c=v['C'][:];g=v['Ga'][:];gw=[0]*len(gd);cw=[0]*len(ga);uw=[0]*len(ga)
assert f(c,v['M1'],v['cyc'],g,v['M2'],v['Ur'],r['rows'],r['inner'],r['active'],c,g,gw,cw,uw)==0
assert c==v['GD'];assert g==v['ga']
# Shape/owner failures must not publish either result.
for change in ('rows','inner','active','short_c','short_gd'):
 a=[v[k][:] for k in ('C','M1','cyc','Ga','M2','Ur')];rows=r['rows'];inner=r['inner'];active=r['active']
 if change=='rows':rows=-1
 if change=='inner':inner=0
 if change=='active':active=inner+1
 if change=='short_c':a[0]=a[0][:-1]
 gd=[77]*len(v['GD']);ga=[77]*len(v['ga']);gw=[0]*len(gd);cw=[0]*len(ga);uw=[0]*len(ga)
 if change=='short_gd':gd=gd[:-1]
 before=(gd[:],ga[:])
 try:f(*a,rows,inner,active,gd,ga,gw,cw,uw)
 except ValueError:pass
 else:raise AssertionError('malformed input accepted: '+change)
 assert (gd,ga)==before
`;
  const payload = Object.fromEntries(
    Object.entries(fixture).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(String) : value,
    ]),
  );
  run(
    "python3",
    ["-c", python, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")],
    { input: JSON.stringify(payload) },
  );

  const built = await compileKernel({ sourcePath: path.join(__dirname, "get_clg2_arch.py") });
  const fn = require(built.modulePath).pari_get_clg2_arch;
  assert(fn.nativeAvailable);
  const backends = ["javascript", "gmp", "tagged"];
  const array = (value) => (Array.isArray(value) ? value : value.toArray());
  for (const backend of backends) {
    const make = (values) =>
      backend === "javascript"
        ? values.slice()
        : fn.createIntegerBuffer(values.length, 256, values);
    const args = ["C", "M1", "cyc", "Ga", "M2", "Ur"].map((name) => make(fixture[name]));
    const gd = make(Array(fixture.GD.length).fill(77n));
    const ga = make(Array(fixture.ga.length).fill(77n));
    const works = [make(Array(gd.length).fill(0n)), make(Array(ga.length).fill(0n)), make(Array(ga.length).fill(0n))];
    assert.equal(
      fn[backend](...args, BigInt(fixture.rows), BigInt(fixture.inner), BigInt(fixture.active), gd, ga, ...works),
      0n,
    );
    assert.deepEqual(array(gd), fixture.GD, `${backend} GD`);
    assert.deepEqual(array(ga), fixture.ga, `${backend} ga`);

    const aliasArgs = ["C", "M1", "cyc", "Ga", "M2", "Ur"].map((name) => make(fixture[name]));
    const aliasWorks = [make(Array(fixture.GD.length).fill(0n)), make(Array(fixture.ga.length).fill(0n)), make(Array(fixture.ga.length).fill(0n))];
    assert.equal(
      fn[backend](...aliasArgs, BigInt(fixture.rows), BigInt(fixture.inner), BigInt(fixture.active), aliasArgs[0], aliasArgs[3], ...aliasWorks),
      0n,
    );
    assert.deepEqual(array(aliasArgs[0]), fixture.GD, `${backend} aliased GD`);
    assert.deepEqual(array(aliasArgs[3]), fixture.ga, `${backend} aliased ga`);

    for (const mode of ["negative rows", "zero inner", "excess active", "short C", "short GD"]) {
      const bad = ["C", "M1", "cyc", "Ga", "M2", "Ur"].map((name) => make(fixture[name]));
      let rows = fixture.rows, inner = fixture.inner, active = fixture.active;
      if (mode === "negative rows") rows = -1;
      if (mode === "zero inner") inner = 0;
      if (mode === "excess active") active = inner + 1;
      if (mode === "short C") bad[0] = make(fixture.C.slice(0, -1));
      const badGd = make(Array(fixture.GD.length - Number(mode === "short GD")).fill(77n));
      const badGa = make(Array(fixture.ga.length).fill(77n));
      const beforeGd = array(badGd), beforeGa = array(badGa);
      const badWorks = [make(Array(fixture.GD.length).fill(0n)), make(Array(fixture.ga.length).fill(0n)), make(Array(fixture.ga.length).fill(0n))];
      assert.throws(() => fn[backend](...bad, BigInt(rows), BigInt(inner), BigInt(active), badGd, badGa, ...badWorks));
      assert.deepEqual(array(badGd), beforeGd);
      assert.deepEqual(array(badGa), beforeGa);
    }
  }

  console.log(JSON.stringify({
    authenticField: fixture.polynomial,
    shape: [fixture.rows, fixture.inner, fixture.active],
    backends: ["PARI", "CPython", ...backends],
    malformedCasesPerBackend: 5,
    aliasModesPerBackend: 2,
    pariArchiveSha256: hash(fs.readFileSync(archive)),
    buch2Sha256: hash(upstream),
    oracleBinarySha256: hash(fs.readFileSync(executable)),
    traceSha256: hash(trace),
    sourceSha256: hash(fs.readFileSync(path.join(__dirname, "get_clg2_arch.py"))),
    coreBytes: fs.statSync(built.coreSourcePath).size,
    artifactDirectory: directory,
  }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
