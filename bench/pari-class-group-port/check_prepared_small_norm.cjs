"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const {source}=require('./collector_c_control.cjs');
const {createHash}=require('node:crypto');
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const distinct=process.argv.includes('--distinct');
 const unreduced=process.argv.includes('--unreduced');
 const constructPrimes=process.argv.includes('--construct-primes');
 const distinguished=process.argv.includes('--distinguished');
 const selectedExponent=process.argv.includes('--selected-exponent');
 assert(!selectedExponent||distinguished,'exponent selection requires distinguished mode');
 assert(!distinguished||(constructPrimes&&distinct),'distinguished mode requires constructed distinct primes');
 assert(!constructPrimes||unreduced,'prime construction requires unreduced mode');
 const moduleName=unreduced?'unreduced_small_norm':'prepared_small_norm';
 const entry=unreduced?'pari_collect_unreduced_ideals':'pari_collect_prepared_ideals';
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 const fixtureArgs=[path.join(__dirname,'check_compiled_ideal_collector.cjs'),pari,'--export-fixtures',...(unreduced?['--unreduced']:[])];
 const fixture=JSON.parse(run(process.execPath,fixtureArgs));
 const second=distinct?JSON.parse(run(process.execPath,[...fixtureArgs,'--packet-prime=3'])):fixture;
 const primeFixtures=constructPrimes?JSON.parse(run(process.execPath,[path.join(__dirname,'check_prime_ideal_hnf.cjs'),pari,archive,'--export-fixtures'])):[];
 let control=source(run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']),{unreduced});
 function replace(a,b){assert.equal(control.split(a).length,2);control=control.replace(a,b);}
 // Repeated same-ideal visits deliberately force duplicate/cache interactions.
 // This is a handoff control, not a claim about upstream L_jid construction.
 replace('clock_gettime(CLOCK_MONOTONIC,&begin);','long status=0;for(long visit=0;visit<2;visit++){clock_gettime(CLOCK_MONOTONIC,&begin);');
 replace('long status=prepared_collector','status=prepared_collector');
 replace('elapsed+=seconds(begin,end);','elapsed+=seconds(begin,end);if(status)break;}');
 replace('puts("]}");','printf("],\\"small\\":%ld}\\n",ns);');
 if(distinct){
  replace('visit<2;visit++){clock_gettime',`visit<2;visit++){
   I=idealhnf(nf,gel(gel(groups,2+visit),1));NI=idealnorm(nf,I);
   ${unreduced?'':`u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),.99,LLL_IM);ideal=ZM_mul(I,u);
   matrix=RgM_mul(nf_get_G(nf),ideal);`}
   clock_gettime`);
  replace('offsets[2]+1,0,0,&ns','offsets[2+visit]+1,0,0,&ns');
 }
 if(distinguished){
  replace('long status=0;for(long visit=0;visit<2;visit++){',
   'GEN distinguished_pr=gel(gel(groups,2),1),distinguished_power=idealpows(nf,distinguished_pr,2);long status=0;for(long visit=0;visit<2;visit++){if(visit==0&&3%pr_get_e(distinguished_pr)==0&&pr_get_e(distinguished_pr)*pr_get_f(distinguished_pr)==n)continue;');
  replace('I=idealhnf(nf,gel(gel(groups,2+visit),1));NI=idealnorm(nf,I);',
   'I=idealmul(nf,distinguished_power,gel(gel(groups,2+visit),1));NI=idealnorm(nf,I);');
  replace('offsets[2+visit]+1,0,0,&ns','offsets[2+visit]+1,offsets[2]+1,2,&ns');
  if(selectedExponent){
   replace('GEN distinguished_pr=gel(gel(groups,2),1),distinguished_power=idealpows(nf,distinguished_pr,2);',
    'GEN distinguished_pr=gel(gel(groups,2),1);long selected_exponent=logint0(sqri(pr_norm(veclast(F.LP))),pr_norm(distinguished_pr),NULL);GEN distinguished_power=idealpows(nf,distinguished_pr,selected_exponent);');
   replace('3%pr_get_e(distinguished_pr)','(selected_exponent+1)%pr_get_e(distinguished_pr)');
   replace('offsets[2+visit]+1,offsets[2]+1,2,&ns','offsets[2+visit]+1,offsets[2]+1,selected_exponent,&ns');
  }
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-norm-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const expected=run(exe,[]).trim().split('\n').map(JSON.parse).map(({index,seconds,repetitions,...r})=>r);assert.equal(expected.length,16);
 const sourcePath=path.join(__dirname,moduleName+'.py');
 const names=fs.readFileSync(sourcePath,'utf8').match(new RegExp('def '+entry+'\\(([\\s\\S]*?)\\n\\)'))[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const inputs=fixture.cases.map(({input:v},index)=>{const w=second.cases[index].input;
  for(const name of ['n','precision','admission_matrix_m','admission_matrix_p','admission_matrix_e','admission_group_e','admission_group_f','admission_group_tau'])assert.deepEqual(v[name],w[name],name);
  const all={...v,search_ideals:[w.jid,v.jid],packet_ids:distinct?[v.jid,w.jid]:[v.jid],packet_matrices:distinct?v.matrix.concat(w.matrix):v.matrix.slice(),packet_reduced_ideals:distinct?v.ideal.concat(w.ideal):v.ideal.slice(),packet_ideals:distinct?v.admission_ideal.concat(w.admission_ideal):v.admission_ideal.slice(),packet_norms:distinct?[v.admission_ideal_norm,w.admission_ideal_norm]:[v.admission_ideal_norm],packet_skips:distinct?[v.skipfirst,w.skipfirst]:[v.skipfirst],schedule:['0','0','0','0']};
  if(unreduced){
   const n=Number(v.n),zero=k=>Array(k).fill('0');
   Object.assign(all,{construct_primes:constructPrimes?'1':'0',basis_table:[],packet_primes:[],packet_generators:[],packet_inert:[],hnf_generator:zero(n),hnf_matrix:zero(n*n),hnf_work:zero(n*n),hnf_pivots:zero(n)});
   Object.assign(all,{power_ideal:zero(n*n),power_alpha:zero(n),power_metadata:zero(4),power_primitive:zero(n),power_temporary:zero(n),power_diagnostic:zero(3),power_multiplication:zero(n*n),power_work:zero(n*(3*n+1)),power_triangular:zero(n*(n+1)),power_moduli:zero(n),product_primitive:zero(n*n),product_matrix:zero(2*n*n)});
   if(constructPrimes){
    const selected=(distinct?[2,3]:[2]).map(p=>primeFixtures.find(r=>r.field===Math.floor(index/4)&&r.p===String(p)));
    assert(selected.every(Boolean));assert.deepEqual(selected[0].output,v.admission_ideal.map(String));
    if(distinct)assert.deepEqual(selected[1].output,w.admission_ideal.map(String));
    all.basis_table=selected[0].table;all.packet_primes=selected.map(r=>r.p);all.packet_inert=selected.map(r=>String(r.inert));all.packet_generators=selected.flatMap(r=>r.generator);
    all.packet_ideals=[];all.packet_norms=[]; // no supplied ideal HNF or norm
    if(distinguished){all.construct_primes=selectedExponent?'3':'2';all.jid0=v.jid;all.e0=selectedExponent?'0':'2';if(selectedExponent)all.power_metadata.push('0');}
   }
  }
  return Object.fromEntries(names.map(([name])=>{assert.notEqual(all[name],undefined,name);return [name,all[name]];}));});
 if(process.argv.includes('--export-fixtures')){
  console.log(JSON.stringify({schema:'pari-small-norm-collector-v1',entry,names,unreduced,distinct,constructPrimes,distinguished,selectedExponent,controlSource:control,cases:inputs.map((input,index)=>({input,expected:expected[index]}))}));return;
 }
 const py=run('python3',['-c',`
import sys,json,decimal,importlib
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
f=getattr(importlib.import_module('bench.pari-class-group-port.${moduleName}'),'${entry}')
d=json.load(sys.stdin)
qr_calls=[0]
power_calls=[0]
if d['distinguished']:
 connected=importlib.import_module('bench.pari-class-group-port.unreduced_small_norm')
 original_power=connected.pari_positive_prime_power_hnf
 def counted_power(*args):
  power_calls[0]+=1
  return original_power(*args)
 connected.pari_positive_prime_power_hnf=counted_power
if d['unreduced']:
 prep=importlib.import_module('bench.pari-class-group-port.ideal_enumeration_preparation')
 enum=importlib.import_module('bench.pari-class-group-port.enumeration_batch')
 original_qr=prep.pari_prepare_enumeration
 def counted_qr(*args):
  qr_calls[0]+=1
  return original_qr(*args)
 prep.pari_prepare_enumeration=counted_qr;enum.pari_prepare_enumeration=counted_qr
for raw,w in zip(d['inputs'],d['expected']):
 qr_calls[0]=0
 power_calls[0]=0
 v={}
 for name,kind in d['names']:
  conv=float if kind in ('float','Float64Buffer') else int;x=raw[name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 status=f(*(v[name] for name,kind in d['names']));last=v['relation_state'][0];size=len(v['relation']);n=v['n']
 actual=dict(status=status,small=v['counters'][1],trials=v['state'][1],attempts=v['counters'][0],relid=v['progress'][0],nfact=v['progress'][1],fact_count=v['counters'][2],last=last,missing=v['relation_state'][2],sup=v['relation_state'][3],basis=v['relation_basis'],hashes=v['relation_hashes'][:last],records=v['relation_records'][:last*size],generators=list(map(str,v['generators'][:last*n])))
 assert actual==w,(actual,w)
 assert v['schedule'][2]==1
 if d['distinguished']:assert power_calls[0]==1,power_calls
 if d['unreduced']:
  consumed=list(reversed(v['search_ideals']))[:2-v['schedule'][0]]
  exponent=v['power_metadata'][4] if d['selectedExponent'] else v['e0']
  if d['selectedExponent']:
   base=v['relation_primes'][v['jid0']-1]**v['admission_group_f'][v['jid0']-1]
   limit=v['relation_primes'][-1]**(2*v['admission_group_f'][-1])
   assert base**exponent<=limit<base**(exponent+1)
  visits=sum(not(j==v['jid0'] and (exponent+1)%v['ramification'][j-1]==0 and v['ramification'][j-1]*v['admission_group_f'][j-1]==n) for j in consumed)
  assert qr_calls[0]==visits,(qr_calls,v['schedule'],consumed)
 before=str(v);assert f(*(v[name] for name,kind in d['names']))==status and str(v)==before
if d['distinguished']:
 v={}
 for name,kind in d['names']:
  conv=float if kind in ('float','Float64Buffer') else int;x=d['inputs'][0][name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 v['admission_group_f']=[];before=str(v)
 try:f(*(v[name] for name,kind in d['names']))
 except ValueError as error:assert 'inconsistent distinguished prime descriptors' in str(error)
 else:raise AssertionError('must reject short descriptor buffer')
 assert str(v)==before
if d['constructPrimes'] and not d['distinguished']:
 v={}
 for name,kind in d['names']:
  conv=float if kind in ('float','Float64Buffer') else int;x=d['inputs'][0][name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 v['jid0']=1;v['e0']=1;before=str(v)
 try:f(*(v[name] for name,kind in d['names']))
 except ValueError as error:assert 'distinguished-ideal products remain unported' in str(error)
 else:raise AssertionError('must reject distinguished-ideal products')
 assert str(v)==before
if d['unreduced'] and not d['constructPrimes']:
 for scale,status_expected in [(0,-11),(2147483659*2147483693,-17)]:
  v={}
  for name,kind in d['names']:
   conv=float if kind in ('float','Float64Buffer') else int;x=d['inputs'][0][name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
  n=v['n'];v['packet_ideals']=[scale if i%n==i//n else 0 for i in range(n*n)]*len(v['packet_ids'])
  assert f(*(v[name] for name,kind in d['names']))==status_expected
  assert v['schedule'][2:]==[1,status_expected] and v['schedule'][0]==1
  before=str(v);assert f(*(v[name] for name,kind in d['names']))==status_expected and str(v)==before
 if d['distinct']:
  v={}
  for name,kind in d['names']:
   conv=float if kind in ('float','Float64Buffer') else int;x=d['inputs'][1][name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
  n=v['n'];v['packet_ideals'][n*n:]=[0]*(n*n)
  assert f(*(v[name] for name,kind in d['names']))==-11
  w=d['first_expected'];last=w['last'];size=len(v['relation'])
  assert v['schedule'][0]==0 and v['schedule'][2:]==[1,-11]
  assert v['relation_state'][0]==last and v['relation_basis']==w['basis']
  assert v['relation_records'][:last*size]==w['records'] and list(map(str,v['generators'][:last*n]))==w['generators']
  before=str(v);assert f(*(v[name] for name,kind in d['names']))==-11 and str(v)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({inputs,expected,names,unreduced,distinct,constructPrimes,distinguished,selectedExponent,first_expected:fixture.cases[1].expected})});
 const built=await compileKernel({sourcePath}),mod=require(built.modulePath);
 const selectedExponents=[];
 assert.equal(mod[entry].nativeAvailable,true);
 assert.doesNotMatch(fs.readFileSync(built.coreSourcePath,'utf8'),/napi_call_function|PyObject_Call/);
 for(let index=0;index<inputs.length;index++)for(const backend of ['javascript','gmp']){
  const v={};for(const [name,kind] of names){const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[index][name];v[name]=Array.isArray(x)?x.map(conv):conv(x);}
  const invoke=()=>mod[entry][backend](...names.map(([name])=>v[name])),status=invoke(),last=Number(v.relation_state[0]),size=v.relation.length,n=Number(v.n);
  const actual={status:Number(status),small:Number(v.counters[1]),trials:Number(v.state[1]),attempts:Number(v.counters[0]),relid:Number(v.progress[0]),nfact:Number(v.progress[1]),fact_count:Number(v.counters[2]),last,missing:Number(v.relation_state[2]),sup:Number(v.relation_state[3]),basis:v.relation_basis.map(Number),hashes:v.relation_hashes.slice(0,last).map(Number),records:v.relation_records.slice(0,last*size).map(Number),generators:v.generators.slice(0,last*n).map(String)};
  assert.deepEqual(actual,expected[index]);assert.equal(v.schedule[2],1n);
  if(selectedExponent){
   const exponent=v.power_metadata[4],j=Number(v.jid0)-1,k=v.relation_primes.length-1;
   const base=v.relation_primes[j]**v.admission_group_f[j],bound=v.relation_primes[k]**(2n*v.admission_group_f[k]);
   assert(base**exponent<=bound&&bound<base**(exponent+1n));
   if(backend==='gmp')selectedExponents.push(String(exponent));
  }
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),status);assert.equal(dump(),before);
 }
 if(distinguished)for(const backend of ['javascript','gmp']){
  const v={};for(const [name,kind]of names){const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[0][name];v[name]=Array.isArray(x)?x.map(conv):conv(x);}
  v.admission_group_f=[];
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();
  assert.throws(()=>mod[entry][backend](...names.map(([name])=>v[name])),/inconsistent distinguished prime descriptors/);assert.equal(dump(),before);
 }
 if(constructPrimes&&!distinguished)for(const backend of ['javascript','gmp']){
  const v={};for(const [name,kind]of names){const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[0][name];v[name]=Array.isArray(x)?x.map(conv):conv(x);}
  v.jid0=1n;v.e0=1n;
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();
  assert.throws(()=>mod[entry][backend](...names.map(([name])=>v[name])),/distinguished-ideal products remain unported/);assert.equal(dump(),before);
 }
 if(unreduced&&!constructPrimes)for(const backend of ['javascript','gmp'])for(const scale of [0n,2147483659n*2147483693n]){
  const v={};for(const [name,kind]of names){const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[0][name];v[name]=Array.isArray(x)?x.map(conv):conv(x);}
  const n=Number(v.n);v.packet_ideals=Array.from({length:v.packet_ids.length*n*n},(_,i)=>i%(n*n)%n===Math.floor(i%(n*n)/n)?scale:0n);
  const invoke=()=>mod[entry][backend](...names.map(([name])=>v[name])),expectedStatus=scale===0n?-11n:-17n;
  assert.equal(invoke(),expectedStatus);assert.deepEqual(v.schedule.map(BigInt).slice(2),[1n,expectedStatus]);assert.equal(BigInt(v.schedule[0]),1n);
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),expectedStatus);assert.equal(dump(),before);
 }
 if(unreduced&&distinct&&!constructPrimes)for(const backend of ['javascript','gmp']){
  const v={};for(const [name,kind]of names){const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[1][name];v[name]=Array.isArray(x)?x.map(conv):conv(x);}
  const n=Number(v.n);v.packet_ideals.fill(0n,n*n);
  const invoke=()=>mod[entry][backend](...names.map(([name])=>v[name]));assert.equal(invoke(),-11n);
  const w=fixture.cases[1].expected,last=w.last,size=v.relation.length;
  assert.equal(BigInt(v.schedule[0]),0n);assert.deepEqual(v.schedule.map(BigInt).slice(2),[1n,-11n]);assert.equal(v.relation_state[0],BigInt(last));
  assert.deepEqual(v.relation_basis.map(Number),w.basis);assert.deepEqual(v.relation_records.slice(0,last*size).map(Number),w.records);assert.deepEqual(v.generators.slice(0,last*n).map(String),w.generators);
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),-11n);assert.equal(dump(),before);
 }
 if(!distinguished)assert(expected.some((r,i)=>r.last>fixture.cases[i].expected.last),'must exercise new relations after first quota');
 else assert(expected.some(r=>r.last>0),'distinguished path must discover relations');
 if(distinct)assert(inputs.every(v=>v.packet_ids[0]!==v.packet_ids[1]));
 console.log('16 two-visit '+(unreduced?'unreduced':'prepared')+' schedules match PARI/CPython/JS/GMP with resident caches and factor lists; published relation state, aggregate counters and terminal idempotence checked; distinct='+distinct);
 console.log(JSON.stringify({unreduced,distinct,constructPrimes,distinguished,selectedExponent,selectedExponents,qualifiedTiming:false,traceSha256:createHash('sha256').update(JSON.stringify(expected)).digest('hex'),modulePath:built.modulePath}));
})().catch(e=>{console.error(e);process.exitCode=1;});
