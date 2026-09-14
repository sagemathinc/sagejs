"use strict";
const assert=require("node:assert/strict"),path=require("node:path"),fs=require("node:fs"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
  const full=process.argv.includes("--factorgen");
  const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-can-factor-"));
  const source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
  fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
static void number(GEN n){char*s=GENtostr(n);printf(" %s",s);pari_free(s);}
static GEN component(GEN column,long row,long r1){if(row<r1)return gel(column,row+1);GEN v=gel(column,r1+1+(row-r1)/2);if(typ(v)==t_COMPLEX)return gel(v,1+(row-r1)%2);return (row-r1)%2?gen_0:v;}
static void scalar(GEN v){long p=-1,e=0,de;GEN m=v;if(typ(v)==t_REAL){p=bit_prec(v);e=expo(v);m=mantissa_real(v,&de);}number(m);printf(" %ld %ld",p,e);}
int main(void){pari_init(64000000,10000);int full=getenv("SAGEJS_TEST_FACTOGEN")!=NULL;
printf("%lu %lu",GP_DATA->factorlimit,maxprimelim());for(long i=1;i<=pari_PRIMES[0];i++)printf(" %lu",pari_PRIMES[i]);puts("");
GEN products=prodprimes();for(long i=1;i<lg(products);i++){if(i>1)printf(" ");char*s=GENtostr(gel(products,i));printf("%s",s);pari_free(s);}puts("");
const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long f=0;f<4;f++){GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf);
GEN groups=cgetg(102,t_VEC),offsets=cgetg(102,t_VECSMALL),support=gen_1;long total=0,ng=0;
for(long p=1;p<=101;p++){gel(groups,p)=cgetg(1,t_VEC);offsets[p]=-1;if(uisprime(p)){gel(groups,p)=idealprimedec(nf,stoi(p));offsets[p]=total;total+=lg(gel(groups,p))-1;support=mului(p,support);ng++;}}
for(long cut=0;cut<3;cut++)for(long mode=0;mode<3;mode++)for(long step=0;step<6;step++){
if(full&&mode==1)continue;
pari_sp av=avma;long k=step==5?60:step==4?20:step;GEN m=zerocol(n);gel(m,2)=int2n(k);GEN I=idealhnf(nf,idealpows(nf,gel(gel(groups,2),1),k));
GEN N=mode==1?idealnorm(nf,I):nfnorm(nf,m);if(mode==2)N=diviiexact(N,idealnorm(nf,I));
FB_t F={0};F.LV=cgetg(102,t_VEC);F.iLP=offsets;F.prodZ=support;
for(long p=1;p<=101;p++){GEN group=shallowcopy(gel(groups,p));if(cut&&(cut==1||p>2)&&lg(group)>1)setlg(group,lg(group)-1);gel(F.LV,p)=group;}
FACT fact[128];fact[0].pr=1;fact[1].pr=99;fact[1].ex=7;
long ok,error=0;GEN NI=mode==0?gen_0:idealnorm(nf,I);
if(full){GEN norm=embed_norm(RgM_RgC_mul(nf_get_M(nf),m),nf_get_r1(nf));N=grndtoi(mode==0?norm:divri(norm,NI),&error);ok=factorgen(&F,nf,mode==0?NULL:I,mode==0?NULL:NI,m,fact);}
else ok=can_factor(&F,nf,mode==0?NULL:I,mode==1?NULL:m,N,fact);
printf("%ld %ld %ld %ld %ld",n,mode,ng,ok,fact[0].pr);number(N);number(support);
for(long p=2;p<=101;p++)if(offsets[p]>=0){GEN group=gel(groups,p);printf(" %ld %ld %ld %ld",p,offsets[p],lg(gel(F.LV,p))-1,lg(group)-1);
for(long j=1;j<lg(group);j++){GEN P=gel(group,j),tau=pr_get_tau(P);long inert=typ(tau)==t_INT;printf(" %ld %ld %ld",pr_get_e(P),pr_get_f(P),inert);
for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)number(inert?gen_0:gcoeff(tau,row,col));}}
for(long j=1;j<=n;j++)number(gel(m,j));for(long row=1;row<=n;row++)for(long col=1;col<=n;col++)number(gcoeff(I,row,col));
if(full){long r1=nf_get_r1(nf);printf(" %ld",r1);number(NI);printf(" %ld",error);GEN M=nf_get_M(nf);for(long row=0;row<n;row++)for(long col=1;col<=n;col++)scalar(component(gel(M,col),row,r1));}
for(long j=1;j<=fact[0].pr;j++)printf(" %ld %ld",fact[j].pr,fact[j].ex);puts("");avma=av;
}}pari_close();return 0;}`);
  const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
  const env={...process.env};delete env.SAGEJS_TEST_FACTOGEN;if(full)env.SAGEJS_TEST_FACTOGEN="1";
  const run=spawnSync(exe,[],{env,encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr);
  const lines=run.stdout.trim().split("\n").map(l=>l.split(" ")),[factorlimit,primeLimit,...primes]=lines[0],products=lines[1];
  const records=lines.slice(2).map(line=>{
    const r=line.map(BigInt),[n,mode,ng,ok,count,norm,support]=r;let pos=7;
    const offsets=Array(102).fill(-1n),counts=Array(102).fill(0n),tau=[],es=[],fs=[],inert=[];
    for(let i=0;i<Number(ng);i++){
      const p=Number(r[pos++]);offsets[p]=r[pos++];counts[p]=r[pos++];const full=Number(r[pos++]);
      for(let j=0;j<full;j++){es.push(r[pos++]);fs.push(r[pos++]);inert.push(r[pos++]);tau.push(...r.slice(pos,pos+Number(n*n)));pos+=Number(n*n);}
    }
    const m=r.slice(pos,pos+Number(n));pos+=Number(n);const ideal=r.slice(pos,pos+Number(n*n));pos+=Number(n*n);
    let numerical={};if(full){const real=r[pos++],idealNorm=r[pos++],error=r[pos++],matrix=r.slice(pos,pos+3*Number(n*n));pos+=3*Number(n*n);numerical={real,idealNorm,error,matrix};}
    return {n,mode,ok,count,norm,support,offsets,counts,tau,es,fs,inert,m,ideal,...numerical,result:r.slice(pos)};
  });
  const py=spawnSync("python3",["-c",`
