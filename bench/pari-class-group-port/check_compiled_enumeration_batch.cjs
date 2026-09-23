"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-enum-batch-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
const upstream=fs.readFileSync(path.join(pari,"src/basemath/buch2.c"),"utf8"),start=upstream.indexOf("  k = N; fp->y[N] = fp->z[N] = 0; fp->x[N] = 0;"),end=upstream.indexOf("    /* element complete */",start);
assert(start>=0&&end>start);const loop=upstream.slice(start,end);assert(loop.includes("maxtry_ELEMENT"));
fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
static long trace(GEN r,double BOUND,long skipfirst,long *out,long *exhausted){long N=lg(r)-1,j,k,count=0,try_elt=0,maxtry_ELEMENT=1000000;pari_sp av;double qq[11][11]={{0}},*qp[11],v[11]={0},y[11]={0},z[11]={0};FP_t data,*fp=&data;GEN inc=const_vecsmall(N,1);fp->x=const_vecsmall(N,0);fp->q=qp;fp->v=v;fp->y=y;fp->z=z;
for(j=0;j<=N;j++)qp[j]=qq[j];for(j=1;j<=N;j++){gisdouble(gcoeff(r,j,j),&v[j]);for(k=j+1;k<=N;k++)gisdouble(gcoeff(r,j,k),&qq[j][k]);}
${loop}
out[count*(N+1)]=try_elt;for(j=1;j<=N;j++)out[count*(N+1)+j]=fp->x[j];if(++count==32){*exhausted=0;return count;}
}END_Fincke_Pohst_ideal:*exhausted=1;return count;}
static void scalar(GEN x){long e;if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(64000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,7};double scales[]={4.,1.e6};
for(long f=0;f<4;f++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),192);long n=nf_get_degree(nf);
for(long k=0;k<3;k++)for(long t=0;t<2;t++){GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[k])),1)),u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),0.99,LLL_IM),ideal=ZM_mul(I,u),x=RgM_mul(nf_get_G(nf),ideal),r=gaussred_from_QR(x,192);double v1,v2,q12;gisdouble(gcoeff(r,1,1),&v1);gisdouble(gcoeff(r,2,2),&v2);gisdouble(gcoeff(r,1,2),&q12);double bound=maxdd(2*(v2+v1*q12*q12),Fincke_Pohst_bound(scales[t],r));long out[352],exhausted,skip=ZV_isscalar(gel(ideal,1)),count=trace(r,bound,skip,out,&exhausted);
printf("%ld %.17g %ld %ld %ld",n,scales[t],skip,count,exhausted);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)scalar(gcoeff(x,i,j));for(long i=0;i<count*(n+1);i++)printf(" %ld",out[i]);puts("");}avma=av;}pari_close();return 0;}`);
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(line=>{const a=line.split(" "),n=Number(a[0]),offset=5+3*n*n;return {n,scale:Number(a[1]),skip:Number(a[2]),count:Number(a[3]),exhausted:Number(a[4]),matrix:a.slice(5,offset),records:a.slice(offset)};});assert.equal(rows.length,24);
assert.equal(rows.filter(r=>r.exhausted).length,3);
const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.enumeration_batch').pari_qr_enumeration_batch
for r in json.load(sys.stdin):
 for chunk in (1,7,32):
    n=r['n'];z=lambda k:[0]*k;state=z(5);buffers=[z(3*n*n),z(3*n*n),z(3*n),z(3*n),z(3*n),[0.]*(n+1)**2,[0.]*(n+1),[0.],z(3),z(64),z(64),z(64),z(64),z(128),z(n+1),[0.]*(n+1),[0.]*(n+1),z(n+1),state];collected=[];status=0
    while len(collected)//(n+1)<32 and status==0:
        take=min(chunk,32-len(collected)//(n+1));out=z(take*(n+1))
        count,status=f(list(map(int,r['matrix'])),n,192,r['scale'],r['skip'],take,*buffers,out)
        collected+=out[:count*(n+1)]
    assert collected==list(map(int,r['records'])) and status==r['exhausted'],(r,chunk,collected,status)
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,"enumeration_batch.py")}),mod=require(built.modulePath);
for(const r of rows)for(const chunk of [1,7,32])for(const backend of ["javascript","gmp"]){const n=r.n,z=k=>Array(k).fill(0n),state=z(5),buffers=[z(3*n*n),z(3*n*n),z(3*n),z(3*n),z(3*n),Array((n+1)**2).fill(0),Array(n+1).fill(0),[0],z(3),z(64),z(64),z(64),z(64),z(128),z(n+1),Array(n+1).fill(0),Array(n+1).fill(0),z(n+1),state];let collected=[],status=0n,calls=0;
 while(collected.length/(n+1)<32&&status===0n){const take=Math.min(chunk,32-collected.length/(n+1)),out=z(take*(n+1));const got=mod.pari_qr_enumeration_batch[backend](r.matrix.map(BigInt),BigInt(n),192n,r.scale,BigInt(r.skip),BigInt(take),...buffers,out);collected.push(...out.slice(0,Number(got[0])*(n+1)).map(BigInt));status=got[1];if(calls++>0)assert.equal(buffers[4][0],123456789n);buffers[4][0]=123456789n;}
 assert.deepEqual(collected,r.records.map(BigInt));assert.equal(status,BigInt(r.exhausted));
}
console.log(`24 connected candidate prefixes, ${rows.filter(r=>r.exhausted).length} exhaustions, three batch sizes, match PARI/CPython/JS/GMP; QR scratch remains untouched on resume`);
})().catch(e=>{console.error(e);process.exitCode=1;});
