"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:"utf8",timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,"Olinux-x86_64");
 let source=run("tar",["-xOf",archive,"pari-2.17.4/src/basemath/lll.c"]);
 assert.equal(createHash("sha256").update(source).digest("hex"),"ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b");
 source+=`
#include <stdint.h>
#include <inttypes.h>
static void pair(dpe_t *x){uint64_t bits;memcpy(&bits,&x->d,8);printf(" %" PRIu64 " %ld",bits,x->e);}
int main(void){pari_init(64000000,10000);
 const char *integers[]={"0","1","-1","3","-3","2^53-1","2^53+1","2^64+2049","-2^64-2049","2^1024+1"};
 long gaps[]={-2000,-54,-53,-52,-1,0,1,52,53,54,2000};
 for(long i=0;i<10;i++)for(long j=0;j<10;j++)for(long k=0;k<11;k++){
 pari_sp av=avma;GEN a=gp_read_str(integers[i]),b=gp_read_str(integers[j]);dpe_t x,y,z;
 affidpe(a,&x);affidpe(b,&y);y.e+=gaps[k];
 pari_printf("%Ps %Ps %ld",a,b,gaps[k]);pair(&x);pair(&y);
 dpe_addz(&x,&y,&z);pair(&z);dpe_subz(&x,&y,&z);pair(&z);dpe_mulz(&x,&y,&z);pair(&z);
 if(y.d!=0){dpe_divz(&x,&y,&z);pair(&z);}else printf(" 0 0");
 printf(" %d",dpe_cmp(&x,&y));dpe_submulz(&x,&y,&x,&z);pair(&z);puts("");avma=av;
 }pari_close();return 0;}
`;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-dpe-")),c=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");fs.writeFileSync(c,source);
 run("cc",["-O2","-fvisibility=hidden","-I"+path.join(pari,"src/headers"),"-I"+lib,c,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe]);
 const rows=run(exe,[]).trim().split("\n").map(x=>x.split(" "));assert.equal(rows.length,1100);
 run("python3",["-c",`
import sys,json,struct,importlib
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.lll_dpe')
def bits(x):return struct.unpack('>Q',struct.pack('>d',x))[0]
for row in json.load(sys.stdin):
 row=list(map(int,row));x,xe=m.pari_dpe_integer(row[0],[0.0]);y,ye=m.pari_dpe_integer(row[1],[0.0]);ye+=row[2]
 assert [bits(x),xe,bits(y),ye]==row[3:7]
 for op,index in [('add',7),('subtract',9),('multiply',11),('divide',13)]:
  if op=='divide' and y==0:continue
  z,e=getattr(m,'pari_dpe_'+op)(x,xe,y,ye)
  assert [bits(z),e]==row[index:index+2],(op,row,z,e)
 assert m.pari_dpe_compare(x,xe,y,ye)==row[15]
 z,e=m.pari_dpe_subtract_product(x,xe,y,ye,x,xe)
 assert [bits(z),e]==row[16:18],('submul',row,z,e)
`,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib")],{input:JSON.stringify(rows)});
 const built=await compileKernel({sourcePath:path.join(__dirname,"lll_dpe.py")}),m=require(built.modulePath),view=new DataView(new ArrayBuffer(8));
 const bits=x=>{view.setFloat64(0,x,false);return view.getBigUint64(0,false);};
 for(const text of rows)for(const backend of ["javascript","gmp"]){
  const row=text.map(BigInt),[x,xe]=m.pari_dpe_integer[backend](row[0],[0]),[y,e]=m.pari_dpe_integer[backend](row[1],[0]),ye=e+row[2];
  assert.deepEqual([bits(x),xe,bits(y),ye],row.slice(3,7));
  for(const [op,index] of [["add",7],["subtract",9],["multiply",11],["divide",13]]){
   if(op==="divide"&&y===0)continue;
   const [z,ze]=m["pari_dpe_"+op][backend](x,xe,y,ye);assert.deepEqual([bits(z),ze],row.slice(index,index+2),`${backend} ${op}`);
  }
  assert.equal(m.pari_dpe_compare[backend](x,xe,y,ye),row[15]);
  const [z,ze]=m.pari_dpe_subtract_product[backend](x,xe,y,ye,x,xe);
  assert.deepEqual([bits(z),ze],row.slice(16,18),`${backend} submul`);
 }
 console.log("1100 DPE operand pairs match PARI/CPython/JS/GMP, including 53-bit cutoff and zero metadata; zero-divisor DPE exponent behavior excluded");
})().catch(error=>{console.error(error);process.exitCode=1;});
