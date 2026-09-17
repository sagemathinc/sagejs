"use strict";

// Publish the post-rnd row and run PARI's genuine following LIE iteration.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};
const signature = (file, name) =>
  fs
    .readFileSync(path.join(__dirname, file), "utf8")
    .match(new RegExp(`def ${name}\\(([\\s\\S]*?)\\n\\)`))[1]
    .trim()
    .split("\n")
    .map((line) => line.trim().replace(/,$/, "").split(": "));

const pari = path.resolve(process.argv[2]);
const archive = path.resolve(process.argv[3]);
const initialPath = path.resolve(process.argv[4]);
const analyticPath = path.resolve(process.argv[5]);
for (const file of [archive, initialPath, analyticPath])
  assert(fs.existsSync(file), `missing fixture: ${file}`);
// The source checker writes a 450-KiB object with one `stdout.write`. When its
// stdout is a pipe Node may exit before the pipe has drained, so give it a
// regular file rather than accepting a silently truncated oracle.
const oracleOutput = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-rnd-outer-oracle-")),
  "oracle.json",
);
const oracleFd = fs.openSync(oracleOutput, "w");
const oracleRun = spawnSync(
  "node",
  [
    path.join(__dirname, "check_rnd_relation_collector.cjs"),
    pari,
    archive,
    "--field3",
    "--oracle-only",
  ],
  {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", oracleFd, "pipe"],
  },
);
fs.closeSync(oracleFd);
assert.equal(oracleRun.status, 0, oracleRun.stderr || String(oracleRun.error));
const oracle = JSON.parse(fs.readFileSync(oracleOutput, "utf8"));
const events = JSON.parse(
  fs.readFileSync(path.join(oracle.traceDirectory, "trace.json")),
);
const appends = events.filter((entry) => entry.event === "hnfadd_input");
const outputs = events.filter((entry) => entry.event === "hnfadd_output");
const acceptances = events.filter((entry) => entry.event === "acceptance");
const result = events.at(-1);
assert.equal(appends.length, 3);
assert.equal(outputs.length, 3);
assert.deepEqual(acceptances.map((entry) => entry.code), [1, 1, 0]);
assert.equal(result.event, "result");

