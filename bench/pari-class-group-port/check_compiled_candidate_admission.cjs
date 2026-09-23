"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-candidate-admission-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
const upstream=fs.readFileSync(path.join(pari,"src/basemath/buch2.c"),"utf8"),start=upstream.indexOf("  k = N; fp->y[N] = fp->z[N] = 0; fp->x[N] = 0;"),end=upstream.indexOf("    /* element complete */",start);
assert(start>=0&&end>start);const loop=upstream.slice(start,end);
fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
static void integer(GEN x){pari_printf("\\\"%Ps\\\"",x);}
static void triple(GEN x){long e;if(typ(x)==t_INT){integer(x);printf(",\\\"-1\\\",\\\"0\\\"");}else{integer(signe(x)?mantissa_real(x,&e):gen_0);printf(",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?bit_prec(x):0,expo(x));}}
static void matrix(const char *name,GEN x,int triples){long n=lg(x)-1;printf("\\\"%s\\\":[",name);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){if(i!=1||j!=1)printf(",");if(triples)triple(gcoeff(x,i,j));else integer(gcoeff(x,i,j));}printf("],");}
static GEN component(GEN column,long row,long r1){if(row<r1)return gel(column,row+1);GEN v=gel(column,r1+1+(row-r1)/2);if(typ(v)==t_COMPLEX)return gel(v,1+(row-r1)%2);return (row-r1)%2?gen_0:v;}
static void trace(FB_t *F,GEN nf,GEN I,GEN ideal,GEN r,double BOUND,long skipfirst){long N=lg(r)-1,j,k,count=0,try_elt=0,maxtry_ELEMENT=1000000,attempts=0,first=1;pari_sp av;double qq[11][11]={{0}},*qp[11],v[11]={0},y[11]={0},z[11]={0};FP_t data,*fp=&data;GEN inc=const_vecsmall(N,1),NI=idealnorm(nf,I);FACT fact[128];fact[0].pr=0;fp->x=const_vecsmall(N,0);fp->q=qp;fp->v=v;fp->y=y;fp->z=z;
for(j=0;j<=N;j++)qp[j]=qq[j];for(j=1;j<=N;j++){gisdouble(gcoeff(r,j,j),&v[j]);for(k=j+1;k<=N;k++)gisdouble(gcoeff(r,j,k),&qq[j][k]);}printf("\\\"trace\\\":[");
${loop}
if(zv_content(fp->x)!=1)continue;GEN gx=ZM_zc_mul(ideal,fp->x);if(ZV_isscalar(gx))continue;if(++attempts>500){printf("],\\\"status\\\":-3,\\\"trials\\\":%ld,\\\"attempts\\\":%ld}",try_elt,attempts);return;}
long error;GEN norm=grndtoi(divri(embed_norm(RgM_RgC_mul(nf_get_M(nf),gx),nf_get_r1(nf)),NI),&error);long ok=factorgen(F,nf,I,NI,gx,fact);
if(!first)printf(",");first=0;printf("[%ld,%ld,%ld,",try_elt,attempts,ok);integer(norm);printf(",%ld,%ld",error,fact[0].pr);for(j=1;j<=N;j++)printf(",%ld",fp->x[j]);for(j=1;j<=N;j++){printf(",");integer(gel(gx,j));}for(j=1;j<=fact[0].pr;j++)printf(",%ld,%ld",fact[j].pr,fact[j].ex);printf("]");
if(ok&&++count==8){printf("],\\\"status\\\":1,\\\"trials\\\":%ld,\\\"attempts\\\":%ld}",try_elt,attempts);return;}
}END_Fincke_Pohst_ideal:printf("],\\\"status\\\":0,\\\"trials\\\":%ld,\\\"attempts\\\":%ld}",try_elt,attempts);}
int main(void){pari_init(128000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
for(long f=0;f<4;f++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf),r1=nf_get_r1(nf),total=0;GEN groups=cgetg(102,t_VEC),offsets=cgetg(102,t_VECSMALL),support=gen_1;for(long p=1;p<=101;p++){gel(groups,p)=cgetg(1,t_VEC);offsets[p]=-1;if(uisprime(p)){gel(groups,p)=idealprimedec(nf,stoi(p));offsets[p]=total;total+=lg(gel(groups,p))-1;support=mului(p,support);}}
FB_t F={0};F.LV=groups;F.iLP=offsets;F.prodZ=support;GEN I=idealhnf(nf,gel(gel(groups,2),1)),u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),.99,LLL_IM),ideal=ZM_mul(I,u),G=RgM_mul(nf_get_G(nf),ideal),r=gaussred_from_QR(G,nbits2prec(192));long skip=ZV_isscalar(gel(ideal,1));double v1,v2,q12;gisdouble(gcoeff(r,1,1),&v1);gisdouble(gcoeff(r,2,2),&v2);gisdouble(gcoeff(r,1,2),&q12);double bound=maxdd(2*(v2+v1*q12*q12),Fincke_Pohst_bound(4.,r));
printf("{\\\"n\\\":%ld,\\\"real\\\":%ld,\\\"skip\\\":%ld,\\\"normI\\\":",n,r1,skip);integer(idealnorm(nf,I));printf(",\\\"support\\\":");integer(support);printf(",\\\"factorlimit\\\":%lu,\\\"primeLimit\\\":%lu,",GP_DATA->factorlimit,maxprimelim());matrix("matrix",G,1);matrix("ideal",ideal,0);matrix("I",I,0);
printf("\\\"M\\\":[");GEN M=nf_get_M(nf);for(long i=0;i<n;i++)for(long j=1;j<=n;j++){if(i||j!=1)printf(",");triple(component(gel(M,j),i,r1));}printf("],\\\"groups\\\":[");long first=1;for(long p=2;p<=101;p++)if(offsets[p]>=0){if(!first)printf(",");first=0;GEN group=gel(groups,p);printf("[%ld,%ld,%ld",p,offsets[p],lg(group)-1);for(long j=1;j<lg(group);j++){GEN P=gel(group,j),tau=pr_get_tau(P);long inert=typ(tau)==t_INT;printf(",%ld,%ld,%ld",pr_get_e(P),pr_get_f(P),inert);for(long row=1;row<=n;row++)for(long col=1;col<=n;col++){printf(",");integer(inert?gen_0:gcoeff(tau,row,col));}}printf("]");}printf("],\\\"primes\\\":[");for(long i=1;i<=pari_PRIMES[0];i++){if(i>1)printf(",");printf("%lu",pari_PRIMES[i]);}printf("],\\\"products\\\":[");GEN products=prodprimes();for(long i=1;i<lg(products);i++){if(i>1)printf(",");integer(gel(products,i));}printf("],");trace(&F,nf,I,ideal,r,bound,skip);puts("");avma=av;}pari_close();return 0;}`);
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(JSON.parse);assert.equal(rows.length,4);
const built=await compileKernel({sourcePath:path.join(__dirname,"candidate_admission.py")}),mod=require(built.modulePath);
const names=fs.readFileSync(path.join(__dirname,"candidate_admission.py"),"utf8").match(/def pari_next_smooth_candidate\(([\s\S]*?)\n\)/)[1].trim().split("\n").map(s=>s.trim().replace(/,$/,"").split(": "));
function inputs(r){const n=r.n,z=k=>Array(k).fill(0n),offsets=Array(102).fill(-1n),counts=z(102),tau=[],es=[],fs=[],inert=[];
 for(const group of r.groups){const [prime,offset,count]=group;offsets[prime]=BigInt(offset);counts[prime]=BigInt(count);let pos=3;for(let j=0;j<count;j++){es.push(BigInt(group[pos++]));fs.push(BigInt(group[pos++]));inert.push(BigInt(group[pos++]));tau.push(...group.slice(pos,pos+n*n).map(BigInt));pos+=n*n;}}
 const values={matrix:r.matrix.map(BigInt),ideal:r.ideal.map(BigInt),n:BigInt(n),precision:192n,scale:4,skipfirst:BigInt(r.skip),track_small:1n,reduction:z(3*n*n),vectors:z(3*n*n),betas:z(3*n),norms:z(3*n),column:z(3*n),float_q:Array((n+1)**2).fill(0),float_v:Array(n+1).fill(0),bound:[0],cache:z(3),a:z(64),b:z(64),p:z(64),q:z(64),stack:z(128),x:z(n+1),y:Array(n+1).fill(0),z:Array(n+1).fill(0),inc:z(n+1),state:z(5),cursor_output:z(n+1),element:z(n),counters:z(4),admission_matrix_m:r.M.filter((_,i)=>i%3===0).map(BigInt),admission_matrix_p:r.M.filter((_,i)=>i%3===1).map(BigInt),admission_matrix_e:r.M.filter((_,i)=>i%3===2).map(BigInt),admission_embedding_m:z(n),admission_embedding_p:z(n),admission_embedding_e:z(n),admission_real_count:BigInt(r.real),admission_ideal_norm:BigInt(r.normI),admission_ideal:r.I.map(BigInt),admission_mode:2n,admission_factor_product:BigInt(r.support),admission_primes:r.primes.map(BigInt),admission_products:r.products.map(BigInt),admission_factorlimit:BigInt(r.factorlimit),admission_prime_limit:BigInt(r.primeLimit),admission_rational_factors:z(16),admission_rational_exponents:z(16),admission_prime_offsets:offsets,admission_prime_counts:counts,admission_group_tau:tau,admission_group_e:es,admission_group_f:fs,admission_group_inert:inert,admission_tau:z(n*n),admission_x:z(n),admission_y:z(n),admission_spare:z(n),admission_stack:z(32),admission_primitive:z(n*n),admission_columns:z(n*n),admission_values:z(n),admission_temporary:z(n),admission_indices:z(128),admission_exponents:z(128),diagnostic:z(3)};
 assert.deepEqual(Object.keys(values).sort(),names.map(x=>x[0]).sort());return values;
}
const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
const py=spawnSync("python3",["-c",`
import sys,json,decimal,importlib
sys.set_int_max_str_digits(100000)
sys.path[:0]=[${JSON.stringify(path.resolve(__dirname,"../.."))},${JSON.stringify(path.resolve(__dirname,"../../src/lib"))}]
f=importlib.import_module('bench.pari-class-group-port.candidate_admission').pari_next_smooth_candidate
payload=json.load(sys.stdin);expected=[]
for r,v in zip(payload['rows'],payload['inputs']):
 for name,kind in payload['names']:
  conv=float if kind in ('float','Float64Buffer') else int
  v[name]=list(map(conv,v[name])) if isinstance(v[name],list) else conv(v[name])
 observed=[];position=0
 for call in range(9):
  status=f(*(v[name] for name,kind in payload['names']))
  snapshot=[status,v['state'][1],*v['counters'],*v['diagnostic'],*v['element'],*v['admission_indices'][:v['counters'][2]],*v['admission_exponents'][:v['counters'][2]]]
  observed.append(list(map(str,snapshot)))
  if status in (1,2):
   while position<len(r['trace']) and r['trace'][position][1]<v['counters'][0]:
    assert r['trace'][position][2]==0,('skipped smooth candidate',r['trace'][position])
    position+=1
   assert position<len(r['trace']),(r['n'],status,v['counters'])
   t=r['trace'][position];n=r['n'];assert v['state'][1]==t[0] and v['counters'][1]==t[1]
   assert v['diagnostic'][:2]==[int(t[3]),t[4]],(r['n'],status,v['diagnostic'],t)
   assert v['x'][1:]==t[6:6+n] and v['element']==list(map(int,t[6+n:6+2*n]))
   if status==2:
    before=json.dumps(v);assert f(*(v[name] for name,kind in payload['names']))==2 and json.dumps(v)==before
    break
   assert t[2]==1 and v['counters'][2]==t[5]
   assert [item for pair in zip(v['admission_indices'][:t[5]],v['admission_exponents'][:t[5]]) for item in pair]==t[6+2*n:]
   position+=1
   if sum(t[2] for t in r['trace'][:position])==8:break
  else:
   assert status==r['status'] and v['state'][1]==r['trials'] and v['counters'][0]==r['attempts'],(r['n'],status,v['counters'],r['status'])
   assert not any(t[2] for t in r['trace'][position:]),'lost smooth candidates before termination'
   if r['trace']:
    last=r['trace'][-1];assert v['diagnostic'][:2]==[int(last[3]),last[4]] and v['counters'][2]==last[5]
    assert [item for pair in zip(v['admission_indices'][:last[5]],v['admission_exponents'][:last[5]]) for item in pair]==last[6+2*r['n']:]
   break
 expected.append(observed)
