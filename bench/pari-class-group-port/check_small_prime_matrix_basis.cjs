"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 for(const [file,sha]of [['Flv.c','edd3d1376c1abf5ada63c238fe044518c876c9d9515bc28cf29836eb6dc65da3'],['F2v.c','25a1ffde169cc1003f8e24922271d69558228675a980fdfc7e444cf12f899836'],['alglin1.c','ccfa192dc3e46e1fbdcc91c8160e11d3b7d91c68b941d4eac1776cf815e2d5a3']]){
  assert.equal(hash(run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/'+file])),sha);assert.equal(hash(fs.readFileSync(path.join(pari,'src/basemath',file))),sha);
 }
 const cases=[];let seed=157;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(const p of [2,3,5,101,2147483659,3037000493])for(let m=1;m<=4;m++)for(let n=1;n<=8;n++)for(let trial=0;trial<12;trial++){
  const a=Array.from({length:m*n},(_,k)=>trial===0?0:trial===1?(k%m===Math.floor(k/m)?1:0):trial===2?p-1:rnd(p));
  if(trial===3&&n>1)for(let i=0;i<m;i++)a[m+i]=a[i];cases.push({m,n,p,a});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-prime-basis-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,String.raw`#include "pari.h"
#include "paripriv.h"
static void emit(GEN a,long m,long n){for(long j=1;j<=n;j++)for(long i=1;i<=m;i++)printf(" %lu",itou(gcoeff(a,i,j)));}
int main(void){pari_init(8000000,1000);long count;scanf("%ld",&count);for(long c=0;c<count;c++){pari_sp av=avma;long m,n;ulong p;scanf("%ld%ld%lu",&m,&n,&p);GEN a=zeromatcopy(m,n);for(long j=1;j<=n;j++)for(long i=1;i<=m;i++){ulong v;scanf("%lu",&v);gcoeff(a,i,j)=utoi(v);}GEN image=FpM_image(a,utoi(p)),supp=FpM_suppl(a,utoi(p));long r=lg(image)-1;printf("%ld",r);emit(image,m,r);emit(supp,m,m);GEN d;long nullity;if(p==2)d=F2m_gauss_pivot(ZM_to_F2m(a),&nullity);else d=Flm_pivots(ZM_to_Flm(a,p),p,&nullity,1);for(long i=1;i<=n;i++)printf(" %ld",d[i]);puts("");avma=av;}pari_close();}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const expected=run(exe,[],{input:[cases.length,...cases.flatMap(c=>[c.m,c.n,c.p,...c.a])].join(' ')}).trim().split('\n').map(s=>s.split(' ').map(Number));
 const cp=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];module=importlib.import_module('bench.pari-class-group-port.small_prime_matrix_basis')
for ix,(c,e) in enumerate(zip(*json.load(sys.stdin))):
 m,n,p=c['m'],c['n'],c['p'];s=m*n;out=s;scratch=s+m*m;r=e[0]
 for name in ['image','supplement']:
  w=c['a']+[77]*(m*m+s+m+n+1);actual=getattr(module,'pari_small_prime_matrix_'+name)(w,0,m,n,p,out,scratch)
  used=m*r if name=='image' else m*m;expected=e[1:1+used] if name=='image' else e[1+m*r:1+m*r+used]
  assert actual==(r if name=='image' else 0) and w[out:out+used]==expected,(ix,name,c,e,w)
  assert w[scratch+s+m:scratch+s+m+n]==e[-n:]
  assert w[:s]==c['a'] and w[out+used:scratch]==[77]*(m*m-used) and w[-1]==77
w=[77]*100;assert module.pari_small_prime_matrix_image(w,0,3,0,5,10,30)==0
try:module.pari_small_prime_matrix_supplement(w,0,3,0,5,10,30)
except ValueError:pass
else:raise AssertionError('empty supplement')
print('CPython passed',ix+1)
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected])});
 const summary={cases:cases.length,cp:cp.trim(),artifactDirectory:dir,qualifiedTiming:false};
 if(!process.argv.includes('--source-only')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'small_prime_matrix_basis.py')}),mod=require(built.modulePath);
  for(const backend of ['javascript','gmp','tagged'])for(let ix=0;ix<cases.length;ix++)for(const name of ['image','supplement']){
   const c=cases[ix],s=c.m*c.n,out=s,scratch=s+c.m*c.m,initial=[...c.a.map(BigInt),...Array(c.m*c.m+s+c.m+c.n+1).fill(77n)],f=mod['pari_small_prime_matrix_'+name],w=f.createIntegerBuffer(initial.length,2,initial);
   const result=Number(f[backend](w,0n,BigInt(c.m),BigInt(c.n),BigInt(c.p),BigInt(out),BigInt(scratch))),a=w.toArray().map(Number),e=expected[ix],r=e[0],used=name==='image'?c.m*r:c.m*c.m;
   assert.equal(result,name==='image'?r:0);assert.deepEqual(a.slice(out,out+used),name==='image'?e.slice(1,1+used):e.slice(1+c.m*r,1+c.m*r+used),backend+' '+name+' '+ix);assert.deepEqual(a.slice(scratch+s+c.m,scratch+s+c.m+c.n),e.slice(-c.n));assert.deepEqual(a.slice(0,s),c.a);assert.deepEqual(a.slice(out+used,scratch),Array(c.m*c.m-used).fill(77));assert.equal(a.at(-1),77);
  }
  summary.backends=['javascript','gmp','tagged'];summary.coreSha256=hash(fs.readFileSync(built.coreSourcePath));
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,summary}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
