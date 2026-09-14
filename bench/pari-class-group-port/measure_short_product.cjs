"use strict";
// Identical prepared operands; diagnostic leaf comparison, not a qualified benchmark.
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const {createHash}=require("node:crypto");
const compilerRoot=path.resolve(process.argv[5]||path.join(__dirname,"../.."));
const {compileKernel}=require(path.join(compilerRoot,"tools/native-kernel/compiler.cjs"));
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:"utf8",timeout:120000,maxBuffer:4000000,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),prefix=path.resolve(process.argv[3]),cpu=Number(process.argv[4]);
 assert(Number.isInteger(cpu)&&cpu>=0);
 const rows=JSON.parse(run("python3",[path.join(__dirname,"check_multiply_precision.py"),pari,prefix,"--json"]));
 assert.equal(rows.length,228);
 const built=await compileKernel({sourcePath:path.join(__dirname,"short_product.py")});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-short-product-cost-"));
 const fixture=rows.map(row=>"{"+row.map(x=>JSON.stringify(x)).join(",")+"}").join(",\n");
 const common=`#include <stdio.h>
#include <stdlib.h>
#include <assert.h>
#include <time.h>
static const char *rows[228][9]={${fixture}};
static double seconds(struct timespec a,struct timespec b){return b.tv_sec-a.tv_sec+(b.tv_nsec-a.tv_nsec)*1e-9;}
`;
 const native=common+`#include "${built.coreHeaderPath}"
int main(void){mpz_t x[9],out[3];for(int j=0;j<9;j++)mpz_init(x[j]);for(int j=0;j<3;j++)mpz_init(out[j]);double total=0;
for(int i=0;i<228;i++){for(int j=0;j<9;j++)assert(mpz_set_str(x[j],rows[i][j],10)==0);
long count=i<32?1000:1;struct timespec a,b;sagejs_native_status error={0};
clock_gettime(CLOCK_MONOTONIC,&a);
for(long k=0;k<count;k++)assert(sagejs_kernel_pari_short_product(&error,out[0],out[1],out[2],x[0],x[1],x[2],x[3],x[4],x[5]));
clock_gettime(CLOCK_MONOTONIC,&b);assert(!error.code);for(int j=0;j<3;j++)assert(mpz_cmp(out[j],x[j+6])==0);
if(i<32)total+=seconds(a,b);}
printf("%.17g\\n",total);for(int j=0;j<9;j++)mpz_clear(x[j]);for(int j=0;j<3;j++)mpz_clear(out[j]);}
`;
 const control=common+`#include <pari.h>
static GEN integer(const char *s){return *s=='-'?negi(strtoi(s+1)):strtoi(s);}
static GEN real(int i,int j){return gmul2n(itor(integer(rows[i][j]),nbits2prec(atol(rows[i][j+1]))),atol(rows[i][j+2])+1-atol(rows[i][j+1]));}
int main(void){pari_init(32000000,500000);double total=0;
for(int i=0;i<228;i++){pari_sp outer=avma;GEN x=real(i,0),y=real(i,3),expected=real(i,6),z=NULL;pari_sp av=avma;
long count=i<32?1000:1;struct timespec a,b;clock_gettime(CLOCK_MONOTONIC,&a);
for(long k=0;k<count;k++){set_avma(av);z=mulrr(x,y);}
clock_gettime(CLOCK_MONOTONIC,&b);assert(gequal(z,expected)&&bit_prec(z)==atol(rows[i][7])&&expo(z)==atol(rows[i][8]));
if(i<32)total+=seconds(a,b);set_avma(outer);}
printf("%.17g\\n",total);pari_close();}
`;
 fs.writeFileSync(path.join(dir,"native.c"),native);fs.writeFileSync(path.join(dir,"pari.c"),control);
 const lib=path.join(pari,"Olinux-x86_64");
 run("cc",["-O2","-ffp-contract=off","-I"+path.join(prefix,"include"),path.join(dir,"native.c"),built.coreSourcePath,"-L"+path.join(prefix,"lib"),"-Wl,-rpath,"+path.join(prefix,"lib"),"-lgmp","-lm","-o",path.join(dir,"native")]);
 run("cc",["-O2","-ffp-contract=off","-I"+path.join(pari,"src/headers"),"-I"+lib,path.join(dir,"pari.c"),"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",path.join(dir,"pari")]);
 const results=[];
 for(let round=0;round<3;round++)for(const name of round%2?["native","pari"]:["pari","native"]){
  const seconds=Number(run("prlimit",["--as=4294967296","--cpu=120","--","taskset","-c",String(cpu),path.join(dir,name)]));
  assert(Number.isFinite(seconds)&&seconds>0);const row={round,name,seconds};results.push(row);console.log(JSON.stringify(row));
 }
 const hash=file=>createHash("sha256").update(fs.readFileSync(file)).digest("hex");
 const report={qualified:false,checkedCases:228,timedCases:32,repetitions:1000,cpu,results,
  fixtureSha256:createHash("sha256").update(JSON.stringify(rows)).digest("hex"),coreSha256:hash(built.coreSourcePath),nativeDriver:hash(path.join(dir,"native.c")),pariDriver:hash(path.join(dir,"pari.c")),
  boundary:"Prepared operand multiplication; parsing/conversion/checks excluded. No warmups; short diagnostic samples. PARI stack reset included; generated function owns temporary lifetimes.",core:built.coreSourcePath};
 fs.writeFileSync(path.join(dir,"evidence.json"),JSON.stringify(report,null,2));console.log(JSON.stringify({evidence:path.join(dir,"evidence.json")}));
})().catch(e=>{console.error(e);process.exitCode=1;});
