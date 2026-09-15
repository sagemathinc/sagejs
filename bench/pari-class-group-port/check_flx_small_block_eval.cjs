"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64'),sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/Flx.c']);assert.equal(fs.readFileSync(path.join(pari,'src/basemath/Flx.c'),'utf8'),source);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-flx-block-eval-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,String.raw`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
static void poly(GEN q){putchar('[');for(long i=2;i<lg(q);i++)printf("%s%lu",i==2?"":",",uel(q,i));putchar(']');}
int main(void){pari_init(64000000,10000);ulong p;long n,dq,count,kind;while(scanf("%ld %ld %ld %ld %lu",&kind,&n,&dq,&count,&p)==5){pari_sp av=avma;GEN t=cgetg(n+3,t_VECSMALL),x=cgetg(n+2,t_VECSMALL),q=cgetg(dq+3,t_VECSMALL);t[1]=0;x[1]=0;q[1]=0;for(long i=0;i<=n;i++)scanf("%lu",&uel(t,i+2));for(long i=0;i<n;i++)scanf("%lu",&uel(x,i+2));for(long i=0;i<=dq;i++)scanf("%lu",&uel(q,i+2));x=Flx_renormalize(x,n+2);GEN v=Flxq_powers(x,count-1,t,p),z=kind?Flx_FlxqV_eval(q,v,t,p):Flx_Flxq_eval(q,x,t,p);printf("{\"output\":");poly(z);printf(",\"powers\":[");for(long i=1;i<lg(v);i++){if(i>1)putchar(',');poly(gel(v,i));}puts("]}");avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-fsanitize=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const rows=[];let state=985173;const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
 for(const p of [3,5,37,3037000493])for(const n of [1,2,3,4])for(let dq=-1;dq<=4;dq++)for(const count of [1,2,3,4])for(const kind of [0,1]){
  if(count===1&&dq>0)continue;const t=Array.from({length:n},()=>next()%p);t.push(1);const x=Array.from({length:n},()=>next()%p),q=Array.from({length:dq+1},()=>next()%p);if(dq>=0&&q[dq]===0)q[dq]=1;rows.push({kind,p,n,dq,count,t,x,q});
 }
 const expected=run(exe,[],{input:rows.map(r=>[r.kind,r.n,r.dq,r.count,r.p,...r.t,...r.x,...r.q].join(' ')).join('\n')+'\n'}).trim().split('\n').map(JSON.parse);assert.equal(expected.length,rows.length);
 const cp=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.flx_small_block_eval')
results=[]
for r,e in zip(*json.load(sys.stdin)):
 w=[77]*302;w[2:2+len(r['q'])]=r['q'];w[12:12+r['n']]=r['x'];w[22:23+r['n']]=r['t']
 for j,v in enumerate(e['powers']):w[32+j*9:41+j*9]=v+[0]*(9-len(v))
 before=w.copy();dx=r['n']-1
 while dx>=0 and r['x'][dx]==0:dx-=1
 if r['kind']:d=m.pari_flx_small_block_eval(w,2,r['dq'],32,r['count'],22,r['n'],r['p'],80,100)
 else:d=m.pari_flx_small_compose(w,2,r['dq'],12,dx,22,r['n'],r['p'],80,100)
 assert w[80:80+d+1]==e['output'] and d==len(e['output'])-1,(r,e,w[80:89])
 assert w[:80]==before[:80] and w[89:100]==before[89:100] and w[292:]==before[292:]
 results.append({'d':d,'w':list(map(str,w)),'dx':dx})
for name in ['pari_flx_small_compose','pari_flx_small_block_eval']:
 good=[2,0,32,2,22,2,3,80,100] if name.endswith('block_eval') else [2,0,12,0,22,2,3,80,100]
 for index,value in [(0,-1),(1,5),(5,0),(6,2),(8,200),(3,5)]:
  args=good.copy();args[index]=value;w=[77]*302;w[24]=1;before=w.copy()
  try:getattr(m,name)(w,*args);assert False
  except ValueError:assert w==before
 w=[77]*302;before=w.copy()
 try:getattr(m,name)(w,*good);assert False
 except ValueError:assert w==before
print(json.dumps(results))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])}));
 const backends=['cpython'];let coreSha256=null;
 if(process.argv.includes('--native')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'flx_small_block_eval.py')}),m=require(built.modulePath);coreSha256=sha(fs.readFileSync(built.coreSourcePath));
  for(const backend of ['javascript','gmp','tagged']){
   for(let i=0;i<rows.length;i++){const r=rows[i],e=cp[i],w=Array(302).fill(77n);w.splice(2,r.q.length,...r.q.map(BigInt));w.splice(12,r.n,...r.x.map(BigInt));w.splice(22,r.n+1,...r.t.map(BigInt));for(let j=0;j<expected[i].powers.length;j++){const v=expected[i].powers[j];w.splice(32+9*j,9,...v.map(BigInt),...Array(9-v.length).fill(0n));}const d=r.kind?m.pari_flx_small_block_eval[backend](w,2n,BigInt(r.dq),32n,BigInt(r.count),22n,BigInt(r.n),BigInt(r.p),80n,100n):m.pari_flx_small_compose[backend](w,2n,BigInt(r.dq),12n,BigInt(e.dx),22n,BigInt(r.n),BigInt(r.p),80n,100n);assert.equal(d,BigInt(e.d));assert.deepEqual(w,e.w.map(BigInt));}
   for(const name of ['pari_flx_small_compose','pari_flx_small_block_eval']){const good=name.endsWith('block_eval')?[2,0,32,2,22,2,3,80,100]:[2,0,12,0,22,2,3,80,100];for(const [index,value] of [[0,-1],[1,5],[5,0],[6,2],[8,200],[3,5]]){const args=good.slice();args[index]=value;const w=Array(302).fill(77n);w[24]=1n;const before=w.slice();assert.throws(()=>m[name][backend](w,...args.map(BigInt)),/frontier|negative|short/);assert.deepEqual(w,before);}const w=Array(302).fill(77n);assert.throws(()=>m[name][backend](w,...good.map(BigInt)),/monic/);assert(w.every(v=>v===77n));}
   backends.push(backend);
  }
 }
 const result={cases:rows.length,backends,coreSha256,pariSourceSha256:sha(source),sourceSha256:sha(fs.readFileSync(path.join(__dirname,'flx_small_block_eval.py'))),qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
