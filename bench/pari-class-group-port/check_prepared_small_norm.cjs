"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{compileKernel}=require('../../tools/native-kernel/compiler.cjs');
const {source}=require('./collector_c_control.cjs');
function run(command,args,options={}){const r=spawnSync(command,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,...options});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
(async()=>{
 const distinct=process.argv.includes('--distinct');
 const pari=path.resolve(process.argv[2]),archive=path.resolve(process.argv[3]),lib=path.join(pari,'Olinux-x86_64');
 const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_compiled_ideal_collector.cjs'),pari,'--export-fixtures']));
 const second=distinct?JSON.parse(run(process.execPath,[path.join(__dirname,'check_compiled_ideal_collector.cjs'),pari,'--export-fixtures','--packet-prime=3'])):fixture;
 let control=source(run('tar',['-xOf',archive,'pari-2.17.4/src/basemath/buch2.c']));
 function replace(a,b){assert.equal(control.split(a).length,2);control=control.replace(a,b);}
 // Repeated same-ideal visits deliberately force duplicate/cache interactions.
 // This is a handoff control, not a claim about upstream L_jid construction.
 replace('clock_gettime(CLOCK_MONOTONIC,&begin);','long status=0;for(long visit=0;visit<2;visit++){clock_gettime(CLOCK_MONOTONIC,&begin);');
 replace('long status=prepared_collector','status=prepared_collector');
 replace('elapsed+=seconds(begin,end);','elapsed+=seconds(begin,end);if(status)break;}');
 if(distinct){
  replace('visit<2;visit++){clock_gettime',`visit<2;visit++){
   I=idealhnf(nf,gel(gel(groups,2+visit),1));NI=idealnorm(nf,I);
   u=ZM_lll(ZM_mul(nf_get_roundG(nf),I),.99,LLL_IM);ideal=ZM_mul(I,u);
   matrix=RgM_mul(nf_get_G(nf),ideal);
   clock_gettime`);
  replace('offsets[2]+1,0,0,&ns','offsets[2+visit]+1,0,0,&ns');
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sagejs-small-norm-')),c=path.join(dir,'oracle.c'),exe=path.join(dir,'oracle');fs.writeFileSync(c,control);
 run('cc',['-O2','-I'+path.join(pari,'src/headers'),'-I'+lib,c,'-L'+lib,'-Wl,-rpath,'+lib,'-lpari','-lm','-o',exe]);
 const expected=run(exe,[]).trim().split('\n').map(JSON.parse).map(({index,seconds,repetitions,...r})=>r);assert.equal(expected.length,16);
 const sourcePath=path.join(__dirname,'prepared_small_norm.py');
 const names=fs.readFileSync(sourcePath,'utf8').match(/def pari_collect_prepared_ideals\(([\s\S]*?)\n\)/)[1].trim().split('\n').map(s=>s.trim().replace(/,$/,'').split(': '));
 const inputs=fixture.cases.map(({input:v},index)=>{const w=second.cases[index].input;
  for(const name of ['n','precision','admission_matrix_m','admission_matrix_p','admission_matrix_e','admission_group_e','admission_group_f','admission_group_tau'])assert.deepEqual(v[name],w[name],name);
  return {...v,search_ideals:[w.jid,v.jid],packet_ids:distinct?[v.jid,w.jid]:[v.jid],packet_matrices:distinct?v.matrix.concat(w.matrix):v.matrix.slice(),packet_reduced_ideals:distinct?v.ideal.concat(w.ideal):v.ideal.slice(),packet_ideals:distinct?v.admission_ideal.concat(w.admission_ideal):v.admission_ideal.slice(),packet_norms:distinct?[v.admission_ideal_norm,w.admission_ideal_norm]:[v.admission_ideal_norm],packet_skips:distinct?[v.skipfirst,w.skipfirst]:[v.skipfirst],schedule:['0','0','0','0']};});
 const py=run('python3',['-c',`
import sys,json,decimal,importlib
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3]
f=importlib.import_module('bench.pari-class-group-port.prepared_small_norm').pari_collect_prepared_ideals
d=json.load(sys.stdin)
for raw,w in zip(d['inputs'],d['expected']):
 v={}
 for name,kind in d['names']:
  conv=float if kind in ('float','Float64Buffer') else int;x=raw[name];v[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 status=f(*(v[name] for name,kind in d['names']));last=v['relation_state'][0];size=len(v['relation']);n=v['n']
 actual=dict(status=status,trials=v['state'][1],attempts=v['counters'][0],relid=v['progress'][0],nfact=v['progress'][1],fact_count=v['counters'][2],last=last,missing=v['relation_state'][2],sup=v['relation_state'][3],basis=v['relation_basis'],hashes=v['relation_hashes'][:last],records=v['relation_records'][:last*size],generators=list(map(str,v['generators'][:last*n])))
 assert actual==w,(actual,w)
 assert v['schedule'][2]==1
 before=str(v);assert f(*(v[name] for name,kind in d['names']))==status and str(v)==before
`,path.resolve(__dirname,'../..'),path.resolve(__dirname,'../../src/lib')],{input:JSON.stringify({inputs,expected,names})});
 const mod=require((await compileKernel({sourcePath})).modulePath);
 for(let index=0;index<inputs.length;index++)for(const backend of ['javascript','gmp']){
  const v={};for(const [name,kind] of names){const conv=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=inputs[index][name];v[name]=Array.isArray(x)?x.map(conv):conv(x);}
  const invoke=()=>mod.pari_collect_prepared_ideals[backend](...names.map(([name])=>v[name])),status=invoke(),last=Number(v.relation_state[0]),size=v.relation.length,n=Number(v.n);
  const actual={status:Number(status),trials:Number(v.state[1]),attempts:Number(v.counters[0]),relid:Number(v.progress[0]),nfact:Number(v.progress[1]),fact_count:Number(v.counters[2]),last,missing:Number(v.relation_state[2]),sup:Number(v.relation_state[3]),basis:v.relation_basis.map(Number),hashes:v.relation_hashes.slice(0,last).map(Number),records:v.relation_records.slice(0,last*size).map(Number),generators:v.generators.slice(0,last*n).map(String)};
  assert.deepEqual(actual,expected[index]);assert.equal(v.schedule[2],1n);
  const dump=()=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),before=dump();assert.equal(invoke(),status);assert.equal(dump(),before);
 }
 assert(expected.some((r,i)=>r.last>fixture.cases[i].expected.last),'must exercise new relations after first quota');
 if(distinct)assert(inputs.every(v=>v.packet_ids[0]!==v.packet_ids[1]));
 console.log('16 two-visit prepared schedules match PARI/CPython/JS/GMP with resident caches and factor lists; full state and terminal idempotence checked; distinct='+distinct);
})().catch(e=>{console.error(e);process.exitCode=1;});
