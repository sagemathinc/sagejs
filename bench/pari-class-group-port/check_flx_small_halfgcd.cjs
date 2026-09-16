"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,input){const r=spawnSync(c,a,{input,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/Flx.c']);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-halfgcd-'));
 const code=String.raw`#include "pari.h"
#include "paripriv.h"
int main(void){pari_init(16000000,10000);long da,db;ulong p;
while(scanf("%ld%ld%lu",&da,&db,&p)==3){pari_sp av=avma;
GEN a=cgetg(da+3,t_VECSMALL),b=cgetg(db+3,t_VECSMALL);a[1]=b[1]=0;
for(long i=0;i<=da;i++)scanf("%lu",(ulong*)&a[i+2]);
for(long i=0;i<=db;i++)scanf("%lu",(ulong*)&b[i+2]);
GEN M=Flx_halfgcd(a,b,p);putchar('[');int first=1;
for(long i=1;i<=2;i++)for(long j=1;j<=2;j++){GEN z=gcoeff(M,i,j);long d=degpol(z);for(long k=0;k<9;k++){if(!first)putchar(',');first=0;printf("%lu",k<=d?(ulong)z[k+2]:0UL);}}
for(long i=1;i<=2;i++)for(long j=1;j<=2;j++)printf(",%ld",degpol(gcoeff(M,i,j)));
puts("]");set_avma(av);}pari_close();return 0;}`;
 fs.writeFileSync(path.join(directory,'oracle.c'),code);run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(directory,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(directory,'oracle')]);
 const rows=[];let seed=19n;const draw=p=>{seed=(1664525n*seed+1013904223n)%4294967296n;return Number(seed%BigInt(p));};
 for(const p of [3,5,37,2147483647])for(let da=1;da<=8;da++)for(let db=-1;db<da;db++)for(let rep=0;rep<3;rep++){
  const a=Array.from({length:da+1},()=>rep===0?0:draw(p)),b=Array.from({length:db+1},()=>draw(p));a[da]=rep===0?1:1+draw(p-1);if(db>=0)b[db]=1+draw(p-1);rows.push({a,b,da,db,p});
 }
 const expected=run(path.join(directory,'oracle'),[],rows.map(r=>[r.da,r.db,r.p,...r.a,...r.b].join(' ')).join('\n')+'\n').trim().split('\n').map(JSON.parse);
 const packets=rows.map(r=>{const w=Array(150).fill('77');r.a.forEach((v,i)=>w[i]=String(v));r.b.forEach((v,i)=>w[9+i]=String(v));return [w,'0',String(r.da),'9',String(r.db),String(r.p),'18','58'];});
 const cp=JSON.parse(run('python3',['-c',`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.flx_small_halfgcd').pari_flx_small_halfgcd
out=[]
for packet in json.load(sys.stdin):
 a=[list(map(int,packet[0]))]+list(map(int,packet[1:]))
 result=f(*a);out.append(dict(result=result,w=list(map(str,a[0]))))
for length,args in [(147,[0,8,9,7,3,18,58]),(150,[0,8,9,7,3,0,58]),(150,[0,9,9,7,3,18,58]),(150,[0,8,9,8,3,18,58]),(150,[0,8,9,7,2,18,58]),(150,[0,8,9,7,3,18,50])]:
 w=[77]*length
 try:f(w,*args)
 except ValueError:pass
 else:raise AssertionError('missing halfgcd guard')
 assert w==[77]*length
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],JSON.stringify(packets)));
 for(let i=0;i<rows.length;i++){assert.equal(cp[i].result,0);assert.deepEqual(cp[i].w.slice(18,58),expected[i].map(String));assert.deepEqual(cp[i].w.slice(0,18),packets[i][0].slice(0,18));assert.deepEqual(cp[i].w.slice(148),['77','77']);}
 const built=await require('../../tools/native-kernel/compiler.cjs').compileKernel({sourcePath:path.join(__dirname,'flx_small_halfgcd.py')});
 const f=require(built.modulePath).pari_flx_small_halfgcd;
 for(const backend of ['javascript','gmp','tagged'])for(let i=0;i<rows.length;i++){
  const w=f.createIntegerBuffer(150,8,packets[i][0].map(BigInt));const result=Number(f[backend](w,...packets[i].slice(1).map(BigInt)));
  assert.deepEqual({result,w:w.toArray().map(String)},cp[i]);
 }
 for(const backend of ['javascript','gmp','tagged'])for(const [length,args] of [[147,[0,8,9,7,3,18,58]],[150,[0,8,9,7,3,0,58]],[150,[0,9,9,7,3,18,58]],[150,[0,8,9,8,3,18,58]],[150,[0,8,9,7,2,18,58]],[150,[0,8,9,7,3,18,50]]]){
  const w=f.createIntegerBuffer(length,8,Array(length).fill(77n));assert.throws(()=>f[backend](w,...args.map(BigInt)),/small halfgcd/);assert.deepEqual(w.toArray(),Array(length).fill(77n));
 }
 const result={cases:rows.length,backends:['cpython','javascript','gmp','tagged'],directory,sourceHash:hash(fs.readFileSync(path.join(__dirname,'flx_small_halfgcd.py'))),upstreamHash:hash(source),coreHash:hash(fs.readFileSync(built.coreSourcePath)),qualifiedTiming:false};
 fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
