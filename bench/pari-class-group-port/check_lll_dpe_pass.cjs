"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,"Olinux-x86_64");
 let source=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/lll.c"]);
 assert.equal(createHash("sha256").update(source).digest("hex"),"ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
 source=source.replace("{ return (dpe_t*) stack_malloc_align(d*sizeof(dpe_t), sizeof(dpe_t)); }",
  "{ dpe_t *v=(dpe_t*)stack_malloc_align(d*sizeof(dpe_t),sizeof(dpe_t)); for(long i=0;i<d;i++){v[i].d=0.;v[i].e=0;} return v; }");
 source=source.replace("static long\nfplll_dpe", "static dpe_t **saved_r;\nstatic long\nfplll_dpe");
 source=source.replace("if (pr) *pr = dpeM_diagonal_shallow(r,d);", "saved_r=r; if (pr) *pr = dpeM_diagonal_shallow(r,d);");
 source+=`
#include <stdint.h>
#include <inttypes.h>
static long selected,case_number;
static void matrix(GEN B){for(long j=1;j<lg(B);j++)for(long i=1;i<lgcols(B);i++)pari_printf(" %Ps",gmael(B,j,i));}
static void test(GEN input){for(long keep=0;keep<=1;keep++)for(long inc=0;inc<=1;inc++){
 if(case_number++!=selected)continue;
 pari_sp av=avma;long n=lg(input)-1;GEN B=gcopy(input),U=matid(n),G=NULL;
 if(!inc){G=zeromatcopy(n,n);for(long j=1;j<=n;j++)for(long i=1;i<=j;i++)gmael(G,j,i)=ZV_dotproduct(gel(B,j),gel(B,i));}
 long status=fplll_dpe(&G,&B,&U,NULL,.99,.51,keep);
 if(!gequal(ZM_mul(input,U),B))pari_err_BUG("DPE transform identity");
 if(status>=0)for(long j=1;j<=n;j++)for(long i=1;i<=j;i++)if(!equalii(gmael(G,j,i),ZV_dotproduct(gel(B,j),gel(B,i))))pari_err_BUG("DPE Gram identity");
 printf("%ld %ld %ld %ld",n,keep,inc,status);matrix(input);matrix(B);matrix(U);
 if(status>=0){matrix(G);for(long i=1;i<=n;i++){uint64_t bits;memcpy(&bits,&saved_r[i][i].d,8);printf(" %" PRIu64 " %ld",bits,saved_r[i][i].e);}}
 puts("");avma=av;
}}
int main(int argc,char **argv){if(argc!=2)return 4;selected=atol(argv[1]);pari_init(128000000,10000);
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long primes[]={2,3,5,7,11,13,17,19};
 for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
 for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));test(ZM_mul(nf_get_roundG(nf),I));avma=av;}avma=outer;}
 for(long n=3;n<=4;n++){pari_sp av=avma;test(matid(n));test(zeromat(n,n));
 GEN B=matid(n);gel(B,1)=zerocol(n);test(B);
 B=matid(n);gel(B,n)=gcopy(gel(B,1));test(B);
 B=matid(n);for(long j=1;j<n;j++)gmael(B,n,j)=stoi(17*j-5);test(B);avma=av;}
 pari_close();return 0;}
`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-dpe-pass-")),c=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");fs.writeFileSync(c,source);
 run("cc",["-O2","-fvisibility=hidden","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
 const rows=[],censored=[];
 for(let i=0;i<168;i++){
  const r=spawnSync(exe,[String(i)],{encoding:"utf8",timeout:2000,maxBuffer:1024*1024});
  if(r.error?.code==="ETIMEDOUT"){censored.push(i);continue;}
  assert.equal(r.status,0,`case ${i}: ${r.stderr||r.error}`);rows.push(r.stdout.trim().split(" "));
 }
 console.log(JSON.stringify({referenceCompleted:rows.length,referenceCensored:censored,referenceCaseTimeoutMs:2000}));
 assert.equal(censored.length,0,"unqualified reference censoring");assert.equal(rows.length,168);
 run("python3",["-c",`
import sys,json,struct,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_dpe_pass').pari_lll_dpe
for index,row in enumerate(json.load(sys.stdin)):
 row=list(map(int,row));n,keep,inc,wanted=row[:4];m=n*n;B=row[4:4+m];U=[int(i==j) for j in range(n) for i in range(n)]
 G=[sum(B[j*n+k]*B[i*n+k] for k in range(n)) if i<=j else 0 for j in range(n) for i in range(n)]
 r=[0.0]*m;re=[0]*m
 got=f(G,B,U,n,n,n,bool(inc),.99,.51,bool(keep),[0.0]*m,[0]*m,r,re,[0.0]*n,[0]*n,[0]*n,[0]*n,[0.0]*n)
 assert got==wanted and B==row[4+m:4+2*m] and U==row[4+2*m:4+3*m],(index,got,wanted,B,U,row)
 if got>=0:
  assert G==row[4+3*m:4+4*m],(index,'Gram',G,row)
  diag=[]
  for i in range(n):diag.extend([struct.unpack('>Q',struct.pack('>d',r[i*n+i]))[0],re[i*n+i]])
  assert diag==row[4+4*m:],(index,'diagonal',diag,row[4+4*m:])
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,"lll_dpe_pass.py")}),f=require(built.modulePath).pari_lll_dpe;assert.equal(f.nativeAvailable,true);
 const bits=new DataView(new ArrayBuffer(8));
 for(let index=0;index<rows.length;index++)for(const backend of ["javascript","gmp"]){
  const row=rows[index].map(BigInt),n=Number(row[0]),m=n*n,N=BigInt(n),pack=x=>backend==="gmp"?f.packIntegerBuffer(x,128):x;
  const input=row.slice(4,4+m);let B=pack(input),U=pack(Array.from({length:m},(_,i)=>BigInt(i%n===Math.floor(i/n))));
  let G=pack(Array.from({length:m},(_,p)=>{const j=Math.floor(p/n),i=p%n;let x=0n;if(i<=j)for(let k=0;k<n;k++)x+=input[j*n+k]*input[i*n+k];return x;}));
  const ints=count=>pack(Array(count).fill(0n)),r=Array(m).fill(0);let re=ints(m);
  const got=f[backend](G,B,U,N,N,N,Boolean(row[2]),.99,.51,Boolean(row[1]),Array(m).fill(0),ints(m),r,re,Array(n).fill(0),ints(n),ints(n),ints(n),Array(n).fill(0));
  if(backend==="gmp"){B=B.toArray();U=U.toArray();G=G.toArray();re=re.toArray();}
  assert.equal(got,row[3],`${index} ${backend} status`);assert.deepEqual(B,row.slice(4+m,4+2*m),`${index} ${backend} basis`);assert.deepEqual(U,row.slice(4+2*m,4+3*m),`${index} ${backend} transform`);
  if(got>=0n){assert.deepEqual(G,row.slice(4+3*m,4+4*m),`${index} ${backend} Gram`);const diag=[];for(let i=0;i<n;i++){bits.setFloat64(0,r[i*n+i],false);diag.push(bits.getBigUint64(0,false),re[i*n+i]);}assert.deepEqual(diag,row.slice(4+4*m),`${index} ${backend} diagonal`);}
 }
 console.log("168 DPE LLL passes match PARI/CPython/JS/GMP: prepared ideals and rank-deficient controls; supplied/incremental Gram and keepfirst on/off");
 console.log(JSON.stringify({traceSha256:createHash("sha256").update(JSON.stringify(rows)).digest("hex")}));
})().catch(error=>{console.error(error);process.exitCode=1;});
