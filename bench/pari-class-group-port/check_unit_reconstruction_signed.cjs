"use strict";

// Connected pristine-source oracle for the characteristic-two sign phase in
// PARI 2.17.4 buch2.c:getfu.  The candidate receives the actual clean A and
// pre-normalization U chosen by PARI's real LLL, never a known unit answer.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sha = (value) => createHash("sha256").update(value).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function sourceFixtures(pari, archive) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-getfu-signed-"));
  const library = path.join(pari, "Olinux-x86_64");
  assert.equal(
    sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  let source = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/buch2.c",
  ]);
  assert.equal(
    sha(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  source = source.replace(
    '#include "paripriv.h"',
    '#include "paripriv.h"\nstatic long oracle_reason;',
  );
  const marker = "static GEN\nnot_given(long reason)\n{";
  assert.equal(source.split(marker).length, 2);
  source = source.replace(marker, `${marker}\n  oracle_reason = reason;`);
  source += String.raw`
static GEN oracle_realpart(GEN x) { return typ(x)==t_COMPLEX? gel(x,1): x; }
static GEN oracle_imagpart(GEN x) { return typ(x)==t_COMPLEX? gel(x,2): gen_0; }
static long oracle_phasebit(GEN x) {
  GEN y=oracle_imagpart(x); if (gequal0(y)) return 0;
  double q=gtodouble(y)/M_PI; long n=lround(q);
  if (fabs(q-(double)n)>1e-7) pari_err_BUG("non-characteristic-two phase");
  n%=2; if(n<0)n+=2; return n;
}
static void scalar(GEN x) {
  long e=0; x=oracle_realpart(x);
  if (typ(x)==t_INT) pari_printf("[\"%Ps\",-1,0]",x);
  else if (!signe(x)) printf("[\"0\",0,%ld]",expo(x));
  else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));
}
static void oracle_scalarmat(GEN x) {
  putchar('['); for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){
    if(j>1||i>1)putchar(',');scalar(gcoeff(x,i,j));} putchar(']');
}
static void phases(GEN x) {
  putchar('['); for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){
    if(j>1||i>1)putchar(',');printf("%ld",oracle_phasebit(gcoeff(x,i,j)));} putchar(']');
}
static void intmat(GEN x) {
  putchar('['); for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){
    if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(x,i,j));} putchar(']');
}
static GEN input_logs(GEN bnf,long kind,long prec) {
  GEN A=gcopy(bnf_get_logfu(bnf));
  if(kind==1){GEN T=mkmat2(mkcol2(stoi(2),gen_1),mkcol2(gen_1,gen_1));return RgM_ZM_mul(A,T);}
  if(kind==2){gcoeff(A,1,1)=gadd(gcoeff(A,1,1),dbltor(1.0));return A;}
  if(kind==3){
    GEN z=itor(shifti(gen_1,22),prec),nz=negr(z),q=real_0_bit(-prec2nbits(prec));
    A=zeromatcopy(3,2);gcoeff(A,1,1)=z;gcoeff(A,2,1)=nz;gcoeff(A,3,1)=q;
    gcoeff(A,1,2)=q;gcoeff(A,2,2)=z;gcoeff(A,3,2)=nz;return A;
  }
  return A;
}
static void emit(long field,long kind,GEN nf,GEN bnf,long prec) {
  pari_sp av=avma; long N=3,R1=3,RU=3,phaseprec=prec2nbits(prec);
  GEN A=input_logs(bnf,kind,prec),input=gcopy(A),matep=cgetg(RU,t_MAT);
  for(long j=1;j<RU;j++){GEN Aj=gel(input,j),s=gdivgs(RgV_sum(real_i(Aj)),-N);gel(matep,j)=fixarch(Aj,s,R1);}
  GEN preU=lll(real_i(matep));
  if(lg(preU)<RU){pari_err_BUG("fixture has no pre-getfu rank-two transform");}
  GEN arch=RgM_ZM_mul(matep,preU),clean=RgM_ZM_mul(input,preU),M=nf_get_M(nf);
  for(long j=1;j<lg(input);j++)for(long i=1;i<lgcols(input);i++){
    GEN im=oracle_imagpart(gcoeff(input,i,j));if(!gequal0(im)&&typ(im)==t_REAL)phaseprec=minss(phaseprec,bit_prec(im));}
  GEN tensor=cgetg(4,t_VEC);for(long j=1;j<=3;j++)gel(tensor,j)=zk_multable(nf,col_ei(3,j));
  oracle_reason=0;GEN finalU=NULL,fu=getfu(nf,&A,&finalU,prec);
  printf("{\"field\":%ld,\"kind\":%ld,\"precision\":%ld,\"phasePrecision\":%ld,\"input\":",field,kind,prec2nbits(prec),phaseprec);oracle_scalarmat(input);
  printf(",\"inputPhases\":");phases(input);printf(",\"factor\":");intmat(preU);
  printf(",\"arch\":");oracle_scalarmat(arch);printf(",\"archPhases\":");phases(arch);
  printf(",\"clean\":");oracle_scalarmat(clean);printf(",\"embedding\":");oracle_scalarmat(M);
  printf(",\"tensor\":[");for(long j=1;j<=3;j++){if(j>1)putchar(',');intmat(gel(tensor,j));}
  printf("],\"reason\":%ld,\"units\":[",oracle_reason);
  if(fu)for(long j=1;j<lg(fu);j++){GEN u=algtobasis(nf,gel(fu,j));if(j>1)putchar(',');intmat(mkmat(u));}
  printf("],\"logs\":");if(fu)oracle_scalarmat(A);else printf("[]");
  printf(",\"phases\":");if(fu)phases(A);else printf("[]");
  printf(",\"finalFactor\":");if(fu)intmat(finalU);else printf("[]");puts("}");avma=av;
}
int main(void){
  pari_init(256000000,10000);const long prec=nbits2prec(192);
  const char *polys[]={"x^3-3*x+1","x^3-4*x+1","x^3-5*x+1","x^3-6*x+1"};
  for(long field=0;field<4;field++){pari_sp av=avma;GEN nf=nfinit(gp_read_str(polys[field]),prec),bnf=Buchall_param(nf,0.,0.,BNF_RELPID,0,prec);for(long kind=0;kind<4;kind++)emit(field,kind,nf,bnf,prec);avma=av;}
  pari_close();return 0;
}
`;
  const c = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(c, source);
  run("cc", [
    "-O1",
    "-fsanitize=undefined",
    "-fno-sanitize-recover=undefined",
    "-I" + path.join(pari, "src/headers"),
    "-I" + library,
    c,
    "-L" + library,
    "-Wl,-rpath," + library,
    "-lpari",
    "-lm",
    "-o",
    executable,
  ]);
  const text = run(executable, []);
  return {
    directory,
    fixtures: text.trim().split("\n").map(JSON.parse),
    trace: sha(text),
  };
}

function flatten(values) {
  return values.flat(Infinity).map(BigInt);
}
function values(buffer) {
  return Array.isArray(buffer) ? buffer : buffer.toArray();
}
function makeArguments(f, fixture, backend) {
  const exact = (length) =>
    backend === "javascript"
      ? Array(length).fill(0n)
      : f.createIntegerBuffer(length, 4096, Array(length).fill(0n));
  const state = Array(8).fill(0n);
  const args = [
    flatten(fixture.input),
    fixture.inputPhases.map(BigInt),
    flatten(fixture.factor),
    flatten(fixture.embedding),
    flatten(fixture.tensor),
    BigInt(fixture.precision),
    BigInt(fixture.phasePrecision),
    exact(18),
    exact(18),
    exact(18),
    Array(6).fill(0n),
    exact(18),
    exact(27),
    exact(18),
    exact(18),
    exact(6),
    exact(9),
    exact(3),
    exact(6),
    exact(4),
    exact(6),
    exact(18),
    Array(6).fill(0n),
    exact(4),
    state,
    Array(3).fill(0n),
    exact(64),
    exact(64),
    exact(64),
    exact(64),
    exact(64),
    exact(128),
  ];
  return {
    args,
    state,
    arch: args[8],
    clean: args[9],
    phases: args[10],
    units: args[20],
    logs: args[21],
    outputPhases: args[22],
    factor: args[23],
  };
}

function validateUnit(unit, tensor) {
  const matrix = Array(9).fill(0n);
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 3; j++) matrix[i] += unit[j] * tensor[9 * j + i];
  const determinant =
    matrix[0] * (matrix[4] * matrix[8] - matrix[7] * matrix[5]) -
    matrix[3] * (matrix[1] * matrix[8] - matrix[7] * matrix[2]) +
    matrix[6] * (matrix[1] * matrix[5] - matrix[4] * matrix[2]);
  assert(determinant === 1n || determinant === -1n);
  assert(unit[1] !== 0n || unit[2] !== 0n);
  const inverse = [
    (matrix[4] * matrix[8] - matrix[7] * matrix[5]) / determinant,
    (matrix[2] * matrix[7] - matrix[1] * matrix[8]) / determinant,
    (matrix[1] * matrix[5] - matrix[2] * matrix[4]) / determinant,
  ];
  for (let row = 0; row < 3; row++) {
    let product = 0n;
    for (let column = 0; column < 3; column++)
      product += matrix[3 * column + row] * inverse[column];
    assert.equal(product, row === 0 ? 1n : 0n);
  }
  const squaredNorm = (vector) =>
    vector.reduce((sum, entry) => sum + entry * entry, 0n);
  assert(squaredNorm(unit) <= squaredNorm(inverse));
}

