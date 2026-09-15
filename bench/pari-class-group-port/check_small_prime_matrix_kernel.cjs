"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 for(const [file,sha]of [['Flv.c','edd3d1376c1abf5ada63c238fe044518c876c9d9515bc28cf29836eb6dc65da3'],['F2v.c','25a1ffde169cc1003f8e24922271d69558228675a980fdfc7e444cf12f899836'],['F3v.c','dfcd20af053cd8517effaabc9aa2c67f7767f865c6b90053cc35fe631c847bbe'],['alglin1.c','ccfa192dc3e46e1fbdcc91c8160e11d3b7d91c68b941d4eac1776cf815e2d5a3']]){
  assert.equal(hash(run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/'+file])),sha);assert.equal(hash(fs.readFileSync(path.join(pari,'src/basemath',file))),sha);
 }
 const cases=[];let seed=151;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const p of [2,3,5,7,101,65537,2147483659,3037000493])for(const [m,n]of [[1,1],[1,4],[4,1],[2,3],[3,2],[3,3],[4,4],[5,7],[7,5],[7,7]])for(let trial=0;trial<20;trial++){
  const a=Array.from({length:m*n},(_,k)=>trial===0?0:trial===1?(k%m===Math.floor(k/m)?1:0):trial===2?p-1:rnd(p));
  if(trial===3&&n>1)for(let i=0;i<m;i++)a[m+i]=a[i];cases.push({m,n,p,a});
 }
 for(const p of [2,3])for(let bits=0;bits<p**4;bits++){let b=bits;const a=[];for(let i=0;i<4;i++){a.push(b%p);b=Math.floor(b/p);}cases.push({m:2,n:2,p,a});}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-prime-kernel-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,String.raw`#include "pari.h"
#include "paripriv.h"
static void emit(GEN a,long m,long n){for(long j=1;j<=n;j++)for(long i=1;i<=m;i++)printf(" %lu",itou(gcoeff(a,i,j)));}
int main(void){pari_init(8000000,1000);long count;scanf("%ld",&count);for(long c=0;c<count;c++){pari_sp av=avma;long m,n;ulong p;scanf("%ld%ld%lu",&m,&n,&p);GEN a=zeromatcopy(m,n);for(long j=1;j<=n;j++)for(long i=1;i<=m;i++){ulong v;scanf("%lu",&v);gcoeff(a,i,j)=utoi(v);}GEN answer=FpM_ker(a,utoi(p)),x,z;if(p==2){x=ZM_to_F2m(a);z=F2m_ker_sp(x,0);x=F2m_to_ZM(x);z=F2m_to_ZM(z);}else if(p==3){x=ZM_to_F3m(a);z=F3m_ker_sp(x,0);x=F3m_to_ZM(x);z=F3m_to_ZM(z);}else{x=ZM_to_Flm(a,p);z=Flm_ker_sp(x,p,0);x=Flm_to_ZM(x);z=Flm_to_ZM(z);}if(!gequal(z,answer))return 5;long r=lg(answer)-1;printf("%ld",r);emit(answer,n,r);emit(x,m,n);puts("");avma=av;}pari_close();}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const expected=run(exe,[],{input:[cases.length,...cases.flatMap(c=>[c.m,c.n,c.p,...c.a])].join(' ')}).trim().split('\n').map(s=>s.split(' ').map(Number));
 const cp=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];f=importlib.import_module('bench.pari-class-group-port.small_prime_matrix_kernel').pari_small_prime_matrix_kernel
for ix,(c,e) in enumerate(zip(*json.load(sys.stdin))):
 m,n,p=c['m'],c['n'],c['p'];s=m*n;out=s;scratch=s+n*n;w=c['a']+[77]*(n*n+s+m+n+1)
 r=f(w,0,m,n,p,out,scratch)
 assert [r]+w[out:out+r*n]+w[scratch:scratch+s]==e,(ix,c,e,w)
 assert w[:s]==c['a'] and w[out+r*n:scratch]==[77]*(n*n-r*n) and w[-1]==77
for m,n in [(0,0),(3,0),(0,3)]:
 w=[77]*100;r=f(w,0,m,n,5,10,30);assert r==n
 if n:assert w[10:19]==[1,0,0,0,1,0,0,0,1]
for m,n,p,value in [(8,2,5,0),(2,8,5,0),(2,2,3037000494,0),(2,2,5,5),(2,2,5,-1)]:
 w=[value]*4+[77]*96;before=w[:]
 try:f(w,0,m,n,p,10,30)
 except ValueError:pass
 else:raise AssertionError('guard accepted')
 assert w==before
print('CPython passed',ix+1)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,cp:cp.trim(),artifactDirectory:dir,qualifiedTiming:false};
 if(!process.argv.includes('--source-only')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_prime_matrix_kernel.py')}),f=require(built.modulePath).pari_small_prime_matrix_kernel;
  for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++){
   const c=cases[ix],s=c.m*c.n,out=s,scratch=s+c.n*c.n,initial=[...c.a.map(BigInt),...Array(c.n*c.n+s+c.m+c.n+1).fill(77n)],w=f.createIntegerBuffer(initial.length,2,initial);
   const r=Number(f[backend](w,0n,BigInt(c.m),BigInt(c.n),BigInt(c.p),BigInt(out),BigInt(scratch))),a=w.toArray().map(Number);
   assert.deepEqual([r,...a.slice(out,out+r*c.n),...a.slice(scratch,scratch+s)],expected[ix],backend+' '+ix);assert.deepEqual(a.slice(0,s),c.a);assert.deepEqual(a.slice(out+r*c.n,scratch),Array(c.n*c.n-r*c.n).fill(77));assert.equal(a.at(-1),77);
  }
  for(const backend of ['javascript','gmp','tagged']){
   for(const [m,n]of [[0,0],[3,0],[0,3]]){const w=f.createIntegerBuffer(100,2,Array(100).fill(77n));assert.equal(f[backend](w,0n,BigInt(m),BigInt(n),5n,10n,30n),BigInt(n));if(n)assert.deepEqual(w.toArray().slice(10,19),[1n,0n,0n,0n,1n,0n,0n,0n,1n]);}
   for(const [m,n,p,value]of [[8,2,5,0],[2,8,5,0],[2,2,3037000494,0],[2,2,5,5],[2,2,5,-1]]){const initial=[...Array(4).fill(BigInt(value)),...Array(96).fill(77n)],w=f.createIntegerBuffer(100,2,initial);assert.throws(()=>f[backend](w,0n,BigInt(m),BigInt(n),BigInt(p),10n,30n));assert.deepEqual(w.toArray(),initial);}
  }
  summary.backends=['javascript','gmp','tagged'];summary.coreSha256=hash(fs.readFileSync(built.coreSourcePath));
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,summary}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
