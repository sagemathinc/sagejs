"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const sources={};for(const name of ['Flv.c','FpV.c','alglin1.c']){const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/'+name]);assert.equal(fs.readFileSync(path.join(pari,'src/basemath',name),'utf8'),source);sources[name]=hash(source);}
 const cases=[];let seed=167;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const p of [2,3,5,101,2147483659,3037000493])for(let m=1;m<=4;m++)for(let nx=0;nx<=m;nx++)for(let ny=0;ny<=m;ny++)for(let trial=0;trial<5;trial++){
  const make=n=>{const perm=Array.from({length:m},(_,i)=>i);for(let i=m-1;i>0;i--){const j=rnd(i+1);[perm[i],perm[j]]=[perm[j],perm[i]];}const a=Array(m*n).fill(0);for(let j=0;j<n;j++)for(let i=0;i<m;i++)a[j*m+perm[i]]=(i<j?0:i===j?1+rnd(p-1):rnd(p))+(trial%2?(i%2?-3:2)*p:0);return a;};
  cases.push({m,nx,ny,p,x:make(nx),y:make(ny)});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-prime-intersection-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,String.raw`#include "pari.h"
#include "paripriv.h"
static GEN readmat(long m,long n){GEN a=zeromatcopy(m,n);for(long j=1;j<=n;j++)for(long i=1;i<=m;i++){long v;scanf("%ld",&v);gcoeff(a,i,j)=stoi(v);}return a;}
int main(void){pari_init(8000000,1000);long count;scanf("%ld",&count);for(long c=0;c<count;c++){pari_sp av=avma;long m,nx,ny;ulong p;scanf("%ld%ld%ld%lu",&m,&nx,&ny,&p);GEN x=readmat(m,nx),y=readmat(m,ny);if(Flm_rank(ZM_to_Flm(x,p),p)!=nx||Flm_rank(ZM_to_Flm(y,p),p)!=ny)return 5;GEN z=FpM_intersect_i(x,y,utoi(p));long r=lg(z)-1;printf("%ld",r);for(long j=1;j<=r;j++)for(long i=1;i<=m;i++)pari_printf(" %Ps",gcoeff(z,i,j));puts("");avma=av;}pari_close();}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const expected=run(exe,[],{input:[cases.length,...cases.flatMap(c=>[c.m,c.nx,c.ny,c.p,...c.x,...c.y])].join(' ')}).trim().split('\n').map(s=>s.split(' ').map(Number));
 const cp=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];module=importlib.import_module('bench.pari-class-group-port.small_prime_matrix_intersection');f=module.pari_small_prime_matrix_intersection
for ix,(c,e) in enumerate(zip(*json.load(sys.stdin))):
 m,nx,ny,p=c['m'],c['nx'],c['ny'],c['p'];y=m*nx;out=y+m*ny;scratch=out+m*m;w=c['x']+c['y']+[77]*(m*m+module.pari_small_prime_matrix_intersection_scratch_size(m)+1)
 r=f(w,0,nx,y,ny,m,p,out,scratch)
 assert [r]+w[out:out+r*m]==e,(ix,c,e,w)
 assert w[:out]==c['x']+c['y'] and w[out+r*m:scratch]==[77]*(m*m-r*m) and w[-1]==77
print('CPython passed',ix+1)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,cp:cp.trim(),sources,artifactDirectory:dir,qualifiedTiming:false};
 if(!process.argv.includes('--source-only')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_prime_matrix_intersection.py')}),f=require(built.modulePath).pari_small_prime_matrix_intersection;
  for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++){
   const c=cases[ix],y=c.m*c.nx,out=y+c.m*c.ny,scratch=out+c.m*c.m,initial=[...c.x.map(BigInt),...c.y.map(BigInt),...Array(c.m*c.m+7*c.m*c.m+3*c.m+1).fill(77n)],w=f.createIntegerBuffer(initial.length,2,initial);
   const r=Number(f[backend](w,0n,BigInt(c.nx),BigInt(y),BigInt(c.ny),BigInt(c.m),BigInt(c.p),BigInt(out),BigInt(scratch))),a=w.toArray().map(Number);
   assert.deepEqual([r,...a.slice(out,out+r*c.m)],expected[ix],backend+' '+ix);assert.deepEqual(a.slice(0,out),[...c.x,...c.y]);assert.deepEqual(a.slice(out+r*c.m,scratch),Array(c.m*c.m-r*c.m).fill(77));assert.equal(a.at(-1),77);
  }
  summary.backends=['javascript','gmp','tagged'];summary.coreSha256=hash(fs.readFileSync(built.coreSourcePath));
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,summary}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
