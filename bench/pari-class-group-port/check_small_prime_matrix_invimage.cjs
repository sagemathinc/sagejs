"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64'),sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const hashes={};for(const name of ['alglin1.c','Flv.c','F2v.c']){const rel='src/basemath/'+name,s=run('tar',['-xOf',archive,'pari-2.17.4/'+rel]);assert.equal(fs.readFileSync(path.join(pari,rel),'utf8'),s);hashes[name]=sha(s);}
 const rows=[];let seed=173;function next(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
 for(const p of [2,3,5,37,101,3037000493])for(let m=0;m<=4;m++)for(let n=0;n<=7;n++)for(let trial=0;trial<8;trial++){
  const a=Array.from({length:m*n},(_,k)=>trial===0?0:trial===1?(k%m===Math.floor(k/m)?1:0):next()%p-p),y=Array.from({length:m},()=>trial===0?0:next()%p);rows.push({m,n,p,a,y});
 }
 for(const p of [2,3])for(let code=0;code<p**6;code++){let v=code;const a=[];for(let i=0;i<6;i++){a.push(v%p);v=Math.floor(v/p);}rows.push({m:2,n:2,p,a:a.slice(0,4),y:a.slice(4)});}
 let actualCases=0,actualFixtureSha256=null;const actualFrontiers=[];const at=process.argv.indexOf('--ideals');
 if(at>=0){const bytes=fs.readFileSync(process.argv[at+1]);actualFixtureSha256=sha(bytes);for(const r of JSON.parse(bytes).rows)for(let j=0;j<r.finalIdeals.length;j++){
  const P=r.finalIdeals[j],V=r.LV[j];if(P.rank+V.rank>7){actualFrontiers.push({field:r.field,p:r.p,ideal:j,columns:P.rank+V.rank});continue;}rows.push({m:r.n,n:P.rank+V.rank,p:r.p,a:[...P.matrix,...V.matrix].map(Number),y:Array.from({length:r.n},(_,i)=>i===0?1:0),field:r.field});actualCases++;
 }}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-prime-invimage-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
int main(void){pari_init(128000000,10000);long m,n;ulong p;while(scanf("%ld %ld %lu",&m,&n,&p)==3){pari_sp av=avma;GEN a=zeromatcopy(m,n),y=cgetg(m+1,t_COL);for(long j=1;j<=n;j++)for(long i=1;i<=m;i++){long v;scanf("%ld",&v);gcoeff(a,i,j)=stoi(v);}for(long i=1;i<=m;i++){long v;scanf("%ld",&v);gel(y,i)=stoi(v);}GEN x=FpM_FpC_invimage(a,y,utoi(p));if(!x)puts("null");else{putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');pari_printf("%Ps",gel(x,i));}puts("]");}avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:rows.map(r=>[r.m,r.n,r.p,...r.a,...r.y].join(' ')).join('\n')+'\n'}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(rows.length,expected.length);
 run('python3',['-c',`import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.small_prime_matrix_invimage')
for r,e in zip(*json.load(sys.stdin)):
 rows=r['m'];cols=r['n'];a=2;rhs=a+rows*cols+2;out=rhs+rows+2;scratch=out+cols+2;size=m.pari_small_prime_matrix_invimage_workspace_size(rows,cols)
 w=[77]*(scratch+size+2);w[a:a+rows*cols]=r['a'];w[rhs:rhs+rows]=r['y'];before=w.copy()
 status=m.pari_small_prime_matrix_invimage(w,a,rows,cols,r['p'],rhs,out,scratch)
 assert status==(-1 if e is None else 0) and w[out:out+cols]==([77]*cols if e is None else e),(r,e,w[out:out+cols])
 assert w[:out]==before[:out] and w[out+cols:scratch]==before[out+cols:scratch] and w[-2:]==[77,77]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])});
 const backends=['cpython'];let coreSha256=null;
 if(process.argv.includes('--native')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_prime_matrix_invimage.py')}),f=require(built.modulePath).pari_small_prime_matrix_invimage;assert(f.nativeAvailable);coreSha256=sha(fs.readFileSync(built.coreSourcePath));
  for(const backend of ['javascript','gmp','tagged']){
   for(let i=0;i<rows.length;i++){const r=rows[i],e=expected[i],a=2,rhs=a+r.m*r.n+2,out=rhs+r.m+2,scratch=out+r.n+2,c=r.n+1,size=2*r.m*c+c*c+r.m+c,w=Array(scratch+size+2).fill(77n);w.splice(a,r.a.length,...r.a.map(BigInt));w.splice(rhs,r.y.length,...r.y.map(BigInt));const before=w.slice();
    assert.equal(f[backend](w,BigInt(a),BigInt(r.m),BigInt(r.n),BigInt(r.p),BigInt(rhs),BigInt(out),BigInt(scratch)),e===null?-1n:0n);assert.deepEqual(w.slice(out,out+r.n),e===null?Array(r.n).fill(77n):e.map(BigInt));assert.deepEqual(w.slice(0,out),before.slice(0,out));assert.deepEqual(w.slice(out+r.n,scratch),before.slice(out+r.n,scratch));assert.deepEqual(w.slice(-2),[77n,77n]);
   }
   for(const args of [[0n,5n,1n,3n,10n,20n,30n],[0n,1n,8n,3n,10n,20n,30n],[-1n,1n,1n,3n,10n,20n,30n],[0n,1n,1n,1n,10n,20n,30n],[0n,1n,1n,3n,10n,20n,95n]]){const w=Array(100).fill(77n);assert.throws(()=>f[backend](w,...args),/frontier|negative|short/);assert.deepEqual(w,Array(100).fill(77n));}
   backends.push(backend);
  }
 }
 const result={cases:rows.length,actualCases,actualFrontiers,actualFixtureSha256,noSolutions:expected.filter(e=>e===null).length,backends,coreSha256,sourceSha256:hashes,oracleSha256:sha(fs.readFileSync(c)),traceSha256:sha(trace),qualifiedTiming:false};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