(async () => {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(
    process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  const oracle = sourceFixtures(pari, archive);
  assert.equal(oracle.fixtures.length, 16);
  assert(oracle.fixtures.some((fixture) => fixture.reason === 0));
  assert(oracle.fixtures.some((fixture) => fixture.reason === 2));
  assert(
    oracle.fixtures.some((fixture) => fixture.reason === 3),
    `missing PRECI fixture: ${oracle.fixtures.map((fixture) => fixture.reason)}`,
  );
  assert(
    oracle.fixtures.some((fixture) =>
      fixture.inputPhases.some((value) => value === 1),
    ),
  );

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "unit_reconstruction_signed.py"),
  });
  const f = require(built.modulePath).pari_getfu_signed_real_cubic;
  assert(f.nativeAvailable);
  const reference = new Map();
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const fixture of oracle.fixtures) {
      const call = makeArguments(f, fixture, backend);
      const result = f[backend](...call.args);
      assert.equal(
        result,
        BigInt(fixture.reason),
        `${backend} field=${fixture.field} kind=${fixture.kind} state=${call.state}`,
      );
      assert.equal(call.state[0], BigInt(fixture.reason));
      assert.deepEqual(values(call.arch), flatten(fixture.arch));
      assert.deepEqual(call.phases, fixture.archPhases.map(BigInt));
      if (fixture.reason === 0) {
        const units = values(call.units);
        const logs = values(call.logs);
        const factor = values(call.factor);
        assert.deepEqual(units, flatten(fixture.units));
        assert.deepEqual(logs, flatten(fixture.logs));
        assert.deepEqual(call.outputPhases, fixture.phases.map(BigInt));
        assert.deepEqual(factor, flatten(fixture.finalFactor));
        const tensor = flatten(fixture.tensor);
        validateUnit(units.slice(0, 3), tensor);
        validateUnit(units.slice(3, 6), tensor);
        const key = `${fixture.field}:${fixture.kind}`;
        const snapshot = { units, logs, factor, phases: call.outputPhases.slice() };
        if (backend === "javascript") reference.set(key, snapshot);
        else assert.deepEqual(snapshot, reference.get(key));
        assert.equal(call.state[6], 2n);
      }
    }
  }

  const bad = makeArguments(f, oracle.fixtures[0], "gmp");
  bad.args[1][0] = 2n;
  const before = [
    values(bad.units).slice(),
    values(bad.logs).slice(),
    bad.outputPhases.slice(),
    values(bad.factor).slice(),
  ];
  assert.throws(() => f.gmp(...bad.args));
  assert.deepEqual(
    [values(bad.units), values(bad.logs), bad.outputPhases, values(bad.factor)],
    before,
  );

  const expected = Object.fromEntries(
    [...reference].map(([key, row]) => [
      key,
      Object.fromEntries(
        Object.entries(row).map(([name, entries]) => [name, entries.map(String)]),
      ),
    ]),
  );
  const dynamic = JSON.parse(
    run(
      "python3",
      [
        "-c",
        `import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
f=importlib.import_module('bench.pari-class-group-port.unit_reconstruction_signed').pari_getfu_signed_real_cubic
def flat(x):
 if isinstance(x,list):return [z for y in x for z in flat(y)]
 return [int(x)]
success=0
for q in d['fixtures']:
 z=lambda n:[0]*n;state=[0]*8
 a=[flat(q['input']),list(map(int,q['inputPhases'])),flat(q['factor']),flat(q['embedding']),flat(q['tensor']),int(q['precision']),int(q['phasePrecision']),z(18),z(18),z(18),z(6),z(18),z(27),z(18),z(18),z(6),z(9),z(3),z(6),z(4),z(6),z(18),z(6),z(4),state,z(3),z(64),z(64),z(64),z(64),z(64),z(128)]
 r=f(*a);assert r==q['reason'] and state[0]==r,(q['field'],q['kind'],r,state)
 assert a[8]==flat(q['arch']) and a[10]==list(map(int,q['archPhases']))
 if r==0:
  e=d['expected'][str(q['field'])+':'+str(q['kind'])]
  assert list(map(str,a[20]))==e['units'];assert list(map(str,a[21]))==e['logs'];assert list(map(str,a[22]))==e['phases'];assert list(map(str,a[23]))==e['factor'];success+=1
print(json.dumps({'fixtures':len(d['fixtures']),'successes':success}))`,
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "../../src/lib"),
      ],
      { input: JSON.stringify({ fixtures: oracle.fixtures, expected }) },
    ),
  );

  console.log(
    JSON.stringify(
      {
        fixtures: oracle.fixtures.length,
        successes: oracle.fixtures.filter((fixture) => fixture.reason === 0).length,
        precisionStops: oracle.fixtures.filter((fixture) => fixture.reason === 3)
          .length,
        largeStops: oracle.fixtures.filter((fixture) => fixture.reason === 2).length,
        signedFixtures: oracle.fixtures.filter((fixture) =>
          fixture.inputPhases.some((value) => value === 1),
        ).length,
        dynamic,
        traceSha256: oracle.trace,
        sourceSha256:
          "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
        coreBytes: fs.statSync(built.coreSourcePath).size,
        cacheKey: built.cacheKey,
        ubsan: true,
        mixedComplex: {
          implemented: false,
          dependency:
            "PARI multiprecision mpsincosm1/mpsincos complex exponential graph",
        },
        boundary:
          "cleanarchunit real triples plus 0/pi parity and rank-two factor through signed getfu reconstruction; relation LLL selection precedes this cut",
        artifactDirectory: oracle.directory,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
