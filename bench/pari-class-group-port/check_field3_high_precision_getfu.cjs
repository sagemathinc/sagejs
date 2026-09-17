"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const source = path.join(__dirname, "field3_high_precision_getfu.py");
const coordinator = path.join(
  __dirname,
  "field3_high_precision_getfu_coordinator.cjs",
);
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}, expected = 0) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

// Capture pristine PARI's low-precision field-3 boundary.  This takes seconds
// and does not execute the forbidden authentic 153088-bit getfu attempt.
const oracle = require("./field3_mixed_unit_suffix_replay.cjs").liveField3();
const rootText = fs.readFileSync(source, "utf8");
assert.equal(
  [...rootText.matchAll(/status = pari_getfu_mixed_quartic\(/g)].length,
  1,
);

const lowDifferential = JSON.parse(
  run(
    "python3",
    [
      "-c",
      String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3];payload=json.load(sys.stdin);d=payload['oracle'];r=payload['retained'];I=lambda n:[0]*n;F=lambda n:[0.0]*n
def logs(records):
 out=[]
 for kind,real,imag in records: out += [int(kind),*map(int,real),*map(int,imag)]
 return out
embedding_real=[];embedding_imag=[]
for kind,real,imag in d['embedding']:
 embedding_real += list(map(int,real));embedding_imag += list(map(int,imag))
tensor=list(map(int,sum(d['tensor'],[])))
prep=importlib.import_module('bench.pari-class-group-port.field3_mixed_unit_suffix')
u=importlib.import_module('bench.pari-class-group-port.unit_lattice_reduction')
transform=importlib.import_module('bench.pari-class-group-port.log_matrix_transform')
g=importlib.import_module('bench.pari-class-group-port.getfu_mixed_quartic')
A=logs(r['A']);L=list(map(int,r['L']));R=list(map(int,r['R']));columns=13;square=169
u1=I(26);ist=I(5);ia=[I(26),I(square),I(square),F(square),I(square),F(square),I(square),F(columns),I(columns),F(26),F(square),I(columns),I(columns),I(columns),F(columns),F(columns),F(columns),I(columns)]
assert u.pari_unit_integer_lattice_rank_two(L,columns,u1,ist,*ia)==0
p1=I(42);transform.pari_log_matrix_transform(A,u1,3,columns,2,False,p1)
def reduce(x):
 rows=[]
 for i in range(3):
  for j in range(2): rows += x[7*(j*3+i)+1:7*(j*3+i)+4]
 out=I(4);work=[I(6),out,I(3),I(6),I(4),I(4),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(3),F(3),F(3),F(3),I(3),I(2)]
 assert u.pari_unit_real_lattice_rank_two(rows,3,*work)==0
 return out
u2=reduce(p1);U=I(26);u.pari_unit_compose_rank_two(u1,columns,u2,U);AU=I(42);transform.pari_log_matrix_transform(A,U,3,columns,2,False,AU)
clean=I(42);assert prep.pari_cleanarchunit_mixed_quartic(AU,R,192,I(3),I(512),I(512),I(512),I(512),I(1024),I(42),clean,I(6))==0
matep=I(42);arch=I(42);fc=I(42);ar=I(18);ai=I(18);cr=I(18);ci=I(18)
prep.pari_field3_prepare_getfu(clean,[1,0,0,1],matep,arch,fc,ar,ai,cr,ci)
factor=reduce(matep)
prep.pari_field3_prepare_getfu(clean,factor,matep,arch,fc,ar,ai,cr,ci)
state=I(8);work=[I(18),I(18),I(48),I(24),I(48),I(24),I(24),I(8),I(16),I(4),I(8),I(4),I(8),I(18),I(18),I(4),state,I(4),I(3),I(3),I(512),I(512),I(512),I(512),I(1024)]
status=g.pari_getfu_mixed_quartic(ar,ai,cr,ci,factor,embedding_real,embedding_imag,tensor,192,*work)
assert status==d['reason'],(status,d['reason'],state)
print(json.dumps({'status':status,'state':state,'factor':factor}))
`,
      root,
      path.join(root, "src/lib"),
    ],
    {
      input: JSON.stringify({
        oracle,
        retained: JSON.parse(
          fs.readFileSync(
            "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/mixed-unit-live-b3ccd8916527e8a7df4a7d10a2f5cb9e76865d5209532817ac65c1aaa178f5e7.json",
            "utf8",
          ),
        ),
      }),
    },
  ).stdout,
);
assert.equal(lowDifferential.status, oracle.reason);

const python = String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module('bench.pari-class-group-port.field3_high_precision_getfu')
prep=importlib.import_module('bench.pari-class-group-port.field3_mixed_unit_suffix')
I=lambda n,v=0:[v]*n
clean=[]
for column in range(2):
 for row in range(3): clean += [1,1<<63,64,column*3+row,0,-1,0]
factor=[1,0,0,1]
matep=I(42);arch=I(42);factored=I(42);ar=I(18);ai=I(18);cr=I(18);ci=I(18)
prep.pari_field3_prepare_getfu(clean,factor,matep,arch,factored,ar,ai,cr,ci)
# Power basis for x^4-2, flattened as four multiplication matrices.
tensor=[]
for basis in range(4):
 matrix=[]
 for column in range(4):
  for row in range(4):
   degree=basis+column
   coefficient=1
   if degree>=4: degree-=4;coefficient=2
   matrix.append(coefficient if row==degree else 0)
 tensor += matrix
embedding=[1,-1,0]*12
raw=list(range(1,603))
rounded_expected=[1,1,1,1,1,1,0,0]
units_expected=[-1,1,0,0,1,1,0,0]
def fake(*args):
 rounded,candidate,nfactor,outunits=args[16],args[19],args[20],args[21]
 for i,v in enumerate(rounded_expected): rounded[i]=v
 for i,v in enumerate(units_expected): candidate[i]=v;outunits[i]=v
 for i,v in enumerate([-factor[0],-factor[1],factor[2],factor[3]]): nfactor[i]=v;args[24][i]=v
 for i in range(18):
  sign=-1 if i<9 else 1
  args[22][i]=sign*args[2][i];args[23][i]=sign*args[3][i]
 args[25][:]=[0,0,0,0,-1,1,2,1]
 return 0
m.pari_getfu_mixed_quartic=fake
def call(precision=192,coeff=512,factor_value=None,terminal=None):
 held=777
 outputs=[I(8,held),I(18,held),I(18,held),I(4,held),I(602,held),I(12,held)]
 work=[I(42),I(42),I(42),I(18),I(18),I(18),I(18),I(18),I(18),I(48),I(24),I(48),I(24),I(24),I(8),I(16),I(4),I(8),I(4),I(18),I(18),I(8),I(4),I(3),I(3),I(coeff),I(coeff),I(coeff),I(coeff),I(105),I(602)]
 selected=factor if factor_value is None else factor_value
 if terminal is not None:
  def stopped(*args): args[25][:]=[terminal,20,-10,0,0,0,0,1];return terminal
  m.pari_getfu_mixed_quartic=stopped
 try:
  status=m.pari_field3_high_precision_getfu(clean,selected,ar,ai,cr,ci,raw,embedding,embedding,tensor,precision,1,*work,*outputs)
  return {'status':status,'outputs':outputs,'rounded':work[14],'getfuState':work[21]}
 except Exception as error:
  return {'error':str(error),'outputs':outputs}
success=call()
assert success['status']==0 and success['outputs'][0]==units_expected
assert success['outputs'][3]==[-1,0,0,1]
assert success['outputs'][4][:301]==[-x for x in raw[:301]] and success['outputs'][4][301:]==raw[301:]
assert success['outputs'][5]==[0,192,1,2,1,1,512,301,0,-1,1,602]
preci=call(terminal=3);assert preci['status']==3 and all(all(x==777 for x in out) for out in preci['outputs'][:5])
# Restore the success fake after the terminal branch monkeypatch.
m.pari_getfu_mixed_quartic=fake
large=call(terminal=2);assert large['status']==2 and all(all(x==777 for x in out) for out in large['outputs'][:5])
m.pari_getfu_mixed_quartic=fake
capacity=call(153088,512);assert 'short field-3 C6 owner or workspace' in capacity['error'] and all(all(x==777 for x in out) for out in capacity['outputs'])
overflow=call(factor_value=[1<<200,0,0,1]);assert 'not unimodular' in overflow['error'] and all(all(x==777 for x in out) for out in overflow['outputs'])
mutated=ar[:];mutated[0]+=1;held=I(8,777)
try:
 args=[clean,factor,mutated,ai,cr,ci,raw,embedding,embedding,tensor,192,1]+[I(42),I(42),I(42),I(18),I(18),I(18),I(18),I(18),I(18),I(48),I(24),I(48),I(24),I(24),I(8),I(16),I(4),I(8),I(4),I(18),I(18),I(8),I(4),I(3),I(3),I(512),I(512),I(512),I(512),I(91),I(602),held,I(18,777),I(18,777),I(4,777),I(602,777),I(12,777)]
 m.pari_field3_high_precision_getfu(*args);raise AssertionError('prepared mutation accepted')
except ValueError as error: assert 'prepared getfu arrays changed' in str(error) and held==I(8,777)
print(json.dumps({'clean':clean,'factor':factor,'archReal':ar,'archImag':ai,'cleanReal':cr,'cleanImag':ci,'tensor':tensor,'embedding':embedding,'raw':raw,'rounded':success['rounded'],'units':success['outputs'][0],'logsReal':success['outputs'][1],'logsImag':success['outputs'][2],'adjustedFactor':success['outputs'][3],'adjustedWraw':success['outputs'][4],'state':success['outputs'][5],'preciState':preci['outputs'][5],'largeState':large['outputs'][5],'getfuState':success['getfuState']}))
`;
const joined = JSON.parse(
  run("python3", ["-c", python, root, path.join(root, "src/lib")]).stdout,
);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-c6-getfu-"));
const published = path.join(temporary, "published");
function writeOwner(stem, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = sha(bytes);
  const selected = path.join(temporary, `${stem}-${digest}.json`);
  fs.writeFileSync(selected, bytes, { mode: 0o444 });
  fs.chmodSync(selected, 0o444);
  return { path: selected, sha256: digest, value };
}
const runIdentity = "pari-2.17.4:test:x4-2:p192";
const c5 = writeOwner("c5", {
  schema: "sagejs.pari-class-group/field3-c5-unit-lattice-cleanarch-v1",
  field: "x^4-2",
  runIdentity,
  precision: 192,
  generation: 1,
  fullTerminalOwnerSha256: "1".repeat(64),
  c3OwnerSha256: "2".repeat(64),
  acceptedC4OwnerSha256: "3".repeat(64),
  acceptanceState: [0, 1, 192, 1],
  state: [0, 192, 3, 0, 0, 0, 0, 1, 1, 1, 301, 13, 2, 2, 15],
  getfuFactor: joined.factor.map(String),
  preparedArchReal: joined.archReal.map(String),
  preparedArchImag: joined.archImag.map(String),
  preparedCleanReal: joined.cleanReal.map(String),
  preparedCleanImag: joined.cleanImag.map(String),
  rawUnitTransform: joined.raw.map(String),
});
const embedding = writeOwner("embedding", {
  schema: "sagejs.pari-class-group/field3-prepared-embedding-owner-v1",
  runIdentity,
  polynomial: [-2, 0, 0, 0, 1],
  signature: [2, 1],
  tensor: joined.tensor.map(String),
});
function candidate(overrides = {}) {
  return {
    schema: "sagejs.pari-class-group/field3-c6-getfu-candidate-v1",
    c5OwnerSha256: c5.sha256,
    embeddingOwnerSha256: embedding.sha256,
    precision: 192,
    generation: 1,
    status: 0,
    factorDeterminant: "1",
    state: joined.state.map(String),
    roundedUnits: joined.rounded.map(String),
    units: joined.units.map(String),
    logsReal: joined.logsReal.map(String),
    logsImag: joined.logsImag.map(String),
    adjustedFactor: joined.adjustedFactor.map(String),
    adjustedWraw: joined.adjustedWraw.map(String),
    ...overrides,
  };
}
function coordinate(selected, expected = 0) {
  return run(
    "node",
    [
      coordinator,
      "--c5-owner",
      c5.path,
      "--c5-sha256",
      c5.sha256,
      "--embedding-owner",
      embedding.path,
      "--embedding-sha256",
      embedding.sha256,
      "--candidate",
      selected.path,
      "--candidate-sha256",
      selected.sha256,
      "--output-dir",
      published,
    ],
    {},
    expected,
  );
}
const accepted = writeOwner("candidate", candidate());
const first = JSON.parse(coordinate(accepted).stdout);
const second = JSON.parse(coordinate(accepted).stdout);
assert.deepEqual(second, first);
assert.equal(first.status, "success");
assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
const result = JSON.parse(fs.readFileSync(first.path, "utf8"));
assert.deepEqual(result.unitNorms, ["-1", "-1"]);
assert.equal(result.inverseMask, 1);

let mutations = 0;
for (const mutate of [
  (value) => value.units.splice(0, 1, String(BigInt(value.units[0]) + 1n)),
  (value) => value.adjustedWraw.splice(301, 1, "999"),
  (value) => (value.c5OwnerSha256 = "0".repeat(64)),
  (value) => value.logsReal.pop(),
]) {
  const value = candidate();
  mutate(value);
  const bad = writeOwner(`mutation-${mutations}`, value);
  assert.notEqual(coordinate(bad, 1).stderr.length, 0);
  mutations++;
}

for (const [status, label, terminalState] of [
  [2, "LARGE", joined.largeState],
  [3, "PRECI", joined.preciState],
]) {
  const terminal = writeOwner(
    `terminal-${status}`,
    candidate({
      status,
      state: terminalState.map(String),
      roundedUnits: [],
      units: [],
      logsReal: [],
      logsImag: [],
      adjustedFactor: [],
      adjustedWraw: [],
    }),
  );
  const terminalResult = JSON.parse(coordinate(terminal).stdout);
  assert.equal(terminalResult.status, "not_given");
  assert.equal(terminalResult.reason, label);
}

console.log(
  JSON.stringify(
    {
      pristinePariDifferential: true,
      leafTraceSha256: oracle.traceSha256,
      cpythonJoin: true,
      highPrecisionCapacityPreflight: 16385,
      terminalReasons: ["LARGE", "PRECI"],
      exactUnitNorms: result.unitNorms,
      inverseMask: result.inverseMask,
      productOne: true,
      rawRows: 301,
      mutationsRejected: mutations,
      idempotentPublication: true,
      authentic153088Executed: false,
      outputSha256: first.sha256,
    },
    null,
    2,
  ),
);
