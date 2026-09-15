"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,'Olinux-x86_64');
 const archive=pari+'.tar.gz';
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const source=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 assert.equal(createHash('sha256').update(source).digest('hex'),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
 const provenance=process.argv.includes('--scalar-provenance');
 const start=source.indexOf('static GEN\nget_log_embed('),end=source.indexOf('\nstatic GEN\nrel_embed(',start);assert(start>=0&&end>start);
 const leaf=source.slice(start,end),dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-log-embed-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');
 fs.writeFileSync(c,`#include "pari.h"
typedef struct {GEN m;} REL_t;
${leaf}
static void emit(GEN x){long e;if(typ(x)==t_INT){pari_printf("%Ps -1 0 ",x);return;}pari_printf("%Ps %ld %ld ",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,10000);const char* fields[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long fi=0;fi<4;fi++)for(long pi=0;pi<${provenance?3:1};pi++)for(long rounded=0;rounded<${provenance?2:1};rounded++){long precs[]={64,192,384},requested=${provenance?'precs[pi]':'128'};GEN nf=nfinit(gp_read_str(fields[fi]),${provenance?'requested':'192'}),M=gcopy(nf_get_M(nf));long n=nf_get_degree(nf),r1=nf_get_r1(nf),ru=nbrows(M);
if(rounded)for(long i=1;i<=ru;i++)gcoeff(M,i,1)=real_1(nbits2prec(requested));
for(long k=1;k<=${provenance?8:20};k++){pari_sp av=avma;long scalar=k>${provenance?4:16};GEN v=cgetg(n+1,t_COL);for(long j=1;j<=n;j++)gel(v,j)=stoi(k<=4?(j==k?1:0):(j%2?k*j:-k-j));if(k==4&&n==3)gel(v,1)=gen_1;REL_t rel={scalar?stoi((k%2?-1:1)*(k-16)):v};
${provenance?'long values[]={1,-1,3,-3};GEN value=stoi(values[(k-1)%4]);for(long j=1;j<=n;j++)gel(v,j)=j==1?value:gen_0;rel.m=scalar?value:v;':''}
pari_printf("%ld %ld %ld %ld ",n,r1,scalar,requested);for(long j=1;j<=n;j++)pari_printf("%Ps ",scalar?(j==1?rel.m:gen_0):gel(v,j));
for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){GEN z=gmael(M,j,i<=ru?i:r1+i-ru);if(typ(z)==t_COMPLEX)z=gel(z,i<=ru?1:2);else if(i>ru)z=gen_0;emit(z);}
GEN out=get_log_embed(&rel,M,ru,r1,nbits2prec(requested));for(long i=1;i<=ru;i++){GEN z=gel(out,i);if(typ(z)==t_COMPLEX){pari_printf("2 ");emit(gel(z,1));emit(gel(z,2));}else{pari_printf("1 ");emit(z);emit(gen_0);}}pari_printf("\\n");avma=av;}}
pari_close();return 0;}`);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),rows=trace.trim().split('\n').map(s=>s.trim().split(' '));assert.equal(rows.length,provenance?192:80);
 const cases=rows.map(row=>{const n=Number(row[0]),r1=Number(row[1]),scalar=Number(row[2]),precision=Number(row[3]),at=4+n,triples=row.slice(at,at+3*n*n);return {n,r1,scalar,precision,coords:row.slice(4,at),matrix:[0,1,2].map(k=>triples.filter((_,i)=>i%3===k)),expected:row.slice(at+3*n*n)};});
 if(process.argv.includes('--export-fixtures')){console.log(JSON.stringify(cases));return;}
 run('python3',['-c',`import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.log_embedding').pari_prepared_log_embedding
work=[[0]*3,[0]*3]+[[0]*64 for _ in range(4)]+[[0]*128]
for ix,r in enumerate(json.load(sys.stdin)):
 out=[0]*len(r['expected']);matrix=[list(map(int,v)) for v in r['matrix']]
 got=f(*matrix,list(map(int,r['coords'])),r['n'],r['r1'],bool(r['scalar']),r['precision'],out,*work)
 assert got==(r['n']+r['r1'])//2
 assert out==list(map(int,r['expected'])),(ix,out,r['expected'])
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(cases)});
 if(process.argv.includes('--cpython-only')){console.log(JSON.stringify({cases:cases.length,backends:['PARI','CPython'],trace_sha256:createHash('sha256').update(trace).digest('hex')}));return;}
 const built=await compileKernel({sourcePath:path.join(__dirname,'log_embedding.py')}),f=require(built.modulePath).pari_prepared_log_embedding;assert(f.nativeAvailable);
 for(const backend of ['javascript','gmp','tagged']){
  const make=n=>backend==='javascript'?Array(n).fill(0n):f.createIntegerBuffer(n,64);
  const work=[make(3),make(3),...Array.from({length:4},()=>make(64)),make(128)];
  for(const [i,r]of cases.entries()){
   const out=make(r.expected.length),got=f[backend](...r.matrix.map(v=>v.map(BigInt)),r.coords.map(BigInt),BigInt(r.n),BigInt(r.r1),Boolean(r.scalar),BigInt(r.precision),out,...work);
   assert.equal(got,BigInt((r.n+r.r1)/2));assert.deepEqual(Array.isArray(out)?out:out.toArray(),r.expected.map(BigInt),`${backend} ${i}`);
  }
 }
 console.log(JSON.stringify({cases:cases.length,provenance,backends:['PARI','CPython','javascript','gmp','tagged'],trace_sha256:createHash('sha256').update(trace).digest('hex'),core_bytes:fs.statSync(built.coreSourcePath).size}));
})().catch(e=>{console.error(e);process.exitCode=1;});