print(json.dumps(expected))
`],{input:stringify({rows,names,inputs:rows.map(inputs)}),encoding:"utf8",timeout:60000,maxBuffer:4*1024*1024});assert.equal(py.status,0,py.stderr);
const expected=JSON.parse(py.stdout);
for(let i=0;i<rows.length;i++)for(const backend of ['javascript','gmp']){const v=inputs(rows[i]);for(const wanted of expected[i]){
 const status=mod.pari_next_smooth_candidate[backend](...names.map(([name])=>v[name]));const count=Number(v.counters[2]);
 const got=[status,v.state[1],...v.counters,...v.diagnostic,...v.element,...v.admission_indices.slice(0,count),...v.admission_exponents.slice(0,count)].map(String);assert.deepEqual(got,wanted);
 if(status!==1n){const before=stringify(v);assert.equal(mod.pari_next_smooth_candidate[backend](...names.map(([name])=>v[name])),status);assert.equal(stringify(v),before);}
}}
const successes=expected.flat().filter(r=>r[0]==='1').length,unresolved=expected.filter(r=>r.at(-1)[0]==='2').length;
assert(successes>0);if(unresolved===0)assert.equal(successes,rows.reduce((sum,r)=>sum+r.trace.filter(t=>t[2]===1).length,0));
for(const backend of ['javascript','gmp']){const v=inputs(rows[0]);v.counters[3]=1n;const before=stringify(v);assert.equal(mod.pari_next_smooth_candidate[backend](...names.map(([name])=>v[name])),2n);assert.equal(stringify(v),before);}
console.log(`4 connected candidate/admission searches match PARI/CPython/JS/GMP: ${successes} smooth candidates from ${rows.reduce((sum,r)=>sum+r.trace.length,0)} factor attempts; ${unresolved} explicitly unresolved searches; terminal-state guards pass`);
})().catch(e=>{console.error(e);process.exitCode=1;});
