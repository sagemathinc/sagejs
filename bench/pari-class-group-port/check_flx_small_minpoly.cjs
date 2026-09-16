"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:128*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64'),sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/Flx.c']);assert.equal(fs.readFileSync(path.join(pari,'src/basemath/Flx.c'),'utf8'),source);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flx-minpoly-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,String.raw`#define _GNU_SOURCE
#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
#include <dlfcn.h>
static long projections;
GEN random_Flx(long d,long v,ulong p){typedef GEN(*F)(long,long,ulong);static F f;if(!f)f=(F)dlsym(RTLD_NEXT,"random_Flx");projections++;return f(d,v,p);}
int main(void){pari_init(64000000,10000);ulong seed,p;long n;while(scanf("%lu %ld %lu",&seed,&n,&p)==3){pari_sp av=avma;GEN t=cgetg(n+3,t_VECSMALL),x=cgetg(n+2,t_VECSMALL);t[1]=0;x[1]=0;for(long i=0;i<=n;i++)scanf("%lu",&uel(t,i+2));for(long i=0;i<n;i++)scanf("%lu",&uel(x,i+2));x=Flx_renormalize(x,n+2);setrand(utoi(seed));projections=0;GEN z=Flxq_minpoly(x,t,p);GEN s=getrand();printf("{\"polynomial\":[");for(long i=2;i<lg(z);i++)printf("%s\"%lu\"",i==2?"":",",uel(z,i));printf("],\"projections\":%ld,\"state\":[",projections);for(int i=0;i<66;i++){ulong v=*int_W(s,i);if(i==65)v&=63;printf("%s\"%lu\"",i?",":"",v);}puts("]}");avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-fsanitize=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-ldl','-lm','-o',exe]);
 const rows=[];let state=1234567;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 for(const seed of ['1','2','18446744073709551615'])for(const p of [3,5,37,3037000493])for(const n of [2,3,4])for(let trial=0;trial<16;trial++){
  const t=Array.from({length:n},()=>next()%p);t.push(1);const x=Array.from({length:n},()=>next()%p);if(trial===0)x.fill(0);if(trial===1){x.fill(0);x[0]=1;}if(trial===2){x.fill(0);x[1]=1;}if(trial===3)t.fill(0,0,n);rows.push({seed,p,n,t,x});
 }
 const expected=run(exe,[],{input:rows.map(r=>[r.seed,r.n,r.p,...r.t,...r.x].join(' ')).join('\n')+'\n'}).trim().split('\n').map(JSON.parse);assert.equal(expected.length,rows.length);assert(expected.every(e=>e.projections>0));
 const cp=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.flx_small_minpoly');rng=importlib.import_module('bench.pari-class-group-port.pari_random')
results=[]
for r,e in zip(*json.load(sys.stdin)):
 w=[77]*1602;w[2:2+r['n']]=r['x'];w[12:13+r['n']]=r['t'];s=[77]*68;rng.pari_random_seed(s,int(r['seed']));diag=[77]*3;before=w.copy();da=r['n']-1
 while da>=0 and r['x'][da]==0:da-=1
 d=m.pari_flxq_minpoly(w,2,da,12,r['n'],r['p'],24,64,s,diag)
 assert w[24:24+d+1]==list(map(int,e['polynomial'])) and s[:66]==list(map(int,e['state'])) and diag[0]==e['projections'],(r,e,w[24:24+d+1],diag)
 assert w[:24]==before[:24] and w[33:64]==before[33:64] and w[-2:]==[77]*2 and s[-2:]==[77]*2 and diag[1:]==[77]*2
 results.append({'d':d,'w':list(map(str,w)),'s':list(map(str,s)),'diag':list(map(str,diag)),'da':da})
for args in [[2,0,12,1,3,24,64],[2,0,12,5,3,24,64],[2,2,12,2,3,24,64],[2,0,12,2,2,24,64],[2,0,12,2,3037000495,24,64],[-1,0,12,2,3,24,64],[2,0,12,2,3,24,100]]:
 w=[77]*1602;s=[77]*68;diag=[77]*3;before=w.copy()
 try:m.pari_flxq_minpoly(w,*args,s,diag);assert False
 except ValueError:assert w==before and s==[77]*68 and diag==[77]*3
for short in [0,1,2]:
 w=[77]*1602;w[14]=1;s=[77]*(65 if short==0 else 68);diag=[] if short==1 else [77]*3
 if short==2:w[14]=0
 before=w.copy()
 try:m.pari_flxq_minpoly(w,2,0,12,2,3,24,64,s,diag);assert False
 except ValueError:assert w==before and all(v==77 for v in s+diag)
print(json.dumps(results))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])}));
 const backends=['cpython'];let coreSha256=null;
 if(process.argv.includes('--native')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'flx_small_minpoly.py')}),m=require(built.modulePath);coreSha256=sha(fs.readFileSync(built.coreSourcePath));
  const rngBuild=await compileKernel({sourcePath:path.join(__dirname,'pari_random.py')}),rng=require(rngBuild.modulePath);
  for(const backend of ['javascript','gmp','tagged']){
   for(let i=0;i<rows.length;i++){const r=rows[i],e=cp[i],w=Array(1602).fill(77n);w.splice(2,r.n,...r.x.map(BigInt));w.splice(12,r.n+1,...r.t.map(BigInt));const s=Array(68).fill(77n),diag=Array(3).fill(77n);rng.pari_random_seed[backend](s,BigInt(r.seed));const d=m.pari_flxq_minpoly[backend](w,2n,BigInt(e.da),12n,BigInt(r.n),BigInt(r.p),24n,64n,s,diag);assert.equal(d,BigInt(e.d));assert.deepEqual(w,e.w.map(BigInt));assert.deepEqual(s,e.s.map(BigInt));assert.deepEqual(diag,e.diag.map(BigInt));}
   for(const args of [[2,0,12,1,3,24,64],[2,0,12,5,3,24,64],[2,2,12,2,3,24,64],[2,0,12,2,2,24,64],[2,0,12,2,3037000495,24,64],[-1,0,12,2,3,24,64],[2,0,12,2,3,24,100]]){const w=Array(1602).fill(77n),s=Array(68).fill(77n),diag=Array(3).fill(77n);assert.throws(()=>m.pari_flxq_minpoly[backend](w,...args.map(BigInt),s,diag),/frontier|negative|short/);assert(w.every(v=>v===77n)&&s.every(v=>v===77n)&&diag.every(v=>v===77n));}
   for(const kind of [0,1,2]){const w=Array(1602).fill(77n);w[14]=kind===2?0n:1n;const before=w.slice(),s=Array(kind===0?65:68).fill(77n),diag=Array(kind===1?0:3).fill(77n);assert.throws(()=>m.pari_flxq_minpoly[backend](w,2n,0n,12n,2n,3n,24n,64n,s,diag),/short|monic/);assert.deepEqual(w,before);assert(s.every(v=>v===77n)&&diag.every(v=>v===77n));}
   backends.push(backend);
  }
 }
 const result={cases:rows.length,maxProjections:Math.max(...expected.map(e=>e.projections)),retryCases:expected.filter(e=>e.projections>1).length,backends,coreSha256,pariSourceSha256:sha(source),sourceSha256:sha(fs.readFileSync(path.join(__dirname,'flx_small_minpoly.py'))),qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
