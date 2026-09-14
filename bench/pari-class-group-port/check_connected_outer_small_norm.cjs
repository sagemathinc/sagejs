"use strict";
// Pinned source/block oracle with the REAL small_norm/Fincke-Pohst collector.
// Inputs remain the four tuning fields and prepared factor-base/cache state.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const {source}=require('./collector_c_control.cjs');
function run(cmd,args,options={}){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
function slice(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i);return s.slice(i,j);}
(async()=>{
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_prepared_small_norm.cjs'),pari,archive,'--export-fixtures','--unreduced','--distinct','--construct-primes','--distinguished','--selected-exponent']));
 const pristine=run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']);
 let control=source(pristine,{unreduced:true});
 let small=slice(pristine,'static void\nsmall_norm(','\nstatic GEN\nget_random_ideal(');
 const smallHash=createHash('sha256').update(small).digest('hex');
 small=small.replace('small_norm(','recorded_small_norm(').replace('Fincke_Pohst_ideal(cache,','prepared_collector(cache,').replace('&Nsmall, &Nfact))','&Nsmall, &Nfact, NULL, NULL, outer_stats))');
 assert(small.includes('NULL, NULL, outer_stats'));
 const close=small.lastIndexOf('}');small=small.slice(0,close)+'outer_ns=Nsmall;outer_nf=Nfact;outer_exponent=e0;\n'+small.slice(close);
 let block=slice(pristine,'      if (need > 0 && Nrelid > 0','      if (need > 0)\n      { /* Random relations */');
 const blockHash=createHash('sha256').update(block).digest('hex');
 block=block.replace('if (lg(F.L_jid) > 1) small_norm(',
  'entered=1;called=(lg(F.L_jid)>1);selected_j=j;\n        if (lg(F.L_jid) > 1) recorded_small_norm(');
 const replace=(a,b)=>{assert.equal(control.split(a).length,2,a);control=control.replace(a,b);};
 replace('int main(int argc,char **argv)',`static long *outer_stats;static long outer_ns,outer_nf,outer_exponent;
${small}
static void outer_vec(GEN v){putchar('[');for(long i=1;i<lg(v);i++){if(i>1)putchar(',');printf("%ld",v[i]);}putchar(']');}
int main(int argc,char **argv)`);
 replace('for(long scenario=0;scenario<4;scenario++) {','for(long variant=0;variant<7;variant++) {long scenario=1;');
 const cEntry=slice(control,'    clock_gettime(CLOCK_MONOTONIC,&begin);','    if(rep==repetitions-1) {');
 replace(cEntry,`    long need=100,Nrelid=quotas[scenario],done_small=(variant==1||variant==2||variant==6)?1:0;
    long small_fail=2,fail_limit=2,RU=nf_get_r1(nf)+nf_get_r2(nf),i,entered=0,called=0,selected_j=0;
    GEN A=NULL,R=variant==2?gen_1:NULL,W=zerovec(variant==2?2:0);
    GEN small_multiplier=zero_Flv(total);if(variant==6)small_multiplier[1]=total;
    F.perm=cgetg(total+1,t_VECSMALL);F.perm[1]=offsets[3]+1;F.perm[2]=1;
    long at=3;for(long id=1;id<=total;id++)if(id!=F.perm[1]&&id!=1)F.perm[at++]=id;
    F.minidx=identity_perm(total);F.sfb_chg=9;
    F.L_jid=variant==3?cgetg(1,t_VECSMALL):mkvecsmall2(offsets[3]+1,1);
    if(variant==4)need=0;if(variant==5)Nrelid=0;
    if(variant==2){C.missing=0;for(long id=1;id<=total;id++)mael(C.basis,id,id)=1;}
    if(need>0)F.L_jid=trim_list(&F);
    outer_stats=stats;outer_ns=outer_nf=outer_exponent=0;
    long status=0;
#define cache C
${block}
#undef cache
    ns=outer_ns;nfactors=outer_nf;
`);
 replace('4*f+scenario,repetitions,elapsed,status','7*f+variant,repetitions,elapsed,status');
 replace('puts("]}");',`printf("],\\"small\\":%ld,\\"outer\\":[%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld],\\"phase\\":%ld,\\"j\\":%ld,\\"exponent\\":%ld,\\"live\\":",ns,need,Nrelid,done_small,small_fail,fail_limit,(long)(C.last-C.base),(long)(C.end-C.base),(long)C.missing,(long)F.sfb_chg,entered?(called?1L:2L):3L,selected_j,outer_exponent);outer_vec(F.L_jid);printf(",\\"multiplier\\":");outer_vec(small_multiplier);puts("}");`);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-connected-outer-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const trace=run(exe,[]),expected=trace.trim().split('\n').map(JSON.parse).map(({index,seconds,repetitions,...r})=>r);
 assert.equal(expected.length,28);
 const inputs=expected.map((e,index)=>{
  const field=Math.floor(index/7),variant=index%7,v=structuredClone(fixture.cases[field*4+1].input),kc=v.relation.length;
  const ids=v.search_ideals.map(Number),perm=[...ids,...Array.from({length:kc},(_,i)=>i+1).filter(i=>!ids.includes(i))];
  const done=[1,2,6].includes(variant)?1:0,lie=variant===2;
  Object.assign(v,{outer_mode:'1',outer_ru:String((Number(v.n)+Number(v.admission_real_count))/2),outer_state:[variant===4?0:100,variant===5?0:1,done,2,2,0,0,0,9,0,0,0,0,0,0,lie?1:0,lie?2:0,0,0].map(String),outer_minidx:Array.from({length:kc},(_,i)=>String(i+1)),outer_present:Array(kc).fill('0'),outer_live:Array(kc).fill('77'),outer_perm:perm.map(String),outer_multiplier:Array(kc).fill('0')});
  if(variant===3)v.search_count='0';
  if(variant===6)v.outer_multiplier[0]=String(kc);
  if(lie){v.relation_state[2]='0';for(let i=0;i<kc;i++)v.relation_basis[i*kc+i]='1';}
  v.search_ideals.push('0','999999');
  // j/e0/mode are selected inside the closure; these cannot be policy inputs.
  v.jid0='0';v.e0='0';v.construct_primes='0';
  return v;
 });
 const names=fixture.names,entry=fixture.entry;
 run('python3',['-c',`import sys,json,decimal,importlib
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.unreduced_small_norm');f=m.pari_collect_unreduced_ideals
d=json.load(sys.stdin)
power_calls=[0];original_power=m.pari_positive_prime_power_hnf
def counted_power(*args):
 power_calls[0]+=1
 return original_power(*args)
m.pari_positive_prime_power_hnf=counted_power
target_hits=0
def values(raw):
 v={}
 for name,kind in d['names']:
  conv=float if kind in ('float','Float64Buffer') else int;x=raw[name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 return v
for index,(raw,e) in enumerate(zip(d['inputs'],d['expected'])):
 power_calls[0]=0
 v=values(raw);before_search=v['search_ideals'][:]
 result=f(*(v[name] for name,kind in d['names']));last=v['relation_state'][0];n=v['n'];kc=len(v['relation'])
 actual=dict(status=result,small=v['counters'][1],trials=v['state'][1],attempts=v['counters'][0],relid=v['progress'][0],nfact=v['progress'][1],fact_count=v['counters'][2],last=last,missing=v['relation_state'][2],sup=v['relation_state'][3],basis=v['relation_basis'],hashes=v['relation_hashes'][:last],records=v['relation_records'][:last*kc],generators=list(map(str,v['generators'][:last*n])),outer=v['outer_state'][:9],phase=v['outer_state'][17],j=v['outer_state'][12],exponent=v['power_metadata'][4] if v['outer_state'][17]==1 and v['outer_state'][12] else 0,live=v['outer_live'][:v['outer_state'][13]],multiplier=v['outer_multiplier'])
 if index%7==4:actual['live']=v['search_ideals'][:v['search_count']]
 assert actual==e,(index,actual,e)
 target_hits+=int(v['schedule'][3]==1 and v['outer_state'][17]==1)
 expected_powers=int(e['phase']==1 and e['j']!=0)
 assert power_calls[0]==expected_powers
 assert v['search_ideals']==before_search
 before=str(v);assert f(*(v[name] for name,kind in d['names']))==result and str(v)==before
 assert power_calls[0]==expected_powers
assert target_hits>0,'must finish the real cache-target return 1'
v=values(d['inputs'][2]);v['relation_state'][1]=1;v['relation_state'][5]=1;before=str(v)
try:f(*(v[name] for name,kind in d['names']))
except ValueError as e:assert 'insufficient prepared LIE cache capacity' in str(e)
else:raise AssertionError('short LIE target accepted')
assert str(v)==before,'capacity rejection must precede all pivot/list mutations'
# Actual numerical dependency failure, including active LIE pivots, must not
# be normalized to success or execute the upstream outer finish.
for index in [0,2]:
 v=values(d['inputs'][index]);v['preparation_rounded_embedding']=[0]*len(v['preparation_rounded_embedding'])
 result=f(*(v[name] for name,kind in d['names']))
 assert result==-11 and v['outer_state'][17:]==[4,-11] and v['outer_state'][9]==1,(result,v['outer_state'])
 assert v['outer_state'][0]==100 and v['outer_state'][2]==(1 if index==2 else 0) and v['outer_state'][8]==9
 if index==2:
  for p in v['outer_perm'][:2]:assert v['relation_basis'][(p-1)*(len(v['relation'])+1)]==0
 before=str(v);assert f(*(v[name] for name,kind in d['names']))==result and str(v)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({names,inputs,expected})});
 const built=await compileKernel({sourcePath:path.join(__dirname,'unreduced_small_norm.py')}),f=require(built.modulePath)[entry];assert(f.nativeAvailable);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call|v8::/);
 const values=raw=>Object.fromEntries(names.map(([name,kind])=>{const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=raw[name];return [name,Array.isArray(x)?x.map(conv):conv(x)];}));
 const targetHits={javascript:0,gmp:0};
 for(const backend of ['javascript','gmp'])for(let index=0;index<inputs.length;index++){
  const v=values(inputs[index]),e=expected[index],invoke=()=>f[backend](...names.map(([name])=>v[name])),result=invoke(),last=Number(v.relation_state[0]),n=Number(v.n),kc=v.relation.length;
  const actual={status:Number(result),small:Number(v.counters[1]),trials:Number(v.state[1]),attempts:Number(v.counters[0]),relid:Number(v.progress[0]),nfact:Number(v.progress[1]),fact_count:Number(v.counters[2]),last,missing:Number(v.relation_state[2]),sup:Number(v.relation_state[3]),basis:v.relation_basis.map(Number),hashes:v.relation_hashes.slice(0,last).map(Number),records:v.relation_records.slice(0,last*kc).map(Number),generators:v.generators.slice(0,last*n).map(String),outer:v.outer_state.slice(0,9).map(Number),phase:Number(v.outer_state[17]),j:Number(v.outer_state[12]),exponent:v.outer_state[17]===1n&&v.outer_state[12]!==0n?Number(v.power_metadata[4]):0,live:v.outer_live.slice(0,Number(v.outer_state[13])).map(Number),multiplier:v.outer_multiplier.map(Number)};
  if(index%7===4)actual.live=v.search_ideals.slice(0,Number(v.search_count)).map(Number);
  assert.deepEqual(actual,e,'case '+index+' '+backend);
  if(v.schedule[3]===1n&&v.outer_state[17]===1n)targetHits[backend]++;
  assert.deepEqual(v.search_ideals,inputs[index].search_ideals.map(BigInt));
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),result);assert.equal(dump(),before);
 }
 assert(targetHits.javascript>0&&targetHits.gmp>0,'must finish the real cache-target return 1');
 for(const backend of ['javascript','gmp']){
  const v=values(inputs[2]);v.relation_state[1]=1n;v.relation_state[5]=1n;
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();
  assert.throws(()=>f[backend](...names.map(([name])=>v[name])),/insufficient prepared LIE cache capacity/);assert.equal(dump(),before);
 }
 for(const backend of ['javascript','gmp'])for(const index of [0,2]){
  const v=values(inputs[index]);v.preparation_rounded_embedding.fill(0n);
  const invoke=()=>f[backend](...names.map(([name])=>v[name]));assert.equal(invoke(),-11n);
  assert.deepEqual(v.outer_state.slice(17),[4n,-11n]);assert.equal(v.outer_state[9],1n);assert.equal(v.outer_state[0],100n);assert.equal(v.outer_state[2],index===2?1n:0n);assert.equal(v.outer_state[8],9n);
  if(index===2)for(const p of v.outer_perm.slice(0,2))assert.equal(v.relation_basis[Number(p-1n)*(v.relation.length+1)],0n);
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),-11n);assert.equal(dump(),before);
 }
 assert(expected.some(r=>r.phase===1&&r.j===0&&r.last>0));assert(expected.some(r=>r.phase===1&&r.j===1&&r.last>0));
 assert(expected.some(r=>r.phase===2));assert(expected.some(r=>r.phase===3));
 console.log(JSON.stringify({cases:expected.length,numericalFailureCases:2,targetHits,smallHash,blockHash,traceSha256:createHash('sha256').update(JSON.stringify(expected)).digest('hex'),coreBytes:fs.statSync(built.coreSourcePath).size,qualifiedTiming:false,boundary:'prepared factor base/minidx/perm/A/R/W/need/allocation; real resident relation collection'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
