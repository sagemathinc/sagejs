"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:32*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64'),sha=x=>createHash('sha256').update(x).digest('hex');
 assert.equal(sha(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const hashes={};for(const name of ['FpX_factor.c','Flx.c','perm.c']){const rel='src/basemath/'+name,s=run('tar',['-xOf',archive,'pari-2.17.4/'+rel]);assert.equal(fs.readFileSync(path.join(pari,rel),'utf8'),s);hashes[name]=sha(s);}
 const rows=[];
 for(const p of [2,3,5])for(let degree=0;degree<=4;degree++)for(let code=0;code<p**degree;code++){let v=code;const a=[];for(let i=0;i<degree;i++){a.push(v%p);v=Math.floor(v/p);}a.push(1);rows.push({p,degree,a});}
 let seed=513;function next(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;}
 for(const p of [3,7,11,13,17,19,23,29,31,37])for(const degree of [3,4])for(let sample=0;sample<100;sample++){
  const a=Array.from({length:degree+1},()=>next()%p);if(a.every(x=>x===0))a[degree]=1;if(sample%7===0)for(let i=0;i<a.length;i++)a[i]-=p;rows.push({p,degree,a});
 }
 for(const degree of [3,4])for(let sample=0;sample<40;sample++){
  const p=47,a=Array.from({length:degree},()=>next()%p);a.push(1);rows.push({p,degree,a});
 }
 for(const p of [2,3,5,47])for(let sample=0;sample<100;sample++){
  const degree=5,a=Array.from({length:degree},()=>next()%p);a.push(1);rows.push({p,degree,a});
 }
 // Fully split quartics and repeated roots exercise queue removal and source sorting.
 for(const p of [3,37])for(let k=0;k<100;k++){let a=[1];for(let j=0;j<4;j++){const r=(k+j*j)%p,b=Array(a.length+1).fill(0);for(let i=0;i<a.length;i++){b[i]=(b[i]-r*a[i])%p;b[i+1]=(b[i+1]+a[i])%p;}a=b;}rows.push({p,degree:4,a});}
 rows.push({p:101,degree:2,a:[-1,0,1]});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-polynomial-roots-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
#include <stdio.h>
int main(void){pari_init(128000000,10000);long d;ulong p;while(scanf("%ld %lu",&d,&p)==2){pari_sp av=avma;GEN v=cgetg(d+2,t_VEC);for(long i=1;i<=d+1;i++){long a;scanf("%ld",&a);gel(v,i)=stoi(a);}GEN f=gtopolyrev(v,0),roots=FpX_roots(f,utoi(p));putchar('[');for(long i=1;i<lg(roots);i++){if(i>1)putchar(',');pari_printf("%Ps",gel(roots,i));}puts("]");avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[],{input:rows.map(r=>[r.degree,r.p,...r.a].join(' ')).join('\n')+'\n'}),expected=trace.trim().split('\n').map(JSON.parse);assert.equal(rows.length,expected.length);
 run('python3',['-c',`import sys,json,decimal,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.small_prime_polynomial_roots')
for r,e in zip(*json.load(sys.stdin)):
 out=[77]*6;w=[91]*246;before=r['a'].copy();count=m.pari_small_prime_polynomial_roots(r['a'],r['degree'],r['p'],out,w)
 assert count==len(e) and out==e+[77]*(6-len(e)),(r,e,out)
 assert r['a']==before and w[244:]==[91,91]
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([rows,expected])});
 const backends=['cpython'];let coreSha256=null;
 if(process.argv.includes('--native')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_prime_polynomial_roots.py')}),f=require(built.modulePath).pari_small_prime_polynomial_roots;assert(f.nativeAvailable);coreSha256=sha(fs.readFileSync(built.coreSourcePath));
  for(const backend of ['javascript','gmp','tagged']){
   for(let i=0;i<rows.length;i++){const r=rows[i],e=expected[i],a=r.a.map(BigInt),out=Array(6).fill(77n),w=Array(246).fill(91n);assert.equal(f[backend](a,BigInt(r.degree),BigInt(r.p),out,w),BigInt(e.length));assert.deepEqual(out,[...e.map(BigInt),...Array(6-e.length).fill(77n)]);assert.deepEqual(w.slice(244),[91n,91n]);assert.deepEqual(a,r.a.map(BigInt));}
   for(const args of [[[0n,0n,0n,0n],3n,37n],[[0n,0n,0n,0n,0n,0n],5n,47n],[[1n],-1n,3n],[[1n],6n,3n],[[1n],0n,4n],[[],1n,3n],[[-1n,0n,0n,1n],3n,101n],[[-1n,0n,0n,0n,0n,1n],5n,53n]]){const out=Array(6).fill(77n);assert.throws(()=>f[backend](...args,out,Array(244).fill(91n)),/frontier|insufficient|zero polynomial/);assert.deepEqual(out,Array(6).fill(77n));}
   backends.push(backend);
  }
 }
 const result={cases:rows.length,backends,coreSha256,sourceSha256:hashes,oracleSha256:sha(fs.readFileSync(c)),traceSha256:sha(trace),qualifiedTiming:false,higherDegreePrimeFrontier:{optimizedDegree3And4:37,boundedDirectDegree3Through5:47}};fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({rows,expected,result}));console.log(JSON.stringify({dir,...result}));
})().catch(e=>{console.error(e);process.exitCode=1;});
