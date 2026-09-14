"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64'),file='src/basemath/hnf_snf.c',sha='264aef9c86b4454b2761d8424571f74c8ecc5ed38f12aa806800c0bef5f6cdbf';
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(pari,file))).digest('hex'),sha);
 assert.equal(createHash('sha256').update(run('tar',['-xOf',process.argv[3],'pari-2.17.4/'+file])).digest('hex'),sha);
 const cases=[];
 for(const n of [3,4])for(const cols of [1,n-1,n,2*n])for(const d of [1n,4n,6n,18n,65536n,(1n<<64n)-1n])for(let kind=0;kind<4;kind++){
  const a=Array.from({length:n*cols},(_,k)=>{
   const i=Math.floor(k/cols),j=k%cols;
   if(kind===0)return 0n;
   if(kind===1)return BigInt(i===j)*(d-1n);
   if(kind===2)return BigInt((i+1)*(j+3)-(i===j?29:2));
   return BigInt(j===cols-1&&i===n-1)*(1n<<90n);
  });
  cases.push({a:'['+Array.from({length:n},(_,i)=>a.slice(i*cols,(i+1)*cols).join(',')).join(';')+']',d:String(d)});
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-composite-hnf-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
static void mat(GEN M){long n=nbrows(M),cols=lg(M)-1;putchar('[');for(long i=1;i<=n;i++)for(long j=1;j<=cols;j++){if(i!=1||j!=1)putchar(',');pari_printf("\\"%Ps\\"",gcoeff(M,i,j));}putchar(']');}
static void emit(GEN M,GEN D,GEN H,GEN alpha){printf("{\\"n\\":%ld,\\"cols\\":%ld,\\"actual\\":%d,\\"d\\":",nbrows(M),lg(M)-1,alpha!=NULL);pari_printf("\\"%Ps\\",\\"input\\":",D);mat(M);printf(",\\"output\\":");mat(H);if(alpha){printf(",\\"alpha\\":");mat(alpha);}puts("}");}
int main(void){pari_init(128000000,10000);const char *ms[]={${cases.map(r=>JSON.stringify(r.a)).join(',')}},*ds[]={${cases.map(r=>JSON.stringify(r.d)).join(',')}};
for(long k=0;k<${cases.length};k++){pari_sp av=avma;GEN M=gp_read_str(ms[k]),D=gp_read_str(ds[k]);emit(M,D,ZM_hnfmodid(M,D),NULL);avma=av;}
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long k=0;k<4;k++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[k]),DEFAULTPREC),P=gel(idealprimedec(nf,gen_2),1),Q=gel(idealprimedec(nf,stoi(3)),1),alpha=zk_multable(nf,pr_get_gen(Q));
for(long e=1;e<=4;e++){GEN I=idealpows(nf,P,e),M=shallowconcat(ZM_mul(alpha,I),ZM_Z_mul(I,pr_get_p(Q))),D=mulii(pr_get_p(Q),gcoeff(I,1,1)),H=ZM_hnfmodid(M,D);if(!gequal(H,idealmul(nf,I,Q)))return 3;emit(M,D,H,alpha);}avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(JSON.parse);
 const py=JSON.parse(run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];module=importlib.import_module('bench.pari-class-group-port.composite_ideal_hnf');f=module.pari_composite_modulus_hnf
results=[]
for ix,r in enumerate(json.load(sys.stdin)):
 n=r['n'];a=list(map(int,r['input']));out=[0]*(n*n)
 try:f(a,n,r['cols'],int(r['d']),[0]*(n*(3*n+1)),[0]*(n*(n+1)),[0]*n,out)
 except ValueError as error:
  assert str(error)=='multiword Bezout remains an external dependency' and not r['actual'],(ix,error,r)
  assert out==[0]*(n*n);results.append('multiword-bezout')
 else:
  assert out==list(map(int,r['output'])),(ix,r,out);results.append('pass')
 assert a==list(map(int,r['input']))
 if r['actual']:
  ideal=[a[i*(2*n)+n+j]//3 for i in range(n) for j in range(n)];product=[0]*(2*n*n);out=[0]*(n*n)
  assert module.pari_ideal_hnf_mul_two(ideal,list(map(int,r['alpha'])),3,n,product,[0]*(n*(3*n+1)),[0]*(n*(n+1)),[0]*n,out)==0
  assert product==a and out==list(map(int,r['output']))
print(json.dumps(results))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)}));
 assert.equal(py.filter(x=>x==='pass').length,158,'do not silently censor new cases');
 assert.equal(py.filter(x=>x!=='pass').length,50);
 const built=await compileKernel({sourcePath:path.join(__dirname,'composite_ideal_hnf.py')}),f=require(built.modulePath).pari_composite_modulus_hnf;assert.equal(f.nativeAvailable,true);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call/);
 for(const [ix,r]of rows.entries())for(const backend of ['javascript','gmp']){
  const n=r.n,a=r.input.map(BigInt),out=Array(n*n).fill(0n),invoke=()=>f[backend](a,BigInt(n),BigInt(r.cols),BigInt(r.d),Array(n*(3*n+1)).fill(0n),Array(n*(n+1)).fill(0n),Array(n).fill(0n),out);
  if(py[ix]==='pass'){assert.equal(invoke(),0n);assert.deepEqual(out,r.output.map(BigInt),`${ix} ${backend}`);}
  else{assert.throws(invoke,/multiword Bezout remains an external dependency/);assert.deepEqual(out,Array(n*n).fill(0n));}
  assert.deepEqual(a,r.input.map(BigInt));
  if(r.actual){
   const g=require(built.modulePath).pari_ideal_hnf_mul_two,ideal=Array.from({length:n*n},(_,i)=>a[Math.floor(i/n)*2*n+n+i%n]/3n),product=Array(2*n*n).fill(0n),h=Array(n*n).fill(0n);
   assert.equal(g[backend](ideal,r.alpha.map(BigInt),3n,BigInt(n),product,Array(n*(3*n+1)).fill(0n),Array(n*(n+1)).fill(0n),Array(n).fill(0n),h),0n);
   assert.deepEqual(product,a);assert.deepEqual(h,r.output.map(BigInt));
  }
 }
 console.log(JSON.stringify({cases:rows.length,matching:py.filter(x=>x==='pass').length,unsupportedMultiwordBezout:py.filter(x=>x!=='pass').length,actualIdealProducts:rows.filter(r=>r.actual).length,traceSha256:createHash('sha256').update(trace).digest('hex'),qualifiedTiming:false,modulePath:built.modulePath,coreBytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