const initialFixture = JSON.parse(fs.readFileSync(initialPath));
const analyticFixture = JSON.parse(fs.readFileSync(analyticPath));
const expectedInitial = initialFixture.expected.find((entry) => entry.field === 3);
const packet = initialFixture.nativeInputs.find(
  (entry) => entry.field === 3 && entry.backend === "gmp",
);
const inverse = analyticFixture.nativeOutputs.find(
  (entry) => entry.field === 3 && entry.backend === "gmp",
);
assert(expectedInitial && packet && inverse);
const driverNames = signature(
  "prepared_class_group_resumable.py",
  "pari_prepared_class_group_resumable",
);
const connectedNames = signature(
  "connected_relation_hnf.py",
  "pari_connected_relation_hnf",
);
const collectorNames = signature(
  "unreduced_ideal_collector.py",
  "pari_collect_unreduced_ideal",
);
const collectedNames = signature(
  "collected_log_embeddings.py",
  "pari_collect_and_log_relations",
);
const connectedAppendNames = signature(
  "connected_hnfadd_acceptance.py",
  "pari_connected_hnfadd_acceptance",
);
const controllerNames = signature(
  "rnd_relation_outer_driver.py",
  "pari_publish_random_outer_append",
);
const raw = structuredClone(packet.input);
const capacity = 8192;
for (const [name, kind] of [
  ...driverNames,
  ...connectedNames,
  ...collectorNames,
  ...collectedNames,
  ...connectedAppendNames,
  ...controllerNames,
]) {
  if (name in raw && (!kind.endsWith("Buffer") || raw[name].length !== 0))
    continue;
  raw[name] = kind.endsWith("Buffer")
    ? Array(capacity).fill(kind === "Float64Buffer" ? 0 : "0")
    : kind === "float"
      ? 0
      : "0";
}
const ideals = expectedInitial.groups.flatMap((group) =>
  group.ideals.map((ideal) => ({ p: group.p, ...ideal })),
);
raw.basis_table = expectedInitial.basisTable;
raw.packet_primes = ideals.map((ideal) => String(ideal.p));
raw.packet_inert = ideals.map((ideal) => String(ideal.inert));
raw.packet_generators = ideals.flatMap(
  (ideal) => expectedInitial.descriptorCatalog[ideal.index].generator,
);
while (raw.power_metadata.length < 5) raw.power_metadata.push("0");
Object.assign(raw, {
  accept_inverse_hr: inverse.inverseHR,
  pass_limit: "1",
  automorphism_count: "1",
  relation_prime_count: String(expectedInitial.KCZ),
  checking_prime_count: String(expectedInitial.KCZ),
  outer_ru: String((expectedInitial.degree + expectedInitial.real) / 2),
  outer_state: Array(19).fill("0"),
  outer_minidx: Array.from({ length: expectedInitial.KC }, (_, i) => String(i + 1)),
  outer_present: Array(expectedInitial.KC).fill("0"),
  outer_live: Array(expectedInitial.KC).fill("0"),
  outer_perm: expectedInitial.initialPerm.map(String),
  outer_multiplier: Array(expectedInitial.KC).fill("0"),
  driver_state: Array(8).fill("0"),
  driver_trace: Array(30).fill("0"),
});
const payload = {
  raw,
  driverNames,
  connectedNames,
  collectorNames,
  collectedNames,
  connectedAppendNames,
  controllerNames,
  expectedInitial,
  oracle,
  appends,
  outputs,
  result,
};
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "sagejs-rnd-outer-driver-"),
);
const payloadPath = path.join(directory, "payload.json");
const cpPath = path.join(directory, "cpython.json");
fs.writeFileSync(payloadPath, JSON.stringify(payload));
const python = String.raw`
import collections.abc, copy, dataclasses, decimal, hashlib, importlib, inspect, json, sys, threading, typing
sys.set_int_max_str_digits(0);sys.path[:0]=sys.argv[2:4];d=json.load(open(sys.argv[1]));e=d['expectedInitial'];o=d['oracle'];raw=d['raw']
def values(names,source):
 out={}
 for name,kind in names:
  x=source[name]
  if kind=='float':out[name]=float(x)
  elif kind=='bool':out[name]=bool(int(x)) if not isinstance(x,bool) else x
  elif kind=='Float64Buffer':out[name]=list(map(float,x))
  elif kind.endswith('Buffer'):out[name]=list(map(int,x))
  else:out[name]=int(x)
 return out
v=values(d['driverNames']+d['connectedNames']+d['collectorNames']+d['collectedNames']+d['connectedAppendNames']+d['controllerNames'],raw);z=lambda k:[0]*k
driver=importlib.import_module('bench.pari-class-group-port.prepared_class_group_resumable').pari_prepared_class_group_resumable
assert driver(**{name:v[name] for name,kind in d['driverNames']})==-200
rows=len(v['relation']);n=v['n'];places=(n+v['admission_real_count'])//2;old=v['relation_state'][0];assert old==293
v['relation_state'][4]=old;v['driver_state'][:]=[3,3,1,old,0,0,0,old];v['driver_trace'][:5]=[old,3,v['outer_state'][12],v['outer_state'][3],v['outer_state'][4]]
ideals=[dict(p=g['p'],**q) for g in e['groups'] for q in g['ideals']];primes=[q['p'] for q in ideals];degrees=[q['f'] for q in ideals];inert=[q['inert'] for q in ideals];ramification=[q['e'] for q in ideals];descriptors=[int(x) for q in ideals for x in e['descriptorCatalog'][q['index']]['generator']]
sched=importlib.import_module('bench.pari-class-group-port.rnd_relation_scheduler');ss=[2,0,0,0,len(o['before']['subfactor']),16*len(o['before']['subfactor']),16*len(o['before']['subfactor'])//10,37,1000,0,0,0];current=o['before']['subfactor']+[0]*(rows-len(o['before']['subfactor']))
assert sched.pari_begin_random_relation_schedule(e['bad'],e['initialPerm'],o['before']['search'],len(o['before']['search']),current,ss,z(rows),z(rows))==1
rw=[z(n),z(n),z(n),z(n),z(3),z(3),z(n*n),z(n*n),z(n*n),z(2*n*n),z(n*(3*n+1)),z(n*(n+1)),z(n),z(n*n),z(n*n)];rng=list(map(int,o['before']['rng']));ex=z(ss[4]);assert sched.pari_random_subfactor_ideal(list(map(int,e['basisTable'])),rng,current,ss[4],primes,ramification,degrees,descriptors,n,ex,*rw)==1;R=rw[-1];assert ex==o['ideal']['exponents'] and list(map(str,rng))==o['ideal']['rng'];NR=1
for i in range(n):NR*=R[i*n+i]
corridor=importlib.import_module('bench.pari-class-group-port.rnd_relation_collector');target=corridor.pari_random_relation_preflight(n,rows,v['relation_state'],2,R,z(n*n),v['generators'],v['relation_metadata'],v['log_embeddings'],places);v['relation_state'][5]=target
collect=importlib.import_module('bench.pari-class-group-port.unreduced_ideal_collector').pari_collect_unreduced_ideal;progress=v['progress'];progress[1]=0
for selected in o['before']['search']:
 w=[z(n),z(n*n),z(n*n),z(2*n*n),z(n*(3*n+1)),z(n*(n+1)),z(n),z(n*n)];norm=corridor.pari_construct_random_search_ideal(list(map(int,e['basisTable'])),R,NR,selected,n,primes,degrees,inert,descriptors,*w);v['admission_ideal'][:n*n]=w[-1]
 for i in range(5):v['state'][i]=0
 v['counters'][0]=v['counters'][3]=0;progress[0]=progress[2]=progress[3]=0;v['preparation_state'][0]=0
 args={name:v[name] for name,kind in d['collectorNames']};args.update(admission_ideal_norm=norm,nrelid=1,track_fact=1,jid=selected,jid0=0,e0=0,subfactor=current[:ss[4]],extra=ex,extra_count=ss[4]);collect(**args)
 if v['relation_state'][0]>=target:break
assert v['relation_state'][0]==target;sched.pari_finish_random_relation_schedule(e['initialPerm'],ss,v['search_ideals'])
logs=importlib.import_module('bench.pari-class-group-port.relation_log_embeddings').pari_append_relation_log_embeddings;logs(v['admission_matrix_m'],v['admission_matrix_p'],v['admission_matrix_e'],v['generators'],v['relation_metadata'],target,n,v['admission_real_count'],v['log_precision'],v['log_completed'],v['log_embeddings'],v['log_coordinates'],v['log_column'],v['log_cache'],v['log_pi_cache'],v['log_a'],v['log_b'],v['log_p'],v['log_q'],v['log_stack'],v['chain_state'][2])
append=importlib.import_module('bench.pari-class-group-port.connected_hnfadd_acceptance').pari_connected_hnfadd_acceptance
controller=importlib.import_module('bench.pari-class-group-port.rnd_relation_outer_driver').pari_publish_random_outer_append
prepare=importlib.import_module('bench.pari-class-group-port.collector_next_pass').pari_prepare_next_small_norm_pass
collected=importlib.import_module('bench.pari-class-group-port.collected_log_embeddings').pari_collect_and_log_relations
control=[0,0,0,v['hnf_state'][0],v['hnf_state'][2],v['hnf_state'][7]]
def append_args(old_columns,columns):
 explicit={'h':v['hnf_result_h'],'h_rows':control[3],'dep':v['hnf_result_dep'],'b':v['hnf_result_b'],'b_columns':control[4],'logs':v['hnf_result_c'],'total_columns':control[5],'log_rows':places,'perm':v['hnf_perm'],'rows':rows,'new_relations':v['relation_records'][old_columns*rows:columns*rows],'new_columns':columns-old_columns,'new_logs':v['log_embeddings'][old_columns*7*places:columns*7*places],'accept_degree':n,'accept_cache_changed':columns!=v['driver_state'][3],'attempt_state':v['append_attempt_state'],'state':v['append_state']}
 out={}
 for name in inspect.signature(append).parameters:
  if name in explicit:out[name]=explicit[name]
  elif name.startswith('accept_'):out[name]=v[name]
  else:out[name]=v['append_'+name]
 return out
def publish(action,columns):
 return controller(rows,places,n,columns,action,v['append_attempt_state'],v['append_state'],v['append_result_h'],v['append_result_dep'],v['append_result_b'],v['append_result_c'],v['hnf_state'],v['hnf_result_h'],v['hnf_result_dep'],v['hnf_result_b'],v['hnf_result_c'],v['relation_state'],v['hnf_perm'],v['search_ideals'],v['outer_perm'],v['outer_state'],v['accept_multiple_state'],v['accept_acceptance_state'],v['driver_state'],v['driver_trace'],control)
columns=target;action=append(**append_args(old,columns))
before=(copy.deepcopy(v['hnf_state']),copy.deepcopy(v['hnf_result_h']),copy.deepcopy(v['hnf_result_dep']),copy.deepcopy(v['hnf_result_b']),copy.deepcopy(v['hnf_result_c']))
try:
 controller(rows,places,n,columns,action,v['append_attempt_state'],v['append_state'],v['append_result_h'],v['append_result_dep'],v['append_result_b'],v['append_result_c'],v['hnf_state'],v['hnf_result_h'],v['hnf_result_dep'],v['hnf_result_b'],v['hnf_result_c'],v['relation_state'],v['hnf_perm'],v['search_ideals'],v['outer_perm'],v['outer_state'],v['accept_multiple_state'],v['accept_acceptance_state'],v['driver_state'],[0],control);assert False,'short trace accepted'
except ValueError:pass
assert before==(v['hnf_state'],v['hnf_result_h'],v['hnf_result_dep'],v['hnf_result_b'],v['hnf_result_c']),'capacity failure published HNF'
action=publish(action,columns);assert action==5,(action,v['append_attempt_state'],control)
resume=importlib.import_module('bench.pari-class-group-port.rnd_lie_cache_resume').pari_resume_after_random_relations
assert resume(rows,290,v['relation_state'],v['outer_state'])==0
assert list(map(int,v['hnf_perm'][:rows]))==d['outputs'][0]['perm'],'random append perm'
assert list(map(int,v['outer_perm'][:rows]))==d['outputs'][0]['perm'],'random outer perm'
random_records=[str(x) for x in e['records']]+[str(x) for x in d['appends'][0]['newRelations']];random_generators=[str(x) for x in e['generators']]+[str(x) for x in d['appends'][0]['newGenerators']];random_logs=[str(x) for x in e['logs']]+[str(x) for x in d['appends'][0]['newLogs']]
assert list(map(str,v['relation_records'][:len(random_records)]))==random_records
assert list(map(str,v['generators'][:len(random_generators)]))==random_generators
assert list(map(str,v['log_embeddings'][:len(random_logs)]))==random_logs
for key,name in [('H','hnf_result_h'),('D','hnf_result_dep'),('B','hnf_result_b'),('C','hnf_result_c')]:assert list(map(str,v[name][:len(d['outputs'][0][key])]))==list(map(str,d['outputs'][0][key])),key
need=control[0];assert need==1
assert prepare(need,v['outer_state'][14],v['outer_state'][15],control[3],1,v['outer_state'],v['relation_state'],v['schedule'],v['log_completed'])==0
overrides={'search_count':control[1],'outer_mode':1,'outer_ru':places,'scalar_prefix_count':v['chain_state'][2]}
args={name:(overrides[name] if name in overrides else v[name]) for name,kind in d['collectedNames']};assert collected(**args)==0;assert v['outer_state'][17]==1
observed=v['relation_state'][0];source_next=d['appends'][1]['last'];assert observed==296 and source_next==296
observed_records=list(map(str,v['relation_records'][columns*rows:observed*rows]));source_records=list(map(str,d['appends'][1]['newRelations']));assert observed_records[:rows]==source_records
observed_generators=list(map(str,v['generators'][columns*n:observed*n]));source_generators=list(map(str,d['appends'][1]['newGenerators']));assert observed_generators[:n]==source_generators
observed_logs=list(map(str,v['log_embeddings'][columns*7*places:observed*7*places]));source_logs=list(map(str,d['appends'][1]['newLogs']));assert observed_logs[:7*places]==source_logs
# Publish column 296 through the same resident HNF/acceptance boundary.
old_columns=columns;columns=observed;action=append(**append_args(old_columns,columns));action_296=publish(action,columns)
hnf_296=[list(map(str,v[name][:len(d['outputs'][1][key])])) for key,name in [('H','hnf_result_h'),('D','hnf_result_dep'),('B','hnf_result_b'),('C','hnf_result_c')]]
for got,key in zip(hnf_296,('H','D','B','C')):assert got==list(map(str,d['outputs'][1][key])),key
assert action_296==5,(action_296,v['append_attempt_state'],control)
assert v['outer_state'][2]==291
need=control[0];assert need==1
prepare_lie=importlib.import_module('bench.pari-class-group-port.post_rnd_lie_iteration').pari_prepare_post_random_lie
assert prepare_lie(rows,columns,need,1,v['outer_state'],v['relation_state'],v['schedule'],v['log_completed'])==1
args={name:(overrides[name] if name in overrides else v[name]) for name,kind in d['collectedNames']};assert collected(**args)==0;assert v['outer_state'][17]==1
lie_last=v['relation_state'][0];assert lie_last==d['appends'][2]['last']==301,(lie_last,d['appends'][2]['last'])
lie_records=list(map(str,v['relation_records'][columns*rows:lie_last*rows]));lie_source_records=list(map(str,d['appends'][2]['newRelations']));assert lie_records==lie_source_records
lie_generators=list(map(str,v['generators'][columns*n:lie_last*n]));lie_source_generators=list(map(str,d['appends'][2]['newGenerators']));assert lie_generators==lie_source_generators
lie_logs=list(map(str,v['log_embeddings'][columns*7*places:lie_last*7*places]));lie_source_logs=list(map(str,d['appends'][2]['newLogs']));assert lie_logs==lie_source_logs
old_columns=columns;columns=lie_last;action=append(**append_args(old_columns,columns));terminal_action=publish(action,columns)
hnf_terminal=[list(map(str,v[name][:len(d['outputs'][2][key])])) for key,name in [('H','hnf_result_h'),('D','hnf_result_dep'),('B','hnf_result_b'),('C','hnf_result_c')]]
for got,key in zip(hnf_terminal,('H','D','B','C')):assert got==list(map(str,d['outputs'][2][key])),key
assert terminal_action==0,(terminal_action,v['append_attempt_state'],control)
# Continue from the live resident owners.  No terminal HNF, class invariant, or
# transform fixture crosses this boundary.
bridge_module=importlib.import_module('bench.pari-class-group-port.terminal_candidate_final_bridge')
h=int(v['hnf_state'][0]);assert h==2 and int(v['hnf_state'][2])==286
presentation=z(h*h);candidate_relations=z(h*h);candidate_logs=z(7*places*columns)
terminal_invariants=z(h);terminal_number=z(1);invariant_work=z(h*h);invariant_column=z(h);invariant_state=z(6);reduced_relation_state=z(5);bridge_state=z(8)
assert bridge_module.pari_publish_terminal_candidate_tail(terminal_action,rows,places,columns,v['hnf_state'],v['hnf_result_h'],v['hnf_result_b'],v['hnf_result_c'],v['relation_state'],v['accept_regulator'],v['driver_state'],presentation,candidate_relations,candidate_logs,terminal_invariants,terminal_number,invariant_work,invariant_column,invariant_state,reduced_relation_state,bridge_state)==0
assert terminal_number==[int(d['result']['classNumber'])] and terminal_invariants[:bridge_state[5]]==list(map(int,d['result']['invariants']))
n2=h*h;smith_outputs=[z(n2) for _ in range(10)];smith_invariants=z(h);smith_number=z(1);smith_column=z(h);smith_product=z(n2);smith_augmented=z(2*n2);smith_states=[z(5),z(5),z(6),z(6),z(7)]
smith_transform=importlib.import_module('bench.pari-class-group-port.class_group_smith_transform').pari_class_group_smith_transform
assert smith_transform(presentation,h,*smith_outputs,smith_invariants,smith_number,smith_column,smith_product,smith_augmented,*smith_states)==0
assert smith_invariants[:smith_states[-1][1]]==terminal_invariants[:bridge_state[5]] and smith_number==terminal_number
smith_evidence={'diagonal':smith_outputs[0],'left':smith_outputs[1],'left_inverse':smith_outputs[2],'right':smith_outputs[3],'right_inverse':smith_product}
relation_component,transform_component=bridge_module.build_terminal_candidate_components(run_id='field3-post-rnd-live',field_id='x^4-2000022*x-2000042',owner_generation=1,places=places,presentation=presentation,candidate_relations=candidate_relations,candidate_logs=candidate_logs,class_invariants=terminal_invariants,class_number=terminal_number,accept_regulator=v['accept_regulator'],driver_state=v['driver_state'],reduced_relation_state=reduced_relation_state,bridge_state=bridge_state,smith=smith_evidence)
internal=importlib.import_module('bench.pari-class-group-port.class_group_internal_result');final=importlib.import_module('bench.pari-class-group-port.class_group_final_state')
candidate=internal.snapshot_prepared_candidate(relation_component.state,relation_component.layout,relation_component.field_id)
assert transform_component.candidate_sha256==final.canonical_component_sha256(candidate)
assumptions=('PARI 2.17.4 heuristic bounds and floating decisions are assumed',)
partial_payload=internal.make_internal_payload(candidate,assumptions,transforms=transform_component.evidence)
publisher=internal.AtomicResultPublisher(internal.ReplayAuthority(relation_component.field_id,assumptions));partial=publisher.publish(partial_payload)
assert partial.detached_payload()['terminal']['missing_components']==['generators','units']
out={'randomLast':295,'postRandomLast':296,'lieLast':lie_last,'action296':action_296,'terminalAction':terminal_action,'rng':list(map(str,rng)),'control':control,'driverState':v['driver_state'],'outerState':v['outer_state'][:19],'randomRecords':random_records,'randomGenerators':random_generators,'randomLogs':random_logs,'randomHNF':[d['outputs'][0][k] for k in ('H','D','B','C')],'postRecords':observed_records,'postGenerators':observed_generators,'postLogs':observed_logs,'postHNF':hnf_296,'lieRecords':lie_records,'lieGenerators':lie_generators,'lieLogs':lie_logs,'terminalHNF':hnf_terminal,'bridgeState':bridge_state,'terminalInvariants':terminal_invariants[:bridge_state[5]],'terminalClassNumber':terminal_number[0],'candidateSha256':transform_component.candidate_sha256,'transformSha256':final.canonical_component_sha256(transform_component.evidence),'partialSha256':partial.sha256,'partialMissing':partial.detached_payload()['terminal']['missing_components']}
json.dump(out,open(sys.argv[4],'w'))
`;
const cp = run("python3", [
  "-c",
  python,
  payloadPath,
  path.resolve(__dirname, "../.."),
  path.resolve(__dirname, "../../src/lib"),
  cpPath,
]);
assert.equal(cp, "");
const expected = JSON.parse(fs.readFileSync(cpPath));
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "post_rnd_lie_iteration_fixture.json"),
  ),
);
const cacheFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "rnd_lie_cache_resume_fixture.json")),
);
assert.notDeepEqual(cacheFixture.source.post.fact, cacheFixture.source.lie.fact);
assert.equal(
  cacheFixture.source.post.basisHash,
  cacheFixture.source.lie.basisHash,
);
assert.deepEqual(fixture.identity, {
  pariVersion: "2.17.4",
  polynomial: "x^4-2000022*x-2000042",
  corridor: "post-rnd HNF append through genuine LIE terminal candidate",
});
assert.deepEqual(fixture.counts, {
  randomLast: expected.randomLast,
  postRandomLast: expected.postRandomLast,
  lieLast: expected.lieLast,
  action296: expected.action296,
  terminalAction: expected.terminalAction,
});
const actualHashes = {
  rng: sha256(JSON.stringify(expected.rng)),
  postRecords: sha256(JSON.stringify(expected.postRecords)),
  postGenerators: sha256(JSON.stringify(expected.postGenerators)),
  postLogs: sha256(JSON.stringify(expected.postLogs)),
  postHNF: sha256(JSON.stringify(expected.postHNF)),
  lieRecords: sha256(JSON.stringify(expected.lieRecords)),
  lieGenerators: sha256(JSON.stringify(expected.lieGenerators)),
  lieLogs: sha256(JSON.stringify(expected.lieLogs)),
  terminalHNF: sha256(JSON.stringify(expected.terminalHNF)),
};
assert.deepEqual(actualHashes, fixture.hashes);
assert.deepEqual(expected.bridgeState, [0, 288, 301, 2, 286, 2, 6321, 572]);
assert.deepEqual(expected.terminalInvariants, [2, 2]);
assert.equal(expected.terminalClassNumber, 4);
assert.deepEqual(expected.driverState.slice(0, 6), [4, 0, 4, 301, 1, 2]);
assert.deepEqual(expected.partialMissing, ["generators", "units"]);
for (const key of ["candidateSha256", "transformSha256", "partialSha256"])
  assert.match(expected[key], /^[0-9a-f]{64}$/);
