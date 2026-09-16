"use strict";
// Adapted PARI reference for a resident, prepared-nf initial candidate.
// This is an oracle/timing control, never a Sage.js mathematical backend.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function option(name,fallback){const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];}
const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
const warmups=Number(option('--warmups',0)),batches=Number(option('--batches',1)),repetitions=Number(option('--repetitions',1));
assert(Number.isInteger(warmups)&&warmups>=0&&warmups<=100);
assert(Number.isInteger(batches)&&batches>=1&&batches<=100);
assert(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=10000);
const release=process.argv.includes('--release');
assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
assert.equal(hash(pristine),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
const precisionHeaders={};
for(const name of ['pariinl.h','parigen.h']){const pinned=run('tar',['-xOf',archive,'pari-2.17.4/src/headers/'+name]),local=fs.readFileSync(path.join(pari,'src/headers',name),'utf8');assert.equal(local,pinned,'precision header differs from pinned archive: '+name);precisionHeaders[name]=hash(pinned);}
let source=pristine;const transformations=[];
function replace(from,to){assert.equal(source.split(from).length,2,from);source=source.replace(from,to);transformations.push({from,to});}
replace('#include "paripriv.h"','#include "paripriv.h"\n#include <time.h>\nstatic GEN prepared_ideals,prepared_norms;\nstatic long audit_small,audit_fact,audit_ideals;');
// Packet construction remains charged, but once for every selected ideal,
// exactly as in the connected candidate instead of lazily at visited ideals.
replace('{ Nid = pr_norm(id); id = pr_hnf(nf, id);}','{ Nid = gel(prepared_norms,j); id = gel(prepared_ideals,j); audit_ideals++; }');
replace('      gel(y,k) = pr_norm(P);','      gel(y,k) = gel(prepared_norms,k);');
replace('if (DEBUGLEVEL && Nsmall) (*Nsmall)++;','if (Nsmall) (*Nsmall)++;');
replace('if (DEBUGLEVEL && Nfact) (*Nfact)++;','if (Nfact) (*Nfact)++;');
replace('  if (DEBUGLEVEL && Nsmall)\n  {','  audit_small=Nsmall; audit_fact=Nfact;\n  if (DEBUGLEVEL && Nsmall)\n  {');
source+=String.raw`
static void scalar_out(GEN x){long e=0;if(typ(x)==t_INT){pari_printf("[\"%Ps\",\"-1\",\"0\"]",x);return;}pari_printf("[\"%Ps\",\"%ld\",\"%ld\"]",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static double elapsed(struct timespec a,struct timespec b){return b.tv_sec-a.tv_sec+(b.tv_nsec-a.tv_nsec)*1e-9;}
static long argument(const char *s){char *end;long n=strtol(s,&end,10);if(!*s||*end)return -1;return n;}
static void fail(const char *s){fprintf(stderr,"resident reference frontier: %s\n",s);exit(3);}
int main(int argc,char **argv){
if(argc!=4)return 2;long warmups=argument(argv[1]),batches=argument(argv[2]),reps=argument(argv[3]);
if(warmups<0||warmups>100||batches<1||batches>100||reps<1||reps>10000)return 2;
pari_init(256000000,10000);DEBUGLEVEL=0;
/* Prepared nf and corridor admission, not result-bearing class inputs. */
GEN nf=nfinit(gp_read_str("x^3-20018*x+20034"),nbits2prec(192));
long N=nf_get_degree(nf),r1=nf_get_r1(nf),r2=nf_get_r2(nf),RU=r1+r2,PREC=nbits2prec(192);
double prepared_LOGD=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2;
PREC=maxss(DEFAULTPREC,nf_get_prec(nf));
PREC=maxss(PREC,nbits2prec((long)(prepared_LOGD*prepared_LOGD*.02)+N*N));
if(nf_get_prec(nf)<PREC)nf=nfnewprec_shallow(nf,PREC);
if(prec2nbits(PREC)!=192)fail("working precision differs from prepared192-bit corridor");
GEN cyclic,auts=automorphism_matrices(nf,&cyclic),zu=nfrootsof1(nf);
GEN embperm=automorphism_perms(nf_get_M(nf),auts,cyclic,r1,r2,N);
if(N!=3||r1!=3||!equali1(nf_get_index(nf))||!equaliu(gel(zu,1),2)||lg(auts)!=1||lg(nfcyclotomicunits(nf,zu))!=1)fail("prepared non-Galois cubic only");
GEN first_result=NULL,nf_snapshot=gclone(nf);long calls=warmups+batches*reps;
double totals[100]={0},teardown[100]={0};
for(long rep=0;rep<calls;rep++){
 pari_sp keep=avma;struct timespec begin,end;GRHcheck_t S;FB_t F={0};RELCACHE_t cache={0};
 audit_small=audit_fact=audit_ideals=0;
 clock_gettime(CLOCK_MONOTONIC,&begin);
 double LOGD=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2,LOGD2=LOGD*LOGD;
 init_GRHcheck(&S,N,r1,LOGD);
 /* Deliberate eager-cache boundary, not stock Buchall demand ordering.
  * 10007 is prime, so cache_prime_dec's inclusive nextprime rule is exact. */
 cache_prime_dec(&S,10007,nf);
 long low=1,high=1;while(!GRHchk(nf,&S,high)){low=high;high*=2;}
 while(high-low>1){long test=(low+high)/2;if(GRHchk(nf,&S,test))high=test;else low=test;}
 long C2=(high==2&&GRHchk(nf,&S,1))?1:high;
 if(C2>(long)(4*LOGD2))C2=(long)(4*LOGD2);
 long C1=maxss(C2,nthideal(&S,nf,N));if(C2<C1)C2=C1;
 setrand(gen_1);FBgen(&F,nf,N,C1,C2,&S);F.embperm=embperm;
 prepared_ideals=cgetg(F.KC+1,t_VEC);prepared_norms=cgetg(F.KC+1,t_VEC);
 long packet=0;
 for(long j=1;j<=F.KCZ;j++){GEN group=gel(F.LV,F.FB[j]);for(long k=1;k<lg(group);k++){GEN ideal=gel(group,k);packet++;gel(prepared_ideals,packet)=pr_hnf(nf,ideal);gel(prepared_norms,packet)=pr_norm(ideal);}}
 if(packet!=F.KC)fail("packet prefix");
 double lim=LOGD<20?exp(-N+r2*log(4/M_PI)+LOGD/2)*sqrt(2*M_PI*N):-1;
 if(lim>=0&&lim<3)lim=3;
 subFBgen(&F,auts,cyclic,lim<0?C2:mindd(lim,C2),MINSFB);
 if(lg(F.idealperm)!=1||F.KCZ2!=F.KCZ)fail("automorphism or extra honesty work");
 long k0=lg(F.subFB)-1;F.L_jid=trim_list(&F);
 /* The connected analytic wrapper recomputes LOGD; retain that work. */
 LOGD=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2;
 long bound=primeneeded(N,r1,r2,LOGD);if(bound>10007)fail("analytic cache bound");
 cache_prime_dec(&S,bound,nf);
 GEN invhr=gmul(gdiv(gmul2n(powru(mppi(DEFAULTPREC),r2),RU),mulri(gsqrt(absi_shallow(nf_get_disc(nf)),DEFAULTPREC),gel(zu,1))),compute_invres(&S,bound));
 FACT *fact=(FACT*)stack_malloc((F.KC+1)*sizeof(FACT));fact[0].pr=0;
 cache.basis=zero_Flm_copy(F.KC,F.KC);init_rel(&cache,&F,RELSUP+RU-1);
 long initial=cache.last-cache.base,target=cache.end-cache.base;
 small_norm(&cache,&F,nf,BNF_RELPID,fact,0);long count=cache.last-cache.base;
 GEN mat=cgetg(count+1,t_MAT),C=cgetg(count+1,t_MAT);
 for(long j=1;j<=count;j++){gel(mat,j)=cache.base[j].R;gel(C,j)=get_log_embed(cache.base+j,nf_get_M(nf),RU,r1,PREC);}
 GEN dep=NULL,B=NULL,W=hnfspec_i(mat,F.perm,&dep,&B,&C,k0);
 long nh=lg(W)-1,nb=lg(B)-1,zc=lg(C)-1-nb-nh,need=F.KC-nh-nb;
 if(RU-1-zc>0)need=minss(need+RU-1-zc,F.KC);if(need)fail("relation retry");
 GEN A=vecslice(C,1,zc),Ar=real_i(A),lambda=NULL,L=NULL,R;long bit=0;
 R=compute_multiple_of_R(Ar,RU,N,&need,&bit,&lambda);
 if(!lambda||!R||need)fail("regulator retry");
 GEN h=ZM_det_triangular(W);long action=compute_R(lambda,mulir(h,invhr),&L,&R);
 if(action)fail("acceptance retry");
 GEN cyc=ZM_snf(W);
 clock_gettime(CLOCK_MONOTONIC,&end);
 if(rep>=warmups)totals[(rep-warmups)/reps]+=elapsed(begin,end);
 /* All comparison, serialized traces and teardown are outside the clock. */
 long patterns=0,factors=0;
 for(long j=0;j<S.nprimes;j++){GEN degrees=gel(S.primes[j].dec,1),mult=gel(S.primes[j].dec,2);patterns+=lg(degrees)-1;for(long k=1;k<lg(mult);k++)factors+=mult[k];}
 GEN rng=getrand();
 GEN result=mkvecn(17,h,cyc,R,stoi(initial),stoi(target),mkvecsmall3(audit_small,audit_fact,audit_ideals),stoi(count),stoi(nh),stoi(nb),stoi(zc),stoi(bit),mkvecsmall3(C1,C2,F.KC),mkvecsmall3(S.nprimes,patterns,factors),rng,invhr,stoi(k0),stoi(bound));
 if(first_result){if(!gequal(first_result,result))fail("repeat changed output/work/RNG");}else first_result=gclone(result);
 if(!gequal(nf,nf_snapshot))fail("prepared nf mutated");
 if(rep==calls-1){
 printf("{\"field\":0,\"precision\":%ld,\"precisionBits\":%ld,\"C1\":%ld,\"C2\":%ld,\"KC\":%ld,\"KCZ\":%ld,\"KCZ2\":%ld,\"degreeState\":[0,%ld,%ld,%ld],\"subfactorCount\":%ld,\"analyticBound\":%ld,\"initialRelations\":%ld,\"target\":%ld,\"relations\":%ld,\"ideals\":%ld,\"smallElements\":%ld,\"factorAttempts\":%ld,\"hnfRows\":%ld,\"bColumns\":%ld,\"unitColumns\":%ld,\"multipleBits\":%ld,\"action\":%ld,\"classNumber\":\"",PREC,prec2nbits(PREC),C1,C2,F.KC,F.KCZ,F.KCZ2,S.nprimes,patterns,factors,k0,bound,initial,target,count,audit_ideals,audit_small,audit_fact,nh,nb,zc,bit,action);
 pari_printf("%Ps",h);printf("\",\"invariants\":[");long first=1;
 for(long i=1;i<lg(cyc);i++)if(!equali1(gel(cyc,i))){if(!first)putchar(',');first=0;pari_printf("\"%Ps\"",gel(cyc,i));}
 printf("],\"regulator\":");scalar_out(R);printf(",\"inverseHR\":");scalar_out(invhr);
 printf(",\"rng\":[");for(long i=0;i<66;i++){if(i)putchar(',');ulong v=*int_W(rng,i);if(i==65)v&=63;printf("\"%lu\"",v);}
 puts("]}");
 }
 clock_gettime(CLOCK_MONOTONIC,&begin);
 delete_cache(&cache);delete_FB(&F);free_GRHcheck(&S);set_avma(keep);
 clock_gettime(CLOCK_MONOTONIC,&end);
 if(rep>=warmups)teardown[(rep-warmups)/reps]+=elapsed(begin,end);
}
printf("{\"unqualifiedBatchSeconds\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",totals[i]);}
printf("],\"unqualifiedTeardownBatchSeconds\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",teardown[i]);}
printf("],\"unqualifiedComputeAndTeardownBatchSeconds\":[");for(long i=0;i<batches;i++){if(i)putchar(',');printf("%.17g",totals[i]+teardown[i]);}puts("]}");
gunclone(first_result);gunclone(nf_snapshot);pari_close();return 0;
}
`;
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-resident-attempt-reference-'));
const c=path.join(directory,'oracle.c'),exe=path.join(directory,'oracle');fs.writeFileSync(c,source);
const compilerPath=run('sh',['-c','command -v cc']).trim();assert(path.isAbsolute(compilerPath));
const flags=release?['-O3']:['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined'];
const buildArguments=[...flags,'-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe];
const build={compilerPath,compilerVersion:run(compilerPath,['--version']).trim(),flags,arguments:buildArguments,sourcePath:c,executablePath:exe,pariLibraryPath:fs.realpathSync(path.join(lib,'libpari.so'))};
const metadata={directory,sourceHash:hash(pristine),transformedHash:hash(source),transformations,precisionHeaders,build,warmups,batches,repetitions,qualifiedTiming:false,boundary:'Prepared nf192 and runtime constants outside; eager degree cache through10007, bounds, seeded FBgen, all selected ideal HNF/norm packets, subfactor policy, inverseHR, first collection/log/HNF/acceptance/invariant-only SNF inside. No fundamental units, generators, maps, packaging or retries. Extra honesty is rejected. Teardown separately timed; comparisons outside.'};
fs.writeFileSync(path.join(directory,'metadata.json'),JSON.stringify(metadata));
if(process.argv.includes('--emit-only')){console.log(JSON.stringify(metadata));process.exit(0);}
run(compilerPath,buildArguments);
metadata.build.executableHash=hash(fs.readFileSync(exe));metadata.build.pariLibraryHash=hash(fs.readFileSync(build.pariLibraryPath));
const stdout=run(exe,[String(warmups),String(batches),String(repetitions)]);fs.writeFileSync(path.join(directory,'stdout.json'),stdout);
const records=stdout.trim().split('\n').map(JSON.parse);assert.equal(records.length,2);const output={...records[0],...records[1]};assert.equal(output.action,0);assert.equal(output.classNumber,'1');assert.deepEqual(output.invariants,[]);
assert.deepEqual(output.degreeState,[0,1230,1833,2270]);assert.equal(output.KC,66);assert.equal(output.C1,333);assert.equal(output.C2,333);assert.equal(output.KCZ,output.KCZ2);
assert.equal(output.precisionBits,192);
assert.equal(output.relations,73);assert.equal(output.subfactorCount,4);
const candidate=option('--candidate',null);
if(candidate){const artifact=JSON.parse(fs.readFileSync(candidate)),other=artifact.summary??artifact.cp??artifact;for(const key of ['action','classNumber','invariants','regulator','relations','degreeState','subfactorCount','inverseHR'])assert.deepEqual(output[key],other[key],key);assert.deepEqual([output.C1,output.C2,output.KC,output.KCZ,output.KCZ2].map(String),other.initialBase.slice(0,5).map(String));metadata.candidateHash=hash(fs.readFileSync(candidate));}
const catalog=option('--catalog',null);
if(catalog){const artifact=JSON.parse(fs.readFileSync(catalog)),row=artifact.rows.find(r=>r.bound===output.C2);assert(row,'catalog control must contain C2');assert.deepEqual(output.rng,row.rng);assert.equal(output.KCZ,row.groups.length);assert.equal(output.KC,row.groups.reduce((n,g)=>n+g.records.length,0));metadata.catalogHash=hash(fs.readFileSync(catalog));}
const summary={...metadata,output};fs.writeFileSync(path.join(directory,'fixtures.json'),JSON.stringify(summary));console.log(JSON.stringify(summary));
