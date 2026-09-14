"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process"), { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
function run(command, args, options = {}) {
 const r = spawnSync(command, args, { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024, ...options });
 assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout;
}
(async () => {
 const pari = path.resolve(process.argv[2]), lib = path.join(pari, "Olinux-x86_64");
 for (const [file, sha] of Object.entries({
  "src/basemath/hnf_snf.c": "264aef9c86b4454b2761d8424571f74c8ecc5ed38f12aa806800c0bef5f6cdbf",
  "src/basemath/base3.c": "5cbf4ebd6c70deb06cfd83f94b8d86368e60cd084f318a003a8ee14821e1cbea",
  "src/basemath/base4.c": "46301497631028a5978266bb4a27c2bdf0a13aab8fb60335e3f359438b76d5e7",
 })) {
 assert.equal(createHash("sha256").update(fs.readFileSync(path.join(pari, file))).digest("hex"), sha);
 assert.equal(createHash("sha256").update(run("tar", ["-xOf", process.argv[3], "pari-2.17.4/" + file])).digest("hex"), sha);
 }
 const cases = [];
 for (const n of [3, 4]) for (const p of [2n, 3n, 257n, 2147483659n, 18446744073709551557n]) for (let kind = 0; kind < 12; kind++) {
  const a = Array.from({ length: n * n }, (_, k) => {
   const i = Math.floor(k / n), j = k % n;
   if (kind === 0) return 0n;
   if (kind === 1) return BigInt(i === j);
   if (kind === 2) return BigInt(i === j) * p;
   if (kind === 3) return BigInt(i + j + 1);
   if (kind === 4) return BigInt(j === n - 1 ? 0 : i * j + 1);
   if (kind === 5) return BigInt(i === n - 1 ? 0 : i + j * j);
   return BigInt((i + 1) * (j + 2) * (kind + 1) - (i === j ? 19 : 3)) * (kind % 2 ? 1n : 1n << 90n);
  });
  cases.push({ n, p: String(p), a: "[" + Array.from({ length: n }, (_, i) => a.slice(i * n, (i + 1) * n).join(",")).join(";") + "]" });
 }
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prime-hnf-")), c = path.join(dir, "oracle.c"), exe = path.join(dir, "oracle");
 // The C control calls upstream routines; it contains no replacement HNF.
 fs.writeFileSync(c, `#include "pari.h"
#include "paripriv.h"
static void matrix(GEN M,long n){putchar('[');for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){if(i!=1||j!=1)putchar(',');pari_printf("\\"%Ps\\"",gcoeff(M,i,j));}putchar(']');}
static void emit(GEN M,GEN p,GEN H,GEN nf,GEN pr){long n=lg(M)-1;printf("{\\"n\\":%ld,\\"actual\\":%d,\\"rank\\":%ld,\\"p\\":",n,nf!=NULL,FpM_rank(M,p));pari_printf("\\"%Ps\\",\\"input\\":",p);matrix(M,n);printf(",\\"output\\":");matrix(H,n);
if(nf){printf(",\\"inert\\":%d,\\"generator\\":[",pr_is_inert(pr));for(long k=1;k<=n;k++){if(k>1)putchar(',');pari_printf("\\"%Ps\\"",pr_is_inert(pr)?gen_0:gel(pr_get_gen(pr),k));}printf("],\\"table\\":[");for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++){if(i!=1||j!=1||k!=1)putchar(',');pari_printf("\\"%Ps\\"",gel(v,k));}}putchar(']');}puts("}");}
int main(void){pari_init(128000000,10000);
const char *ms[]={${cases.map(r => JSON.stringify(r.a)).join(",")}},*ps[]={${cases.map(r => JSON.stringify(r.p)).join(",")}};
for(long k=0;k<${cases.length};k++){pari_sp av=avma;GEN M=gp_read_str(ms[k]),p=gp_read_str(ps[k]);emit(M,p,ZM_hnfmodprime(M,p),NULL,NULL);avma=av;}
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
long primes[]={2,3,5,7,11,13,17,19};
for(long k=0;k<4;k++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[k]),DEFAULTPREC);long n=nf_get_degree(nf);
for(long t=0;t<8;t++){GEN p=stoi(primes[t]),dec=idealprimedec(nf,p);for(long j=1;j<lg(dec);j++){GEN pr=gel(dec,j),M=pr_is_inert(pr)?zeromatcopy(n,n):zk_multable(nf,pr_get_gen(pr));emit(M,p,pr_hnf(nf,pr),nf,pr);}}
avma=av;}pari_close();return 0;}`);
 run("cc", ["-O2", "-I" + path.join(pari, "src/headers"), "-I" + lib, c, "-L" + lib, "-Wl,-rpath," + lib, "-lpari", "-lm", "-o", exe]);
 const trace = run(exe, []), rows = trace.trim().split("\n").map(JSON.parse);
 assert(rows.some(r => r.rank === 0) && rows.some(r => r.rank === r.n));
 assert(rows.some(r => r.actual && r.rank > 0 && r.rank < r.n));
 run("python3", ["-c", `import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
module=importlib.import_module('bench.pari-class-group-port.prime_ideal_hnf');f=module.pari_prime_modulus_hnf
for index,r in enumerate(json.load(sys.stdin)):
 n=r['n'];a=list(map(int,r['input']));before=a[:];out=[0]*(n*n)
 rank=f(a,n,int(r['p']),[0]*(n*n),[0]*n,out)
 assert rank==r['rank'] and out==list(map(int,r['output'])) and a==before,(index,r,rank,out)
 if r['actual']:
  m=[0]*(n*n);out=[0]*(n*n)
  rank=module.pari_prime_ideal_hnf(list(map(int,r['table'])),list(map(int,r['generator'])),n,int(r['p']),r['inert'],m,[0]*(n*n),[0]*n,out)
  assert rank==r['rank'] and out==list(map(int,r['output'])) and m==a,(index,r,rank,m,out)
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], { input: JSON.stringify(rows) });
 const built = await compileKernel({ sourcePath: path.join(__dirname, "prime_ideal_hnf.py") }), f = require(built.modulePath).pari_prime_modulus_hnf;
 assert.equal(f.nativeAvailable, true);
 assert.equal(require(built.modulePath).pari_prime_ideal_hnf.nativeAvailable, true);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath, "utf8"), /napi_call_function|PyObject_Call/);
 for (const [index, r] of rows.entries()) for (const backend of ["javascript", "gmp"]) {
  const a = r.input.map(BigInt), out = Array(r.n * r.n).fill(0n);
  const rank = f[backend](a, BigInt(r.n), BigInt(r.p), Array(r.n * r.n).fill(0n), Array(r.n).fill(0n), out);
  assert.equal(rank, BigInt(r.rank), `${index} ${backend}`);
  assert.deepEqual(out, r.output.map(BigInt), `${index} ${backend}`); assert.deepEqual(a, r.input.map(BigInt));
  if (r.actual) {
   const g = require(built.modulePath).pari_prime_ideal_hnf, m = Array(r.n*r.n).fill(0n), h = Array(r.n*r.n).fill(0n);
   const table = r.table.map(BigInt), generator = r.generator.map(BigInt);
   assert.equal(g[backend](table, generator, BigInt(r.n), BigInt(r.p), BigInt(r.inert), m, Array(r.n*r.n).fill(0n), Array(r.n).fill(0n), h), BigInt(r.rank));
   assert.deepEqual(h, r.output.map(BigInt)); assert.deepEqual(m, a);
   assert.deepEqual(table, r.table.map(BigInt)); assert.deepEqual(generator, r.generator.map(BigInt));
  }
 }
 console.log(`${rows.length} prime-modulus HNFs match PARI/CPython/JS/GMP (${rows.filter(r => r.actual).length} actual prime ideals); original matrices unchanged`);
 console.log(JSON.stringify({ traceSha256: createHash("sha256").update(trace).digest("hex"), qualifiedTiming: false, modulePath: built.modulePath }));
})().catch(error => { console.error(error); process.exitCode = 1; });
