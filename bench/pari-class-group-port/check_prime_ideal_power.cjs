"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(process.argv[3])).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 for(const file of ['base3.c','base4.c','hnf_snf.c','polarit2.c','trans1.c','bb_group.c'])assert.deepEqual(fs.readFileSync(path.join(pari,'src/basemath',file)),Buffer.from(run('tar',['-xOf',process.argv[3],'pari-2.17.4/src/basemath/'+file])));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prime-power-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 // Include pinned upstream source only to expose the static idealpowprime.
 // No reimplementation of its mathematical body in this C fixture adapter.
 fs.writeFileSync(c,`#include ${JSON.stringify(path.join(pari,'src/basemath/base4.c'))}
static void vec(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');pari_printf("\\"%Ps\\"",gel(x,i));}putchar(']');}
static void mat(GEN M,long n){putchar('[');for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){if(i!=1||j!=1)putchar(',');pari_printf("\\"%Ps\\"",gcoeff(M,i,j));}putchar(']');}
int main(void){pari_init(128000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,5,7,11,13,17,19};long powers[]={1,2,3,4,7,12,31,255,256,511};
for(long field=0;field<4;field++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[field]),DEFAULTPREC);long n=nf_get_degree(nf);GEN table=cgetg(n*n*n+1,t_VEC);long pos=1;
for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=n;k++)gel(table,pos++)=gel(v,k);}
for(long pi=0;pi<8;pi++){GEN p=stoi(primes[pi]),dec=idealprimedec(nf,p);for(long j=1;j<lg(dec);j++){GEN pr=gel(dec,j);for(long ei=0;ei<10;ei++){
long exponent=powers[ei];GEN content,two=idealpowprime(nf,pr,stoi(exponent),&content),alpha=gel(two,2),H=idealpows(nf,pr,exponent);
printf("{\\"n\\":%ld,\\"p\\":%ld,\\"e\\":%ld,\\"f\\":%ld,\\"exponent\\":%ld,\\"meta\\":[",n,primes[pi],pr_get_e(pr),pr_get_f(pr),exponent);pari_printf("\\"%Ps\\",\\"%Ps\\",\\"%ld\\"],\\"alpha\\":",gel(two,1),content?content:gen_1,typ(alpha)==t_INT);vec(algtobasis(nf,alpha));printf(",\\"generator\\":");vec(algtobasis(nf,pr_get_gen(pr)));printf(",\\"table\\":");vec(table);printf(",\\"output\\":");mat(H,n);puts("}");
}}}avma=av;}pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(JSON.parse);assert.equal(rows.length,580);
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3];m=importlib.import_module('bench.pari-class-group-port.prime_ideal_power')
for ix,r in enumerate(json.load(sys.stdin)):
 n=r['n'];table=list(map(int,r['table']));generator=list(map(int,r['generator']));alpha=[77]*(n+2);meta=[91]*3;counts=[91]*3
 args=[table,generator,n,r['p'],r['e'],r['f'],r['exponent'],[0]*n,[0]*n,alpha,meta,counts]
 assert m.pari_positive_prime_power_two(*args)==0
 assert alpha==list(map(int,r['alpha']))+[77,77] and meta==list(map(int,r['meta'])),(ix,r,alpha,meta)
 out=[77]*(n*n+2)
 try:status=m.pari_positive_prime_power_hnf(*args,[0]*(n*n),[0]*(n*(3*n+1)),[0]*(n*(n+1)),[0]*n,out)
 except ValueError as error:
  assert str(error)=='multiword HNF modulus remains unported' and meta[0]>=2**64 and any(alpha[1:n])
  assert out==[77]*(n*n+2)
 else:assert status==0 and out==list(map(int,r['output']))+[77,77],(ix,r,out)
 assert table==list(map(int,r['table'])) and generator==list(map(int,r['generator']))
for exponent in [-1,0,512]:
 alpha=[77]*3;meta=[91]*3;counts=[92]*3
 try:m.pari_positive_prime_power_two([],[],3,2,1,1,exponent,[],[],alpha,meta,counts)
 except ValueError as error:assert str(error)=='unsupported positive prime power exponent'
 else:raise AssertionError('invalid prime exponent accepted')
 assert alpha==[77]*3 and meta==[91]*3 and counts==[92]*3
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,'prime_ideal_power.py')}),m=require(built.modulePath),f=m.pari_positive_prime_power_two,h=m.pari_positive_prime_power_hnf;
 assert(f.nativeAvailable&&h.nativeAvailable);
 let censored=0;for(const backend of ['javascript','gmp'])for(const [ix,r]of rows.entries()){
  const n=r.n,table=r.table.map(BigInt),generator=r.generator.map(BigInt),buf=(count,fill=0n)=>f.createIntegerBuffer(count,1024,Array(count).fill(fill));
  assert(table.every(v=>v>-(1n<<64n)&&v<(1n<<64n))&&generator.every(v=>v>-(1n<<64n)&&v<(1n<<64n)));
  // H(input)<2^64, H(table)<2^64, n<=4, exponent<=511 imply
  // H(input^e)<2^(64*e+68*(e-1))<2^67500. Actual generator heights
  // here are checked more tightly below to retain the fixed65536-bit budget.
  assert(generator.every(v=>v>-(1n<<32n)&&v<(1n<<32n)));
  const alpha=buf(n+2,77n),meta=buf(3,91n),counts=[91n,91n,91n],args=[table,generator,BigInt(n),BigInt(r.p),BigInt(r.e),BigInt(r.f),BigInt(r.exponent),buf(n),buf(n),alpha,meta,counts];
  assert.equal(f[backend](...args),0n);assert.deepEqual(alpha.toArray(),[...r.alpha.map(BigInt),77n,77n],ix+' '+backend);assert.deepEqual(meta.toArray(),r.meta.map(BigInt));
  const out=buf(n*n+2,77n),hnfArgs=[...args,buf(n*n),buf(n*(3*n+1)),buf(n*(n+1)),buf(n),out];
  if(BigInt(r.meta[0])>=1n<<64n&&r.alpha.slice(1).some(v=>BigInt(v)!==0n)){assert.throws(()=>h[backend](...hnfArgs),/multiword HNF modulus remains unported/);assert.deepEqual(out.toArray(),Array(n*n+2).fill(77n));if(backend==='gmp')censored++;}
  else{assert.equal(h[backend](...hnfArgs),0n);assert.deepEqual(out.toArray(),[...r.output.map(BigInt),77n,77n],ix+' '+backend+' HNF');}
  assert.deepEqual(table,r.table.map(BigInt));assert.deepEqual(generator,r.generator.map(BigInt));
 }
 for(const backend of ['javascript','gmp'])for(const exponent of [-1n,0n,512n]){
  const alpha=[77n,77n,77n],meta=[91n,91n,91n],counts=[92n,92n,92n];
  assert.throws(()=>f[backend]([],[],3n,2n,1n,1n,exponent,[],[],alpha,meta,counts),/unsupported positive prime power exponent/);
  assert.deepEqual(alpha,[77n,77n,77n]);assert.deepEqual(meta,[91n,91n,91n]);assert.deepEqual(counts,[92n,92n,92n]);
 }
 console.log(JSON.stringify({cases:rows.length,hnfCases:rows.length-censored,unsupportedHnfModulus:censored,ramifiedCases:rows.filter(r=>r.e>1).length,inertCases:rows.filter(r=>r.f===r.n).length,traceSha256:createHash('sha256').update(trace).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size,qualifiedTiming:false}));
})().catch(e=>{console.error(e);process.exitCode=1;});
