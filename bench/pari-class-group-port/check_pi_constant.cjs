"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:"utf8",timeout:120000,maxBuffer:4*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64");
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pari,'src/basemath/trans1.c'))).digest('hex'),'287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-pi-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
int main(void){pari_init(32000000,10000);
for(long pass=0;pass<3;pass++)for(long i=1;i<=16;i++){long bits=(pass==1?17-i:i)*64,de;pari_sp av=avma;GEN v=mppi(bits);pari_printf("%ld %Ps %ld %ld\\n",bits,mantissa_real(v,&de),bit_prec(v),expo(v));avma=av;}
pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(s=>s.split(' '));assert.equal(rows.length,48);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.pi_constant').pari_pi_constant
work=[[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
for row in json.load(sys.stdin):
 v=list(map(int,row));assert f(v[0],*work)==tuple(v[1:]),v
before=str(work);assert f(64,work[0],[],[],[],[],[])==f(64,*work);assert str(work)==before
for bits in [0,63,1088]:
 try:f(bits,*work)
 except ValueError:pass
 else:raise AssertionError(bits)
try:f(64,[0]*3,[],[],[],[],[])
except ValueError:pass
else:raise AssertionError('short workspace')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'pi_constant.py')}),f=require(built.modulePath).pari_pi_constant;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp']){
  // At most 22 terms, each q below 2^68: 64 words comfortably cover
  // the binary-splitting products, not just the final 1024-bit constant.
  const make=n=>backend==='javascript'?Array(n).fill(0n):f.createIntegerBuffer(n,64);
  const work=[make(3),...Array.from({length:4},()=>make(64)),make(128)];
  for(const row of rows){const v=row.map(BigInt);assert.deepEqual(f[backend](v[0],...work),v.slice(1));}
  const snapshot=()=>work.map(v=>Array.isArray(v)?v.slice():v.toArray());
  const before=snapshot();assert.deepEqual(f[backend](64n,work[0],[],[],[],[],[]),f[backend](64n,...work));assert.deepEqual(snapshot(),before);
  for(const bits of [0n,63n,1088n])assert.throws(()=>f[backend](bits,...work));
  assert.throws(()=>f[backend](64n,Array(3).fill(0n),[],[],[],[],[]));
 }
 console.log(JSON.stringify({cases:rows.length,trace_sha256:createHash('sha256').update(trace).digest('hex'),core_bytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
