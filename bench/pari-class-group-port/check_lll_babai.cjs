"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,"Olinux-x86_64");
 const actual=process.argv.includes("--actual");
 let source=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/lll.c"]);
 assert.equal(createHash("sha256").update(source).digest("hex"),"ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
 if(actual){
   source=source.replace("{ return (double*) stack_malloc_align(d*sizeof(double), sizeof(double)); }",
     "{ double *v=(double*)stack_malloc_align(d*sizeof(double),sizeof(double)); for(long i=0;i<d;i++)v[i]=0.; return v; }");
   source=source.replace("\nBabai_fast(","\noriginal_Babai_fast(");
   source=source.replace("\nZM_lll_norms(GEN x,","\nprobe_ZM_lll_norms(GEN x,");
   source=source.replace("static long\nfplll_fast",`static int
Babai_fast(pari_sp av,long k,GEN *B,GEN *U,double **mu,double **r,double *s,double **app,GEN ex,double **G,long a,long z,long maximum,double eta){
 if(++probe_calls>512)pari_err_BUG("Babai trace cap");
 probe_k=k-1;probe_a=a-1;probe_z=z;probe_max=maximum;
 dump(nbrows(*B),-1,*B,*U,mu,r,s,app,ex,G);
 int result=original_Babai_fast(av,k,B,U,mu,r,s,app,ex,G,a,z,maximum,eta);
 dump(nbrows(*B),result,*B,*U,mu,r,s,app,ex,G);return result;
}
static long
fplll_fast`);
 }
 source=source.replace('#include "paripriv.h"',`#include "paripriv.h"
static long probe_k,probe_a,probe_z,probe_max,probe_calls;
static void dump(long,long,GEN,GEN,double **,double **,double *,double **,GEN,double **);
`);
 source+=`
#include <stdint.h>
#include <inttypes.h>
static void outdouble(double x){uint64_t b;memcpy(&b,&x,8);printf(" %" PRIu64,b);}
static void dump(long n,long status,GEN B,GEN U,double **mu,double **r,double *s,double **app,GEN ex,double **G){
 printf("%ld %ld %ld %ld %ld %ld",n,status,probe_k,probe_a,probe_z,probe_max);
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)pari_printf(" %Ps",gmael(B,j,i));
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)pari_printf(" %Ps",gmael(U,j,i));
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)outdouble(mu[j][i]);
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)outdouble(r[j][i]);
 for(long i=1;i<=n;i++)outdouble(s[i]);
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)outdouble(app[j][i]);
 for(long i=1;i<=n;i++)printf(" %ld",ex[i]);
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)outdouble(G[j][i]);
 puts("");
}
int main(void){pari_init(64000000,10000);long shifts[]={0,1,52,53,100,1074,2098};
 for(long n=3;n<=4;n++)for(long sign=-1;sign<=1;sign+=2)for(long t=0;t<7;t++){
 pari_sp av=avma;GEN B=matid(n),U=matid(n),ex=cgetg(n+1,t_VECSMALL);
 for(long j=1;j<n;j++){gmael(B,j,j)=stoi(j+1);gmael(B,n,j)=mulsi(sign,addiu(shifti(gen_1,shifts[t]),j));}
 double **mu=cget_dblmat(n+1),**r=cget_dblmat(n+1),**app=cget_dblmat(n+1),**G=cget_dblmat(n+1),*s=cget_dblvec(n+1);
 for(long j=1;j<=n;j++){mu[j]=cget_dblvec(n+1);r[j]=cget_dblvec(n+1);app[j]=cget_dblvec(n+1);G[j]=cget_dblvec(n+1);
 for(long i=1;i<=n;i++){mu[j][i]=0;r[j][i]=0;}s[j]=0;ex[j]=set_line(app[j],gel(B,j),n);}
 for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)G[j][i]=dbldotproduct(app[j],app[i],n);
 for(long j=1;j<n;j++)r[j][j]=G[j][j];
 probe_k=n-1;probe_a=0;probe_z=0;probe_max=n;
 dump(n,-1,B,U,mu,r,s,app,ex,G);
 long result=Babai_fast(avma,n,&B,&U,mu,r,s,app,ex,G,1,0,n,0.51);
 dump(n,result,B,U,mu,r,s,app,ex,G);avma=av;
 }pari_close();return 0;}
`;
 if(actual){
   source=source.slice(0,source.indexOf("int main(void){pari_init"))+`
int main(void){pari_init(128000000,10000);
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long primes[]={2,3,5,7,11,13,17,19};
 for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
 for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));
 GEN B=ZM_mul(nf_get_roundG(nf),I);
 GEN U=probe_ZM_lll_norms(B,.99,LLL_IM,NULL);
 if(!gequal(U,ZM_lll_norms(B,.99,LLL_IM,NULL)))return 3;
 avma=av;}avma=outer;}
 fprintf(stderr,"captured %ld Babai calls from 32 prepared ideals\\n",probe_calls);
 pari_close();return 0;}
`;
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-babai-")),c=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");fs.writeFileSync(c,source);
 run("cc",["-O2","-fvisibility=hidden","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
 const rows=run(exe,[]).trim().split("\n").map(x=>x.split(" "));
 assert.equal(rows.length,actual?160:56);
 run("python3",["-c",`
import sys,json,struct,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_babai').pari_babai_fast
def decode(row):
 n=int(row[0]);pos=6;out=[]
 for count,integer in [(n*n,True),(n*n,True),(n*n,False),(n*n,False),(n,False),(n*n,False),(n,True),(n*n,False)]:
  out.append([int(x) if integer else struct.unpack('>d',struct.pack('>Q',int(x)))[0] for x in row[pos:pos+count]]);pos+=count
 assert pos==len(row)
 return n,out
rows=json.load(sys.stdin)
for i in range(0,len(rows),2):
 n,a=decode(rows[i]);_,want=decode(rows[i+1])
 result=f(a[0],a[1],n,n,n,*map(int,rows[i][2:6]),0.51,*a[2:],[0]*n,[0]*n,[0.0]*n,[0.0])
 assert result==int(rows[i+1][1]),i
 for j,(got,expected) in enumerate(zip(a,want)):
  if j in (0,1,6):assert got==expected,(i,j,got,expected)
  else:assert [struct.pack('>d',x) for x in got]==[struct.pack('>d',x) for x in expected],(i,j,got,expected)
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,"lll_babai.py")}),f=require(built.modulePath).pari_babai_fast;
 assert.equal(f.nativeAvailable,true);
 const bits=new DataView(new ArrayBuffer(8));
 function decode(row){const n=Number(row[0]);let pos=6;const out=[];for(const [count,integer] of [[n*n,1],[n*n,1],[n*n,0],[n*n,0],[n,0],[n*n,0],[n,1],[n*n,0]]){out.push(row.slice(pos,pos+count).map(x=>{if(integer)return BigInt(x);bits.setBigUint64(0,BigInt(x),false);return bits.getFloat64(0,false);}));pos+=count;}assert.equal(pos,row.length);return [n,out];}
 for(let i=0;i<rows.length;i+=2)for(const backend of ["javascript","gmp"]){
  const [n,a]=decode(rows[i]),[,want]=decode(rows[i+1]),N=BigInt(n);
  // Fixed experiment capacity, declared before execution, for 2098-bit inputs
  // and growing transformation entries. This is not an adaptive LLL limit.
  const pack=x=>backend==="gmp"?f.packIntegerBuffer(x,64):x;
  for(const j of [0,1,6])a[j]=pack(a[j]);
  const result=f[backend](a[0],a[1],N,N,N,...rows[i].slice(2,6).map(BigInt),0.51,...a.slice(2),pack(Array(n).fill(0n)),pack(Array(n).fill(0n)),Array(n).fill(0),[0]);
  if(backend==="gmp")for(const j of [0,1,6])a[j]=a[j].toArray();
  assert.equal(result,BigInt(rows[i+1][1]),`${i} ${backend} status`);assert.deepEqual(a,want,`${i} ${backend} state`);
 }
 console.log(`${rows.length/2} Babai calls match PARI/CPython/JS/GMP state (${actual?"captured normal LLL path, 32 prepared ideals":"synthetic dimensions 3/4, shifts through 2098"})`);
 const counters={calls:rows.length/2,basisChanges:0,nonzeroIncomingMu:0,stagnation:0};
 for(let i=0;i<rows.length;i+=2){
   const [n,before]=decode(rows[i]),[,after]=decode(rows[i+1]);
   if(before[0].some((x,j)=>x!==after[0][j]))counters.basisChanges++;
   if(before[2].some(x=>x!==0))counters.nonzeroIncomingMu++;
   if(rows[i+1][1]==="1")counters.stagnation++;
 }
 console.log(JSON.stringify({counters,traceSha256:createHash("sha256").update(JSON.stringify(rows)).digest("hex")}));
})().catch(error=>{console.error(error);process.exitCode=1;});