import sys,json,decimal,importlib
sys.set_int_max_str_digits(100000)
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
module=importlib.import_module('bench.pari-class-group-port.ideal_admission')
front=module.pari_prepared_factorgen if ${full?"True":"False"} else module.pari_prepared_can_factor
d=json.load(sys.stdin);expected=[]
for r in d['records']:
  r={k:list(map(int,v)) if isinstance(v,list) else int(v) for k,v in r.items()};n=r['n'];indices=[99]*128;exponents=[7]*128
  args=[r['norm'],r['m'],r['ideal'],r['mode'],n,r['support'],list(map(int,d['primes'])),list(map(int,d['products'])),int(d['factorlimit']),int(d['primeLimit']),[0]*16,[0]*16,r['offsets'],r['counts'],r['tau'],r['es'],r['fs'],r['inert'],[0]*(n*n),[0]*n,[0]*n,[0]*n,[0]*32,[0]*(n*n),[0]*(n*n),[0]*n,[0]*n,indices,exponents]
  if 'matrix' in r:
    a=r['matrix'];args=[a[0::3],a[1::3],a[2::3],[0]*n,[0]*n,[0]*n,r['real'],r['idealNorm']]+args[1:]+[1]
  result=front(*args)
  if 'matrix' in r:
    status,norm,error,count,residual=result
    assert (norm,error)==(r['norm'],r['error'])
  else: status,count,residual=result
  if status!=2:
    assert (status,count)==(r['ok'],r['count']),(r['norm'],result,r['ok'],r['count'])
    assert [v for pair in zip(indices[:count],exponents[:count]) for v in pair]==r['result']
  else: assert count==0 and residual==abs(r['norm']) and abs(r['norm']).bit_length()>64
  expected.append([list(map(str,result)),list(map(str,indices[:count])),list(map(str,exponents[:count]))])
print(json.dumps(expected))
`],{input:JSON.stringify({records,primes,products,factorlimit,primeLimit},(_,v)=>typeof v==="bigint"?String(v):v),encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});assert.equal(py.status,0,py.stderr);
  const expected=JSON.parse(py.stdout),built=await compileKernel({sourcePath:path.join(__dirname,"ideal_admission.py")}),mod=require(built.modulePath),totals=[0,0,0];let partial=0,numericalRejected=0;
  for(let i=0;i<records.length;i++){
    const r=records[i],reference=expected[i].map(a=>a.map(BigInt)),n=Number(r.n),countIndex=full?3:1;totals[Number(reference[0][0])]++;
    if(full&&r.error>-32n)numericalRejected++;
    else if(reference[0][0]===0n&&reference[0][countIndex]>0n)partial++;
    for(const backend of ["javascript","gmp","tagged"]){
      const buf=len=>mod.createIntegerBuffer(len,64),indices=Array(128).fill(99n),exponents=Array(128).fill(7n);
      let args=[r.norm,r.m,r.ideal,r.mode,r.n,r.support,primes.map(BigInt),products.map(BigInt),BigInt(factorlimit),BigInt(primeLimit),buf(16),buf(16),r.offsets,r.counts,r.tau,r.es,r.fs,r.inert,buf(n*n),buf(n),buf(n),buf(n),buf(32),buf(n*n),buf(n*n),buf(n),buf(n),indices,exponents];
      if(full)args=[...[0,1,2].map(k=>r.matrix.filter((_,j)=>j%3===k)),buf(n),buf(n),buf(n),r.real,r.idealNorm,...args.slice(1),1n];
      const result=mod[full?"pari_prepared_factorgen":"pari_prepared_can_factor"][backend](...args);
      assert.deepEqual([result,indices.slice(0,Number(result[countIndex])),exponents.slice(0,Number(result[countIndex]))],reference);
    }
  }
  assert(totals.every(x=>x>0)&&partial>0,`${totals}; partial=${partial}`);
  if(full)assert(numericalRejected>0);
  console.log(`${records.length} connected ${full?"factorgen":"can_factor"} controls agree: rejected/success/unresolved=${totals}; ${partial} partial-write rejections; ${numericalRejected} numerical rejections`);
})().catch(error=>{console.error(error);process.exitCode=1;});
