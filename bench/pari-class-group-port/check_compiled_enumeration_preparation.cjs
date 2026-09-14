"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-enum-prep-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
static void scalar(GEN x){long e;if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,7};double scales[]={0.125,4.,256.,1.e6,1.e12};
for(long f=0;f<4;f++)for(long pr=128;pr<=256;pr+=64){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),pr);long n=nf_get_degree(nf);
for(long k=0;k<3;k++)for(long t=0;t<5;t++){GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[k])),1)),u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),0.99,LLL_IM),x=RgM_mul(nf_get_G(nf),ZM_mul(I,u)),r=gaussred_from_QR(x,pr);
double v[11]={0},q[121]={0},T=scales[t];long stride=n+1;for(long i=1;i<=n;i++){if(!gisdouble(gcoeff(r,i,i),&v[i]))return 2;for(long j=1;j<i;j++)if(!gisdouble(gcoeff(r,j,i),&q[j*stride+i]))return 3;}
double b2=v[2]+v[1]*q[stride+2]*q[stride+2],bound=maxdd(2*b2,Fincke_Pohst_bound(T,r));
GEN zT=dbltor(T*T),prod=gcoeff(r,1,1);long stop;for(stop=2;stop<=n;stop++){prod=gmul(prod,gcoeff(r,stop,stop));GEN B=sqrtnr(gmul(zT,prod),stop);if(stop==n||cmprr(B,gcoeff(r,stop+1,stop+1))<0)break;}
printf("%ld %ld %.17g %ld %.17g",n,pr,T,stop,bound);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)scalar(gcoeff(x,i,j));for(long i=0;i<=n;i++)printf(" %.17g",v[i]);for(long i=0;i<stride*stride;i++)printf(" %.17g",q[i]);puts("");}avma=av;}pari_close();return 0;}`);
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(line=>{const a=line.split(" "),n=Number(a[0]),offset=5+3*n*n;return {n,p:Number(a[1]),scale:Number(a[2]),stop:Number(a[3]),bound:Number(a[4]),matrix:a.slice(5,offset),v:a.slice(offset,offset+n+1).map(Number),q:a.slice(offset+n+1).map(Number)};});assert.equal(rows.length,180);
assert.deepEqual([...new Set(rows.map(r=>r.stop))].sort(),[2,3,4]);
const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.enumeration_preparation').pari_prepare_enumeration
for ix,r in enumerate(json.load(sys.stdin)):
    n=r['n'];fq=[0.]*(n+1)**2;fv=[0.]*(n+1);bound=[0.]
    got=f(list(map(int,r['matrix'])),n,r['p'],r['scale'],[0]*(3*n*n),[0]*(3*n*n),[0]*(3*n),[0]*(3*n),[0]*(3*n),fq,fv,bound,[0]*3,[0]*64,[0]*64,[0]*64,[0]*64,[0]*128)
    assert got==r['stop'] and bound[0]==r['bound'] and fq==r['q'] and fv==r['v'],(ix,got,bound,r)
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,"enumeration_preparation.py")}),mod=require(built.modulePath);
for(const [ix,r] of rows.entries())for(const backend of ["javascript","gmp"]){const n=r.n,z=k=>Array(k).fill(0n),fq=Array((n+1)**2).fill(0),fv=Array(n+1).fill(0),bound=[0];
 const got=mod.pari_prepare_enumeration[backend](r.matrix.map(BigInt),BigInt(n),BigInt(r.p),r.scale,z(3*n*n),z(3*n*n),z(3*n),z(3*n),z(3*n),fq,fv,bound,z(3),z(64),z(64),z(64),z(64),z(128));
 assert.equal(got,BigInt(r.stop),`${ix} ${backend}`);assert.deepEqual(bound,[r.bound],`${ix} ${backend}`);assert.deepEqual(fq,r.q);assert.deepEqual(fv,r.v);
}
console.log("180 connected QR/bound preparations match PARI/CPython/JS/GMP, including stop degrees 2/3/4 and binary64 coefficients");
})().catch(e=>{console.error(e);process.exitCode=1;});
