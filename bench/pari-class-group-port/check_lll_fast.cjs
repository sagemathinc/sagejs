"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:4*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,"Olinux-x86_64");
 const declaredCases=process.argv.includes("--prepared-only")?64:84;
 let source=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/lll.c"]);
 assert.equal(createHash("sha256").update(source).digest("hex"),"ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
 source+=`
static long selected, case_number;
static void matrix(GEN B){for(long j=1;j<lg(B);j++)for(long i=1;i<lgcols(B);i++)pari_printf(" %Ps",gmael(B,j,i));}
static void test(GEN input){for(long keep=0;keep<=1;keep++){
 if(case_number++ != selected)continue;
 pari_sp av=avma;long n=lg(input)-1;GEN B=gcopy(input),U=matid(n);
 long status=fplll_fast(&B,&U,.99,.51,keep);
 if(!gequal(ZM_mul(input,U),B))pari_err_BUG("fast transform identity");
 printf("%ld %ld %ld",n,keep,status);matrix(input);matrix(B);matrix(U);puts("");avma=av;
}}
int main(int argc,char **argv){if(argc!=2)return 4;selected=atol(argv[1]);pari_init(128000000,10000);
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long primes[]={2,3,5,7,11,13,17,19};
 for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));
 for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));test(ZM_mul(nf_get_roundG(nf),I));avma=av;}avma=outer;}
 for(long n=3;n<=4;n++){pari_sp av=avma;test(matid(n));test(zeromat(n,n));
 GEN B=matid(n);gel(B,1)=zerocol(n);test(B);
 B=matid(n);gel(B,n)=gcopy(gel(B,1));test(B);
 B=matid(n);for(long j=1;j<n;j++)gmael(B,n,j)=stoi(17*j-5);test(B);
 avma=av;}pari_close();return 0;}
`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-fast-lll-")),c=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");fs.writeFileSync(c,source);
 run("cc",["-O2","-fvisibility=hidden","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
 const rows=[],censored=[];
 for(let index=0;index<declaredCases;index++){
   const result=spawnSync(exe,[String(index)],{encoding:"utf8",timeout:2000,maxBuffer:1024*1024});
   if(result.error?.code==="ETIMEDOUT"){censored.push(index);continue;}
   assert.equal(result.status,0,result.stderr||String(result.error));
   rows.push(result.stdout.trim().split(" "));
 }
 assert.equal(rows.length+censored.length,declaredCases);
 console.log(JSON.stringify({referenceCompleted:rows.length,referenceCensored:censored,referenceCaseTimeoutMs:2000}));
 run("python3",["-c",`
import sys,json,importlib
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.lll_fast').pari_lll_fast
for index,row in enumerate(json.load(sys.stdin)):
 row=list(map(int,row));n,keep,wanted=row[:3];m=n*n;B=row[3:3+m];U=[int(i==j) for j in range(n) for i in range(n)]
 try:got=f(B,U,n,n,n,.99,.51,bool(keep),[0.0]*m,[0.0]*m,[0.0]*n,[0.0]*m,[0]*n,[0.0]*m,[0]*n,[0]*n,[0]*n,[0.0]*n,[0.0])
 except Exception as error:raise AssertionError((index,row[:3],row[3:3+m])) from error
 assert got==wanted and B==row[3+m:3+2*m] and U==row[3+2*m:],(index,got,wanted,B,U,row)
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,"lll_fast.py")}),f=require(built.modulePath).pari_lll_fast;assert.equal(f.nativeAvailable,true);
 for(let index=0;index<rows.length;index++)for(const backend of ["javascript","gmp"]){
  const row=rows[index].map(BigInt),n=Number(row[0]),m=n*n,N=BigInt(n),pack=x=>backend==="gmp"?f.packIntegerBuffer(x,64):x;
  let B=pack(row.slice(3,3+m)),U=pack(Array.from({length:m},(_,i)=>BigInt(i%n===Math.floor(i/n))));
  const ints=()=>pack(Array(n).fill(0n));
  const got=f[backend](B,U,N,N,N,.99,.51,Boolean(row[1]),Array(m).fill(0),Array(m).fill(0),Array(n).fill(0),Array(m).fill(0),ints(),Array(m).fill(0),ints(),ints(),ints(),Array(n).fill(0),[0]);
  if(backend==="gmp"){B=B.toArray();U=U.toArray();}
  assert.equal(got,row[2],`${index} ${backend} status`);assert.deepEqual(B,row.slice(3+m,3+2*m),`${index} ${backend} basis`);assert.deepEqual(U,row.slice(3+2*m),`${index} ${backend} transform`);
 }
 console.log(`${rows.length} completed fast LLL passes match PARI/CPython/JS/GMP; ${censored.length} reference controls censored (${declaredCases} declared cases, keepfirst on/off)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
