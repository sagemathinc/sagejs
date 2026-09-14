"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-candidate-search-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
const upstream=fs.readFileSync(path.join(pari,"src/basemath/buch2.c"),"utf8"),start=upstream.indexOf("  k = N; fp->y[N] = fp->z[N] = 0; fp->x[N] = 0;"),end=upstream.indexOf("    /* element complete */",start);
assert(start>=0&&end>start);const loop=upstream.slice(start,end);
fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
static long trace(GEN r,GEN ideal,double BOUND,long skipfirst,long initial,long *out,long *status,long *attempts,long *small,long *trials,GEN *element){long N=lg(r)-1,j,k,count=0,try_elt=0,maxtry_ELEMENT=1000000;pari_sp av;double qq[11][11]={{0}},*qp[11],v[11]={0},y[11]={0},z[11]={0};FP_t data,*fp=&data;GEN inc=const_vecsmall(N,1);fp->x=const_vecsmall(N,0);fp->q=qp;fp->v=v;fp->y=y;fp->z=z;
*attempts=initial;*small=0;*element=gclone(const_col(N,stoi(99)));
for(j=0;j<=N;j++)qp[j]=qq[j];for(j=1;j<=N;j++){gisdouble(gcoeff(r,j,j),&v[j]);for(k=j+1;k<=N;k++)gisdouble(gcoeff(r,j,k),&qq[j][k]);}
${loop}
if(zv_content(fp->x)!=1)continue;GEN snapshot=gclone(ZM_zc_mul(ideal,fp->x));gunclone(*element);*element=snapshot;if(ZV_isscalar(*element))continue;
if(++*attempts>500){*status=-3;*trials=try_elt;return count;}++*small;
out[count*(N+1)]=try_elt;for(j=1;j<=N;j++)out[count*(N+1)+j]=fp->x[j];if(++count==32){*status=1;*trials=try_elt;return count;}
}END_Fincke_Pohst_ideal:*status=0;*trials=try_elt;return count;}
static void scalar(GEN x){long e;if(typ(x)==t_INT)pari_printf(" %Ps -1 0",x);else pari_printf(" %Ps %ld %ld",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
int main(void){pari_init(128000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};long primes[]={2,3,7},initials[]={0,499,500};double scales[]={4.,1.e6};
for(long f=0;f<4;f++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),192);long n=nf_get_degree(nf);
for(long k=0;k<3;k++)for(long t=0;t<2;t++)for(long h=0;h<3;h++){GEN I=idealhnf(nf,gel(idealprimedec(nf,stoi(primes[k])),1)),u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),0.99,LLL_IM),ideal=ZM_mul(I,u),x=RgM_mul(nf_get_G(nf),ideal),r=gaussred_from_QR(x,192);double v1,v2,q12;gisdouble(gcoeff(r,1,1),&v1);gisdouble(gcoeff(r,2,2),&v2);gisdouble(gcoeff(r,1,2),&q12);double bound=maxdd(2*(v2+v1*q12*q12),Fincke_Pohst_bound(scales[t],r));long out[352],status,attempts,small,trials,skip=ZV_isscalar(gel(ideal,1));GEN element;long count=trace(r,ideal,bound,skip,initials[h],out,&status,&attempts,&small,&trials,&element);
printf("%ld %.17g %ld %ld %ld %ld %ld %ld %ld",n,scales[t],skip,initials[h],count,status,attempts,small,trials);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)scalar(gcoeff(x,i,j));for(long i=1;i<=n;i++)for(long j=1;j<=n;j++)pari_printf(" %Ps",gcoeff(ideal,i,j));for(long i=1;i<=n;i++)pari_printf(" %Ps",gel(element,i));for(long i=0;i<count*(n+1);i++)printf(" %ld",out[i]);puts("");gunclone(element);}avma=av;}pari_close();return 0;}`);
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(line=>{const a=line.split(" "),n=Number(a[0]),m=9+3*n*n,e=m+n*n;return {n,scale:Number(a[1]),skip:Number(a[2]),initial:a[3],count:Number(a[4]),status:a[5],counters:a.slice(6,8),trials:a[8],matrix:a.slice(9,m),ideal:a.slice(m,e),element:a.slice(e,e+n),records:a.slice(e+n)};});assert.equal(rows.length,72);assert.deepEqual([...new Set(rows.map(r=>Number(r.status)))].sort(),[-3,0,1]);
const py=spawnSync("python3",["-c",`
import sys,json,importlib
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.candidate_search').pari_next_factor_candidate
for r in json.load(sys.stdin):
 n=r['n'];z=lambda k:[0]*k;state=z(5);out=z(n+1);element=[99]*n;counters=[int(r['initial']),0]
 buffers=[z(3*n*n),z(3*n*n),z(3*n),z(3*n),z(3*n),[0.]*(n+1)**2,[0.]*(n+1),[0.],z(3),z(64),z(64),z(64),z(64),z(128),z(n+1),[0.]*(n+1),[0.]*(n+1),z(n+1),state,out,element,counters]
 collected=[];status=1
 while len(collected)//(n+1)<32 and status==1:
  status=f(list(map(int,r['matrix'])),list(map(int,r['ideal'])),n,192,r['scale'],r['skip'],1,*buffers)
  if status==1:collected+=out[:]
 assert collected==list(map(int,r['records'])) and status==int(r['status']) and counters==list(map(int,r['counters'])) and element==list(map(int,r['element'])) and state[1]==int(r['trials']),(r,status,counters,element)
