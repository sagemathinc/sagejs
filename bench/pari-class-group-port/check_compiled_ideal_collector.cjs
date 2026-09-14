"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {createHash}=require('node:crypto');
const {spawnSync}=require("node:child_process"),{compileKernel}=require("../../tools/native-kernel/compiler.cjs");
(async()=>{
const initialized=process.argv.includes('--initialized-cache');
const packetPrime=Number((process.argv.find(x=>x.startsWith('--packet-prime='))||'--packet-prime=2').split('=')[1]);
assert([2,3].includes(packetPrime),'supported packet primes are 2 and 3');
assert(packetPrime===2||process.argv.includes('--export-fixtures'),'nondefault packet prime is export-only');
assert(!(initialized&&process.argv.includes('--export-fixtures')),'initialized cache export needs a separate schema');
const pari=path.resolve(process.argv[2]),lib=path.join(pari,"Olinux-x86_64"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-ideal-collector-")),source=path.join(dir,"oracle.c"),exe=path.join(dir,"oracle");
const upstream=fs.readFileSync(path.join(pari,"src/basemath/buch2.c"),"utf8"),start=upstream.indexOf("  k = N; fp->y[N] = fp->z[N] = 0; fp->x[N] = 0;"),end=upstream.indexOf("    /* element complete */",start);
assert(start>=0&&end>start);const loop=upstream.slice(start,end);
fs.writeFileSync(source,`#include "${path.join(pari,"src/basemath/buch2.c")}"
static void integer(GEN x){pari_printf("\\\"%Ps\\\"",x);}
static void triple(GEN x){long e;if(typ(x)==t_INT){integer(x);printf(",\\\"-1\\\",\\\"0\\\"");}else{integer(signe(x)?mantissa_real(x,&e):gen_0);printf(",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?bit_prec(x):0,expo(x));}}
static void matrix(const char *name,GEN x,int triples){long n=lg(x)-1;printf("\\\"%s\\\":[",name);for(long i=1;i<=n;i++)for(long j=1;j<=n;j++){if(i!=1||j!=1)printf(",");if(triples)triple(gcoeff(x,i,j));else integer(gcoeff(x,i,j));}printf("],");}
static GEN component(GEN column,long row,long r1){if(row<r1)return gel(column,row+1);GEN v=gel(column,r1+1+(row-r1)/2);if(typ(v)==t_COMPLEX)return gel(v,1+(row-r1)%2);return (row-r1)%2?gen_0:v;}
static void finish(RELCACHE_t *C,long degree,long status,long trials,long attempts,long relid,long nfact,long fact_count){long last=C->last-C->base,n=lg(C->basis)-1;
printf("],%cstatus%c:%ld,%ctrials%c:%ld,%cattempts%c:%ld,%crelid%c:%ld,%cnfact%c:%ld,%cfact_count%c:%ld,%clast%c:%ld,%cmissing%c:%lu,%csup%c:%ld,",34,34,status,34,34,trials,34,34,attempts,34,34,relid,34,34,nfact,34,34,fact_count,34,34,last,34,34,C->missing,34,34,C->relsup);
printf("%cbasis%c:[",34,34);for(long j=1;j<=n;j++)for(long i=1;i<=n;i++)printf("%s%lu",j==1&&i==1?"":",",uel(gel(C->basis,j),i));printf("],%chashes%c:[",34,34);for(long j=1;j<=last;j++)printf("%s%ld",j==1?"":",",C->base[j].nz);
printf("],%crecords%c:[",34,34);for(long j=1;j<=last;j++)for(long i=1;i<=n;i++)printf("%s%ld",j==1&&i==1?"":",",C->base[j].R[i]);
printf("],%cgenerators%c:[",34,34);for(long j=1;j<=last;j++)for(long i=1;i<=degree;i++){if(j!=1||i!=1)printf(",");integer(gel(C->base[j].m,i));}printf("]}");delete_cache(C);}
static void trace(FB_t *F,GEN nf,GEN I,GEN ideal,GEN r,double BOUND,long skipfirst,long nrelid,long target){long N=lg(r)-1,j,k,count=0,try_elt=0,maxtry_ELEMENT=1000000,attempts=0,first=1,smooth_count=0;pari_sp av;double qq[11][11]={{0}},*qp[11],v[11]={0},y[11]={0},z[11]={0};FP_t data,*fp=&data;GEN inc=const_vecsmall(N,1),NI=idealnorm(nf,I);FACT fact[128];fact[0].pr=0;RELCACHE_t C={0};C.basis=zero_Flm_copy(F->KC,F->KC);C.missing=F->KC;C.relsup=2;reallocate(&C,10*(F->KC+2)+50);C.last=C.base;C.end=C.base+target;fp->x=const_vecsmall(N,0);fp->q=qp;fp->v=v;fp->y=y;fp->z=z;
for(j=0;j<=N;j++)qp[j]=qq[j];for(j=1;j<=N;j++){gisdouble(gcoeff(r,j,j),&v[j]);for(k=j+1;k<=N;k++)gisdouble(gcoeff(r,j,k),&qq[j][k]);}printf("\\\"trace\\\":[");
${loop}
if(zv_content(fp->x)!=1)continue;GEN gx=ZM_zc_mul(ideal,fp->x);if(ZV_isscalar(gx))continue;if(++attempts>500){finish(&C,N,-3,try_elt,attempts,count,smooth_count,fact[0].pr);return;}
long error;GEN norm=grndtoi(divri(embed_norm(RgM_RgC_mul(nf_get_M(nf),gx),nf_get_r1(nf)),NI),&error);long ok=factorgen(F,nf,I,NI,gx,fact);
if(!first)printf(",");first=0;printf("[%ld,%ld,%ld,",try_elt,attempts,ok);integer(norm);printf(",%ld,%ld",error,fact[0].pr);for(j=1;j<=N;j++)printf(",%ld",fp->x[j]);for(j=1;j<=N;j++){printf(",");integer(gel(gx,j));}for(j=1;j<=fact[0].pr;j++)printf(",%ld,%ld",fact[j].pr,fact[j].ex);printf("]");
if(ok){if(!nrelid){finish(&C,N,1,try_elt,attempts,count,smooth_count,fact[0].pr);return;}add_to_fact(F->iLP[2]+1,1,fact);long nz;GEN R=set_fact(F,fact,NULL,&nz),cgx=Z_content(gx);if(cgx){gx=Q_div_to_int(gx,cgx);for(long i=1;i<=fact[0].pr;i++)fact_update(R,F,fact[i].pr,cgx);}smooth_count++;long accepted=add_rel_i(&C,R,nz,gx,0,0,NULL,0);if(accepted>0){if(C.last>=C.end){finish(&C,N,1,try_elt,attempts,count,smooth_count,fact[0].pr);return;}if(++count==nrelid){finish(&C,N,0,try_elt,attempts,count,smooth_count,fact[0].pr);return;}}}
}END_Fincke_Pohst_ideal:finish(&C,N,0,try_elt,attempts,count,smooth_count,fact[0].pr);}
int main(void){pari_init(128000000,10000);const char *polys[]={"x^3-20018*x+20034","x^3-20010*x+20018","x^4-20018*x-20034","x^4-2000022*x-2000042"};
long quotas[]={0,1,8,8},targets[]={100,100,2,100};for(long f=0;f<4;f++)for(long scenario=0;scenario<4;scenario++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[f]),nbits2prec(192));long n=nf_get_degree(nf),r1=nf_get_r1(nf),total=0;GEN groups=cgetg(102,t_VEC),offsets=cgetg(102,t_VECSMALL),support=gen_1;for(long p=1;p<=101;p++){gel(groups,p)=cgetg(1,t_VEC);offsets[p]=-1;if(uisprime(p)){gel(groups,p)=idealprimedec(nf,stoi(p));offsets[p]=total;total+=lg(gel(groups,p))-1;support=mului(p,support);}}
FB_t F={0};F.LV=groups;F.iLP=offsets;F.prodZ=support;F.KC=total;F.LP=cgetg(total+1,t_VEC);long next=1;for(long pp=2;pp<=101;pp++)for(long ii=1;ii<lg(gel(groups,pp));ii++)gel(F.LP,next++)=gel(gel(groups,pp),ii);GEN I=idealhnf(nf,gel(gel(groups,2),1)),u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),.99,LLL_IM),ideal=ZM_mul(I,u),G=RgM_mul(nf_get_G(nf),ideal),r=gaussred_from_QR(G,nbits2prec(192));long skip=ZV_isscalar(gel(ideal,1));double v1,v2,q12;gisdouble(gcoeff(r,1,1),&v1);gisdouble(gcoeff(r,2,2),&v2);gisdouble(gcoeff(r,1,2),&q12);double bound=maxdd(2*(v2+v1*q12*q12),Fincke_Pohst_bound(4.,r));
printf("{\\\"n\\\":%ld,\\\"real\\\":%ld,\\\"skip\\\":%ld,\\\"normI\\\":",n,r1,skip);integer(idealnorm(nf,I));printf(",\\\"support\\\":");integer(support);printf(",\\\"factorlimit\\\":%lu,\\\"primeLimit\\\":%lu,",GP_DATA->factorlimit,maxprimelim());printf("%cnrelid%c:%ld,%ctarget%c:%ld,",34,34,quotas[scenario],34,34,targets[scenario]);matrix("matrix",G,1);matrix("ideal",ideal,0);matrix("I",I,0);
printf("\\\"M\\\":[");GEN M=nf_get_M(nf);for(long i=0;i<n;i++)for(long j=1;j<=n;j++){if(i||j!=1)printf(",");triple(component(gel(M,j),i,r1));}printf("],\\\"groups\\\":[");long first=1;for(long p=2;p<=101;p++)if(offsets[p]>=0){if(!first)printf(",");first=0;GEN group=gel(groups,p);printf("[%ld,%ld,%ld",p,offsets[p],lg(group)-1);for(long j=1;j<lg(group);j++){GEN P=gel(group,j),tau=pr_get_tau(P);long inert=typ(tau)==t_INT;printf(",%ld,%ld,%ld",pr_get_e(P),pr_get_f(P),inert);for(long row=1;row<=n;row++)for(long col=1;col<=n;col++){printf(",");integer(inert?gen_0:gcoeff(tau,row,col));}}printf("]");}printf("],\\\"primes\\\":[");for(long i=1;i<=pari_PRIMES[0];i++){if(i>1)printf(",");printf("%lu",pari_PRIMES[i]);}printf("],\\\"products\\\":[");GEN products=prodprimes();for(long i=1;i<lg(products);i++){if(i>1)printf(",");integer(gel(products,i));}printf("],");trace(&F,nf,I,ideal,r,bound,skip,quotas[scenario],targets[scenario]);puts("");avma=av;}pari_close();return 0;}`);
if(packetPrime!==2){
 let code=fs.readFileSync(source,'utf8');
 for(const [a,b] of [['gel(gel(groups,2),1)',`gel(gel(groups,${packetPrime}),1)`],['F->iLP[2]+1',`F->iLP[${packetPrime}]+1`]]){assert.equal(code.split(a).length,2);code=code.replace(a,b);}
 fs.writeFileSync(source,code);
}
if(initialized){
 let code=fs.readFileSync(source,'utf8');
 const replace=(a,b)=>{assert.equal(code.split(a).length,2);code=code.replace(a,b);};
 replace('C.end=C.base+target;fp->x=',`C.end=C.base+target;
 for(long prime=2;prime<lg(F->LV);prime++)if(F->iLP[prime]>=0){
  GEN group=gel(F->LV,prime),initial=zero_zv(F->KC);long offset=F->iLP[prime];
  for(long j=1;j<lg(group);j++)initial[offset+j]=pr_get_e(gel(group,j));
  (void)add_rel_i(&C,initial,offset+1,stoi(prime),0,0,NULL,0);
 }
 fp->x=`);
 replace('integer(gel(C->base[j].m,i));','integer(typ(C->base[j].m)==t_INT?(i==1?C->base[j].m:gen_0):gel(C->base[j].m,i));');
 fs.writeFileSync(source,code);
}
const cc=spawnSync("cc",["-O2","-I"+path.join(pari,"src/headers"),"-I"+lib,source,"-L"+lib,"-Wl,-rpath,"+lib,"-lpari","-lm","-o",exe],{encoding:"utf8",timeout:30000});assert.equal(cc.status,0,cc.stderr);
const run=spawnSync(exe,[],{encoding:"utf8",timeout:30000,maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr);
const rows=run.stdout.trim().split("\n").map(JSON.parse);assert.equal(rows.length,16);
const names=fs.readFileSync(path.join(__dirname,"ideal_collector.py"),"utf8").match(/def pari_collect_ideal_relations\(([\s\S]*?)\n\)/)[1].trim().split("\n").map(s=>s.trim().replace(/,$/,"").split(": "));
function inputs(r){const n=r.n,z=k=>Array(k).fill(0n),offsets=Array(102).fill(-1n),counts=z(102),tau=[],es=[],fs=[],inert=[];
 for(const group of r.groups){const [prime,offset,count]=group;offsets[prime]=BigInt(offset);counts[prime]=BigInt(count);let pos=3;for(let j=0;j<count;j++){es.push(BigInt(group[pos++]));fs.push(BigInt(group[pos++]));inert.push(BigInt(group[pos++]));tau.push(...group.slice(pos,pos+n*n).map(BigInt));pos+=n*n;}}
 const values={matrix:r.matrix.map(BigInt),ideal:r.ideal.map(BigInt),n:BigInt(n),precision:192n,scale:4,skipfirst:BigInt(r.skip),track_small:1n,reduction:z(3*n*n),vectors:z(3*n*n),betas:z(3*n),norms:z(3*n),column:z(3*n),float_q:Array((n+1)**2).fill(0),float_v:Array(n+1).fill(0),bound:[0],cache:z(3),a:z(64),b:z(64),p:z(64),q:z(64),stack:z(128),x:z(n+1),y:Array(n+1).fill(0),z:Array(n+1).fill(0),inc:z(n+1),state:z(5),cursor_output:z(n+1),element:z(n),counters:z(4),admission_matrix_m:r.M.filter((_,i)=>i%3===0).map(BigInt),admission_matrix_p:r.M.filter((_,i)=>i%3===1).map(BigInt),admission_matrix_e:r.M.filter((_,i)=>i%3===2).map(BigInt),admission_embedding_m:z(n),admission_embedding_p:z(n),admission_embedding_e:z(n),admission_real_count:BigInt(r.real),admission_ideal_norm:BigInt(r.normI),admission_ideal:r.I.map(BigInt),admission_mode:2n,admission_factor_product:BigInt(r.support),admission_primes:r.primes.map(BigInt),admission_products:r.products.map(BigInt),admission_factorlimit:BigInt(r.factorlimit),admission_prime_limit:BigInt(r.primeLimit),admission_rational_factors:z(16),admission_rational_exponents:z(16),admission_prime_offsets:offsets,admission_prime_counts:counts,admission_group_tau:tau,admission_group_e:es,admission_group_f:fs,admission_group_inert:inert,admission_tau:z(n*n),admission_x:z(n),admission_y:z(n),admission_spare:z(n),admission_stack:z(32),admission_primitive:z(n*n),admission_columns:z(n*n),admission_values:z(n),admission_temporary:z(n),admission_indices:z(128),admission_exponents:z(128),diagnostic:z(3)};
 const size=es.length,capacity=10*(size+2)+50;
 Object.assign(values,{nrelid:BigInt(r.nrelid),track_fact:1n,jid:offsets[2]+1n,jid0:0n,e0:0n,subfactor:[],extra:[],extra_count:-1n,relation_primes:r.groups.flatMap(g=>Array(g[2]).fill(BigInt(g[0]))),ramification:es.slice(),relation:z(size),relation_state:[0n,BigInt(capacity),BigInt(size),2n,0n,BigInt(r.target)],relation_basis:z(size*size),relation_records:z(capacity*size),relation_hashes:z(capacity),relation_metadata:z(capacity*3),relation_scratch:z(size),generators:z(capacity*n),progress:z(4)});
 values.jid=offsets[packetPrime]+1n;
 assert.deepEqual(Object.keys(values).sort(),names.map(x=>x[0]).sort());return values;
}
const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v);
// Export the prepared boundary without compiling or executing the translation.
// Expected collector outputs are separate: consumers must not feed them into
// the timed computation. This oracle is diagnostic, not a timing comparator.
if(process.argv.includes('--export-fixtures')){
 process.stdout.write(stringify({schema:'pari-prepared-ideal-collector-v1',
  provenance:{packetPrime,buch2Sha256:createHash('sha256').update(upstream).digest('hex'),
   boundary:'Prepared reduced ideal, G*ideal, embeddings and factor-base data; empty cache; no automorphism images',
   diagnosticOnly:true},names,
  cases:rows.map((r,index)=>({index,input:inputs(r),expected:{
   status:r.status,trials:r.trials,attempts:r.attempts,relid:r.relid,
   nfact:r.nfact,fact_count:r.fact_count,last:r.last,missing:r.missing,
   sup:r.sup,basis:r.basis,hashes:r.hashes,records:r.records,generators:r.generators
  }}))})+'\n');
 return;
}
const built=await compileKernel({sourcePath:path.join(__dirname,"ideal_collector.py")}),mod=require(built.modulePath);
const initializer=initialized?require((await compileKernel({sourcePath:path.join(__dirname,'relation_insertion.py')})).modulePath):null;
const py=spawnSync('python3',['-c',`
import sys,json,decimal,importlib
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.ideal_collector').pari_collect_ideal_relations
initialize=importlib.import_module('bench.pari-class-group-port.relation_insertion').pari_initialize_owned_relations
payload=json.load(sys.stdin)
for r,v in zip(payload['rows'],payload['inputs']):
 for name,kind in payload['names']:
  conv=float if kind in ('float','Float64Buffer') else int
  v[name]=list(map(conv,v[name])) if isinstance(v[name],list) else conv(v[name])
 if payload['initialized']:
  initialize(2,[g[0] for g in r['groups']],[g[1] for g in r['groups']],[g[2] for g in r['groups']],[1]*len(r['groups']),v['ramification'],v['relation_state'],v['relation_basis'],v['relation_records'],v['relation_hashes'],v['relation_metadata'],v['relation'],v['relation_scratch'],r['n'],v['generators'])
  v['relation_state'][5]=r['target']
 status=f(*(v[name] for name,kind in payload['names']))
 last=r['last'];size=len(v['relation']);capacity=10*(size+2)+50;n=r['n']
 assert status==r['status'],(r['n'],r['nrelid'],r['target'],status,r['status'])
 assert v['counters']==[r['attempts'],r['attempts'],r['fact_count'],0],(r,v['counters'])
 assert v['state'][1]==r['trials']
 assert v['progress']==[r['relid'],r['nfact'],1,status],(r,v['progress'])
 assert v['relation_state']==[last,capacity,r['missing'],r['sup'],0,r['target']]
 assert v['relation_basis']==r['basis']
 assert v['relation_hashes'][:last]==r['hashes'] and v['relation_records'][:last*size]==r['records']
 assert v['generators'][:last*n]==list(map(int,r['generators']))
 assert all(x==0 for x in v['generators'][last*n:])
 assert v['relation_metadata'][:last*3]==[x for i in range(last) for x in (i+1,0,0)]
 before=json.dumps(v)
 assert f(*(v[name] for name,kind in payload['names']))==status and json.dumps(v)==before
print('CPython collector state matches all 16 PARI scenarios')
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:stringify({rows,names,initialized,inputs:rows.map(inputs)}),encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});assert.equal(py.status,0,py.stderr);
for(const r of rows)for(const backend of ['javascript','gmp']){
 const v=inputs(r),invoke=()=>mod.pari_collect_ideal_relations[backend](...names.map(([name])=>v[name]));
 if(initialized){initializer.pari_initialize_owned_relations[backend](2n,...[0,1,2].map(i=>r.groups.map(g=>BigInt(g[i]))),r.groups.map(()=>1n),v.ramification,v.relation_state,v.relation_basis,v.relation_records,v.relation_hashes,v.relation_metadata,v.relation,v.relation_scratch,BigInt(r.n),v.generators);v.relation_state[5]=BigInt(r.target);}
 const status=invoke(),last=r.last,size=v.relation.length,capacity=10*(size+2)+50;
 assert.equal(status,BigInt(r.status));assert.deepEqual(v.counters.map(BigInt),[r.attempts,r.attempts,r.fact_count,0].map(BigInt));assert.equal(v.state[1],BigInt(r.trials));
 assert.deepEqual(v.progress.map(BigInt),[r.relid,r.nfact,1,r.status].map(BigInt));
 assert.deepEqual(v.relation_state,[last,capacity,r.missing,r.sup,0,r.target].map(BigInt));
 assert.deepEqual(v.relation_basis,r.basis.map(BigInt));assert.deepEqual(v.relation_hashes.slice(0,last),r.hashes.map(BigInt));assert.deepEqual(v.relation_records.slice(0,last*size),r.records.map(BigInt));
 assert.deepEqual(v.generators.slice(0,last*r.n),r.generators.map(BigInt));assert(v.generators.slice(last*r.n).every(x=>x===0n));
 assert.deepEqual(v.relation_metadata.slice(0,last*3),Array.from({length:last},(_,i)=>[BigInt(i+1),0n,0n]).flat());
 const before=stringify(v);assert.equal(invoke(),status);assert.equal(stringify(v),before);
}
assert(rows.some(r=>r.nrelid===0&&r.status===1&&(initialized?r.last>0:r.last===0)&&r.nfact===0));
assert(rows.some(r=>r.nrelid===1&&r.status===0&&r.relid===1));
assert(rows.some(r=>r.target===2&&r.status===1&&r.last>=2&&r.relid<r.last));
assert(rows.some(r=>r.target===100&&r.nrelid===8&&r.status===0&&r.relid<8));
console.log('16 prepared ideal collectors match PARI/CPython/JS/GMP: probes, quotas, cache targets and exhaustion; relation bases, exact generators and terminal state agree; initial rational cache='+initialized);
})().catch(e=>{console.error(e);process.exitCode=1;});
