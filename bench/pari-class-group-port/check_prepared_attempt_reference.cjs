"use strict";
// PARI 2.17.4 prepared-boundary reference, not an alternative Sage.js backend.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
const at=process.argv.indexOf('--serial-repetitions'),repetitions=at<0?1:Number(process.argv[at+1]);assert(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=10000);
assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);assert.equal(hash(pristine),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
let source=pristine;const transformations=[];
function replace(from,to){assert.equal(source.split(from).length,2,from);source=source.replace(from,to);transformations.push({from,to});}
replace('#include "paripriv.h"','#include "paripriv.h"\n#include <time.h>\nstatic GEN prepared_ideals,prepared_norms;\nstatic long audit_small,audit_fact,audit_ideals;');
// Match native input packets exactly, rather than charging only PARI for
// ideal-HNF preparation. The selected branch is asserted j0=0 below.
replace('{ Nid = pr_norm(id); id = pr_hnf(nf, id);}','{ Nid = gel(prepared_norms,j); id = gel(prepared_ideals,j); audit_ideals++; }');
replace('if (DEBUGLEVEL && Nsmall) (*Nsmall)++;','if (Nsmall) (*Nsmall)++;');
replace('if (DEBUGLEVEL && Nfact) (*Nfact)++;','if (Nfact) (*Nfact)++;');
replace('  if (DEBUGLEVEL && Nsmall)\n  {','  audit_small=Nsmall; audit_fact=Nfact;\n  if (DEBUGLEVEL && Nsmall)\n  {');
source+=String.raw`
static void scalar_out(GEN x){long e=0;if(typ(x)==t_INT){pari_printf("[\"%Ps\",\"-1\",\"0\"]",x);return;}pari_printf("[\"%Ps\",\"%ld\",\"%ld\"]",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static double elapsed(struct timespec a,struct timespec b){return b.tv_sec-a.tv_sec+(b.tv_nsec-a.tv_nsec)*1e-9;}
int main(int argc,char **argv){long reps=argc>1?atol(argv[1]):1;if(reps<1||reps>10000)return 2;
pari_init(256000000,10000);DEBUGLEVEL=0;
const char *polynomials[]={"x^3-20018*x+20034","x^3-20010*x+20018"};
for(long field=0;field<2;field++){pari_sp outer=avma;
GEN nf=nfinit(gp_read_str(polynomials[field]),192);long N=nf_get_degree(nf),r1=nf_get_r1(nf),r2=nf_get_r2(nf),RU=r1+r2;
double LOGD=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2,LOGD2=LOGD*LOGD;long PREC=maxss(DEFAULTPREC,nf_get_prec(nf));PREC=maxss(PREC,nbits2prec((long)(LOGD2*.02)+N*N));if(nf_get_prec(nf)<PREC)nf=nfnewprec_shallow(nf,PREC);
GRHcheck_t S;init_GRHcheck(&S,N,r1,LOGD);long low=1,high=1;while(!GRHchk(nf,&S,high)){low=high;high*=2;}while(high-low>1){long test=(low+high)/2;if(GRHchk(nf,&S,test))high=test;else low=test;}
long C2=(high==2&&GRHchk(nf,&S,1))?1:high;if(C2>(long)(4*LOGD2))C2=(long)(4*LOGD2);long C1=maxss(C2,nthideal(&S,nf,N));if(C2<C1)C2=C1;
FB_t F={0};FBgen(&F,nf,N,C1,C2,&S);GEN cyclic,auts=automorphism_matrices(nf,&cyclic);F.embperm=automorphism_perms(nf_get_M(nf),auts,cyclic,r1,r2,N);
double lim=LOGD<20?exp(-N+r2*log(4/M_PI)+LOGD/2)*sqrt(2*M_PI*N):-1;if(lim>=0&&lim<3)lim=3;subFBgen(&F,auts,cyclic,lim<0?C2:mindd(lim,C2),MINSFB);
if(lg(F.idealperm)!=1||lg(nfcyclotomicunits(nf,nfrootsof1(nf)))!=1){fputs("unsupported automorphism/cyclotomic branch\n",stderr);return 3;}
long bound=primeneeded(N,r1,r2,LOGD);cache_prime_dec(&S,bound,nf);GEN invhr=gmul(gdiv(gmul2n(powru(mppi(DEFAULTPREC),r2),RU),mulri(gsqrt(absi_shallow(nf_get_disc(nf)),DEFAULTPREC),gel(nfrootsof1(nf),1))),compute_invres(&S,bound));
prepared_ideals=cgetg(F.KC+1,t_VEC);prepared_norms=cgetg(F.KC+1,t_VEC);for(long j=1;j<=F.KC;j++){gel(prepared_ideals,j)=pr_hnf(nf,gel(F.LP,j));gel(prepared_norms,j)=pr_norm(gel(F.LP,j));}
GEN search=trim_list(&F),first_result=NULL;long k0=lg(F.subFB)-1;double total=0;
GEN prepared_state=mkvecn(12,nf,F.LP,F.LV,F.FB,F.iLP,F.perm,F.subFB,F.minidx,search,prepared_ideals,prepared_norms,invhr),prepared_snapshot=gclone(prepared_state);
for(long rep=0;rep<reps;rep++){pari_sp keep=avma;FB_t G=F;G.perm=leafcopy(F.perm);G.L_jid=search;
RELCACHE_t cache={0};FACT *fact=(FACT*)stack_malloc((F.KC+1)*sizeof(FACT));fact[0].pr=0;
audit_small=audit_fact=audit_ideals=0;struct timespec begin,end;clock_gettime(CLOCK_MONOTONIC,&begin);
cache.basis=zero_Flm_copy(F.KC,F.KC);init_rel(&cache,&G,RELSUP+RU-1);long initial=cache.last-cache.base,target=cache.end-cache.base;
small_norm(&cache,&G,nf,BNF_RELPID,fact,0);long count=cache.last-cache.base;
GEN mat=cgetg(count+1,t_MAT),C=cgetg(count+1,t_MAT);for(long j=1;j<=count;j++){gel(mat,j)=cache.base[j].R;gel(C,j)=get_log_embed(cache.base+j,nf_get_M(nf),RU,r1,PREC);}
GEN dep=NULL,B=NULL,W=hnfspec_i(mat,G.perm,&dep,&B,&C,k0);long nh=lg(W)-1,nb=lg(B)-1,zc=lg(C)-1-nb-nh,need=F.KC-nh-nb;
if(RU-1-zc>0)need=minss(need+RU-1-zc,F.KC);if(need){fputs("first attempt needs relations; no retry permitted\n",stderr);return 4;}
GEN A=vecslice(C,1,zc),Ar=real_i(A),lambda=NULL,L=NULL,R;long bit=0;
R=compute_multiple_of_R(Ar,RU,N,&need,&bit,&lambda);if(!lambda||!R||need){fputs("first attempt needs regulator retry\n",stderr);return 5;}
GEN h=ZM_det_triangular(W);long action=compute_R(lambda,mulir(h,invhr),&L,&R);if(action){fputs("first attempt not accepted; no retry permitted\n",stderr);return 6;}
GEN cyc=ZM_snf(W);clock_gettime(CLOCK_MONOTONIC,&end);total+=elapsed(begin,end);
GEN result=mkvecn(11,h,cyc,R,stoi(initial),stoi(target),mkvecsmall3(audit_small,audit_fact,audit_ideals),stoi(count),stoi(nh),stoi(nb),stoi(zc),stoi(bit));if(first_result){if(!gequal(first_result,result)){fputs("repeat changed result or work counts\n",stderr);return 7;}}else first_result=gclone(result);
if(!gequal(prepared_state,prepared_snapshot)){fputs("attempt mutated shared prepared owners\n",stderr);return 8;}
if(rep==reps-1){printf("{\"field\":%ld,\"precision\":%ld,\"C1\":%ld,\"C2\":%ld,\"KC\":%ld,\"initialRelations\":%ld,\"target\":%ld,\"relations\":%ld,\"ideals\":%ld,\"smallElements\":%ld,\"factorAttempts\":%ld,\"hnfRows\":%ld,\"bColumns\":%ld,\"unitColumns\":%ld,\"multipleBits\":%ld,\"action\":%ld,\"classNumber\":\"",field,PREC,C1,C2,F.KC,initial,target,count,audit_ideals,audit_small,audit_fact,nh,nb,zc,bit,action);pari_printf("%Ps",h);printf("\",\"invariants\":[");long first=1;for(long i=1;i<lg(cyc);i++)if(!equali1(gel(cyc,i))){if(!first)putchar(',');first=0;pari_printf("\"%Ps\"",gel(cyc,i));}printf("],\"regulator\":");scalar_out(R);printf(",\"repetitions\":%ld,\"unqualifiedSecondsTotal\":%.17g}\n",reps,total);}
delete_cache(&cache);set_avma(keep);}
gunclone(first_result);gunclone(prepared_snapshot);free_GRHcheck(&S);set_avma(outer);}
pari_close();return 0;}
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-prepared-attempt-reference-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(c,source);
// UBSan validation and timing artifacts are intentionally separate builds.
const flags=at<0?['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined']:['-O3'];
run('cc',[...flags,'-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
const trace=run(exe,[String(repetitions)]);fs.writeFileSync(path.join(dir,'stdout.jsonl'),trace);const outputs=trace.trim().split('\n').map(JSON.parse);
for(const r of outputs){assert.equal(r.action,0);assert.equal(r.classNumber,r.field===0?'1':'3');assert.deepEqual(r.invariants,r.field===0?[]:['3']);}
const driverOutputs=[];
for(const r of outputs){const traceRun=JSON.parse(run(process.execPath,[path.join(__dirname,'check_default_driver_trace.cjs'),pari,archive,'--field'+r.field]));const events=JSON.parse(fs.readFileSync(path.join(traceRun.directory??traceRun.artifactDirectory,'trace.json')));const result=events.at(-1),base=events.find(e=>e.event==='factor_base'),initial=events.find(e=>e.event==='initialized'),collected=events.filter(e=>e.event==='small_norm_after');assert.equal(collected.length,1,'reference is only the successful first attempt');assert.equal(r.relations,collected[0].relations);assert.equal(r.initialRelations,initial.relations);assert.equal(r.target,initial.target);for(const k of ['C1','C2','KC','precision'])assert.equal(r[k],base[k]);assert.equal(r.classNumber,result.classNumber);assert.deepEqual(r.invariants,result.invariants);assert.deepEqual(r.regulator,[result.regulator.mantissa,String(result.regulator.precision),String(result.regulator.exponent)]);driverOutputs.push({field:r.field,result,traceDirectory:traceRun.directory??traceRun.artifactDirectory});}
const summary={outputs,driverOutputs,sourceHash:hash(pristine),transformedHash:hash(source),transformations,traceSha256:hash(trace),ubsan:at<0,qualifiedTiming:false,boundary:'Prepared nf/default factor base/search/ideal HNF/norm packets and inverseHR outside section; fresh cache initialization, first small_norm j0=0, logs, HNF, regulator acceptance and invariant-only SNF inside. No retries, honesty, ideal generators, full units or maps. Output serialization/cache teardown outside.',timingCaveat:'Serial repetitions report raw unqualified reference time only; require isolated matched native measurement, release builds, and matching allocation/reset conventions before interpreting ratios.',artifactDirectory:dir};
fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify(summary));console.log(JSON.stringify(summary));
