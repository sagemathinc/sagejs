"use strict";
// Diagnostic expanded, genuine small_norm collection, without invented relations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {source}=require('./collector_c_control.cjs');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:120000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function part(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,a);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 assert.equal(createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),'02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53');
 const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct']));
 let control=source(pristine,{unreduced:true});
 const replace=(a,b)=>{assert.equal(control.split(a).length,2,a);control=control.replace(a,b);};
 let small=part(pristine,'static void\nsmall_norm(','\nstatic GEN\nget_random_ideal(');
 const smallHash=createHash('sha256').update(small).digest('hex');
 small=small.replace('small_norm(','recorded_small_norm(').replace('Fincke_Pohst_ideal(cache,','prepared_collector(cache,').replace('&Nsmall, &Nfact))','&Nsmall, &Nfact, NULL, NULL, recorded_stats))');
 replace('int main(int argc,char **argv)',`static long *recorded_stats;\n${small}
static void exactmat(GEN A){putchar('[');for(long j=1;j<lg(A);j++)for(long i=1;i<lg(gel(A,j));i++){if(j!=1||i!=1)putchar(',');pari_printf("\\\"%Ps\\\"",gcoeff(A,i,j));}putchar(']');}
static void scalar(GEN x){long e;if(typ(x)==t_INT){pari_printf("\\\"%Ps\\\",\\\"-1\\\",\\\"0\\\"",x);return;}pari_printf("\\\"%Ps\\\",\\\"%ld\\\",\\\"%ld\\\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));}
static void logmat(GEN A){putchar('[');for(long j=1;j<lg(A);j++)for(long i=1;i<lg(gel(A,j));i++){if(j!=1||i!=1)putchar(',');GEN x=gcoeff(A,i,j);if(typ(x)==t_COMPLEX){printf("\\\"2\\\",");scalar(gel(x,1));putchar(',');scalar(gel(x,2));}else{printf("\\\"1\\\",");scalar(x);printf(",\\\"0\\\",\\\"-1\\\",\\\"0\\\"");}}putchar(']');}
int main(int argc,char **argv)`);
 replace('long quotas[]={0,1,8,8},targets[]={100,100,2,100};','long quotas[]={8},targets[]={400};');
 replace('for(long scenario=0;scenario<4;scenario++) {','for(long scenario=0;scenario<1;scenario++) {');
 replace('double qq[11][11]={{0}}','for(long prime=2;prime<lg(F.LV);prime++)if(F.iLP[prime]>=0){GEN group=gel(F.LV,prime),initial=zero_zv(F.KC);long offset=F.iLP[prime];for(long j=1;j<lg(group);j++)initial[offset+j]=pr_get_e(gel(group,j));(void)add_rel_i(&C,initial,offset+1,stoi(prime),0,0,NULL,0);}\n    double qq[11][11]={{0}}');
 replace('emit_integer(gel(C.base[j].m,i));','emit_integer(typ(C.base[j].m)==t_INT?(i==1?C.base[j].m:gen_0):gel(C.base[j].m,i));');
 replace('long status=prepared_collector(&C,&F,nf,I,NI,fact,quotas[scenario],&fp,NULL,\n      offsets[2]+1,0,0,&ns,&nfactors,ideal,matrix,stats);','F.L_jid=identity_perm(total);recorded_stats=stats;recorded_small_norm(&C,&F,nf,quotas[scenario],fact,0);long status=0;');
 replace('puts("]}");',`printf("],\\\"packets\\\":[");for(long j=1;j<=total;j++){if(j>1)putchar(',');GEN I=pr_hnf(nf,gel(F.LP,j));printf("{\\\"norm\\\":");pari_printf("\\\"%Ps\\\"",pr_norm(gel(F.LP,j)));printf(",\\\"ideal\\\":[");for(long i=1;i<=n;i++)for(long k=1;k<=n;k++){if(i!=1||k!=1)putchar(',');pari_printf("\\\"%Ps\\\"",gcoeff(I,i,k));}printf("]}");}
     GEN rels=cgetg(count+1,t_MAT),logs=cgetg(count+1,t_MAT);long ru=nf_get_r1(nf)+nf_get_r2(nf);
     for(long j=1;j<=count;j++){gel(rels,j)=C.base[j].R;gel(logs,j)=get_log_embed(C.base+j,nf_get_M(nf),ru,nf_get_r1(nf),128);}
     printf("],\\\"logs\\\":");logmat(logs);
     GEN perm=identity_perm(total),D=NULL,B=NULL,H=hnfspec_i(rels,perm,&D,&B,&logs,0);
     long nc=lg(logs)-1,nh=lg(H)-1,nb=lg(B)-1;
     printf(",\\\"H\\\":");exactmat(H);printf(",\\\"D\\\":");exactmat(D);printf(",\\\"B\\\":");exactmat(B);printf(",\\\"C\\\":");logmat(logs);
     printf(",\\\"perm\\\":[");for(long j=1;j<=total;j++){if(j>1)putchar(',');printf("%ld",perm[j]);}
     printf("],\\\"hnfState\\\":[%ld,%ld,%ld,%ld,%ld],\\\"field\\\":%ld",nh,nc-nb,nb,total-nb-nh,nc-nb-nh,f);
     GRHcheck_t S;long r1=nf_get_r1(nf),r2=nf_get_r2(nf);GEN disc=absi_shallow(nf_get_disc(nf));double ld=dbllog2(disc)*M_LN2;long lim=primeneeded(n,r1,r2,ld);init_GRHcheck(&S,n,r1,ld);cache_prime_dec(&S,lim,nf);GEN invhr=gmul(gdiv(gmul2n(powru(mppi(DEFAULTPREC),r2),ru),mulri(gsqrt(disc,DEFAULTPREC),gel(nfrootsof1(nf),1))),compute_invres(&S,lim));printf(",\\\"inverseHR\\\":[");scalar(invhr);printf("],\\\"residueBound\\\":%ld}\\n",lim);free_GRHcheck(&S);`);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-collector-dependencies-'));fs.writeFileSync(path.join(dir,'oracle.c'),control);
 run('cc',['-O1','-fsanitize=undefined','-fno-sanitize-recover=undefined','-I'+path.join(pari,'src/headers'),'-I'+lib,path.join(dir,'oracle.c'),'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',path.join(dir,'oracle')]);
 const expected=run(path.join(dir,'oracle'),[]).trim().split('\n').map(JSON.parse);
 fs.writeFileSync(path.join(dir,'source-fixtures.json'),JSON.stringify(expected));
 const inputs=expected.map((e,i)=>{const v=structuredClone(fixture.cases[i*4+3].input),n=Number(v.n),kc=v.relation.length,capacity=10*(kc+2)+50;Object.assign(v,{nrelid:'8',search_ideals:Array.from({length:kc},(_,j)=>String(j+1)),search_count:String(kc),packet_ids:Array.from({length:kc},(_,j)=>String(j+1)),packet_ideals:e.packets.flatMap(r=>r.ideal),packet_norms:e.packets.map(r=>r.norm)});v.relation_state[1]=String(capacity);v.relation_state[5]='400';for(const [key,width]of [['relation_records',kc],['relation_hashes',1],['relation_metadata',3],['generators',n]])v[key]=Array(capacity*width).fill('0');return v;});
 const hsig=fs.readFileSync(path.join(__dirname,'hnfspec_complete.py'),'utf8').match(/def pari_hnfspec_complete\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const result=JSON.parse(run('python3',['-c',`import json,sys,importlib,decimal
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3]
d=json.load(sys.stdin);collect=importlib.import_module('bench.pari-class-group-port.unreduced_small_norm').pari_collect_unreduced_ideals;hnf=importlib.import_module('bench.pari-class-group-port.hnfspec_complete').pari_hnfspec_complete;initialize=importlib.import_module('bench.pari-class-group-port.relation_insertion').pari_initialize_owned_relations;append=importlib.import_module('bench.pari-class-group-port.relation_log_embeddings').pari_append_relation_log_embeddings
out=[]
for raw,e in zip(d['inputs'],d['expected']):
 v={}
 for name,kind in d['names']:
  conv=float if kind in ('float','Float64Buffer') else int;x=raw[name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 primes=[p for p,count in enumerate(v['admission_prime_counts']) if count];initialize(2,primes,[v['admission_prime_offsets'][p] for p in primes],[v['admission_prime_counts'][p] for p in primes],[1]*len(primes),v['ramification'],v['relation_state'],v['relation_basis'],v['relation_records'],v['relation_hashes'],v['relation_metadata'],v['relation'],v['relation_scratch'],v['n'],v['generators']);v['relation_state'][5]=400
 status=collect(**v);last=v['relation_state'][0];kc=len(v['relation']);n=v['n'];ru=(n+v['admission_real_count'])//2
 assert status==0,(status,v['preparation_state'])
 for key,actual in [('last',last),('records',v['relation_records'][:last*kc]),('generators',list(map(str,v['generators'][:last*n]))),('basis',v['relation_basis']),('missing',v['relation_state'][2])]:assert actual==e[key],(key,actual,e[key])
 logs=[0]*(7*ru*last);completed=[0];append(v['admission_matrix_m'],v['admission_matrix_p'],v['admission_matrix_e'],v['generators'],v['relation_metadata'],last,n,v['admission_real_count'],128,completed,logs,[0]*n,[0]*(7*ru),[0]*3,[0]*3,[0]*64,[0]*64,[0]*64,[0]*64,[0]*128);assert logs==list(map(int,e['logs'])),('logs',e['field']);assert completed==[last]
 cap=max(64,(kc+last)**2,7*ru*(kc+last));w={name:[77]*cap for name,kind in d['hsig'] if kind!='int'}
 w.update(original=v['relation_records'][:last*kc],rows=kc,columns=last,perm=list(range(1,kc+1)),k0=0,logs=logs,log_rows=ru)
 w.update(cup_arena=[77]*160000,cup_frames=[77]*32,cup_solve_state=[77]*8,cup_state=[77]*8)
 hs=hnf(**w)
 if hs==0:
  for key,name in [('H','result_h'),('D','result_dep'),('B','result_b'),('C','result_c')]:want=list(map(int,e[key]));assert w[name][:len(want)]==want,key
  assert w['perm']==e['perm'],('perm',w['perm'],e['perm']);assert [w['state'][i] for i in (0,1,2,4)]==[e['hnfState'][i] for i in (0,1,2,4)],('state',w['state'][:9],e['hnfState'])
 out.append({'field':e['field'],'relations':last,'hnfStatus':hs,'state':w['state'][:9]})
print(json.dumps(out))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({inputs,expected,names:fixture.names,hsig})}));
 const native=[],nativeOutputs=[];
 if(process.argv.includes('--native')){
  const load=async name=>{const built=await compileKernel({sourcePath:path.join(__dirname,name+'.py')});assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);return require(built.modulePath);};
  const collect=(await load('collected_log_embeddings')).pari_collect_and_log_relations,initialize=(await load('relation_insertion')).pari_initialize_owned_relations,hnf=(await load('hnfspec_complete')).pari_hnfspec_complete;
  assert(collect.nativeAvailable&&initialize.nativeAvailable&&hnf.nativeAvailable);
  for(const backend of ['javascript','gmp'])for(let i=0;i<inputs.length;i++){
   const e=expected[i],v=Object.fromEntries(fixture.names.map(([name,kind])=>{const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[i][name];return [name,Array.isArray(x)?x.map(conv):conv(x)];})),n=Number(v.n),ru=(n+Number(v.admission_real_count))/2,kc=v.relation.length;
   const primes=v.admission_prime_counts.flatMap((x,p)=>x?[BigInt(p)]:[]);initialize[backend](2n,primes,primes.map(p=>v.admission_prime_offsets[Number(p)]),primes.map(p=>v.admission_prime_counts[Number(p)]),primes.map(()=>1n),v.ramification,v.relation_state,v.relation_basis,v.relation_records,v.relation_hashes,v.relation_metadata,v.relation,v.relation_scratch,v.n,v.generators);v.relation_state[5]=400n;
   const completed=[0n],logs=Array(Number(v.relation_state[1])*7*ru).fill(0n);const status=collect[backend](...fixture.names.map(([name])=>v[name]),128n,completed,logs,Array(n).fill(0n),Array(7*ru).fill(0n),Array(3).fill(0n),Array(3).fill(0n),Array(64).fill(0n),Array(64).fill(0n),Array(64).fill(0n),Array(64).fill(0n),Array(128).fill(0n));assert.equal(status,0n);
   const last=Number(v.relation_state[0]);assert.equal(last,e.last);assert.deepEqual(v.relation_records.slice(0,last*kc).map(Number),e.records);assert.deepEqual(v.generators.slice(0,last*n).map(String),e.generators);assert.deepEqual(logs.slice(0,last*7*ru).map(String),e.logs);assert.equal(completed[0],BigInt(last));
   const cap=Math.max(64,(kc+last)**2,7*ru*(kc+last)),w=Object.fromEntries(hsig.filter(([,kind])=>kind!=='int').map(([name])=>[name,Array(cap).fill(77n)]));Object.assign(w,{original:v.relation_records.slice(0,last*kc),rows:BigInt(kc),columns:BigInt(last),perm:Array.from({length:kc},(_,j)=>BigInt(j+1)),k0:0n,logs:logs.slice(0,last*7*ru),log_rows:BigInt(ru)});
   Object.assign(w,{cup_arena:Array(160000).fill(77n),cup_frames:Array(32).fill(77n),cup_solve_state:Array(8).fill(77n),cup_state:Array(8).fill(77n)});
   const hs=hnf[backend](...hsig.map(([name])=>w[name]));assert.equal(hs,BigInt(result[i].hnfStatus));if(hs===0n){for(const [key,name]of [['H','result_h'],['D','result_dep'],['B','result_b'],['C','result_c']])assert.deepEqual(w[name].slice(0,e[key].length).map(String),e[key]);assert.deepEqual(w.perm.map(Number),e.perm);}
   native.push({backend,field:i,relations:last,hnfStatus:Number(hs)});
   if(hs===0n){const nh=Number(w.state[0]),nb=Number(w.state[2]),nc=last;nativeOutputs.push({backend,field:i,degree:n,logRows:ru,factorCount:kc,H:w.result_h.slice(0,nh*nh).map(String),D:w.result_dep.slice(0,(kc-nb-nh)*nh).map(String),B:w.result_b.slice(0,(kc-nb)*nb).map(String),C:w.result_c.slice(0,7*ru*nc).map(String),perm:w.perm.map(Number),hnfState:[nh,nc-nb,nb,kc-nb-nh,nc-nb-nh],rawHnfState:w.state.slice(0,9).map(Number),records:v.relation_records.slice(0,last*kc).map(String),generators:v.generators.slice(0,last*n).map(String),metadata:v.relation_metadata.slice(0,last*3).map(String),relationState:v.relation_state.map(String)});}
  }
 }
 const summary={result,native,smallHash,traceSha256:createHash('sha256').update(JSON.stringify(expected.map(({seconds,...r})=>r))).digest('hex'),qualifiedTiming:false,preparedBoundary:'Four tuning fields; all prime ideals above p<=101; prepared prime ideal HNFs, factor base, nf embeddings and ballvol=500; rational-prime cache initialization then upstream small_norm descending list and quota 8; no invented or repeated relations. Same-source collector, weighted logs and complete HNF replay. Analytic inverse hR is supplied by upstream primeneeded/compute_invres and normalization, never a class-number or regulator answer.'};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,inputs,names:fixture.names,expected,hsig,nativeOutputs}));summary.artifactDirectory=dir;
 if(process.argv.includes('--export-fixtures'))console.log(JSON.stringify({summary,inputs,names:fixture.names,expected,hsig,nativeOutputs}));else console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exit(1);});
