"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const fixturePath = path.join(__dirname, "unit-bridge-cubic-fixtures.json");
const fixtures = JSON.parse(fs.readFileSync(fixturePath));
const sha = (value) => createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 240000, maxBuffer: 128 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}
function values(value) {
  return Array.isArray(value) ? value : value.toArray();
}
function flatten(value) {
  return value.flat(Infinity).map(BigInt);
}

function sourceOracle(pari, archive, item) {
  assert.equal(sha(fs.readFileSync(archive)), fixtures.pari.archive_sha256);
  let source;
  for (const [name, wanted] of [
    ["pari-2.17.4/src/basemath/buch2.c", fixtures.pari.buch2_sha256],
    ["pari-2.17.4/src/basemath/lll.c", fixtures.pari.lll_sha256],
  ]) {
    const contents=run("tar", ["-xOf", archive, name]);
    assert.equal(sha(contents), wanted);
    if(name.endsWith("buch2.c"))source=contents;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-unit-bridge-"));
  const library = path.join(pari, "Olinux-x86_64");
  source=source.replace('#include "paripriv.h"','#include "paripriv.h"\nstatic long oracle_reason;');
  const marker="static GEN\nnot_given(long reason)\n{";
  assert.equal(source.split(marker).length,2);
  source=source.replace(marker,`${marker}\n  oracle_reason = reason;`);
  source += String.raw`
static GEN oracle_re(GEN x){return typ(x)==t_COMPLEX?gel(x,1):x;}
static GEN oracle_im(GEN x){return typ(x)==t_COMPLEX?gel(x,2):gen_0;}
static void oracle_scalar(GEN x){long e=0;x=oracle_re(x);if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static long oracle_phase(GEN x){GEN y=oracle_im(x);if(gequal0(y))return 0;double q=gtodouble(y)/M_PI;long n=lround(q);if(fabs(q-n)>1e-7)pari_err_BUG("unit bridge phase");n%=2;if(n<0)n+=2;return n;}
static void oracle_smat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');oracle_scalar(gcoeff(x,i,j));}putchar(']');}
static void oracle_pmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');printf("%ld",oracle_phase(gcoeff(x,i,j)));}putchar(']');}
static void oracle_ivec(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');pari_printf("\"%Ps\"",gel(x,i));}putchar(']');}
static void oracle_imat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(x,i,j));}putchar(']');}
int main(){pari_init(256000000,10000);long prec=nbits2prec(192),retry=nbits2prec(2048);GEN b0=bnfinit0(gp_read_str("${item.polynomial}"),1,NULL,prec),b=bnfnewprec(b0,retry),nf=bnf_get_nf(b),input=gcopy(bnf_get_logfu(b)),A=gcopy(input),U=NULL;oracle_reason=0;GEN fu=getfu(nf,&A,&U,retry);printf("{\"input\":");oracle_smat(input);printf(",\"inputPhases\":");oracle_pmat(input);printf(",\"logs\":");oracle_smat(A);printf(",\"phases\":");oracle_pmat(A);printf(",\"factor\":");oracle_imat(U);printf(",\"reason\":%ld,\"units\":[",oracle_reason);if(fu)for(long j=1;j<lg(fu);j++){if(j>1)putchar(',');oracle_ivec(algtobasis(nf,gel(fu,j)));}printf("],\"regulator\":");oracle_scalar(bnf_get_reg(b));printf(",\"embedding\":");oracle_smat(nf_get_M(nf));printf(",\"tensor\":[");for(long j=1;j<=3;j++){if(j>1)putchar(',');oracle_imat(zk_multable(nf,col_ei(3,j)));}puts("]}");pari_close();}
`;
  const c = path.join(directory, "oracle.c"), exe = path.join(directory, "oracle");
  fs.writeFileSync(c, source);
  run("cc", ["-O1", "-fsanitize=undefined", "-fno-sanitize-recover=undefined",
    "-I" + path.join(pari, "src/headers"), "-I" + library, c, "-L" + library,
    "-Wl,-rpath," + library, "-lpari", "-lm", "-o", exe]);
  const text = run(exe, []);
  return { expected: JSON.parse(text), traceSha256: sha(text), directory };
}

function allocatePrepare(f, item, backend) {
  const I = (n) => backend === "javascript" ? Array(n).fill(0n) : f.createIntegerBuffer(n, 4096, Array(n).fill(0n));
  const F = (n) => backend === "javascript" ? Array(n).fill(0) : f.createFloat64Buffer(Array(n).fill(0));
  const c = item.columns, sq = c * c;
  const args = [flatten(item.accepted_arch), flatten(item.relation_lattice), BigInt(c), flatten(item.regulator),
    I(2*c),I(4),I(2*c),I(42),I(18),I(42),I(18),Array(6).fill(0n),Array(5).fill(0n),F(5),
    I(5),I(2*c),I(sq),I(sq),F(sq),I(sq),F(sq),I(sq),F(c),I(c),F(2*c),F(sq),I(c),I(c),I(c),F(c),F(c),F(c),I(c),
    I(6),I(3),I(6),I(4),I(4),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(3),F(3),F(3),F(3),I(3),I(2)];
  return { args, u: args[6], clean: args[10], phases: args[11], state: args[12], trace: args[13] };
}
function allocateFactor(f, clean, backend) {
  const I=(n)=>backend==="javascript"?Array(n).fill(0n):f.createIntegerBuffer(n,4096,Array(n).fill(0n));
  const F=(n)=>backend==="javascript"?Array(n).fill(0):f.createFloat64Buffer(Array(n).fill(0));
  const args=[clean,I(4),I(18),I(6),I(4),Array(2).fill(0n),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(2),F(3),F(3),I(4)];
  return {args,factor:args[1],state:args[5]};
}
function allocateGetfu(f, item, clean, phases, factor, backend, precision=item.precision, embedding=item.embedding) {
  const I=(n)=>backend==="javascript"?Array(n).fill(0n):f.createIntegerBuffer(n,4096,Array(n).fill(0n));
  const args=[clean,phases,factor,flatten(embedding),flatten(item.multiplication_basis),BigInt(precision),BigInt(precision),
    I(18),I(18),I(18),Array(6).fill(0n),I(18),I(27),I(18),I(18),I(6),I(9),I(3),I(6),I(4),I(6),I(18),Array(6).fill(0n),I(4),Array(8).fill(0n),Array(3).fill(0n),I(2048),I(2048),I(2048),I(2048),I(2048),I(4096)];
  return {args,units:args[20],logs:args[21],phases:args[22],factor:args[23],state:args[24]};
}
function checkUnit(unit, tensor) {
  const m=Array(9).fill(0n);for(let i=0;i<9;i++)for(let j=0;j<3;j++)m[i]+=unit[j]*tensor[9*j+i];
  const d=m[0]*(m[4]*m[8]-m[7]*m[5])-m[3]*(m[1]*m[8]-m[7]*m[2])+m[6]*(m[1]*m[5]-m[4]*m[2]);
  assert(d===1n||d===-1n);
  const inverse=[(m[4]*m[8]-m[7]*m[5])/d,(m[2]*m[7]-m[1]*m[8])/d,(m[1]*m[5]-m[2]*m[4])/d];
  for(let i=0;i<3;i++){let x=0n;for(let j=0;j<3;j++)x+=m[3*j+i]*inverse[j];assert.equal(x,i===0?1n:0n);}
}
function realNumber(t) { const m=BigInt(t[0]),p=Number(t[1]),e=Number(t[2]); if(p===-1)return Number(m); if(m===0n)return 0; const a=m<0n?-m:m,s=p-53; return (m<0n?-1:1)*Number(a>>BigInt(s))*2**(e-52); }

(async()=>{
  const pari=path.resolve(process.argv[2]||"/home/user/upstream/pari-2.17.4");
  const archive=path.resolve(process.argv[3]||"/home/user/upstream/pari-2.17.4.tar.gz");
  assert.equal(fixtures.cases.length,1);
  const item=fixtures.cases[0], oracle=sourceOracle(pari,archive,item);
  if (process.env.SAGEJS_DUMP_UNIT_ORACLE === "1") {
    console.log(JSON.stringify(oracle.expected));
    return;
  }
  assert.deepEqual(flatten(item.multiplication_basis), flatten(oracle.expected.tensor));
  assert.equal(Math.max(...oracle.expected.input.map((x)=>Number(x[1]))),2176);
  assert.equal(Math.max(...oracle.expected.embedding.map((x)=>Number(x[1]))),2240);
  assert(Math.abs(realNumber(oracle.expected.regulator)-realNumber(item.regulator))<0.5);
  const sourceUnits=flatten(oracle.expected.units),sourceTensor=flatten(oracle.expected.tensor);
  checkUnit(sourceUnits.slice(0,3),sourceTensor);checkUnit(sourceUnits.slice(3,6),sourceTensor);
  const bridgeBuilt=await compileKernel({sourcePath:path.join(__dirname,"unit_bridge_cubic.py")});
  const signedBuilt=await compileKernel({sourcePath:path.join(__dirname,"unit_reconstruction_signed.py")});
  const bridge=require(bridgeBuilt.modulePath), signed=require(signedBuilt.modulePath).pari_getfu_signed_real_cubic;
  const reference=new Map();
  for(const backend of ["javascript","gmp","tagged"]){
    const prep=allocatePrepare(bridge.pari_cubic_unit_bridge_prepare,item,backend);
    assert.equal(bridge.pari_cubic_unit_bridge_prepare[backend](...prep.args),0n,`${backend} prep ${prep.state}`);
    const factor=allocateFactor(bridge.pari_cubic_getfu_factor_rank_two,prep.clean,backend);
    assert.equal(bridge.pari_cubic_getfu_factor_rank_two[backend](...factor.args),0n,`${backend} factor ${factor.state}`);
    const initial=allocateGetfu(signed,item,prep.clean,prep.phases,factor.factor,backend);
    assert.equal(signed[backend](...initial.args),3n,`${backend} initial getfu ${initial.state}`);
    assert.equal(initial.state[0],3n);
    assert.deepEqual(values(initial.units),Array(6).fill(0n));
    assert.deepEqual(values(initial.logs),Array(18).fill(0n));
    assert.deepEqual(initial.phases,Array(6).fill(0n));
    assert.deepEqual(values(initial.factor),Array(4).fill(0n));
    const linkState=Array(3).fill(0n);
    assert.equal(bridge.pari_cubic_unit_retry_link[backend](prep.clean,flatten(oracle.expected.input),linkState),0n,`${backend} retry link ${linkState}`);
    assert.deepEqual(prep.phases,oracle.expected.inputPhases.map(BigInt));
    const retryFactor=allocateFactor(bridge.pari_cubic_getfu_factor_rank_two,flatten(oracle.expected.input),backend);
    assert.equal(bridge.pari_cubic_getfu_factor_rank_two[backend](...retryFactor.args),0n,`${backend} retry factor ${retryFactor.state}`);
    const retry=allocateGetfu(signed,item,flatten(oracle.expected.input),oracle.expected.inputPhases.map(BigInt),retryFactor.factor,backend,2048,oracle.expected.embedding);
    assert.equal(signed[backend](...retry.args),0n,`${backend} retry getfu ${retry.state}`);
    assert.deepEqual(values(retry.units),sourceUnits);
    assert.deepEqual(values(retry.logs),flatten(oracle.expected.logs));
    assert.deepEqual(retry.phases,oracle.expected.phases.map(BigInt));
    assert.deepEqual(values(retry.factor),flatten(oracle.expected.factor));
    const out=backend==="javascript"?Array(2*item.columns).fill(0n):bridge.pari_cubic_unit_compose_provenance.createIntegerBuffer(2*item.columns,4096,Array(2*item.columns).fill(0n));
    assert.equal(bridge.pari_cubic_unit_compose_provenance[backend](prep.u,BigInt(item.columns),retry.factor,out),0n);
    const snapshot={u:values(prep.u),clean:values(prep.clean),phases:prep.phases.slice(),factor:values(retry.factor),provenance:values(out),units:values(retry.units),logs:values(retry.logs),getfuState:initial.state.slice(),retryState:retry.state.slice()};
    if(backend==="javascript")reference.set("answer",snapshot);else assert.deepEqual(snapshot,reference.get("answer"));
  }
  const dynamic=JSON.parse(run("python3",["-c",String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin);q=d['item'];E=d['expected']
b=importlib.import_module('bench.pari-class-group-port.unit_bridge_cubic');g=importlib.import_module('bench.pari-class-group-port.unit_reconstruction_signed').pari_getfu_signed_real_cubic
I=lambda n:[0]*n;F=lambda n:[0.0]*n;c=q['columns'];sq=c*c
a=[[int(x) for x in q['accepted_arch']],[int(x) for x in q['relation_lattice']],c,[int(x) for x in q['regulator']],I(2*c),I(4),I(2*c),I(42),I(18),I(42),I(18),I(6),I(5),F(5),I(5),I(2*c),I(sq),I(sq),F(sq),I(sq),F(sq),I(sq),F(c),I(c),F(2*c),F(sq),I(c),I(c),I(c),F(c),F(c),F(c),I(c),I(6),I(3),I(6),I(4),I(4),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(3),F(3),F(3),F(3),I(3),I(2)]
assert b.pari_cubic_unit_bridge_prepare(*a)==0
f=[a[10],I(4),I(18),I(6),I(4),I(2),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(2),F(3),F(3),I(4)];assert b.pari_cubic_getfu_factor_rank_two(*f)==0
x=[a[10],a[11],f[1],[int(v) for v in q['embedding']],[int(v) for v in q['multiplication_basis']],q['precision'],q['phase_precision'],I(18),I(18),I(18),I(6),I(18),I(27),I(18),I(18),I(6),I(9),I(3),I(6),I(4),I(6),I(18),I(6),I(4),I(8),I(3),I(64),I(64),I(64),I(64),I(64),I(128)];assert g(*x)==3 and x[24][0]==3
assert x[20]==I(6) and x[21]==I(18) and x[22]==I(6) and x[23]==I(4)
ri=[int(v) for t in E['input'] for v in t]
ls=I(3);assert b.pari_cubic_unit_retry_link(a[10],ri,ls)==0 and ls[0]==6 and ls[1]<=16 and ls[2]==1
assert a[11]==E['inputPhases']
rf=[ri,I(4),I(18),I(6),I(4),I(2),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(2),F(3),F(3),I(4)];assert b.pari_cubic_getfu_factor_rank_two(*rf)==0
rx=[ri,[int(v) for v in E['inputPhases']],rf[1],[int(v) for t in E['embedding'] for v in t],[int(v) for row in E['tensor'] for v in row],2048,2048,I(18),I(18),I(18),I(6),I(18),I(27),I(18),I(18),I(6),I(9),I(3),I(6),I(4),I(6),I(18),I(6),I(4),I(8),I(3),I(320),I(320),I(320),I(320),I(320),I(128)];assert g(*rx)==0
assert list(map(str,rx[20]))==[z for row in E['units'] for z in row]
assert list(map(str,rx[21]))==[str(z) for t in E['logs'] for z in t]
assert rx[22]==[int(v) for v in E['phases']],(rx[22],E['phases'])
assert list(map(str,rx[23]))==E['factor'],(rx[23],E['factor'])
o=I(2*c);assert b.pari_cubic_unit_compose_provenance(a[6],c,rx[23],o)==0
print(json.dumps({'units':2,'relations':q['resident_state']['relation_count'],'phaseBits':sum(a[11]),'initialStatus':'PRECI','retryStatus':'success'}))
`,root,path.join(root,"src/lib")],{input:JSON.stringify({item,expected:oracle.expected})}));
  console.log(JSON.stringify({cases:1,backends:["cpython","javascript","gmp","tagged"],dynamic,traceSha256:oracle.traceSha256,
    exactUnits:"native retry equals pristine source",exactNorms:true,exactLogs:"native retry equals pristine source",composedProvenance:true,coreBytes:fs.statSync(bridgeBuilt.coreSourcePath).size,
    residentGetfuStatus:"PRECI then successful p2240-capacity retry",remaining:{mixedSignature:"not connected",wideSelector:"not exercised"},artifactDirectory:oracle.directory}));
})().catch(error=>{console.error(error);process.exitCode=1;});
