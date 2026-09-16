"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:16*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,"Olinux-x86_64");
 let source=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/lll.c"]);
 assert.equal(createHash("sha256").update(source).digest("hex"),"ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
 function replace(a,b){assert.equal(source.split(a).length,2,a);source=source.replace(a,b);}
 replace('#include "paripriv.h"','#include "paripriv.h"\nstatic long qrstatus, taken, size_seen, threshold_seen, spread_seen;');
 replace("\nZM_lll_norms(GEN x,","\nprobe_ZM_lll_norms(GEN x,");
 replace("  if (!QR_init(RgM_gtofp(M, prec), &B, &Q, &L, prec) || !gsisinv(L)) return NULL;",
  "  qrstatus=QR_init(RgM_gtofp(M, prec), &B, &Q, &L, prec); if (!qrstatus || !gsisinv(L)) return NULL;");
 replace("      useflatter = sz >= thr;","      taken=1;size_seen=sz;threshold_seen=thr;spread_seen=spr; useflatter = sz >= thr;");
 replace("  if(DEBUGLEVEL>=4) timer_start(&T);",`  return mkvecsmalln(9,useflatter,is_upper,is_lower,rank,qrstatus,taken,size_seen,threshold_seen,spread_seen);
  if(DEBUGLEVEL>=4) timer_start(&T);`);
 source+=`
static void emit(GEN B){for(long keep=0;keep<=1;keep++){
 qrstatus=-1;taken=size_seen=threshold_seen=spread_seen=0;
 GEN result=probe_ZM_lll_norms(B,.99,LLL_IM|(keep?LLL_KEEP_FIRST:0),NULL);
 printf("%ld %ld",lg(B)-1,keep);for(long i=1;i<=9;i++)printf(" %ld",result[i]);
 for(long i=1;i<lgcols(B);i++)for(long j=1;j<lg(B);j++)pari_printf(" %Ps",gcoeff(B,i,j));puts("");}}
int main(void){pari_init(128000000,10000);
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,5,7,11,13,17,19};
 for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
 for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));emit(ZM_mul(nf_get_roundG(nf),I));avma=av;}avma=outer;}
 for(long n=3;n<=4;n++){
  for(long kind=0;kind<4;kind++)for(long edge=-1;edge<=1;edge++){
   pari_sp av=avma;long threshold=(kind&1)?(n==3?31783:34393):(n==3?23280:30486);
   GEN B=matid(n);gcoeff(B,1,1)=int2n(threshold+edge);gcoeff(B,1,n)=stoi(3);
   if(kind&1)gcoeff(B,2,3)=gen_1;
   if(kind>=2)B=RgM_flip(B);emit(B);avma=av;
  }
  pari_sp av=avma;GEN B=matid(n);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)gcoeff(B,i,j)=stoi(i==j?3:1);emit(B);avma=av;
 }
 pari_close();return 0;}
`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-lll-selection-")),c=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");fs.writeFileSync(c,source);
 run("cc",["-O2","-fvisibility=hidden","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
 const rows=run(exe,[]).trim().split("\n").map(x=>x.split(" "));assert.equal(rows.length,116);
 run("python3",["-c",`
import sys,json,importlib,decimal
sys.set_int_max_str_digits(0)
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_selection').pari_lll_select_full_rank
for index,row in enumerate(json.load(sys.stdin)):
 row=list(map(int,row));n,keep=row[:2];diagnostic=[0]*5
 result=f(row[11:],n,row[5],bool(keep),*[ [0]*(3*n*n) for _ in range(3) ],*[ [0]*(3*n) for _ in range(3) ],diagnostic)
 assert list(result)==row[2:5] and diagnostic==row[6:11],(index,result,diagnostic,row[:11])
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,"lll_selection.py")}),f=require(built.modulePath).pari_lll_select_full_rank;assert.equal(f.nativeAvailable,true);
 for(let index=0;index<rows.length;index++)for(const backend of ["javascript","gmp"]){
  const row=rows[index].map(BigInt),n=Number(row[0]),N=BigInt(n),pack=x=>backend==="gmp"?f.packIntegerBuffer(x,1024):x;
  const ints=count=>pack(Array(count).fill(0n));let diagnostic=ints(5);
  const result=f[backend](pack(row.slice(11)),N,row[5],Boolean(row[1]),ints(3*n*n),ints(3*n*n),ints(3*n*n),ints(3*n),ints(3*n),ints(3*n),diagnostic);
  if(backend==="gmp")diagnostic=diagnostic.toArray();
  assert.deepEqual(result,row.slice(2,5),`${index} ${backend} decision`);assert.deepEqual(diagnostic,row.slice(6,11),`${index} ${backend} diagnostic`);
 }
 console.log("116 full-rank LLL selection cases match PARI/CPython/JS/GMP, including QR failure and triangular threshold boundaries; rank remains supplied");
 console.log(JSON.stringify({traceSha256:createHash("sha256").update(JSON.stringify(rows)).digest("hex")}));
})().catch(error=>{console.error(error);process.exitCode=1;});
