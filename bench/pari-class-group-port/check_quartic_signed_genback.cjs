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
const CANDIDATES = [
  [5099n, 0n, 0n, 0n],
  [25999801n, 0n, 0n, 0n],
  [56861n, -11n, 0n, 0n],
  [22n, 1n, 0n, 0n],
  [-30151186825648964n, 83085512275137n, 16518741033n, -17982819n],
  [-229n, 1n, 0n, 0n],
  [-822310719931774691n, -6114803664512006n, -2453125764292n, -47408694981n],
];

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
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
function pristineOracle(pari, archive) {
  assert.equal(hash(fs.readFileSync(archive)), ARCHIVE_SHA256);
  const lib = path.join(pari, "Olinux-x86_64");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-quartic-genback-"));
  const source = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(
    source,
    `#include "pari.h"
#include "paripriv.h"
static void emitrow(GEN M,long n){for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)pari_printf("%Ps ",gcoeff(M,i,j));}
static void emitfactor(GEN F){long i,n=lg(gel(F,1))-1;printf("%ld ",n);for(i=1;i<=n;i++){GEN x=gcoeff(F,i,1),e=gcoeff(F,i,2);if(typ(x)==t_COL){printf("1 ");for(long j=1;j<=4;j++)pari_printf("%Ps ",gel(x,j));printf("1 ");}else{GEN a=x,d=gen_1;if(typ(x)==t_FRAC){a=gel(x,1);d=gel(x,2);}printf("0 ");pari_printf("%Ps 0 0 0 %Ps ",a,d);}pari_printf("%Ps ",e);}}
int main(void){pari_init(768000000,10000);GEN b=bnfinit0(gp_read_str("x^4-200000002*x-200000002"),1,NULL,nbits2prec(192));GEN nf=bnf_get_nf(b),Vb=gel(b,5),Ge=gmael(b,9,4),G=bnf_get_gen(b),W=gel(b,1),U,V,Y,X;GEN D=ZM_snfall(W,&U,&V),Ui=ZM_inv(U,NULL);ZM_hnfdivrem(U,D,&Y);GEN Uir=ZM_hnfdivrem(Ui,W,&X);emitrow(nf_get_roundG(nf),4);for(long i=1;i<=4;i++)for(long j=1;j<=4;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=4;k++)pari_printf("%Ps ",gel(v,k));}for(long j=1;j<=3;j++)emitrow(idealhnf(nf,gel(Vb,j)),4);for(long j=1;j<=2;j++)emitrow(gel(G,j),4);for(long j=1;j<=2;j++)emitfactor(gel(Ge,j));for(long j=1;j<=2;j++)for(long i=1;i<=3;i++)pari_printf("%Ps ",gcoeff(Uir,i,j));putchar('\\n');pari_close();return 0;}`,
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
  const words = run(executable, []).trim().split(/\s+/).map(BigInt);
  let at = 0;
  const take = (n) => { const answer = words.slice(at, at + n); at += n; return answer; };
  const roundedT2 = take(16), table = take(64);
  const primes = [take(16), take(16), take(16)];
  const generators = [take(16), take(16)];
  const factors = [];
  for (let generator = 0; generator < 2; generator += 1) {
    const count = Number(take(1)[0]), list = [];
    for (let i = 0; i < count; i += 1) {
      list.push({ kind: take(1)[0], values: take(5), exponent: take(1)[0] });
    }
    factors.push(list);
  }
  const relation = take(6);
  assert.equal(at, words.length);
  return { roundedT2, table, primes, generators, factors, relation, directory };
}

function makeWorkspace(z, fz) {
  return [
    z(16), z(4), z(4), z(52), z(20), z(4), z(16), z(16), z(16), z(16),
    z(5), z(4), z(16), z(16), z(16), z(16), z(16), z(16), z(16), z(16),
    z(48), z(48), z(48), z(12), z(12), z(12), z(4), z(7), z(12), z(12),
    z(12), z(4), z(4), z(4), z(4), z(12), z(12), z(12), z(12), z(4),
    fz(16), fz(16), fz(4), fz(16), z(4), fz(16), z(16), z(16), z(16),
    z(4), z(4), z(4), fz(4), fz(1), z(4),
  ];
}
function values(owner) { return Array.isArray(owner) ? owner : owner.toArray(); }
function execute(mod, backend, fixture) {
  const exact = (a) => backend === "javascript" ? a : mod.pari_quartic_t2_candidate.packIntegerBuffer(a, 1536);
  const z = (n) => exact(Array(n).fill(0n));
  const fz = (n) => Array(n).fill(0);
  const T = exact(fixture.table), RG = exact(fixture.roundedT2), P = fixture.primes.map(exact);
  const call = (name, ...args) => mod[name][backend](...args);
  const candidate = (ideal) => {
    const workspace = makeWorkspace(z, fz);
    assert.equal(call("pari_quartic_t2_candidate", ideal, T, RG, ...workspace), 0n);
    return exact(values(workspace.at(-1)));
  };
  const multiply = (left, right) => {
    const output = z(16);
    assert.equal(call("pari_quartic_ideal_hnf_multiply", left, right, T, z(64), z(32), z(52), z(20), z(4), z(16), output), 0n);
    return output;
  };
  const inverse = (ideal) => {
    const output = z(16);
    assert.equal(call("pari_quartic_ideal_hnf_inverse_scaled", ideal, T, z(16), z(4), z(4), z(52), z(20), z(4), output), 0n);
    return output;
  };
  const factorStore = () => ({ kinds: z(20), vals: z(100), exps: z(20), meta: exact([0n]) });
  const reduce = (ideal, content, factors) => {
    const y = candidate(ideal), output = z(16);
    assert.deepEqual(values(y), CANDIDATES[reduce.cursor++], `${backend}: candidate ${reduce.cursor}`);
    call("pari_quartic_idealred_candidate", ideal, T, y, exact(content), factors.kinds, factors.vals, factors.exps, factors.meta, z(16), z(16), z(4), z(1), z(52), z(20), z(4), output);
    return output;
  };
  reduce.cursor = 0;
  const extend = (source, target) => call("pari_quartic_factor_extend", source.kinds, source.vals, source.exps, source.meta, target.kinds, target.vals, target.exps, target.meta);

  const firstFactors = factorStore();
  const first = reduce(P[0], [1n, 1n], firstFactors);
  const secondFactors = factorStore();
  let second = reduce(multiply(P[0], P[0]), [1n, 1n], secondFactors);
  const denominator = values(second)[0];
  assert.equal(values(secondFactors.meta)[0], 0n);
  second = reduce(inverse(second), [1n, denominator], secondFactors);
  const p2Factors = factorStore();
  let p2 = reduce(inverse(P[1]), [1n, values(P[1])[0]], p2Factors);
  second = multiply(second, p2); extend(p2Factors, secondFactors);
  second = reduce(second, [1n, 1n], secondFactors);
  const p3Factors = factorStore();
  let p3 = reduce(inverse(P[2]), [1n, values(P[2])[0]], p3Factors);
  second = multiply(second, p3); extend(p3Factors, secondFactors);
  second = reduce(second, [1n, 1n], secondFactors);
  assert.equal(reduce.cursor, 7);
  const unpackFactors = (store) => Array.from({ length: Number(values(store.meta)[0]) }, (_, i) => ({ kind: values(store.kinds)[i], values: values(store.vals).slice(5 * i, 5 * i + 5), exponent: values(store.exps)[i] }));
  return { generators: [values(first), values(second)], factors: [unpackFactors(firstFactors), unpackFactors(secondFactors)] };
}
function mutationControls(mod, backend, fixture) {
  const kernel = mod.pari_quartic_idealred_candidate;
  const exact = (a) => backend === "javascript" ? a : kernel.packIntegerBuffer(a, 1536);
  const z = (n, value = 0n) => exact(Array(n).fill(value));
  const output = z(16, 77n);
  assert.throws(
    () => kernel[backend](
      exact(fixture.primes[0]),
      exact(fixture.table),
      exact([5099n, 1n, 0n, 0n]),
      exact([1n, 1n]),
      z(4), z(20), z(4), exact([0n]),
      z(16), z(16), z(4), z(1), z(52), z(20), z(4), output,
    ),
    /does not map ideal integrally/,
    `${backend}: mutated candidate rejection`,
  );
  assert.deepEqual(values(output), Array(16).fill(77n), `${backend}: atomic rejection`);
}

(async () => {
  const pari = path.resolve(process.argv[2] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4");
  const archive = path.resolve(process.argv[3] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz");
  const fixture = pristineOracle(pari, archive);
  assert.deepEqual(fixture.relation, [1n, 0n, 0n, -2n, -1n, -1n]);
  assert.deepEqual(fixture.factors.map((x) => x.length), [0, 7]);

  const payload = JSON.stringify(fixture, (_, value) => typeof value === "bigint" ? value.toString() : value);
  const pythonCandidates = CANDIDATES.map((row) => row.map(String));
  const python = run("python3", ["-c", `
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
q=importlib.import_module('bench.pari-class-group-port.quartic_signed_genback')
r=json.load(sys.stdin); cv=lambda a:list(map(int,a)); T=cv(r['table']);RG=cv(r['roundedT2']);P=[cv(x) for x in r['primes']];z=lambda n:[0]*n;zf=lambda n:[0.0]*n
A=[z(16),z(4),z(4),z(52),z(20),z(4),z(16),z(16),z(16),z(16),z(5),z(4),z(16),z(16),z(16),z(16),z(16),z(16),z(16),z(16),z(48),z(48),z(48),z(12),z(12),z(12),z(4),z(7),z(12),z(12),z(12),z(4),z(4),z(4),z(4),z(12),z(12),z(12),z(12),z(4),zf(16),zf(16),zf(4),zf(16),z(4),zf(16),z(16),z(16),z(16),z(4),z(4),z(4),zf(4),zf(1),z(4)]
C=[list(map(int,row)) for row in ${JSON.stringify(pythonCandidates)}]; cursor=0
def cand(I):
 global cursor
 for x in A:
  for i in range(len(x)): x[i]=0
 q.pari_quartic_t2_candidate(I,T,RG,*A); y=A[-1][:]; assert y==C[cursor],(cursor,y);cursor+=1;return y
def mul(L,R):
 o=z(16);q.pari_quartic_ideal_hnf_multiply(L,R,T,z(64),z(32),z(52),z(20),z(4),z(16),o);return o
def inv(I):
 o=z(16);q.pari_quartic_ideal_hnf_inverse_scaled(I,T,z(16),z(4),z(4),z(52),z(20),z(4),o);return o
def store():return [z(20),z(100),z(20),[0]]
def red(I,c,s):
 o=z(16);q.pari_quartic_idealred_candidate(I,T,cand(I),c,*s,z(16),z(16),z(4),z(1),z(52),z(20),z(4),o);return o
def ext(a,b):q.pari_quartic_factor_extend(*a,*b)
def factors(s):return [{'kind':s[0][i],'values':s[1][5*i:5*i+5],'exponent':s[2][i]} for i in range(s[3][0])]
s1=store();G1=red(P[0],[1,1],s1);s2=store();G2=red(mul(P[0],P[0]),[1,1],s2);d=G2[0];s2[2][:s2[3][0]]=[-x for x in s2[2][:s2[3][0]]];G2=red(inv(G2),[1,d],s2);t=store();B=red(inv(P[1]),[1,P[1][0]],t);G2=mul(G2,B);ext(t,s2);G2=red(G2,[1,1],s2);t=store();B=red(inv(P[2]),[1,P[2][0]],t);G2=mul(G2,B);ext(t,s2);G2=red(G2,[1,1],s2)
answer={'generators':[G1,G2],'factors':[factors(s1),factors(s2)]}
def enc(x):
 if isinstance(x,list): return [enc(v) for v in x]
 if isinstance(x,dict): return {k:enc(v) for k,v in x.items()}
 return str(x)
print(json.dumps(enc(answer)))
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], { input: payload });
  const dynamic = JSON.parse(python, (_, value) => typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : value);
  assert.deepEqual(dynamic.generators, fixture.generators, "CPython generators");
  assert.deepEqual(dynamic.factors, fixture.factors, "CPython factors");

  const sourcePath = path.join(__dirname, "quartic_signed_genback.py");
  const built = await compileKernel({ sourcePath });
  const mod = require(built.modulePath);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const answer = execute(mod, backend, fixture);
    assert.deepEqual(answer.generators, fixture.generators, `${backend}: generators`);
    assert.deepEqual(answer.factors, fixture.factors, `${backend}: factors`);
    mutationControls(mod, backend, fixture);
  }
  console.log(JSON.stringify({
    polynomial: "x^4-200000002*x-200000002",
    smithColumn: fixture.relation.slice(3).map(String),
    reductions: 7,
    finalFactors: 7,
    multiwordProductNorm: "167617610254588861937",
    backends: ["pristine PARI 2.17.4", "CPython", "javascript", "gmp", "tagged"],
    coreSha256: hash(fs.readFileSync(built.coreSourcePath)),
    qualifiedTiming: false,
    directory: fixture.directory,
  }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
