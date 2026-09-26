"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-residue-bound-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
int main(void){pari_init(64000000,10000);double logs[]={3,10,20,40,100,300,1000};
for(long n=2;n<=10;n++)for(long r1=n%2;r1<=n;r1+=2)for(long li=0;li<7;li++){
long r2=(n-r1)/2;double ld=logs[li];long result=primeneeded(n,r1,r2,ld);
double a=0.3526*ld-0.8212*n+4.5007,rm=-1.0155*ld+2.1042*n-8.3419,rM=-0.5*ld+1.2076*n+1,r1m=-ld+1.4150*n,r1M=-ld+1.9851*n,r2m=-ld+0.9151*n,r2M=-ld+1.0800*n;
printf("%ld %ld %ld %.17g %ld",n,r1,r2,ld,result);
for(long i=0;i<=31;i++)printf(" %.17g",tailres(r1,r2,a,rm,rM,r1m,r1M,r2m,r2M,3.0*(1UL<<i),i));
puts("");}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
  const records=run.stdout.trim().split("\n").map(line=>{const r=line.split(" ").map(Number);assert.equal(r.length,37);return {n:r[0],r1:r[1],r2:r[2],ld:r[3],bound:r[4],tails:r.slice(5)};});
  const py=spawnSync("python3",["-c",`
import sys,json,math
sys.path[:0]=[${JSON.stringify(__dirname)},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
from residue_bound import pari_prepared_primeneeded,pari_tailres_check
for r in json.load(sys.stdin):
    coefficients=[0.0]*7;table=[0.0]*31;out=[0.0]
    assert pari_prepared_primeneeded(r['n'],r['r1'],r['r2'],[r['ld']],coefficients,table,out)==r['bound'],r
    for i,want in enumerate(r['tails']):
        pari_tailres_check(r['r1'],r['r2'],3*2**i,i,coefficients,table,out)
        assert math.isclose(out[0],want,rel_tol=1e-12,abs_tol=1e-14),(r,i,out,want)
print('CPython bound and tail match PARI')
`],{input:JSON.stringify(records),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
  const built=await compileKernel({sourcePath:path.join(__dirname,"residue_bound.py")}),mod=require(built.modulePath);
  for(const r of records)for(const backend of ["javascript","gmp"]){
    const coefficients=Array(7).fill(0),table=Array(31).fill(0),out=[0];
    assert.equal(mod.pari_prepared_primeneeded[backend](BigInt(r.n),BigInt(r.r1),BigInt(r.r2),[r.ld],coefficients,table,out),BigInt(r.bound));
    for(const [i,want] of r.tails.entries()){
      const above=mod.pari_tailres_check[backend](BigInt(r.r1),BigInt(r.r2),3n*(1n<<BigInt(i)),BigInt(i),coefficients,table,out);
      assert.equal(above,want>0.25?1n:0n);
      assert(Math.abs(out[0]-want)<=1e-14+1e-12*Math.abs(want),`${backend} ${JSON.stringify(r)} i=${i}: ${out[0]} != ${want}`);
    }
  }
  console.log(`${records.length} primeneeded results and ${records.length*32} tail values match PARI/CPython/JS/GMP, retaining upstream argument casts`);
})().catch(error=>{console.error(error);process.exitCode=1;});
