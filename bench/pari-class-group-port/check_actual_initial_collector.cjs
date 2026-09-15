"use strict";
// Actual PARI default initial policy, at an explicitly prepared nf boundary.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const hash=x=>createHash('sha256').update(x).digest('hex');
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 const fieldArg=process.argv.indexOf('--field'),field=fieldArg<0?1:Number(process.argv[fieldArg+1]);assert(Number.isInteger(field)&&field>=0&&field<4,'--field must be one of the four declared tuning field indices');
 const polynomial=['x^3-20018*x+20034','x^3-20010*x+20018','x^4-20018*x-20034','x^4-2000022*x-2000042'][field];
 assert.equal(hash(fs.readFileSync(archive)),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 assert.equal(hash(pristine),'904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac');
 const template=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct']));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-actual-initial-collector-'));
 const control=pristine+`
static void exact(GEN x){pari_printf("\\\"%Ps\\\"",x);}
static void scalar(GEN x){long e;if(typ(x)==t_INT){exact(x);printf(",\\\"-1\\\",\\\"0\\\"");}else{exact(signe(x)?mantissa_real(x,&e):gen_0);printf(",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?bit_prec(x):0,expo(x));}}
static void exactmat(GEN A){putchar('[');for(long j=1;j<lg(A);j++)for(long i=1;i<lg(gel(A,j));i++){if(j>1||i>1)putchar(',');exact(gcoeff(A,i,j));}putchar(']');}
static void smallvec(GEN A){putchar('[');for(long j=1;j<lg(A);j++){if(j>1)putchar(',');printf("%ld",A[j]);}putchar(']');}
static void logmat(GEN A){putchar('[');for(long j=1;j<lg(A);j++)for(long i=1;i<lg(gel(A,j));i++){if(j>1||i>1)putchar(',');GEN x=gcoeff(A,i,j);if(typ(x)==t_COMPLEX){printf("\\\"2\\\",");scalar(gel(x,1));putchar(',');scalar(gel(x,2));}else{printf("\\\"1\\\",");scalar(x);printf(",\\\"0\\\",\\\"-1\\\",\\\"0\\\"");}}putchar(']');}
int main(void){pari_init(256000000,10000);DEBUGLEVEL=0;
 GEN nf=nfinit(gp_read_str(${JSON.stringify(polynomial)}),nbits2prec(192));long n=nf_get_degree(nf),r1=nf_get_r1(nf),r2=nf_get_r2(nf),ru=r1+r2;
 double ld=dbllog2(absi_shallow(nf_get_disc(nf)))*M_LN2,ld2=ld*ld;long PREC=maxss(DEFAULTPREC,nf_get_prec(nf));PREC=maxss(PREC,nbits2prec((long)(ld2*.02)+n*n));if(nf_get_prec(nf)<PREC)nf=nfnewprec_shallow(nf,PREC);
 GRHcheck_t S;init_GRHcheck(&S,n,r1,ld);long low=1,high=1;
 while(!GRHchk(nf,&S,high)){low=high;high*=2;}while(high-low>1){long test=(low+high)/2;if(GRHchk(nf,&S,test))high=test;else low=test;}
 long c2=(high==2&&GRHchk(nf,&S,1))?1:high;if(c2>(long)(4.*ld2))c2=(long)(4.*ld2);long c1=maxss(c2,nthideal(&S,nf,n));if(c2<c1)c2=c1;
 FB_t F={0};FBgen(&F,nf,n,c1,c2,&S);GEN cyclic,auts=automorphism_matrices(nf,&cyclic);F.embperm=automorphism_perms(nf_get_M(nf),auts,cyclic,r1,r2,n);
 double lim=ld<20.?exp(-n+r2*log(4/M_PI)+ld/2)*sqrt(2*M_PI*n):-1;if(lim>=0&&lim<3)lim=3;double prod=lim<0?c2:mindd(lim,c2);
 subFBgen(&F,auts,cyclic,prod,MINSFB);if(lg(F.idealperm)!=1||lg(nfcyclotomicunits(nf,nfrootsof1(nf)))!=1){fputs("unsupported actual-policy automorphism or cyclotomic-unit branch\\n",stderr);return 20;}
 long kc=F.KC;printf("{\\\"field\\\":${field},\\\"degree\\\":%ld,\\\"real\\\":%ld,\\\"logD\\\":%.17g,\\\"C1\\\":%ld,\\\"C2\\\":%ld,\\\"KC\\\":%ld,\\\"KCZ\\\":%ld,\\\"KCZ2\\\":%ld,\\\"ballvol\\\":%.17g,\\\"scale\\\":%.17g,\\\"subfactorProduct\\\":%.17g,\\\"additional\\\":%ld,\\\"nrelid\\\":%ld,\\\"support\\\":",n,r1,ld,c1,c2,kc,F.KCZ,F.KCZ2,F.ballvol,4*maxtry_FACT/F.ballvol,prod,RELSUP+ru-1,BNF_RELPID);exact(F.prodZ);
 printf(",\\\"catalog\\\":[");long base=0;GEN full=cgetg(S.nprimes+1,t_VEC);
 for(long i=0;i<S.nprimes;i++){GEN all=idealprimedec(nf,utoipos(S.primes[i].p));gel(full,i+1)=all;if(i)putchar(',');printf("[%lu,%ld",S.primes[i].p,base);for(long j=1;j<lg(all);j++)printf(",%ld",pr_get_f(gel(all,j)));putchar(']');base+=lg(all)-1;}
 printf("],\\\"groups\\\":[");for(long i=1;i<=F.KCZ;i++){long p=F.FB[i],ix=0,offset=0;while(S.primes[ix].p!=(ulong)p){offset+=lg(gel(full,ix+1))-1;ix++;}GEN group=gel(F.LV,p),all=gel(full,ix+1);if(i>1)putchar(',');printf("{\\\"p\\\":%ld,\\\"offset\\\":%ld,\\\"complete\\\":%d,\\\"ideals\\\":[",p,F.iLP[p],isclone(group)?1:0);
 for(long j=1;j<lg(group);j++){GEN P=gel(group,j),tau=pr_get_tau(P),I=pr_hnf(nf,P);long inert=typ(tau)==t_INT,index=-1;for(long k=1;k<lg(all);k++)if(gequal(P,gel(all,k))){index=offset+k-1;break;}if(index<0)return 21;if(j>1)putchar(',');printf("{\\\"index\\\":%ld,\\\"e\\\":%ld,\\\"f\\\":%ld,\\\"inert\\\":%ld,\\\"norm\\\":",index,pr_get_e(P),pr_get_f(P),inert);exact(pr_norm(P));printf(",\\\"tau\\\":[");for(long a=1;a<=n;a++)for(long b=1;b<=n;b++){if(a>1||b>1)putchar(',');exact(inert?gen_0:gcoeff(tau,a,b));}printf("],\\\"ideal\\\":[");for(long a=1;a<=n;a++)for(long b=1;b<=n;b++){if(a>1||b>1)putchar(',');exact(gcoeff(I,a,b));}printf("]}");}printf("]}");}
 printf("],\\\"precision\\\":%ld,\\\"subfactorCount\\\":%ld,\\\"bad\\\":[",PREC,lg(F.subFB)-1);for(long i=1;i<=kc;i++){if(i>1)putchar(',');printf("%d",bad_subFB(&F,i));}printf("],\\\"perm\\\":");smallvec(F.perm);printf(",\\\"minidx\\\":");smallvec(F.minidx);
 RELCACHE_t C={0};C.basis=zero_Flm_copy(kc,kc);init_rel(&C,&F,RELSUP+ru-1);long initial_count=C.last-C.base,target=C.end-C.base;F.L_jid=trim_list(&F);printf(",\\\"search\\\":");smallvec(F.L_jid);printf(",\\\"initialCount\\\":%ld,\\\"target\\\":%ld",initial_count,target);
 FACT *fact=(FACT*)stack_malloc((kc+1)*sizeof(FACT));fact[0].pr=0;small_norm(&C,&F,nf,BNF_RELPID,fact,0);
 long count=C.last-C.base;printf(",\\\"last\\\":%ld,\\\"missing\\\":%lu,\\\"sup\\\":%ld,\\\"records\\\":[",count,C.missing,C.relsup);
 for(long j=1;j<=count;j++)for(long i=1;i<=kc;i++){if(j>1||i>1)putchar(',');printf("%ld",C.base[j].R[i]);}printf("],\\\"generators\\\":[");for(long j=1;j<=count;j++)for(long i=1;i<=n;i++){if(j>1||i>1)putchar(',');exact(typ(C.base[j].m)==t_INT?(i==1?C.base[j].m:gen_0):gel(C.base[j].m,i));}
 GEN rels=cgetg(count+1,t_MAT),logs=cgetg(count+1,t_MAT);for(long j=1;j<=count;j++){gel(rels,j)=C.base[j].R;gel(logs,j)=get_log_embed(C.base+j,nf_get_M(nf),ru,r1,PREC);}printf("],\\\"logs\\\":");logmat(logs);
 GEN perm=leafcopy(F.perm),D=NULL,B=NULL,H=hnfspec_i(rels,perm,&D,&B,&logs,lg(F.subFB)-1);long nh=lg(H)-1,nb=lg(B)-1;printf(",\\\"H\\\":");exactmat(H);printf(",\\\"D\\\":");exactmat(D);printf(",\\\"B\\\":");exactmat(B);printf(",\\\"C\\\":");logmat(logs);printf(",\\\"hnfPerm\\\":");smallvec(perm);printf(",\\\"hnfState\\\":[%ld,%ld,%ld,%ld,%ld]",nh,count-nb,nb,kc-nb-nh,count-nb-nh);
 long limres=primeneeded(n,r1,r2,ld);cache_prime_dec(&S,limres,nf);GEN invhr=gmul(gdiv(gmul2n(powru(mppi(DEFAULTPREC),r2),ru),mulri(gsqrt(absi_shallow(nf_get_disc(nf)),DEFAULTPREC),gel(nfrootsof1(nf),1))),compute_invres(&S,limres));printf(",\\\"inverseHR\\\":[");scalar(invhr);printf("],\\\"residueBound\\\":%ld}\\n",limres);
 delete_cache(&C);free_GRHcheck(&S);pari_close();return 0;}
`;
 fs.writeFileSync(path.join(dir,'oracle.c'),control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'oracle')]);
 const expected=JSON.parse(run(path.join(dir,'oracle'),[]));fs.writeFileSync(path.join(dir,'source-fixture.json'),JSON.stringify(expected));
 const v=structuredClone(template.cases[4*field+3].input),n=Number(v.n),kc=expected.KC,cap=10*(kc+expected.additional)+50,zero=k=>Array(k).fill('0');
 assert.equal(Number(v.precision),expected.precision,'prepared nf precision needs rebuilding');
 Object.assign(v,{nrelid:String(expected.nrelid),scale:expected.scale,admission_factor_product:expected.support,admission_prime_offsets:Array(expected.C2+1).fill('-1'),admission_prime_counts:zero(expected.C2+1),admission_group_tau:[],admission_group_e:[],admission_group_f:[],admission_group_inert:[],relation_primes:[],ramification:[],relation:zero(kc),relation_scratch:zero(kc),relation_basis:zero(kc*kc),relation_state:['0',String(cap),String(kc),String(expected.additional),'0',String(expected.target)],relation_records:zero(cap*kc),relation_hashes:zero(cap),relation_metadata:zero(cap*3),generators:zero(cap*n),packet_ids:Array.from({length:kc},(_,i)=>String(i+1)),packet_ideals:[],packet_norms:[],search_ideals:expected.search.map(String),search_count:String(expected.search.length),schedule:zero(4)});
 for(const g of expected.groups){v.admission_prime_offsets[g.p]=String(g.offset);v.admission_prime_counts[g.p]=String(g.ideals.length);for(const P of g.ideals){v.admission_group_tau.push(...P.tau);v.admission_group_e.push(String(P.e));v.ramification.push(String(P.e));v.admission_group_f.push(String(P.f));v.admission_group_inert.push(String(P.inert));v.relation_primes.push(String(g.p));v.packet_ideals.push(...P.ideal);v.packet_norms.push(P.norm);}}
 assert.equal(v.relation_primes.length,kc);
 const hsig=fs.readFileSync(path.join(__dirname,'hnfspec_complete.py'),'utf8').match(/def pari_hnfspec_complete\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const payload={expected,input:v,names:template.names,hsig};
 const result=JSON.parse(run('python3',['-c',`
import sys,json,importlib,decimal
sys.set_int_max_str_digits(100000) # Diagnostic serialization, not kernel capacity.
sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin);e=d['expected'];v={}
for name,kind in d['names']:
 conv=float if kind in ('float','Float64Buffer') else int;x=d['input'][name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
base=importlib.import_module('bench.pari-class-group-port.initial_base').pari_prepared_initial_base
primes=[];full_offsets=[];full_counts=[];full_degrees=[];po=[];pc=[];pd=[];mult=[]
for p,offset,*degrees in e['catalog']:
 primes.append(p);full_offsets.append(offset);full_counts.append(len(degrees));full_degrees.extend(degrees);po.append(len(pd));last=None
 for f in degrees:
  if f!=last:pd.append(f);mult.append(1);last=f
  else:mult[-1]+=1
 pc.append(len(pd)-po[-1])
sp=[0]*len(primes);off=[0]*(e['C2']+1);cnt=off.copy();complete=off.copy();indices=[0]*len(full_degrees)
b=base(e['degree'],e['real'],[e['logD'],0.0,0.0],primes,po,pc,pd,mult,full_offsets,full_counts,full_degrees,[0]*(e['degree']+1),[0.0]*(len(primes)+2),[0.0]*2,[0.0]*(len(primes)+1),sp,off,cnt,complete,indices)
assert list(b)==[e['C1'],e['C2'],e['KC'],e['KCZ'],e['KCZ2'],e['KC'],int(e['support'])],b
assert indices[:e['KC']]==[P['index'] for g in e['groups'] for P in g['ideals']]
assert sp[:e['KCZ']]==[g['p'] for g in e['groups']]
for g in e['groups']:assert (off[g['p']],cnt[g['p']],complete[g['p']])==(g['offset'],len(g['ideals']),g['complete'])
sub=importlib.import_module('bench.pari-class-group-port.subfactor_base').pari_prepared_subfactor_base
kc=e['KC'];perm=[0]*kc
subresult=sub(list(map(int,v['packet_norms'])),e['bad'],[e['subfactorProduct']],3,[0]*kc,[0]*kc,[0]*(3*kc+3),[0]*kc,[0]*kc,perm);assert perm==e['perm'];assert subresult[0]==e['subfactorCount']
assert e['minidx']==list(range(1,kc+1));assert e['search']==perm
initialize=importlib.import_module('bench.pari-class-group-port.relation_insertion').pari_initialize_owned_relations
initial=initialize(e['additional'],[g['p'] for g in e['groups']],[g['offset'] for g in e['groups']],[len(g['ideals']) for g in e['groups']],[g['complete'] for g in e['groups']],v['ramification'],v['relation_state'],v['relation_basis'],v['relation_records'],v['relation_hashes'],v['relation_metadata'],v['relation'],v['relation_scratch'],v['n'],v['generators']);assert initial==e['initialCount'];assert v['relation_state'][5]==e['target']
collect=importlib.import_module('bench.pari-class-group-port.unreduced_small_norm').pari_collect_unreduced_ideals
s=collect(**v);last=v['relation_state'][0];assert s==int(last>=e['target']),('collector',s);assert last==e['last'],(last,e['last']);assert v['relation_records'][:last*kc]==e['records'];assert list(map(str,v['generators'][:last*v['n']]))==e['generators']
ru=(v['n']+v['admission_real_count'])//2;logs=[0]*(7*ru*last);done=[0]
append=importlib.import_module('bench.pari-class-group-port.relation_log_embeddings').pari_append_relation_log_embeddings
append(v['admission_matrix_m'],v['admission_matrix_p'],v['admission_matrix_e'],v['generators'],v['relation_metadata'],last,v['n'],v['admission_real_count'],e['precision'],done,logs,[0]*v['n'],[0]*(7*ru),[0]*3,[0]*3,[0]*64,[0]*64,[0]*64,[0]*64,[0]*128);assert list(map(str,logs))==e['logs']
hnf=importlib.import_module('bench.pari-class-group-port.hnfspec_complete').pari_hnfspec_complete
cap=max(64,(kc+last)**2,7*ru*(kc+last));w={name:[77]*cap for name,kind in d['hsig'] if kind!='int'};w.update(original=v['relation_records'][:last*kc],rows=kc,columns=last,perm=perm,k0=e['subfactorCount'],logs=logs,log_rows=ru)
hs=hnf(**w)
if hs==0:
 for key,name in [('H','result_h'),('D','result_dep'),('B','result_b'),('C','result_c')]:assert list(map(str,w[name][:len(e[key])]))==e[key],key
 assert w['perm']==e['hnfPerm']
print(json.dumps({'initialBase':list(map(str,b)),'initialRelations':initial,'relations':last,'collectorStatus':s,'hnfStatus':hs,'hnfState':w['state'][:9]}))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify(payload)}));
 const nativeOutputs=[],native=[],nativeInputs=[];
 if(process.argv.includes('--native')){
  const load=async name=>{const built=await compileKernel({sourcePath:path.join(__dirname,name+'.py')});assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);return require(built.modulePath);};
  const base=(await load('initial_base')).pari_prepared_initial_base,sub=(await load('subfactor_base')).pari_prepared_subfactor_base,chain=(await load('connected_relation_hnf')).pari_connected_relation_hnf;
  assert(base.nativeAvailable&&sub.nativeAvailable&&chain?.nativeAvailable);
  const sig=fs.readFileSync(path.join(__dirname,'connected_relation_hnf.py'),'utf8').match(/def pari_connected_relation_hnf\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
  for(const backend of ['javascript','gmp']){
   const primes=[],fo=[],fc=[],fd=[],po=[],pc=[],pd=[],mult=[];
   for(const [p,offset,...degrees]of expected.catalog){primes.push(BigInt(p));fo.push(BigInt(offset));fc.push(BigInt(degrees.length));fd.push(...degrees.map(BigInt));po.push(BigInt(pd.length));let last=null;for(const f of degrees){if(f!==last){pd.push(BigInt(f));mult.push(1n);last=f;}else mult[mult.length-1]++;}pc.push(BigInt(pd.length)-po.at(-1));}
   const selected=Array(primes.length).fill(0n),off=Array(expected.C2+1).fill(0n),counts=off.slice(),complete=off.slice(),indices=Array(fd.length).fill(0n);
   const br=base[backend](BigInt(n),BigInt(expected.real),[expected.logD,0,0],primes,po,pc,pd,mult,fo,fc,fd,Array(n+1).fill(0n),Array(primes.length+2).fill(0),[0,0],Array(primes.length+1).fill(0),selected,off,counts,complete,indices);
   assert.deepEqual(br,result.initialBase.map(BigInt));assert.deepEqual(indices.slice(0,kc),expected.groups.flatMap(g=>g.ideals.map(P=>BigInt(P.index))));
   const permutation=Array(kc).fill(0n),sr=sub[backend](v.packet_norms.map(BigInt),expected.bad.map(BigInt),[expected.subfactorProduct],3n,Array(kc).fill(0n),Array(kc).fill(0n),Array(3*kc+3).fill(0n),Array(kc).fill(0n),Array(kc).fill(0n),permutation);assert.deepEqual(permutation,expected.perm.map(BigInt));assert.equal(sr[0],BigInt(expected.subfactorCount));
   const raw=Object.fromEntries(template.names.map(([name,kind])=>{const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=v[name];return [name,Array.isArray(x)?x.map(conv):conv(x)];})),ru=(n+expected.real)/2,hcap=Math.max(64,(kc+expected.target)**2,7*ru*(kc+expected.target));
   Object.assign(raw,{log_precision:128n,log_completed:[0n],log_embeddings:Array(cap*7*ru).fill(0n),log_coordinates:Array(n).fill(0n),log_column:Array(7*ru).fill(0n),log_cache:Array(3).fill(0n),log_pi_cache:Array(3).fill(0n),log_a:Array(64).fill(0n),log_b:Array(64).fill(0n),log_p:Array(64).fill(0n),log_q:Array(64).fill(0n),log_stack:Array(128).fill(0n),initial_additional:BigInt(expected.additional),initial_target:BigInt(expected.target),initial_primes:expected.groups.map(g=>BigInt(g.p)),initial_offsets:expected.groups.map(g=>off[g.p]),initial_counts:expected.groups.map(g=>counts[g.p]),initial_complete:expected.groups.map(g=>complete[g.p]),hnf_k0:0n,hnf_original:Array(kc*cap).fill(0n),hnf_perm:permutation,chain_state:Array(4).fill(0n)});
   raw.log_precision=BigInt(expected.precision);raw.hnf_k0=sr[0];raw.search_ideals=permutation.slice();
   for(const [name,kind]of sig)if(!(name in raw)){assert(name.startsWith('hnf_')&&kind.endsWith('Buffer'),name);raw[name]=Array(hcap).fill(77n);}
   if(backend==='gmp')nativeInputs.push({backend,field,names:sig,input:JSON.parse(JSON.stringify(raw,(_,x)=>typeof x==='bigint'?String(x):x))});
   const status=chain[backend](...sig.map(([name])=>raw[name]));assert.equal(status,BigInt(result.hnfStatus));assert.equal(raw.relation_state[0],BigInt(expected.last));assert.deepEqual(raw.relation_records.slice(0,expected.last*kc).map(Number),expected.records);assert.deepEqual(raw.generators.slice(0,expected.last*n).map(String),expected.generators);assert.deepEqual(raw.log_embeddings.slice(0,7*ru*expected.last).map(String),expected.logs);
   if(status===0n){for(const [key,name]of [['H','hnf_result_h'],['D','hnf_result_dep'],['B','hnf_result_b'],['C','hnf_result_c']])assert.deepEqual(raw[name].slice(0,expected[key].length).map(String),expected[key]);assert.deepEqual(raw.hnf_perm.map(Number),expected.hnfPerm);
    const nh=Number(raw.hnf_state[0]),nb=Number(raw.hnf_state[2]),nc=expected.last;nativeOutputs.push({backend,field,degree:n,logRows:ru,factorCount:kc,H:raw.hnf_result_h.slice(0,expected.H.length).map(String),D:raw.hnf_result_dep.slice(0,expected.D.length).map(String),B:raw.hnf_result_b.slice(0,expected.B.length).map(String),C:raw.hnf_result_c.slice(0,expected.C.length).map(String),perm:raw.hnf_perm.map(Number),hnfState:[nh,nc-nb,nb,kc-nb-nh,nc-nb-nh],rawHnfState:raw.hnf_state.slice(0,9).map(Number),records:raw.relation_records.slice(0,nc*kc).map(String),generators:raw.generators.slice(0,nc*n).map(String),metadata:raw.relation_metadata.slice(0,nc*3).map(String),relationState:raw.relation_state.map(String)});
   }
   native.push({backend,field,hnfStatus:Number(status),relations:expected.last});
  }
 }
 const summary={result:[{field,...result}],native,policy:'PARI 2.17.4 defaults cbach=cbach2=0,Nrelid=4,RELSUP=5,actual FBgen and subFBgen,initial j0=0 small_norm; prepared nf at192 bits, prime decompositions/ideal HNFs/embedding arithmetic; no retries or completeness claim',sourceHash:hash(control),traceSha256:hash(JSON.stringify(expected)),qualifiedTiming:false,artifactDirectory:dir};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,inputs:[v],names:template.names,hsig,expected:[{...expected,initialPerm:expected.perm,perm:expected.hnfPerm}],nativeOutputs,nativeInputs}));
 console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
