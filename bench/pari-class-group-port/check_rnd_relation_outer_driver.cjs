"use strict";

// Compose the authenticated rnd_rel corridor with the retained outer retry
// state. The source oracle changes control only: no relation/HNF answer is an
// input to the ordinary Python computation.
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
import copy, decimal, importlib, inspect, json, sys
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
observed=v['relation_state'][0];source_next=d['appends'][1]['last'];assert observed==298 and source_next==296
observed_records=list(map(str,v['relation_records'][columns*rows:observed*rows]));source_records=list(map(str,d['appends'][1]['newRelations']));assert observed_records[:rows]!=source_records
out={'randomLast':columns,'observedNext':observed,'sourceNext':source_next,'rng':list(map(str,rng)),'control':control,'driverState':v['driver_state'],'outerState':v['outer_state'][:19],'randomRecords':random_records,'randomGenerators':random_generators,'randomLogs':random_logs,'randomHNF':[d['outputs'][0][k] for k in ('H','D','B','C')],'observedNextRecords':observed_records,'sourceNextRecords':source_records}
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
    path.join(__dirname, "rnd_relation_outer_driver_fixture.json"),
  ),
);
assert.deepEqual(fixture.identity, {
  pariVersion: "2.17.4",
  polynomial: "x^4-2000022*x-2000042",
  corridor: "forced rnd_rel append through first subsequent LIE small_norm",
});
assert.deepEqual(fixture.counts, {
  randomLast: expected.randomLast,
  pariNext: expected.sourceNext,
  nativeNext: expected.observedNext,
});
const actualHashes = {
  rngAfterRandomIdeal: sha256(JSON.stringify(expected.rng)),
  randomPrefixRelations: sha256(JSON.stringify(expected.randomRecords)),
  randomPrefixGenerators: sha256(JSON.stringify(expected.randomGenerators)),
  randomPrefixLogs: sha256(JSON.stringify(expected.randomLogs)),
  randomPrefixHnf: sha256(JSON.stringify(expected.randomHNF)),
  nativeNextRelations: sha256(JSON.stringify(expected.observedNextRecords)),
  pariNextRelations: sha256(JSON.stringify(expected.sourceNextRecords)),
};
assert.deepEqual(actualHashes, fixture.hashes);
const summary = {
    field: 3,
    cpython: {
      randomLast: expected.randomLast,
      observedNext: expected.observedNext,
      sourceNext: expected.sourceNext,
      driverState: expected.driverState,
      rng: actualHashes.rngAfterRandomIdeal,
      relations: actualHashes.randomPrefixRelations,
      generators: actualHashes.randomPrefixGenerators,
      logs: actualHashes.randomPrefixLogs,
      hnf: actualHashes.randomPrefixHnf,
      observedNextRelations: actualHashes.nativeNextRelations,
      sourceNextRelations: actualHashes.pariNextRelations,
    },
    source: {
      randomPasses: events.filter((entry) => entry.event === "random_relations")
        .length,
      appendedPasses: appends.length,
      acceptanceCodes: acceptances.map((entry) => entry.code),
    },
    frontier:
      "post-rnd LIE small_norm persistent FACT/cache state: native closure appends 3 different relations where PARI appends 1",
    directory,
};

async function nativeSmoke() {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "rnd_relation_outer_driver.py"),
  });
  const module = require(built.modulePath);
  const kernel = module.pari_publish_random_outer_append;
  assert(kernel.nativeAvailable);
  const integer = (values) => values.map(BigInt);
  const replay = (backend) => {
    const appendState = integer([2, 0, 2, 0, 0, 0, 0, 8, 0]);
    const residentState = integer(Array(9).fill(0));
    const residentH = integer(Array(4).fill(0));
    const residentB = integer(Array(4).fill(0));
    const residentC = integer(Array(112).fill(0));
    const relationState = integer([8, 32, 0, 0, 7, 8]);
    const search = integer(Array(4).fill(0));
    const outerPermutation = integer(Array(4).fill(0));
    const outer = integer(Array(19).fill(0));
    const driverState = integer([3, 3, 1, 7, 0, 0, 0, 7]);
    const trace = integer(Array(10).fill(0));
    const control = integer([0, 0, 0, 0, 0, 0]);
    const status = kernel[backend](
      4n,
      2n,
      3n,
      8n,
      5n,
      integer([3, 0, 0, 8]),
      appendState,
      integer([2, 0, 0, 2]),
      [],
      integer([1, 0, 0, 1]),
      integer(Array.from({ length: 112 }, (_, i) => i + 1)),
      residentState,
      residentH,
      [],
      residentB,
      residentC,
      relationState,
      integer([2, 1, 4, 3]),
      search,
      outerPermutation,
      outer,
      integer([0, 1, 0, 1]),
      integer([2, 0]),
      driverState,
      trace,
      control,
    );
    assert.equal(status, 5n);
    assert.deepEqual(control, integer([1, 4, 1, 2, 2, 8]));
    assert.deepEqual(search, integer([2, 1, 4, 3]));
    assert.deepEqual(outerPermutation, integer([2, 1, 4, 3]));
    assert.equal(outer[4], 10n);
    assert.equal(outer[14], 1n);
    assert.equal(outer[15], 1n);
    assert.equal(relationState[4], 8n);
    assert.equal(driverState[2], 2n);
    assert.equal(driverState[3], 8n);
    assert.equal(driverState[6], 112n);
    assert.deepEqual(trace.slice(5, 10), integer([8, 5, 0, 0, 10]));
    assert.deepEqual(residentState, appendState);
    assert.deepEqual(residentH, integer([2, 0, 0, 2]));
    assert.deepEqual(residentB, integer([1, 0, 0, 1]));
    assert.deepEqual(
      residentC,
      integer(Array.from({ length: 112 }, (_, i) => i + 1)),
    );
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