`],{input:JSON.stringify(rows),encoding:"utf8",timeout:30000});assert.equal(py.status,0,py.stderr);
const built=await compileKernel({sourcePath:path.join(__dirname,"candidate_search.py")}),mod=require(built.modulePath);
for(const r of rows)for(const backend of ["javascript","gmp"]){const n=r.n,z=k=>Array(k).fill(0n),state=z(5),out=z(n+1),element=Array(n).fill(99n),counters=[BigInt(r.initial),0n],buffers=[z(3*n*n),z(3*n*n),z(3*n),z(3*n),z(3*n),Array((n+1)**2).fill(0),Array(n+1).fill(0),[0],z(3),z(64),z(64),z(64),z(64),z(128),z(n+1),Array(n+1).fill(0),Array(n+1).fill(0),z(n+1),state,out,element,counters];let collected=[],status=1n,calls=0;
 const invoke=()=>mod.pari_next_factor_candidate[backend](r.matrix.map(BigInt),r.ideal.map(BigInt),BigInt(n),192n,r.scale,BigInt(r.skip),1n,...buffers);
 while(collected.length/(n+1)<32&&status===1n){status=invoke();if(status===1n)collected.push(...out.map(BigInt));if(calls++>0)assert.equal(buffers[4][0],123456789n);buffers[4][0]=123456789n;}
 assert.deepEqual(collected,r.records.map(BigInt));assert.equal(status,BigInt(r.status));assert.deepEqual(counters.map(BigInt),r.counters.map(BigInt));assert.deepEqual(element,r.element.map(BigInt));assert.equal(state[1],BigInt(r.trials));
 if(status!==1n){const before=JSON.stringify(buffers,(_,v)=>typeof v==='bigint'?String(v):v);assert.equal(invoke(),status);assert.equal(JSON.stringify(buffers,(_,v)=>typeof v==='bigint'?String(v):v),before);}
}
console.log(`72 connected QR/cursor/filter searches match PARI/CPython/JS/GMP: ${rows.filter(r=>r.status==='0').length} exhausted, ${rows.filter(r=>r.status==='-3').length} factor limits, ${rows.filter(r=>r.status==='1').length} prefixes; terminal states and QR residency retained`);
})().catch(e=>{console.error(e);process.exitCode=1;});