const summary = {
  field: 3,
  cpython: {
    counts: fixture.counts,
    hashes: actualHashes,
    driverState: expected.driverState,
    outerState: expected.outerState,
    bridgeState: expected.bridgeState,
    terminalInvariants: expected.terminalInvariants,
    terminalClassNumber: expected.terminalClassNumber,
    candidateSha256: expected.candidateSha256,
    transformSha256: expected.transformSha256,
    partialSha256: expected.partialSha256,
    partialMissing: expected.partialMissing,
  },
  source: {
    randomPasses: events.filter((entry) => entry.event === "random_relations")
      .length,
    appendedPasses: appends.length,
    acceptanceCodes: acceptances.map((entry) => entry.code),
    postFact: cacheFixture.source.post.fact,
    lieFact: cacheFixture.source.lie.fact,
    residentBasis: cacheFixture.source.lie.basisHash,
  },
  conclusion:
    "the live terminal H/B/C state now publishes exact [2,2] Smith data into the immutable final-state interface",
};

async function nativeSmoke() {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "post_rnd_lie_iteration.py"),
  });
  const module = require(built.modulePath);
  const kernel = module.pari_prepare_post_random_lie;
  assert(kernel.nativeAvailable);
  const integer = (values) => values.map(BigInt);
  const replay = (backend) => {
    const relationState = integer([296, 400, 0, 0, 296, 296]);
    const outer = integer(Array(19).fill(0));
    outer[2] = 291n;
    outer[14] = 1n;
    outer[15] = 1n;
    outer[16] = 5n;
    outer[17] = 1n;
    const schedule = integer([0, 0, 1, 0]);
    const logs = integer([296]);
    const status = kernel[backend](
      288n,
      296n,
      1n,
      1n,
      outer,
      relationState,
      schedule,
      logs,
    );
    assert.equal(status, 1n);
    assert.equal(relationState[5], 297n);
    assert.deepEqual(outer.slice(0, 3), integer([1, 0, 291]));
    assert.equal(outer[17], 0n);
    assert.deepEqual(schedule, integer([0, 0, 0, 0]));
    const shortRelation = integer([296, 302, 0, 0, 296, 296]);
    const shortOuter = integer(Array(19).fill(0));
    shortOuter[2] = 291n;
    shortOuter[14] = shortOuter[15] = shortOuter[17] = 1n;
    shortOuter[16] = 5n;
    const snapshot = [...shortOuter];
    assert.equal(
      kernel[backend](
        288n,
        296n,
        1n,
        1n,
        shortOuter,
        shortRelation,
        integer([0, 0, 1, 0]),
        integer([296]),
      ),
      -1n,
    );
    assert.deepEqual(shortOuter, snapshot);
    assert.deepEqual(shortRelation, integer([296, 302, 0, 0, 296, 296]));
    return backend;
  };
  summary.native = [replay("javascript"), replay("gmp")];
  summary.nativeCore = sha256(fs.readFileSync(built.coreSourcePath));
  console.log(JSON.stringify(summary));
}

nativeSmoke().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
