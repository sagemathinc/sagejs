"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 for(const [file,sha]of [['F2x.c','faf7278692b9a6d1281542f89b4f870c2380097208d1f4186bbe3015b9b76938'],['F2v.c','25a1ffde169cc1003f8e24922271d69558228675a980fdfc7e444cf12f899836']]){
  assert.equal(hash(run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/'+file])),sha);assert.equal(hash(fs.readFileSync(path.join(pari,'src/basemath',file))),sha);
 }
 const names=['mul','sqr','rem','div','gcd','deriv','sqrt','degree','valuation'],cases=[];
 for(let a=0;a<32;a++)for(let b=0;b<32;b++)for(const op of [0,4])cases.push({op,a,b});
 for(let a=0;a<512;a++){
  for(const op of [5,7,8])cases.push({op,a,b:0});
  if(a<32)cases.push({op:1,a,b:0});
  if(!(a&170))cases.push({op:6,a,b:0});
  for(let b=1;b<32;b++)for(const op of [2,3])cases.push({op,a,b});
 }
 const matrices=[];for(let n=0;n<=3;n++)for(let bits=0;bits<2**(n*n);bits++)matrices.push({n,columns:Array.from({length:n},(_,i)=>(bits>>(n*i))&((1<<n)-1))});
 let seed=149;for(let i=0;i<256;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;matrices.push({n:4,columns:Array.from({length:4},(_,j)=>(seed>>(4*j))&15)});}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-f2x-small-')),file=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(file,String.raw`#include "pari.h"
#include "paripriv.h"
static GEN poly(ulong a){GEN z=cgetg(a?3:2,t_VECSMALL);z[1]=0;if(a)z[2]=a;return z;}
static ulong word(GEN z){return lg(z)>2?uel(z,2):0;}
int main(void){pari_init(8000000,1000);long count;scanf("%ld",&count);for(long i=0;i<count;i++){pari_sp av=avma;long op;ulong a,b;scanf("%ld%lu%lu",&op,&a,&b);GEN x=poly(a),y=poly(b),z=NULL;long v=0;switch(op){case 0:z=F2x_mul(x,y);break;case 1:z=F2x_sqr(x);break;case 2:z=F2x_rem(x,y);break;case 3:z=F2x_div(x,y);break;case 4:z=F2x_gcd(x,y);break;case 5:z=F2x_deriv(x);break;case 6:z=F2x_sqrt(x);break;case 7:v=F2x_degree(x);break;case 8:v=F2x_valrem(x,&z);z=NULL;break;}if(z)printf("%lu\n",word(z));else printf("%ld\n",v);avma=av;}
scanf("%ld",&count);for(long c=0;c<count;c++){pari_sp av=avma;long n;scanf("%ld",&n);GEN x=zero_F2m_copy(n,n);for(long i=1;i<=n;i++){ulong a;scanf("%lu",&a);if(n)gel(x,i)[2]=a;}GEN y=F2m_ker_sp(x,0);long r=lg(y)-1;printf("%ld",r);for(long i=1;i<=n;i++)printf(" %lu",word(gel(x,i)));for(long i=1;i<=r;i++)printf(" %lu",word(gel(y,i)));puts("");avma=av;}pari_close();}
`);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,file,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const lines=run(exe,[],{input:[cases.length,...cases.flatMap(c=>[c.op,c.a,c.b]),matrices.length,...matrices.flatMap(c=>[c.n,...c.columns])].join(' ')}).trim().split('\n');
 const expected=lines.slice(0,cases.length),kernels=lines.slice(cases.length).map(x=>x.split(' ').map(Number));
 const cp=run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.f2x_small')
cases,expected,matrices,kernels,names=json.load(sys.stdin)
for c,e in zip(cases,expected):
 args=[c['a']]+([c['b']] if c['op'] in [0,2,3,4] else [])
 assert getattr(m,'pari_f2x_small_'+names[c['op']])(*args)==int(e),(c,e)
for c,e in zip(matrices,kernels):
 n=c['n'];w=c['columns']+[77]*(13-n);r=m.pari_f2m_small_kernel(w,0,n,4,8)
 assert [r]+w[:n]+w[4:4+r]==e,(c,e,w)
 assert w[4+r:8]==[77]*(4-r) and w[8+n:]==[77]*(5-n)
print('CPython passed')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify([cases,expected,matrices,kernels,names])});
 const summary={polynomialCases:cases.length,matrixCases:matrices.length,cp:cp.trim(),artifactDirectory:dir,qualifiedTiming:false};
 if(!process.argv.includes('--source-only')){
  const built=await compileKernel({sourcePath:path.join(__dirname,'f2x_small.py')}),mod=require(built.modulePath);
  for(const backend of ['javascript','gmp','tagged']){
   for(let i=0;i<cases.length;i++){const c=cases[i],args=[BigInt(c.a)];if([0,2,3,4].includes(c.op))args.push(BigInt(c.b));assert.equal(mod['pari_f2x_small_'+names[c.op]][backend](...args),BigInt(expected[i]),backend+' '+i);}
   const f=mod.pari_f2m_small_kernel;
   for(let i=0;i<matrices.length;i++){const c=matrices[i],w=f.createIntegerBuffer(13,2,[...c.columns.map(BigInt),...Array(13-c.n).fill(77n)]),r=Number(f[backend](w,0n,BigInt(c.n),4n,8n)),a=w.toArray().map(Number);assert.deepEqual([r,...a.slice(0,c.n),...a.slice(4,4+r)],kernels[i]);assert.deepEqual(a.slice(4+r,8),Array(4-r).fill(77));assert.deepEqual(a.slice(8+c.n),Array(5-c.n).fill(77));}
  }
  summary.backends=['javascript','gmp','tagged'];summary.coreSha256=hash(fs.readFileSync(built.coreSourcePath));
 }
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({cases,expected,matrices,kernels,summary}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
