"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64");
 for(const [file,sha] of Object.entries({
  "src/basemath/alglin1.c":"ccfa192dc3e46e1fbdcc91c8160e11d3b7d91c68b941d4eac1776cf815e2d5a3",
  "src/basemath/Flv.c":"edd3d1376c1abf5ada63c238fe044518c876c9d9515bc28cf29836eb6dc65da3",
  "src/kernel/none/gcdll.c":"b91389d8cd1b8fea0f62da09a73e076b92c4127dcc3a9234f17001d5c2524e7b",
  "src/language/forprime.c":"8da10ec9afe97230818772428381b65dea231e271d713a277f6c283716ead823",
 })){
  const pristine=run("tar",["-xOf",process.argv[3],"pari-2.17.4/"+file]);
  assert.equal(createHash("sha256").update(pristine).digest("hex"),sha,file);
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(pari,file))).digest("hex"),sha,file);
 }
 const prepared=JSON.parse(run(process.execPath,[path.join(__dirname,"probe_lll_preparation.cjs"),pari,process.argv[3]])).rows;
 const cases=prepared.map(r=>({n:r.degree,input:r.input}));
 const p=2147483659n,q=2147483693n;
 for(const n of [3,4])for(let kind=0;kind<8;kind++){
  const a=Array.from({length:n*n},(_,i)=>BigInt(i%n===Math.floor(i/n)));
  if(kind===0)a.fill(0n);
  if(kind===1)a[0]=p;
  if(kind===2)a[0]=p*q;
  if(kind===3)for(let i=0;i<n;i++)a[i*n+n-1]=a[i*n];
  if(kind===4)for(let i=0;i<n;i++)a[i*n+n-1]=0n;
  if(kind===5)for(let i=0;i<n*n;i++)a[i]=(BigInt(i)-5n)*(1n<<80n);
  if(kind===6){a[0]=-p;a[n+1]=-3n;a[1]=5n;}
  if(kind===7){a[0]=0n;a[1]=1n;a[n]=1n;a[n+1]=0n;}
  cases.push({n,input:a.map(String)});
 }
 const matrices=cases.map(r=>JSON.stringify("["+Array.from({length:r.n},(_,i)=>r.input.slice(i*r.n,(i+1)*r.n).join(",")).join(";")+"]"));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-integer-rank-")),c=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
 fs.writeFileSync(c,`#include "pari.h"
#include "paripriv.h"
int main(void){pari_init(128000000,10000);const char *matrices[]={${matrices.join(",")}};
 for(long ix=0;ix<${cases.length};ix++){pari_sp av=avma;GEN M=gp_read_str(matrices[ix]);long n=lg(M)-1,zc=0,best=n,trials=0,rank=-1;ulong prime=0;GEN A=zero_Flm(n,n),d=zero_zv(n);
 for(long j=1;j<=n;j++)if(ZV_equal0(gel(M,j)))zc++;
 if(zc==n)rank=0;else{forprime_t S;init_modular_small(&S);for(long i=0;i<2;i++){long rp;prime=u_forprime_next(&S);if(prime!=(i?2147483693UL:2147483659UL))return 2;A=ZM_to_Flm(M,prime);d=Flm_pivots(A,prime,&rp,1);trials++;if(rp<best)best=rp;if(rp==zc){rank=n-rp;break;}}}
 if(rank>=0&&rank!=ZM_rank(M))return 3;
 printf("%ld %ld %lu %ld",rank,trials,prime,best);for(long j=1;j<=n;j++)printf(" %ld",d[j]);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)printf(" %lu",uel(gel(A,j),i));puts("");avma=av;}pari_close();return 0;}`);
 run("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
 const trace=run(exe,[]),rows=trace.trim().split("\n").map((line,i)=>{const a=line.split(" ");return {...cases[i],status:a[0],diagnostic:a.slice(1,4),pivots:a.slice(4,4+cases[i].n),matrix:a.slice(4+cases[i].n)};});
 assert(rows.some(r=>r.diagnostic[0]==="2"&&r.status===String(r.n)));assert(rows.some(r=>r.status==="-1"));assert(rows.slice(0,32).every(r=>r.status===String(r.n)));
 run("python3",["-c",`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_rank').pari_initial_integer_rank
for ix,r in enumerate(json.load(sys.stdin)):
 n=r['n'];matrix=[0]*n*n;occupied=[0]*n;pivots=[0]*n;diagnostic=[0]*3
 result=f(list(map(int,r['input'])),n,matrix,occupied,pivots,diagnostic)
 assert result==int(r['status']) and diagnostic==list(map(int,r['diagnostic'])) and pivots==list(map(int,r['pivots'])) and matrix==list(map(int,r['matrix'])),(ix,result,diagnostic,pivots,matrix,r)
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,"lll_rank.py")}),f=require(built.modulePath).pari_initial_integer_rank;assert.equal(f.nativeAvailable,true);
 for(const [ix,r]of rows.entries())for(const backend of ["javascript","gmp"]){const pack=a=>backend==="gmp"?f.packIntegerBuffer(a,16):a,z=n=>pack(Array(n).fill(0n)),matrix=z(r.n*r.n),occupied=z(r.n),pivots=z(r.n),diagnostic=z(3),out=a=>backend==="gmp"?a.toArray():a;
  assert.equal(f[backend](pack(r.input.map(BigInt)),BigInt(r.n),matrix,occupied,pivots,diagnostic),BigInt(r.status),`${ix} ${backend}`);
  assert.deepEqual(out(matrix),r.matrix.map(BigInt));assert.deepEqual(out(pivots),r.pivots.map(BigInt));assert.deepEqual(out(diagnostic),r.diagnostic.map(BigInt));
 }
 console.log(`${rows.length} initial modular rank paths match PARI/CPython/JS/GMP, including second-prime recovery and unresolved dubious rank`);
 console.log(JSON.stringify({traceSha256:createHash("sha256").update(trace).digest("hex"),qualifiedTiming:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
