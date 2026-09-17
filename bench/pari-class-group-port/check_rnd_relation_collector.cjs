"use strict";

// Force one predeclared post-HNF rnd_rel branch in pristine PARI 2.17.4 and
// retain the exact random ideal, appended relations/logs and resulting HNF.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonicalHash = (value) => sha256(JSON.stringify(value));

function pariOracle() {
  const base = path.join(__dirname, "check_default_driver_trace.cjs");
  let driver = fs.readFileSync(base, "utf8");
  const helpers = String.raw`
static long forced_random_branch = 0;
static void audit_matrix(GEN a,int word) {
  printf("[");long first=1;
  for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){
    if(!first)putchar(',');first=0;
    if(word)printf("\"%ld\"",mael(a,j,i));else pari_printf("\"%Ps\"",gcoeff(a,i,j));
  }putchar(']');
}
static void audit_real(GEN x) {
  long e;if(typ(x)==t_INT){pari_printf("\"%Ps\",\"-1\",\"0\"",x);return;}
  pari_printf("\"%Ps\",\"%ld\",\"%ld\"",signe(x)?mantissa_real(x,&e):gen_0,signe(x)?bit_prec(x):0,expo(x));
}
static void audit_logs(GEN a) {
  putchar('[');long first=1;
  for(long j=1;j<lg(a);j++)for(long i=1;i<lg(gel(a,j));i++){
    if(!first)putchar(',');first=0;GEN x=gcoeff(a,i,j);
    if(typ(x)==t_COMPLEX){printf("\"2\",");audit_real(gel(x,1));putchar(',');audit_real(gel(x,2));}
    else{printf("\"1\",");audit_real(x);printf(",\"0\",\"-1\",\"0\"");}
  }putchar(']');
}
static void audit_hnf(GEN W,GEN dep,GEN B,GEN C,GEN perm) {
  printf("\"H\":");audit_matrix(W,0);printf(",\"D\":");audit_matrix(dep,0);
  printf(",\"B\":");audit_matrix(B,0);printf(",\"C\":");audit_logs(C);
  printf(",\"perm\":[");for(long i=1;i<lg(perm);i++){if(i>1)putchar(',');printf("%ld",perm[i]);}
  printf("],\"hRows\":%ld,\"bColumns\":%ld,\"totalColumns\":%ld,\"rows\":%ld,\"logRows\":%ld",lg(W)-1,lg(B)-1,lg(C)-1,lg(perm)-1,nbrows(C));
}
static void audit_rng(const char *name) { GEN r=getrand();printf("\"%s\":[",name);for(long i=0;i<66;i++){ulong v=*int_W(r,i);if(i==65)v&=63;if(i)putchar(',');printf("\"%lu\"",v);}putchar(']'); }
`;
  const hnf = String.raw`
        { pari_sp audit_av=avma;
          printf("{\"event\":\"hnfadd_input\",\"random\":%s,\"chk\":%ld,\"last\":%ld,\"newColumns\":%ld,",forced_random_branch==2?"true":"false",cache.chk-cache.base,cache.last-cache.base,lg(mat)-1);
          audit_hnf(W,dep,B,C,F.perm);printf(",\"newRelations\":");audit_matrix(mat,1);printf(",\"newLogs\":");audit_logs(E);
          printf(",\"newGenerators\":[");long first=1;for(REL_t *rel=cache.chk+1;rel<=cache.last;rel++)for(long q=1;q<=N;q++){if(!first)putchar(',');first=0;GEN m=rel->m;if(!m)printf("null");else pari_printf("\"%Ps\"",typ(m)==t_INT?(q==1?m:gen_0):gel(m,q));}printf("]}\n");set_avma(audit_av);
        }
        W = hnfadd_i(W, F.perm, &dep, &B, &C, mat, E);
        { pari_sp audit_av=avma;printf("{\"event\":\"hnfadd_output\",\"random\":%s,",forced_random_branch==2?"true":"false");audit_hnf(W,dep,B,C,F.perm);printf("}\n");set_avma(audit_av); }
`;
  const randomTrace = String.raw`
  ex = cgetg(lg(F->subFB), t_VECSMALL);
  if (forced_random_branch) { printf("{\"event\":\"rnd_before\",");audit_rng("rng");printf(",\"search\":[");for(long q=1;q<lg(L_jid);q++){if(q>1)putchar(',');printf("%ld",L_jid[q]);}printf("],\"subfactor\":[");for(long q=1;q<lg(F->subFB);q++){if(q>1)putchar(',');printf("%ld",F->subFB[q]);}printf("]}\n"); }
  R = get_random_ideal(F, nf, ex); /* random product from subFB */
  if (forced_random_branch) { printf("{\"event\":\"rnd_ideal\",\"exponents\":[");for(long q=1;q<lg(ex);q++){if(q>1)putchar(',');printf("%ld",ex[q]);}printf("],\"ideal\":");audit_matrix(R,0);printf(",");audit_rng("rng");printf("}\n"); }
`;
  const insertion = [
    `replace('static void trace_integer', ${JSON.stringify(helpers + "\nstatic void trace_integer")});`,
    `replace('        W = hnfadd_i(W, F.perm, &dep, &B, &C, mat, E);', ${JSON.stringify(hnf)});`,
    `replace(${JSON.stringify("  ex = cgetg(lg(F->subFB), t_VECSMALL);\n  R = get_random_ideal(F, nf, ex); /* random product from subFB */")}, ${JSON.stringify(randomTrace)});`,
    `replace('      if (need > 0 && Nrelid > 0', ${JSON.stringify(String.raw`      if (cache.chk > cache.base && !forced_random_branch) { done_small=F.KC+2; small_fail=fail_limit+1; forced_random_branch=1; }
      if (need > 0 && Nrelid > 0`)});`,
    `replace('        rnd_rel(&cache, &F, nf, fact);', ${JSON.stringify(String.raw`        rnd_rel(&cache, &F, nf, fact); forced_random_branch=2;`)});`,
  ].join("\n");
  assert.equal(driver.split("// Observe repeated driver").length, 2);
  driver = driver.replace("// Observe repeated driver", insertion + "\n// Observe repeated driver");
  let receipt;
  const scopedProcess=Object.create(process);
  scopedProcess.argv=process.argv.filter((value)=>value!=="--oracle-only"&&value!=="--source-only"&&!value.startsWith("--initial="));
  vm.runInNewContext(driver, {require,process:scopedProcess,console:{error:console.error,log:(text)=>{receipt=JSON.parse(text);}}}, {filename:base});
  const before=receipt.events.find((event)=>event.event==="rnd_before"),ideal=receipt.events.find((event)=>event.event==="rnd_ideal"),input=receipt.events.find((event)=>event.event==="hnfadd_input"&&event.random),output=receipt.events.find((event)=>event.event==="hnfadd_output"&&event.random);
  assert(before&&ideal&&input&&output,"forced random branch did not reach HNF append");
  return {identity:{pariVersion:"2.17.4",polynomial:"x^4-2000022*x-2000042",forcedBranch:"first post-HNF collection uses literal rnd_rel"},before,ideal,input,output,result:receipt.events.at(-1),traceDirectory:receipt.directory};
}

const oracle=pariOracle();
if(process.argv.includes("--oracle-only")){console.log(JSON.stringify(oracle,null,2));process.exit(0);}
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,"rnd_relation_collector_fixture.json")));
assert.equal(sha256(fs.readFileSync(path.resolve(process.argv[3]))),fixture.pariArchiveSha256,"PARI archive drift");
assert.deepEqual(oracle.identity,fixture.identity);
for(const key of ["before","ideal","input","output","result"])assert.equal(canonicalHash(oracle[key]),fixture.hashes[key],`PARI ${key} trace drift`);
assert.deepEqual({old:oracle.input.last-oracle.input.newColumns,last:oracle.input.last,newColumns:oracle.input.newColumns,hRowsBefore:oracle.input.hRows,hRowsAfter:oracle.output.hRows,bColumnsBefore:oracle.input.bColumns,bColumnsAfter:oracle.output.bColumns},fixture.counts);
assert.deepEqual({search:oracle.before.search,subfactor:oracle.before.subfactor,exponents:oracle.ideal.exponents},fixture.scheduler);
const initialOption=process.argv.find((value)=>value.startsWith("--initial="));
assert(initialOption,"supply --initial=<authenticated field-3 collector fixture>");
const initialPath=path.resolve(initialOption.slice("--initial=".length));
assert(fs.existsSync(initialPath),"missing authenticated initial fixture");
assert.equal(sha256(fs.readFileSync(initialPath)),fixture.initialFixtureSha256,"initial collector fixture drift");
const signature=(file,name)=>fs.readFileSync(path.join(__dirname,file),"utf8").match(new RegExp(`def ${name}\\(([\\s\\S]*?)\\n\\)`))[1].trim().split("\n").map((line)=>line.trim().replace(/,$/,"").split(": "));
const initial=JSON.parse(fs.readFileSync(initialPath));
const expectedInitial=initial.expected.find((entry)=>entry.field===3),packet=initial.nativeInputs.find((entry)=>entry.field===3&&entry.backend==="gmp");
assert(expectedInitial&&packet,"initial fixture lacks field-3 GMP packet");
const payload={
  initialPath,
  connectedNames:signature("connected_relation_hnf.py","pari_connected_relation_hnf"),
  collectorNames:signature("unreduced_ideal_collector.py","pari_collect_unreduced_ideal"),
  hnfNames:signature("hnfadd.py","pari_hnfadd"),
  raw:packet.input,
  expectedInitial,
  oracle,
};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-rnd-relation-collector-")),payloadPath=path.join(directory,"payload.json"),cpPath=path.join(directory,"cpython.json"),statePath=path.join(directory,"initial-state.json");
fs.writeFileSync(payloadPath,JSON.stringify(payload));
const python=String.raw`
import copy,decimal,importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[2:4];d=json.load(open(sys.argv[1]));e=d['expectedInitial'];o=d['oracle'];raw=d['raw'];
def values(names,source):
 out={}
 for name,kind in names:
  x=source[name];conv=float if kind in ('float','Float64Buffer') else int
  out[name]=list(map(conv,x)) if isinstance(x,list) else conv(x)
 return out
connected=importlib.import_module('bench.pari-class-group-port.connected_relation_hnf').pari_connected_relation_hnf
v=values(d['connectedNames'],raw);assert connected(**v)==0;rows=len(v['relation']);n=v['n'];places=(n+v['admission_real_count'])//2;old=v['relation_state'][0];assert old==293
assert list(map(str,v['hnf_result_h'][:len(o['input']['H'])]))==o['input']['H'],'initial H';assert list(map(str,v['hnf_result_dep'][:len(o['input']['D'])]))==o['input']['D'],'initial D';assert list(map(str,v['hnf_result_b'][:len(o['input']['B'])]))==o['input']['B'],'initial B';assert list(map(str,v['hnf_result_c'][:len(o['input']['C'])]))==o['input']['C'],'initial C';assert v['hnf_perm']==o['input']['perm'],'initial perm'
native_state={}
for name,kind in d['connectedNames']:
 x=v[name]
 if kind in ('float','Float64Buffer'):native_state[name]=x
 elif isinstance(x,list):native_state[name]=list(map(str,x))
 else:native_state[name]=str(x)
json.dump(native_state,open(sys.argv[5],'w'))
ideals=[dict(p=g['p'],**q) for g in e['groups'] for q in g['ideals']];primes=[q['p'] for q in ideals];degrees=[q['f'] for q in ideals];inert=[q['inert'] for q in ideals];descriptors=[int(x) for q in ideals for x in e['descriptorCatalog'][q['index']]['generator']]
z=lambda k:[0]*k;mod=importlib.import_module('bench.pari-class-group-port.rnd_relation_collector');target=mod.pari_random_relation_preflight(n,rows,v['relation_state'],2,z(n*n),z(n*n),v['generators'],v['relation_metadata'],v['log_embeddings'],places)
saved=(v['relation_state'][:],v['generators'][:],v['relation_metadata'][:],v['log_embeddings'][:]);v['relation_state'][1]=old+1
try: mod.pari_random_relation_preflight(n,rows,v['relation_state'],2,z(n*n),z(n*n),v['generators'],v['relation_metadata'],v['log_embeddings'],places);assert False,'capacity accepted'
except ValueError: pass
v['relation_state'][:]=saved[0];assert v['generators']==saved[1] and v['relation_metadata']==saved[2] and v['log_embeddings']==saved[3],'capacity failure mutated owners'
sched=importlib.import_module('bench.pari-class-group-port.rnd_relation_scheduler');current=o['before']['subfactor']+[0]*(rows-len(o['before']['subfactor']));ss=[2,0,0,0,len(o['before']['subfactor']),16*len(o['before']['subfactor']),16*len(o['before']['subfactor'])//10,37,1000,0,0,0]
assert sched.pari_begin_random_relation_schedule(e['bad'],e['initialPerm'],o['before']['search'],len(o['before']['search']),current,ss,[0]*rows,[0]*rows)==1,'scheduler';assert current[:ss[4]]==o['before']['subfactor'],'subfactor'
def pari_matrix_row_major(values,dimension):
 # PARI emits matrices by columns; native matrix owners are row-major.
 return [int(values[column*dimension+row]) for row in range(dimension) for column in range(dimension)]
rw=[z(n),z(n),z(n),z(n),z(3),z(3),z(n*n),z(n*n),z(n*n),z(2*n*n),z(n*(3*n+1)),z(n*(n+1)),z(n),z(n*n),z(n*n)];rng=list(map(int,o['before']['rng']));ex=z(ss[4]);assert sched.pari_random_subfactor_ideal(list(map(int,e['basisTable'])),rng,current,ss[4],primes,[q['e'] for q in ideals],degrees,descriptors,n,ex,*rw)==1,'random attempts';R=rw[-1];assert ex==o['ideal']['exponents'],'exponents';assert R==pari_matrix_row_major(o['ideal']['ideal'],n),(R,o['ideal']['ideal'],current[:ss[4]]);assert list(map(str,rng))==o['ideal']['rng'],'rng';NR=1
for i in range(n):NR*=R[i*n+i]
v['relation_state'][5]=target
construct=mod.pari_construct_random_search_ideal;collect=importlib.import_module('bench.pari-class-group-port.unreduced_ideal_collector').pari_collect_unreduced_ideal;cnames=d['collectorNames'];progress=v['progress'];progress[1]=0
bad_output=[71]*(n*n)
try: construct(list(map(int,e['basisTable'])),R,NR,0,n,primes,degrees,inert,descriptors,z(n),z(n*n),z(n*n),z(2*n*n),z(n*(3*n+1)),z(n*(n+1)),z(n),bad_output);assert False,'malformed descriptor accepted'
except ValueError: pass
assert bad_output==[71]*(n*n),'malformed construction mutated output'
for selected in o['before']['search']:
 w=[z(n),z(n*n),z(n*n),z(2*n*n),z(n*(3*n+1)),z(n*(n+1)),z(n),z(n*n)];norm=construct(list(map(int,e['basisTable'])),R,NR,selected,n,primes,degrees,inert,descriptors,*w);v['admission_ideal'][:n*n]=w[-1]
 for i in range(5):v['state'][i]=0
 v['counters'][0]=v['counters'][3]=0;progress[0]=progress[2]=progress[3]=0;v['preparation_state'][0]=0
 args={name:v[name] for name,kind in cnames if name in v};args.update(admission_ideal_norm=norm,nrelid=1,track_fact=1,jid=selected,jid0=0,e0=0,subfactor=current[:ss[4]],extra=ex,extra_count=ss[4])
 status=collect(**args)
 if v['relation_state'][0]>=target:break
assert v['relation_state'][0]==o['input']['last'];new=v['relation_state'][0]-old;assert new==o['input']['newColumns'];assert list(map(str,v['relation_records'][old*rows:(old+new)*rows]))==o['input']['newRelations'];assert list(map(str,v['generators'][old*n:(old+new)*n]))==o['input']['newGenerators']
for row in range(old,old+new):assert v['relation_metadata'][3*row:3*row+3]==[row+1,0,0],('provenance',row,v['relation_metadata'][3*row:3*row+3])
logs=importlib.import_module('bench.pari-class-group-port.relation_log_embeddings').pari_append_relation_log_embeddings;logs(v['admission_matrix_m'],v['admission_matrix_p'],v['admission_matrix_e'],v['generators'],v['relation_metadata'],v['relation_state'][0],n,v['admission_real_count'],int(v['log_precision']),v['log_completed'],v['log_embeddings'],v['log_coordinates'],v['log_column'],v['log_cache'],v['log_pi_cache'],v['log_a'],v['log_b'],v['log_p'],v['log_q'],v['log_stack'],v['chain_state'][2])
newlogs=v['log_embeddings'][old*7*places:(old+new)*7*places];assert list(map(str,newlogs))==o['input']['newLogs'],('new logs',list(map(str,newlogs)),o['input']['newLogs']);search=z(rows);assert sched.pari_finish_random_relation_schedule(e['initialPerm'],ss,search)==rows,'scheduler finish'
hrows=v['hnf_state'][0];bcols=v['hnf_state'][2];cap=max(8192,7*places*(old+new),rows*(hrows+new));ha={name:([77]*cap if kind.endswith('Buffer') else 0) for name,kind in d['hnfNames']};ha.update(h=v['hnf_result_h'],h_rows=hrows,dep=v['hnf_result_dep'],b=v['hnf_result_b'],b_columns=bcols,logs=v['hnf_result_c'],total_columns=old,log_rows=places,perm=v['hnf_perm'],rows=rows,new_relations=v['relation_records'][old*rows:(old+new)*rows],new_columns=new,new_logs=newlogs)
hnf=importlib.import_module('bench.pari-class-group-port.hnfadd').pari_hnfadd;assert hnf(**ha)==0
for key,name in [('H','result_h'),('D','result_dep'),('B','result_b'),('C','result_c')]:assert list(map(str,ha[name][:len(o['output'][key])]))==o['output'][key],key
assert ha['perm']==o['output']['perm'];out={'old':old,'last':v['relation_state'][0],'new':new,'status':status,'rng':list(map(str,rng)),'exponents':ex,'records':o['input']['newRelations'],'generators':o['input']['newGenerators'],'provenance':v['relation_metadata'][3*old:3*(old+new)],'logs':o['input']['newLogs'],'hnfState':ha['state'][:9]};json.dump(out,open(sys.argv[4],'w'))
`;
const {spawnSync}=require("node:child_process");
const cp=spawnSync("python3",["-c",python,payloadPath,path.resolve(__dirname,"../.."),path.resolve(__dirname,"../../src/lib"),cpPath,statePath],{encoding:"utf8",timeout:180000,maxBuffer:64*1024*1024});assert.equal(cp.status,0,cp.stderr||String(cp.error));
const cpResult=JSON.parse(fs.readFileSync(cpPath));
if(process.argv.includes("--source-only")){console.log(JSON.stringify({pari:"2.17.4",fixture:canonicalHash(fixture),cpython:true,old:cpResult.old,last:cpResult.last,newColumns:cpResult.new,exponents:cpResult.exponents,records:canonicalHash(cpResult.records),generators:canonicalHash(cpResult.generators),provenance:canonicalHash(cpResult.provenance),logs:canonicalHash(cpResult.logs),hnfState:cpResult.hnfState,directory,traceDirectory:oracle.traceDirectory}));process.exit(0);}

