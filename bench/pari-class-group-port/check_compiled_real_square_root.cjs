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
  // One declared leaf corpus shared by CPython and every compiled backend.
  // 3967 bits covers the largest real-wrapper radicand (2*1920+127).
  const leafValues = new Set(Array.from({length:257},(_,i)=>String(i)));
  for (const k of [31,32,63,64,127,128,256,1024,3967])
    for (const d of [-1n,0n,1n]) leafValues.add(String((1n<<BigInt(k))+d));
  for (const k of [31,32,63,64,127,1983]) {
    const root=(1n<<BigInt(k))+1n;
    for (const d of [-1n,0n,1n]) leafValues.add(String(root*root+d));
  }
  const leafInputs=[...leafValues];
  const negativeInputs=["-1","-2",String(-(1n<<63n)),String(-(1n<<3967n))];
  const py = spawnSync("python3", ["-c", `
import sys,json,importlib,math
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
m=importlib.import_module('bench.pari-class-group-port.real_square_root')
data=json.load(sys.stdin)
for row in data['records']:
    values=list(map(int,row));got=m.pari_real_square_root_abs(*values[:3]);assert got==tuple(values[3:]),(values,got)
expected=[]
for value in map(int,data['leafInputs']):
    root=math.isqrt(value);assert m.pari_sqrtrem_integer(value)==(root,value-root*root)
    expected.append([str(root),str(value-root*root)])
for value in map(int,data['negativeInputs']):
    try: m.pari_sqrtrem_integer(value)
    except ValueError as error: assert 'negative integer square root' in str(error)
    else: raise AssertionError(('accepted negative',value))
print(json.dumps(expected))
`], {input:JSON.stringify({records,leafInputs,negativeInputs}),encoding:"utf8",timeout:30000});
  assert.equal(py.status, 0, py.stderr);
  const leafExpected=JSON.parse(py.stdout).map(row=>row.map(BigInt));
  const built = await compileKernel({sourcePath:path.join(__dirname,"real_square_root.py")}), mod = require(built.modulePath);
  for (const row of records) for (const backend of ["javascript", "gmp", "tagged"]) {
    const values = row.map(BigInt);
    assert.deepEqual(mod.pari_real_square_root_abs[backend](...values.slice(0,3)), values.slice(3), `${backend}: ${row}`);
  }
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (let i=0;i<leafInputs.length;i++) {
      const value=BigInt(leafInputs[i]);
      const [r,s] = mod.pari_sqrtrem_integer[backend](value);
      assert.deepEqual([r,s],leafExpected[i], `${backend}: exact sqrtrem ${value}`);
      assert.equal(r*r+s,value);assert(s>=0n && s<2n*r+1n);
    }
    for (const value of negativeInputs)
      assert.throws(()=>mod.pari_sqrtrem_integer[backend](BigInt(value)), /negative integer square root/);
    assert.throws(()=>mod.pari_real_square_root_abs[backend](0n,64n,0n), /nonzero full mantissa/);
    assert.throws(()=>mod.pari_real_square_root_abs[backend](1n,2048n,0n), /unsupported square root precision/);
  }
  console.log(`${records.length} square roots match PARI/CPython/JS/GMP/tagged; ${leafInputs.length} exact sqrtrem controls and ${negativeInputs.length} negative controls match CPython/JS/GMP/tagged; integer-root substitution remains explicit`);
})().catch(error => {console.error(error);process.exitCode=1;});
