"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs"), os = require("node:os");
const { spawnSync } = require("node:child_process"), { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
(async () => {
  const pari = path.resolve(process.argv[2]), lib = path.join(pari, "Olinux-x86_64"), dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-real-sqrt-"));
  const source = path.join(dir, "oracle.c"), exe = path.join(dir, "oracle");
  fs.writeFileSync(source, `#include "pari.h"
int main(void){pari_init(16000000,10000);setrand(stoi(1729));
long precs[]={64,128,192,256,512,1024,1920};
for(long pi=0;pi<7;pi++)for(long pattern=0;pattern<40;pattern++)for(long parity=0;parity<2;parity++)for(long sign=-1;sign<=1;sign+=2){
pari_sp av=avma;long p=precs[pi],e=2*(pattern-20)+parity,de;
GEN m=addii(int2n(p-1),randomi(int2n(p-1)));
if(pattern==0)m=int2n(p-1);if(pattern==1)m=addis(int2n(p-1),1);if(pattern==2)m=subis(int2n(p),1);
if(sign<0)m=negi(m);GEN x=itor(m,p);setexpo(x,e);GEN y=sqrtr_abs(x);GEN out=mantissa_real(y,&de);
pari_printf("%Ps %ld %ld %Ps %ld %ld\\n",m,p,e,out,bit_prec(y),expo(y));avma=av;
}pari_close();return 0;}`);
  const cc = spawnSync("cc", ["-O2", "-I"+path.join(pari,"src/headers"), "-I"+lib, source, "-L"+lib, "-Wl,-rpath,"+lib, "-lpari", "-lm", "-o", exe], {encoding:"utf8",timeout:30000});
  assert.equal(cc.status, 0, cc.stderr);
  const run = spawnSync(exe, [], {encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});
  assert.equal(run.status, 0, run.stderr);
  const records = run.stdout.trim().split("\n").map(line => line.split(" "));
  assert.equal(records.length, 1120);
  const py = spawnSync("python3", ["-c", `
import sys,json,importlib,math
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
m=importlib.import_module('bench.pari-class-group-port.real_square_root')
for row in json.load(sys.stdin):
    values=list(map(int,row));got=m.pari_real_square_root_abs(*values[:3]);assert got==tuple(values[3:]),(values,got)
for value in list(range(257))+[2**k+d for k in (63,64,127,256,1024,3967) for d in (-1,0,1)]:
    root=math.isqrt(value);assert m.pari_sqrtrem_integer(value)==(root,value-root*root)
`], {input:JSON.stringify(records),encoding:"utf8",timeout:30000});
  assert.equal(py.status, 0, py.stderr);
  const built = await compileKernel({sourcePath:path.join(__dirname,"real_square_root.py")}), mod = require(built.modulePath);
  for (const row of records) for (const backend of ["javascript", "gmp", "tagged"]) {
    const values = row.map(BigInt);
    assert.deepEqual(mod.pari_real_square_root_abs[backend](...values.slice(0,3)), values.slice(3), `${backend}: ${row}`);
  }
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const value of [0n,1n,2n,3n,4n,15n,16n,17n,(1n<<3967n)-1n]) {
      const [r,s] = mod.pari_sqrtrem_integer[backend](value);
      assert.equal(r*r+s,value);assert(s>=0n && s<2n*r+1n);
    }
    assert.throws(()=>mod.pari_sqrtrem_integer[backend](-1n), /negative integer square root/);
    assert.throws(()=>mod.pari_real_square_root_abs[backend](0n,64n,0n), /nonzero full mantissa/);
    assert.throws(()=>mod.pari_real_square_root_abs[backend](1n,2048n,0n), /unsupported square root precision/);
  }
  console.log(`${records.length} square roots match PARI/CPython/JS/GMP/tagged; integer-root substitution remains explicit`);
})().catch(error => {console.error(error);process.exitCode=1;});
