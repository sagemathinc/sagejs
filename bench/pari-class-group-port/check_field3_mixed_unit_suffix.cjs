"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const { retainedField3, hash } = require("./field3_mixed_unit_suffix_replay.cjs");

const root = path.resolve(__dirname, "../..");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 900000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};

const authorityIndex = process.argv.indexOf("--authority");
const authority =
  authorityIndex >= 0
    ? JSON.parse(fs.readFileSync(process.argv[authorityIndex + 1], "utf8"))
    : retainedField3(...process.argv.slice(2, 6));
assert.equal(authority.A.length, 273);
assert.equal(authority.L.length, 26);
assert.equal(authority.terminalColumns, 301);
assert.equal(authority.retainedBColumns, 286);

const python = String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(0);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
u=importlib.import_module('bench.pari-class-group-port.unit_lattice_reduction')
t=importlib.import_module('bench.pari-class-group-port.log_matrix_transform')
m=importlib.import_module('bench.pari-class-group-port.field3_mixed_unit_suffix')
I=lambda n:[0]*n; F=lambda n:[0.0]*n; c=13; sq=c*c; A=list(map(int,d['A']));L=list(map(int,d['L']));R=list(map(int,d['R']))
u1=I(26); ist=I(5); ia=[I(26),I(sq),I(sq),F(sq),I(sq),F(sq),I(sq),F(c),I(c),F(26),F(sq),I(c),I(c),I(c),F(c),F(c),F(c),I(c)]
assert u.pari_unit_integer_lattice_rank_two(L,c,u1,ist,*ia)==0
p=I(42);assert t.pari_log_matrix_transform(A,u1,3,c,2,False,p)==0
def real_rows(x): return [x[7*(j*3+i)+q] for i in range(3) for j in range(2) for q in (1,2,3)]
def reduce(x):
 rows=3; out=I(4); a=[I(6),out,I(3),I(6),I(4),I(4),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(3),F(3),F(3),F(3),I(3),I(2)]
 assert u.pari_unit_real_lattice_rank_two(real_rows(x),rows,*a)==0
 return out
