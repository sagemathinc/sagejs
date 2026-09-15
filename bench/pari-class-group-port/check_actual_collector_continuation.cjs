"use strict";
// Diagnostic continuation: source acceptance decisions remain explicit inputs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const hash=x=>createHash('sha256').update(x).digest('hex');
function run(c,a,o={}){const r=spawnSync(c,a,{encoding:'utf8',timeout:240000,maxBuffer:128*1024*1024,...o});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const signature=(file,name)=>fs.readFileSync(path.join(__dirname,file),'utf8').match(new RegExp('def '+name+'\\(([\\s\\S]*?)\\n\\)'))[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
(async()=>{
 const fixture=JSON.parse(fs.readFileSync(process.argv[2])),trace=JSON.parse(fs.readFileSync(process.argv[3])),entry=fixture.nativeInputs.find(x=>x.field===2&&x.backend==='gmp');assert(entry,'requires field2 actual initialized packet');
 const expected=fixture.expected.find(x=>x.field===2),raw=structuredClone(entry.input),kc=raw.relation.length,n=Number(raw.n),ru=(n+Number(raw.admission_real_count))/2;
 const firstNames=signature('connected_relation_hnf.py','pari_connected_relation_hnf'),nextNames=signature('collected_log_embeddings.py','pari_collect_and_log_relations');
 Object.assign(raw,{outer_mode:'1',outer_ru:String(ru),outer_state:[Number(raw.initial_target)-expected.initialCount,Number(raw.nrelid),0,0,kc+1,0,0,0,0,0,0,0,0,0,0,0,0,0,0].map(String),outer_minidx:expected.minidx.map(String),outer_present:Array(kc).fill('0'),outer_live:Array(kc).fill('0'),outer_perm:raw.hnf_perm.slice(),outer_multiplier:Array(kc).fill('0')});
 while(raw.power_metadata.length<5)raw.power_metadata.push('0');
 const appends=trace.filter(x=>x.event==='hnfadd_input'),searches=trace.filter(x=>x.event==='collector_search');assert.equal(appends.length,2);assert.equal(searches.length,3);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-actual-collector-continuation-'));
 // The original packet includes HNF ideals but not pr_get_gen. Export that
 // prepared nf descriptor, retaining the exact upstream prime-ideal ordering.
 const pari='/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4',lib=path.join(pari,'Olinux-x86_64');
 const desc=path.join(dir,'prime-descriptors.c'),exe=path.join(dir,'prime-descriptors');
 fs.writeFileSync(desc,`#include "pari.h"\n#include "paripriv.h"\nint main(void){pari_init(256000000,10000);GEN nf=nfinit(gp_read_str("x^4-20018*x-20034"),nbits2prec(192));putchar('[');for(long i=1;i<=4;i++)for(long j=1;j<=4;j++){GEN v=tablemul_ei_ej(nf,i,j);for(long k=1;k<=4;k++){if(i!=1||j!=1||k!=1)putchar(',');pari_printf("\\\"%Ps\\\"",gel(v,k));}}puts("]");long count;scanf("%ld",&count);for(long t=0;t<count;t++){long p,j;scanf("%ld %ld",&p,&j);GEN all=idealprimedec(nf,utoipos(p)),pr=gel(all,j),g=pr_get_gen(pr);putchar('[');for(long i=1;i<=4;i++){if(i>1)putchar(',');pari_printf("\\\"%Ps\\\"",gel(g,i));}puts("]");}pari_close();}`);
 run('cc',['-O1','-I'+path.join(pari,'src/headers'),'-I'+lib,desc,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const descriptors=expected.groups.flatMap(g=>g.ideals.map(pr=>({p:g.p,index:pr.index-expected.catalog.find(x=>x[0]===g.p)[1]+1,inert:pr.inert})));
 raw.packet_primes=descriptors.map(x=>String(x.p));raw.packet_inert=descriptors.map(x=>String(x.inert));
 const descriptorRows=run(exe,[],{input:[descriptors.length,...descriptors.flatMap(x=>[x.p,x.index])].join(' ')}).trim().split('\n').map(JSON.parse);
 raw.basis_table=descriptorRows[0];raw.packet_generators=descriptorRows.slice(1).flat();
 const cp=JSON.parse(run('python3',['-c',`import sys,json,importlib,copy,decimal
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
first=importlib.import_module('bench.pari-class-group-port.connected_relation_hnf').pari_connected_relation_hnf
collect=importlib.import_module('bench.pari-class-group-port.collected_log_embeddings').pari_collect_and_log_relations
prepare=importlib.import_module('bench.pari-class-group-port.collector_next_pass').pari_prepare_next_small_norm_pass
v={}
for name,kind in d['firstNames']:
 conv=float if kind in ('float','Float64Buffer') else int;x=d['raw'][name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
assert first(**{k:v[k] for k,t in d['firstNames']})==0
e=d['expected'];kc=len(v['relation']);n=v['n'];ru=(n+v['admission_real_count'])//2;last=v['relation_state'][0]
assert last==e['last'];assert v['relation_records'][:last*kc]==e['records'];assert list(map(str,v['generators'][:last*n]))==e['generators'];assert list(map(str,v['log_embeddings'][:last*7*ru]))==e['logs'];assert v['hnf_perm']==e['hnfPerm']
# Literal first !A transition before compute_multiple_of_R.
v['outer_state'][3]=0;v['outer_state'][4]=max(kc//32,10)
outputs=[]
for ix,a in enumerate(d['appends']):
 old=v['relation_state'][0];records=v['relation_records'][:old*kc];gens=v['generators'][:old*n];logs=v['log_embeddings'][:old*7*ru]
 # Source first and second HNF both have W empty, hence full F.perm search.
 # A/R/need come from the explicitly supplied source acceptance decision.
 v['search_ideals'][:]=v['hnf_perm'];v['search_count']=kc;v['outer_perm'][:]=v['hnf_perm'];v['relation_state'][4]=old
 assert v['search_ideals']==d['searches'][ix+1]['search'];assert v['outer_perm']==d['searches'][ix+1]['perm']
 assert prepare(1,1,1,0,1,v['outer_state'],v['relation_state'],v['schedule'],v['log_completed'])==0
 status=collect(**{k:v[k] for k,t in d['nextNames']});assert status==0,(ix,status,v['power_metadata'],v['preparation_state'])
 last=v['relation_state'][0];assert last==a['last'];assert old==a['chk'];assert v['outer_state'][12]==ix+1
 assert v['relation_records'][:old*kc]==records and v['generators'][:old*n]==gens and v['log_embeddings'][:old*7*ru]==logs
 newrecords=v['relation_records'][old*kc:last*kc];newgens=list(map(str,v['generators'][old*n:last*n]));newlogs=list(map(str,v['log_embeddings'][old*7*ru:last*7*ru]))
 assert list(map(str,newrecords))==list(map(str,a['newRelations'])),(ix,'relations',newrecords,a['newRelations'])
 assert newgens==list(map(str,a['newGenerators'])),(ix,'generators',newgens,a['newGenerators'])
 assert newlogs==a['newLogs'],(ix,'logs',newlogs,a['newLogs'])
 outputs.append(dict(j=ix+1,last=last,e0=v['power_metadata'][4],records=list(map(str,newrecords)),generators=newgens,logs=newlogs,outer=v['outer_state'][:],relationState=list(map(str,v['relation_state']))))
print(json.dumps(outputs))
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({raw,firstNames,nextNames,expected,appends,searches})}));
 const summary={field:2,passes:cp.map(x=>({j:x.j,last:x.last,e0:x.e0,generators:x.generators})),preparedDecisions:'source acceptance need=1,A=true,R=true,W empty; literal first !A reset small_fail=0,fail_limit=max(KC/32,10); no native acceptance invocation in this diagnostic',preparedInputs:'existing nf packet plus source nf multiplication table and prime descriptor generators',prefixPreservation:true,qualifiedTiming:false,artifactDirectory:dir};
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,cp,appends,preparedInput:raw,firstNames,nextNames}));
 if(process.argv.includes('--source-only')){console.log(JSON.stringify(summary));return;}
 const firstBuilt=await compileKernel({sourcePath:path.join(__dirname,'connected_relation_hnf.py')}),first=require(firstBuilt.modulePath).pari_connected_relation_hnf;
 const nextBuilt=await compileKernel({sourcePath:path.join(__dirname,'collected_log_embeddings.py')}),collect=require(nextBuilt.modulePath).pari_collect_and_log_relations;
 const prepBuilt=await compileKernel({sourcePath:path.join(__dirname,'collector_next_pass.py')}),prepare=require(prepBuilt.modulePath).pari_prepare_next_small_norm_pass;
 const outputs=[];
 for(const backend of ['gmp']){
  const v=Object.fromEntries(firstNames.map(([name,kind])=>{const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=raw[name];return [name,Array.isArray(x)?x.map(conv):conv(x)];}));
  assert.equal(first[backend](...firstNames.map(([k])=>v[k])),0n);let last=Number(v.relation_state[0]);assert.equal(last,expected.last);assert.deepEqual(v.relation_records.slice(0,last*kc).map(Number),expected.records);assert.deepEqual(v.generators.slice(0,last*n).map(String),expected.generators);assert.deepEqual(v.log_embeddings.slice(0,last*7*ru).map(String),expected.logs);assert.deepEqual(v.hnf_perm.map(Number),expected.hnfPerm);
  v.outer_state[3]=0n;v.outer_state[4]=BigInt(Math.max(Math.floor(kc/32),10));
  for(let ix=0;ix<appends.length;ix++){
   const a=appends[ix],old=last,records=v.relation_records.slice(0,old*kc),gens=v.generators.slice(0,old*n),logs=v.log_embeddings.slice(0,old*7*ru);
   v.search_ideals.splice(0,kc,...v.hnf_perm);v.search_count=BigInt(kc);v.outer_perm.splice(0,kc,...v.hnf_perm);v.relation_state[4]=BigInt(old);
   assert.deepEqual(v.search_ideals.map(Number),searches[ix+1].search);assert.deepEqual(v.outer_perm.map(Number),searches[ix+1].perm);
   assert.equal(prepare[backend](1n,1n,1n,0n,1n,v.outer_state,v.relation_state,v.schedule,v.log_completed),0n);
   assert.equal(collect[backend](...nextNames.map(([k])=>v[k])),0n);last=Number(v.relation_state[0]);assert.equal(last,a.last);assert.equal(old,a.chk);assert.equal(v.outer_state[12],BigInt(ix+1));
   assert.deepEqual(v.relation_records.slice(0,old*kc),records);assert.deepEqual(v.generators.slice(0,old*n),gens);assert.deepEqual(v.log_embeddings.slice(0,old*7*ru),logs);
   const actual={backend,j:ix+1,last,e0:Number(v.power_metadata[4]),records:v.relation_records.slice(old*kc,last*kc).map(String),generators:v.generators.slice(old*n,last*n).map(String),logs:v.log_embeddings.slice(old*7*ru,last*7*ru).map(String),outer:v.outer_state.map(Number),relationState:v.relation_state.map(String)};
   for(const k of ['j','last','e0','records','generators','logs','outer','relationState'])assert.deepEqual(actual[k],cp[ix][k],k);outputs.push(actual);
  }
 }
 summary.nativeCoreBytes=fs.statSync(nextBuilt.coreSourcePath).size;summary.backends=['CPython','gmp'];
 fs.writeFileSync(path.join(dir,'fixtures.json'),JSON.stringify({summary,cp,nativeOutputs:outputs,appends,preparedInput:raw,firstNames,nextNames}));console.log(JSON.stringify(summary));
})().catch(e=>{console.error(e);process.exitCode=1;});
