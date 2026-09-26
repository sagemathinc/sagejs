"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120000,
    maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
(async () => {
  const pari = path.resolve(process.argv[2]), lib = path.join(pari, "Olinux-x86_64");
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(pari,
    "src/basemath/trans1.c"))).digest("hex"),
    "287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-multiword-log-"));
  const c = path.join(dir, "oracle.c"), exe = path.join(dir, "oracle");
  fs.writeFileSync(c, `#include "pari.h"
int main(void) {
  pari_init(32000000,10000); setrand(stoi(1729));
  long exponents[]={-10000,-1000,-65,-1,0,1,65,1000,10000};
  for(long bits=64;bits<=384;bits+=64)
    for(long k=0;k<48;k++) for(long ei=0;ei<9;ei++) for(long sign=-1;sign<=1;sign+=2) {
      pari_sp av=avma; long de,e=exponents[ei];
      GEN m=addii(int2n(bits-1),randomi(int2n(bits-1)));
      long t=(k/2)%6, shift=t*64;
      if(k<12 && shift<bits-1) m=(k%2)?subii(int2n(bits),int2n(shift)):addii(int2n(bits-1),int2n(shift));
      if(k==12)m=int2n(bits-1);
      if(k==13)m=subis(int2n(bits),1);
      if(k==14)m=addii(shifti(utoipos((~0UL/3)*2),bits-64),gen_1);
      if(k==15)m=shifti(utoipos((~0UL/3)*2+1),bits-64);
      if(sign<0)m=negi(m);
      GEN x=itor(m,bits);setexpo(x,e);GEN y=logr_abs(x);
      pari_printf("%Ps %ld %ld %Ps %ld %ld\\n",m,bits,e,signe(y)?mantissa_real(y,&de):gen_0,signe(y)?bit_prec(y):0,expo(y));
      avma=av;
    }
  pari_close();return 0;
}`);
  run("cc", ["-O2", "-I" + path.join(pari, "src/headers"), "-I" + lib, c,
    "-L" + lib, "-Wl,-rpath," + lib, "-lpari", "-lm", "-o", exe]);
  const trace = run(exe, []), rows = trace.trim().split("\n").map(s => s.split(" "));
  assert.equal(rows.length, 5184);
  run("python3", ["-c", `import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.real_logarithm').pari_real_logarithm_multiword
work=[[0]*3]+[[0]*256 for _ in range(4)]+[[0]*512]
for ix,row in enumerate(json.load(sys.stdin)):
 v=list(map(int,row));got=f(*v[:3],*work);assert got==tuple(v[3:]),(ix,v,got)
for args in [(1,64,0),(1<<63,448,0),(1<<63,64,10001)]:
 before=str(work)
 try:f(*args,*work)
 except ValueError:pass
 else:raise AssertionError(args)
 assert str(work)==before
`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")],
  { input: JSON.stringify(rows) });
  const built = await compileKernel({ sourcePath: path.join(__dirname, "real_logarithm.py") });
  const f = require(built.modulePath).pari_real_logarithm_multiword;
  assert(f.nativeAvailable);
  for (const backend of ["javascript", "gmp"]) {
    const work = [Array(3).fill(0n), ...Array.from({length:4}, () => Array(256).fill(0n)), Array(512).fill(0n)];
    for (const [i, row] of rows.entries()) {
      const v = row.map(BigInt);
      assert.deepEqual(f[backend](...v.slice(0, 3), ...work), v.slice(3), `${backend} ${i}`);
    }
    for (const args of [[1n,64n,0n],[1n<<63n,448n,0n],[1n<<63n,64n,10001n]]) {
      const before = structuredClone(work);
      assert.throws(() => f[backend](...args,...work));
      assert.deepEqual(work,before);
    }
  }
  console.log(JSON.stringify({ cases: rows.length, precision: "64..384 bits", trace_sha256:
    createHash("sha256").update(trace).digest("hex"), core_bytes:fs.statSync(built.coreSourcePath).size }));
})().catch(error => { console.error(error); process.exitCode = 1; });