u2=reduce(p);U=I(26);u.pari_unit_compose_rank_two(u1,c,u2,U);AU=I(42);t.pari_log_matrix_transform(A,U,3,c,2,False,AU)
clean=I(42);cs=I(42);state=I(6);work=[I(3),I(512),I(512),I(512),I(512),I(1024)]
status=m.pari_cleanarchunit_mixed_quartic(AU,R,192,*work,cs,clean,state);assert status==0,(status,state)
identity=[1,0,0,1];matep=I(42);arch=I(42);fc=I(42);ar=I(18);ai=I(18);cr=I(18);ci=I(18)
m.pari_field3_prepare_getfu(clean,identity,matep,arch,fc,ar,ai,cr,ci);u3=reduce(matep)
m.pari_field3_prepare_getfu(clean,u3,matep,arch,fc,ar,ai,cr,ci)
g=importlib.import_module('bench.pari-class-group-port.getfu_mixed_quartic');gs=I(8);ga=[ar,ai,cr,ci,u3,list(map(int,d['embeddingReal'])),list(map(int,d['embeddingImag'])),list(map(int,d['multiplicationBasis'])),192,I(18),I(18),I(48),I(24),I(48),I(24),I(24),I(8),I(16),I(4),I(8),I(4),I(8),I(18),I(18),I(4),gs,I(4),I(3),I(3),I(512),I(512),I(512),I(512),I(1024)];getfu_status=g.pari_getfu_mixed_quartic(*ga);assert getfu_status in (0,2,3)
held=clean[:];bad=AU[:];bad[3]=0;badstate=I(6);negative=m.pari_cleanarchunit_mixed_quartic(bad,R,192,*[I(3),I(512),I(512),I(512),I(512),I(1024)],I(42),clean,badstate);assert negative==1,(negative,badstate);assert clean==held
assert [m.pari_field3_unit_suffix_action(0,x) for x in (0,2,3)]==[0,3,4]
print(json.dumps({'U1':list(map(str,u1)),'U2':list(map(str,u2)),'U':list(map(str,U)),'AU':list(map(str,AU)),'clean':list(map(str,held)),'cleanState':list(map(str,state)),'getfuFactor':list(map(str,u3)),'archReal':list(map(str,ar)),'archImag':list(map(str,ai)),'cleanReal':list(map(str,cr)),'cleanImag':list(map(str,ci)),'getfuStatus':getfu_status,'getfuState':list(map(str,gs)),'negativeState':list(map(str,badstate))}))
`;
const expected = JSON.parse(
  run("python3", ["-c", python, root, path.join(root, "src/lib")], {
    input: JSON.stringify(authority),
  }),
);

const ints = (n) => Array(n).fill(0n);
const floats = (n) => Array(n).fill(0);
const realRows = (x) => {
  const out = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++)
      for (const q of [1, 2, 3]) out.push(x[7 * (j * 3 + i) + q]);
  return out;
};

(async () => {
  const lattice = require(
    (await compileKernel({ sourcePath: path.join(__dirname, "unit_lattice_reduction.py") }))
      .modulePath,
  );
  const transform = require(
    (await compileKernel({ sourcePath: path.join(__dirname, "log_matrix_transform.py") }))
      .modulePath,
  ).pari_log_matrix_transform;
  const mixed = require(
    (await compileKernel({ sourcePath: path.join(__dirname, "field3_mixed_unit_suffix.py") }))
      .modulePath,
  );
  const getfu = require(
    (await compileKernel({ sourcePath: path.join(__dirname, "getfu_mixed_quartic.py") }))
      .modulePath,
  ).pari_getfu_mixed_quartic;
  const results = [];
  for (const backend of ["javascript", "gmp"]) {
    const A = authority.A.map(BigInt), L = authority.L.map(BigInt), R = authority.R.map(BigInt);
    const c = 13, sq = c * c, u1 = ints(26), ist = ints(5);
    const ia = [ints(26),ints(sq),ints(sq),floats(sq),ints(sq),floats(sq),ints(sq),floats(c),ints(c),floats(26),floats(sq),ints(c),ints(c),ints(c),floats(c),floats(c),floats(c),ints(c)];
    assert.equal(lattice.pari_unit_integer_lattice_rank_two[backend](L,13n,u1,ist,...ia),0n);
    const p=ints(42);assert.equal(transform[backend](A,u1,3n,13n,2n,false,p),0n);
    const reduce=(x)=>{const out=ints(4),a=[ints(6),out,ints(3),ints(6),ints(4),ints(4),floats(4),ints(4),floats(4),ints(4),floats(2),ints(2),floats(6),floats(4),ints(2),ints(3),ints(3),floats(3),floats(3),floats(3),ints(3),ints(2)];assert.equal(lattice.pari_unit_real_lattice_rank_two[backend](realRows(x),3n,...a),0n);return out};
    const u2=reduce(p),U=ints(26);lattice.pari_unit_compose_rank_two[backend](u1,13n,u2,U);const AU=ints(42);transform[backend](A,U,3n,13n,2n,false,AU);
    const clean=ints(42),scratch=ints(42),state=ints(6),work=[ints(3),ints(512),ints(512),ints(512),ints(512),ints(1024)];assert.equal(mixed.pari_cleanarchunit_mixed_quartic[backend](AU,R,192n,...work,scratch,clean,state),0n);
    const matep=ints(42),arch=ints(42),fc=ints(42),ar=ints(18),ai=ints(18),cr=ints(18),ci=ints(18);mixed.pari_field3_prepare_getfu[backend](clean,[1n,0n,0n,1n],matep,arch,fc,ar,ai,cr,ci);const u3=reduce(matep);mixed.pari_field3_prepare_getfu[backend](clean,u3,matep,arch,fc,ar,ai,cr,ci);
    const E=(values)=>backend==="gmp"?getfu.createIntegerBuffer(values.length,8192,values):values;const Z=(n)=>E(ints(n));const gs=ints(8),pivots=ints(4),ga=[E(ar),E(ai),E(cr),E(ci),E(u3),E(authority.embeddingReal.map(BigInt)),E(authority.embeddingImag.map(BigInt)),E(authority.multiplicationBasis.map(BigInt)),192n,Z(18),Z(18),Z(48),Z(24),Z(48),Z(24),Z(24),Z(8),Z(16),Z(4),Z(8),Z(4),Z(8),Z(18),Z(18),Z(4),gs,pivots,Z(3),Z(3),Z(512),Z(512),Z(512),Z(512),Z(1024)];const getfuStatus=getfu[backend](...ga);assert.equal(String(getfuStatus),String(expected.getfuStatus));assert.deepEqual(gs.map(String),expected.getfuState);
    for(const [name,got] of Object.entries({U1:u1,U2:u2,U,AU,clean,cleanState:state,getfuFactor:u3,archReal:ar,archImag:ai,cleanReal:cr,cleanImag:ci}))assert.deepEqual(got.map(String),expected[name].map(String),`${backend} ${name}`);
    const held=[...clean],bad=[...AU];bad[3]=0n;const bs=ints(6);assert.equal(mixed.pari_cleanarchunit_mixed_quartic[backend](bad,R,192n,ints(3),ints(512),ints(512),ints(512),ints(512),ints(1024),ints(42),clean,bs),1n);assert.deepEqual(clean,held);assert.deepEqual(bs.map(String),expected.negativeState.map(String));
    assert.deepEqual([0n,2n,3n].map(x=>mixed.pari_field3_unit_suffix_action[backend](0n,x)),[0n,3n,4n]);results.push(backend);
  }
  console.log(JSON.stringify({field:3,authoritySha256:authority.authoritySha256,preparedOwnerSha256:authority.preparedOwnerSha256,terminalColumns:301,retainedBColumns:286,unitColumns:13,cpython:true,backends:results,cleanState:expected.cleanState,getfuFactor:expected.getfuFactor,getfuStatus:expected.getfuStatus,getfuState:expected.getfuState,legitimateNotGiven:expected.getfuStatus===2?"LARGE":expected.getfuStatus===3?"PRECI":null,transactionalNegative:true,outputSha256:hash(JSON.stringify(expected))}));
})().catch((error)=>{console.error(error);process.exitCode=1;});