const {compileKernel}=require("../../tools/native-kernel/compiler.cjs");
const integer=(values)=>values.map(BigInt),zeros=(count)=>Array(count).fill(0n);
const convert=(kind,value)=>kind==="float"?Number(value):kind==="bool"?(typeof value==="boolean"?value:BigInt(value)!==0n):kind==="Float64Buffer"?value.map(Number):kind.endsWith("Buffer")?integer(value):BigInt(value);
const load=async(name)=>{const built=await compileKernel({sourcePath:path.join(__dirname,name+".py")}),module=require(built.modulePath);return {built,module};};
const rowMajor=(values,n)=>{const out=[];for(let row=0;row<n;row++)for(let column=0;column<n;column++)out.push(BigInt(values[column*n+row]));return out;};
async function replay(backend,modules) {
 const saved=JSON.parse(fs.readFileSync(statePath)),v={};for(const [name,kind] of payload.connectedNames)v[name]=convert(kind,saved[name]);
 const n=Number(v.n),rows=v.relation.length,places=(n+Number(v.admission_real_count))/2,old=Number(v.relation_state[0]);assert.equal(old,fixture.counts.old);
 const ideals=expectedInitial.groups.flatMap(group=>group.ideals.map(ideal=>({p:group.p,...ideal}))),primes=integer(ideals.map(x=>x.p)),ramification=integer(ideals.map(x=>x.e)),degrees=integer(ideals.map(x=>x.f)),inert=integer(ideals.map(x=>x.inert)),descriptors=integer(ideals.flatMap(x=>expectedInitial.descriptorCatalog[x.index].generator));
 const preflight=modules.corridor.pari_random_relation_preflight,construct=modules.corridor.pari_construct_random_search_ideal,R=zeros(n*n),searchIdeal=zeros(n*n);
 const target=preflight[backend](BigInt(n),BigInt(rows),v.relation_state,2n,R,searchIdeal,v.generators,v.relation_metadata,v.log_embeddings,BigInt(places));assert.equal(target,BigInt(fixture.counts.last));
 const capacity=v.relation_state[1],beforeOwners=[...v.relation_state,...v.generators,...v.relation_metadata,...v.log_embeddings];v.relation_state[1]=BigInt(old+1);assert.throws(()=>preflight[backend](BigInt(n),BigInt(rows),v.relation_state,2n,R,searchIdeal,v.generators,v.relation_metadata,v.log_embeddings,BigInt(places)),/capacity/);v.relation_state[1]=capacity;assert.deepEqual([...v.relation_state,...v.generators,...v.relation_metadata,...v.log_embeddings],beforeOwners);
 const scheduler=modules.scheduler,current=integer([...oracle.before.subfactor,...Array(rows-oracle.before.subfactor.length).fill(0)]),ss=integer([2,0,0,0,oracle.before.subfactor.length,16*oracle.before.subfactor.length,Math.floor(16*oracle.before.subfactor.length/10),37,1000,0,0,0]);
 assert.equal(scheduler.pari_begin_random_relation_schedule[backend](integer(expectedInitial.bad),integer(expectedInitial.initialPerm),integer(oracle.before.search),BigInt(oracle.before.search.length),current,ss,zeros(rows),zeros(rows)),1n);assert.deepEqual(current.slice(0,Number(ss[4])),integer(oracle.before.subfactor));
 const rw=[zeros(n),zeros(n),zeros(n),zeros(n),zeros(3),zeros(3),zeros(n*n),zeros(n*n),zeros(n*n),zeros(2*n*n),zeros(n*(3*n+1)),zeros(n*(n+1)),zeros(n),zeros(n*n),R],rng=integer(oracle.before.rng),ex=zeros(Number(ss[4]));
 assert.equal(scheduler.pari_random_subfactor_ideal[backend](integer(expectedInitial.basisTable),rng,current,ss[4],primes,ramification,degrees,descriptors,BigInt(n),ex,...rw),1n);assert.deepEqual(ex,integer(oracle.ideal.exponents));assert.deepEqual(R,rowMajor(oracle.ideal.ideal,n));assert.deepEqual(rng,integer(oracle.ideal.rng));let NR=1n;for(let i=0;i<n;i++)NR*=R[i*n+i];v.relation_state[5]=target;
 const malformed=Array(n*n).fill(71n),badWork=[zeros(n),zeros(n*n),zeros(n*n),zeros(2*n*n),zeros(n*(3*n+1)),zeros(n*(n+1)),zeros(n),malformed];assert.throws(()=>construct[backend](integer(expectedInitial.basisTable),R,NR,0n,BigInt(n),primes,degrees,inert,descriptors,...badWork),/descriptor/);assert.deepEqual(malformed,Array(n*n).fill(71n));
 let status=0n;for(const selected of oracle.before.search){const work=[zeros(n),zeros(n*n),zeros(n*n),zeros(2*n*n),zeros(n*(3*n+1)),zeros(n*(n+1)),zeros(n),zeros(n*n)],norm=construct[backend](integer(expectedInitial.basisTable),R,NR,BigInt(selected),BigInt(n),primes,degrees,inert,descriptors,...work);v.admission_ideal.splice(0,n*n,...work.at(-1));for(let i=0;i<5;i++)v.state[i]=0n;v.counters[0]=0n;v.counters[3]=0n;v.progress[0]=0n;v.progress[2]=0n;v.progress[3]=0n;v.preparation_state[0]=0n;const override={admission_ideal_norm:norm,nrelid:1n,track_fact:1n,jid:BigInt(selected),jid0:0n,e0:0n,subfactor:current.slice(0,Number(ss[4])),extra:ex,extra_count:ss[4]};status=modules.collector.pari_collect_unreduced_ideal[backend](...payload.collectorNames.map(([name])=>Object.hasOwn(override,name)?override[name]:v[name]));if(v.relation_state[0]>=target)break;}
 assert.equal(v.relation_state[0],target);const added=Number(target)-old,newRelations=v.relation_records.slice(old*rows,Number(target)*rows),newGenerators=v.generators.slice(old*n,Number(target)*n);assert.deepEqual(newRelations.map(String),oracle.input.newRelations);assert.deepEqual(newGenerators.map(String),oracle.input.newGenerators);for(let row=old;row<Number(target);row++)assert.deepEqual(v.relation_metadata.slice(3*row,3*row+3),[BigInt(row+1),0n,0n]);
 assert.equal(modules.logs.pari_append_relation_log_embeddings[backend](v.admission_matrix_m,v.admission_matrix_p,v.admission_matrix_e,v.generators,v.relation_metadata,target,BigInt(n),v.admission_real_count,v.log_precision,v.log_completed,v.log_embeddings,v.log_coordinates,v.log_column,v.log_cache,v.log_pi_cache,v.log_a,v.log_b,v.log_p,v.log_q,v.log_stack,v.chain_state[2]),target);const newLogs=v.log_embeddings.slice(old*7*places,Number(target)*7*places);assert.deepEqual(newLogs.map(String),oracle.input.newLogs);assert.equal(scheduler.pari_finish_random_relation_schedule[backend](integer(expectedInitial.initialPerm),ss,zeros(rows)),BigInt(rows));
 const hrows=v.hnf_state[0],bcols=v.hnf_state[2],cap=Math.max(8192,7*places*Number(target),rows*(Number(hrows)+added)),ha={};for(const [name,kind]of payload.hnfNames)ha[name]=kind.endsWith("Buffer")?Array(cap).fill(77n):0n;Object.assign(ha,{h:v.hnf_result_h,h_rows:hrows,dep:v.hnf_result_dep,b:v.hnf_result_b,b_columns:bcols,logs:v.hnf_result_c,total_columns:BigInt(old),log_rows:BigInt(places),perm:v.hnf_perm,rows:BigInt(rows),new_relations:newRelations,new_columns:BigInt(added),new_logs:newLogs});assert.equal(modules.hnf.pari_hnfadd[backend](...payload.hnfNames.map(([name])=>ha[name])),0n);for(const [key,name]of [["H","result_h"],["D","result_dep"],["B","result_b"],["C","result_c"]])assert.deepEqual(ha[name].slice(0,oracle.output[key].length).map(String),oracle.output[key]);assert.deepEqual(ha.perm,integer(oracle.output.perm));
 return {backend,status:Number(status),old,last:Number(target),relations:canonicalHash(newRelations.map(String)),generators:canonicalHash(newGenerators.map(String)),provenance:canonicalHash(v.relation_metadata.slice(3*old,3*Number(target)).map(String)),logs:canonicalHash(newLogs.map(String)),hnfState:ha.state.slice(0,9).map(Number)};
}
async function main(){const names=["rnd_relation_scheduler","rnd_relation_collector","unreduced_ideal_collector","relation_log_embeddings","hnfadd"],loaded={};for(const name of names)loaded[name]=(await load(name)).module;const modules={scheduler:loaded.rnd_relation_scheduler,corridor:loaded.rnd_relation_collector,collector:loaded.unreduced_ideal_collector,logs:loaded.relation_log_embeddings,hnf:loaded.hnfadd},native=[];for(const backend of ["javascript","gmp"])native.push(await replay(backend,modules));console.log(JSON.stringify({pari:"2.17.4",fixture:canonicalHash(fixture),cpython:true,native,tagged:"unsupported: frozen logs and HNF state contain 256-320-bit exact integers",oracleDirectory:oracle.traceDirectory}));}
main().catch(error=>{console.error(error);process.exitCode=1;});
