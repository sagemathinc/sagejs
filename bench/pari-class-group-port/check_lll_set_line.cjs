"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const result=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:4*1024*1024,...options});assert.equal(result.status,0,result.stderr||String(result.error));return result.stdout;}
(async()=>{
  const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,"Olinux-x86_64");
  let source=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/lll.c"]);
  assert.equal(createHash("sha256").update(source).digest("hex"),"ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
  source+=`
#include <stdint.h>
#include <inttypes.h>
static void emit_column(GEN column){
  long n=lg(column)-1; double values[5]={0}; long maximum=set_line(values,column,n);
  printf("%ld %ld",n,maximum);
  for(long i=1;i<=n;i++){long exponent;uint64_t bits;itodbl_exp(gel(column,i),&exponent);
    memcpy(&bits,&values[i],sizeof(bits));pari_printf(" %Ps %ld",gel(column,i),exponent);printf(" %" PRIu64,bits);}
  puts("");
}
int main(void){pari_init(64000000,10000);
 const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
 long primes[]={2,3,5,7,11,13,17,19};
 for(long f=0;f<4;f++){pari_sp outer=avma;GEN nf=nfinit(gp_read_str(polys[f]),192);
   for(long p=0;p<8;p++){pari_sp av=avma;GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[p])),1));
     GEN B=ZM_mul(nf_get_roundG(nf),I);for(long j=1;j<lg(B);j++)emit_column(gel(B,j));avma=av;}
   avma=outer;}
 emit_column(zerocol(3));
 long shifts[]={0,1,53,64,1074,1075,2098};
 for(long k=0;k<7;k++)for(long sign=-1;sign<=1;sign+=2){pari_sp av=avma;
   GEN big=shifti(gen_1,shifts[k]);if(sign<0)big=negi(big);
   emit_column(mkcol3(gen_0,stoi(sign),big));
   emit_column(mkcol3(stoi(sign*3),big,stoi(-sign*7)));avma=av;}
 pari_close();return 0;}
`;
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-lll-column-")),cpath=path.join(directory,"oracle.c"),executable=path.join(directory,"oracle");
  fs.writeFileSync(cpath,source);
  run("cc",["-O2","-fvisibility=hidden","-I"+path.join(pari,"src/headers"),"-I"+lib,cpath,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",executable]);
  const rows=run(executable,[]).trim().split("\n").map(line=>line.split(" "));
  assert.equal(rows.length,141);
  run("python3",["-c",`
import sys,json,decimal,struct,importlib
sys.path[:0]=sys.argv[1:3]
function=importlib.import_module('bench.pari-class-group-port.lll_float_preparation').pari_lll_set_line
for row in json.load(sys.stdin):
    row=list(map(int,row));n=row[0];data=row[2:];out=[0.0]*n;exponents=[0]*n
    maximum=function(data[0::3],n,out,exponents,[0.0])
    bits=[struct.unpack('>Q',struct.pack('>d',value))[0] for value in out]
    assert maximum==row[1] and exponents==data[1::3] and bits==data[2::3],row
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(rows)});
  const built=await compileKernel({sourcePath:path.join(__dirname,"lll_float_preparation.py")});
  const function_=require(built.modulePath).pari_lll_set_line,bits=new DataView(new ArrayBuffer(8));
  for(const row of rows)for(const backend of ["javascript","gmp"]){
    const n=Number(row[0]),data=row.slice(2).map(BigInt),values=[],exponents=Array(n).fill(0n),out=Array(n).fill(0);
    for(let i=0;i<n;i++)values.push(data[3*i]);
    assert.equal(function_[backend](values,BigInt(n),out,exponents,[0]),BigInt(row[1]));
    for(let i=0;i<n;i++){assert.equal(exponents[i],data[3*i+1]);bits.setFloat64(0,out[i],false);assert.equal(bits.getBigUint64(0,false),data[3*i+2]);}
  }
  console.log("141 set_line columns match PARI/CPython/JS/GMP bit-for-bit (112 actual prepared ideal columns, 29 zero/wide-exponent controls)");
})().catch(error=>{console.error(error);process.exitCode=1;});
