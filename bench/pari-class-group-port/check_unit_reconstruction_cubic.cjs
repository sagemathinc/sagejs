"use strict";

// Stage-local differential for PARI 2.17.4 buch2.c:getfu on totally real
// cubics.  The source oracle constructs its own nf and log-unit input; no
// known unit, regulator, or class answer enters the translated computation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sha = (x) => createHash("sha256").update(x).digest("hex");
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function sourceFixtures(pari, archive) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-getfu-cubic-"));
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
static void scalar(GEN x) {
  long e = 0;
  x = real_i(x);
  if (typ(x) == t_INT) pari_printf("[\"%Ps\",-1,0]",x);
  else if (!signe(x)) printf("[\"0\",0,%ld]",expo(x));
  else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));
}
static void print_scalar_matrix(GEN x) {
  putchar('[');
  for (long j=1;j<lg(x);j++) for (long i=1;i<lgcols(x);i++) {
    if (j>1 || i>1) putchar(','); scalar(gcoeff(x,i,j));
  }
  putchar(']');
}
static void intmat(GEN x) {
  putchar('[');
  for (long j=1;j<lg(x);j++) for (long i=1;i<lgcols(x);i++) {
    if (j>1 || i>1) putchar(','); pari_printf("\"%Ps\"",gcoeff(x,i,j));
  }
  putchar(']');
}
static GEN input_logs(GEN nf, GEN bnf, long kind, long prec) {
  /* Twice the logarithm lattice kills the all-real sign phases.  This lane
   * intentionally exercises the real-only getfu cut; sign reconstruction is
   * a separate characteristic-two boundary. */
  GEN A = gmul2n(gcopy(bnf_get_logfu(bnf)),1);
  if (kind == 1) {
    GEN T = mkmat2(mkcol2(stoi(2),gen_1),mkcol2(gen_1,gen_1));
    return RgM_ZM_mul(A,T);
  }
  if (kind == 2) {
    return zeromatcopy(3,2);
  }
  if (kind == 3) {
    GEN z=itor(shifti(gen_1,22),prec), nz=negr(z), q=gen_0;
    A=zeromatcopy(3,2);
    gcoeff(A,1,1)=z; gcoeff(A,2,1)=nz; gcoeff(A,3,1)=q;
    gcoeff(A,1,2)=q; gcoeff(A,2,2)=z; gcoeff(A,3,2)=nz;
    return A;
  }
  return A;
}
static void emit(long field, long kind, GEN nf, GEN bnf, long prec) {
  pari_sp av=avma;
  GEN A=input_logs(nf,bnf,kind,prec), input=gcopy(A), M=nf_get_M(nf);
  GEN tensor=cgetg(4,t_VEC);
  for(long j=1;j<=3;j++) gel(tensor,j)=zk_multable(nf,col_ei(3,j));
  oracle_reason=0;
  GEN fu=getfu(nf,&A,NULL,prec);
  printf("{\"field\":%ld,\"kind\":%ld,\"precision\":%ld,\"input\":",field,kind,prec2nbits(prec));print_scalar_matrix(input);
  printf(",\"embedding\":");print_scalar_matrix(M);printf(",\"tensor\":[");
  for(long j=1;j<=3;j++){if(j>1)putchar(',');intmat(gel(tensor,j));}
  printf("],\"reason\":%ld,\"units\":[",oracle_reason);
  if(fu) for(long j=1;j<lg(fu);j++) {
    GEN u=algtobasis(nf,gel(fu,j)); if(j>1)putchar(','); intmat(mkmat(u));
  }
  printf("],\"logs\":"); if(fu)print_scalar_matrix(A);else printf("[]"); puts("}");
  avma=av;
}
int main(void) {
  pari_init(256000000,10000);
  const char *polys[]={"x^3-3*x+1","x^3-4*x+1","x^3-20018*x+20034","x^3-20010*x+20018"};
  const long prec=nbits2prec(192);
  for(long field=0;field<4;field++) {
    pari_sp av=avma; GEN nf=nfinit(gp_read_str(polys[field]),prec);
    GEN bnf=Buchall_param(nf,0.,0.,BNF_RELPID,0,prec);
    for(long kind=0;kind<4;kind++) emit(field,kind,nf,bnf,prec);
    avma=av;
  }
  {
    /* The authentic retry frontier: 2,240 input bits, with getfu's
     * transcendental leaves retaining their 64-bit working guard. */
    pari_sp av=avma; const long wide=nbits2prec(2240);
    GEN nf=nfinit(gp_read_str(polys[0]),wide);
    GEN bnf=Buchall_param(nf,0.,0.,BNF_RELPID,0,wide);
    emit(4,0,nf,bnf,wide); avma=av;
  }
  pari_close(); return 0;
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
  return { directory, fixtures: text.trim().split("\n").map(JSON.parse), trace: sha(text) };
}

function makeArguments(f, fixture, backend) {
  const exact = (n) =>
    backend === "javascript"
      ? Array(n).fill(0n)
      : f.createIntegerBuffer(n, 4096, Array(n).fill(0n));
  const integers = (values) => values.flat(Infinity).map(BigInt);
  const triples = (values) => values.flat().map(BigInt);
  const state = Array(8).fill(0n);
  const transcendentalScratch = fixture.precision > 1920 ? 320 : 64;
  const args = [
    triples(fixture.input),
    triples(fixture.embedding),
    integers(fixture.tensor),
    BigInt(fixture.precision),
    exact(18), exact(6), exact(4), exact(18), exact(18), exact(27), exact(18), exact(18),
    exact(6), exact(9), exact(3), exact(6), exact(6), exact(18), state,
    Array(3).fill(0n), Array(4).fill(0), Array(4).fill(0), Array(2).fill(0),
    Array(6).fill(0), exact(2), Array(4).fill(0), exact(2), exact(3), exact(3),
    Array(3).fill(0), Array(3).fill(0), exact(4), exact(4), exact(4), exact(2),
    exact(transcendentalScratch), exact(transcendentalScratch),
    exact(transcendentalScratch), exact(transcendentalScratch),
    exact(transcendentalScratch), exact(128),
  ];
  return { args, state, units: args[16], logs: args[17] };
}

function values(buffer) {
  return Array.isArray(buffer) ? buffer : buffer.toArray();
}

function validateUnit(unit, tensor) {
  const multiplication = Array(9).fill(0n);
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 3; j++)
      multiplication[i] += unit[j] * tensor[9 * j + i];
  const determinant =
    multiplication[0] *
      (multiplication[4] * multiplication[8] -
        multiplication[7] * multiplication[5]) -
    multiplication[3] *
      (multiplication[1] * multiplication[8] -
        multiplication[7] * multiplication[2]) +
    multiplication[6] *
      (multiplication[1] * multiplication[5] -
        multiplication[4] * multiplication[2]);
  assert(determinant === 1n || determinant === -1n);
  assert(unit[1] !== 0n || unit[2] !== 0n);
  const inverse = [
    (multiplication[4] * multiplication[8] -
      multiplication[7] * multiplication[5]) /
      determinant,
    (multiplication[2] * multiplication[7] -
      multiplication[1] * multiplication[8]) /
      determinant,
    (multiplication[1] * multiplication[5] -
      multiplication[2] * multiplication[4]) /
      determinant,
  ];
  for (let row = 0; row < 3; row++) {
    let value = 0n;
    for (let column = 0; column < 3; column++)
      value += multiplication[3 * column + row] * inverse[column];
    assert.equal(value, row === 0 ? 1n : 0n);
  }
  const norm = unit.reduce((sum, value) => sum + value * value, 0n);
  const inverseNorm = inverse.reduce((sum, value) => sum + value * value, 0n);
  assert(norm <= inverseNorm);
}

(async () => {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(
    process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  const oracle = sourceFixtures(pari, archive);
  assert.equal(oracle.fixtures.length, 17);
  assert.equal(oracle.fixtures.at(-1).precision, 2240);
  assert(oracle.fixtures.filter((x) => x.reason === 0).length >= 4);
  assert(oracle.fixtures.some((x) => x.reason === 3));
  assert(oracle.fixtures.some((x) => x.reason === 2));

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "unit_reconstruction_cubic.py"),
  });
  const f = require(built.modulePath).pari_getfu_real_cubic;
  assert(f.nativeAvailable);
  const reference = new Map();
  for (const backend of ["javascript", "gmp"]) {
    for (const fixture of oracle.fixtures) {
      const call = makeArguments(f, fixture, backend);
      const result = f[backend](...call.args);
      assert.equal(
        result,
        BigInt(fixture.reason),
        `${backend} result field=${fixture.field} kind=${fixture.kind} state=${call.state} candidate=${values(call.args[15])} transform=${values(call.args[6])}`,
      );
      assert.equal(call.state[0], BigInt(fixture.reason));
      if (fixture.reason === 0) {
        const units = values(call.units);
        const logs = values(call.logs);
        const tensor = fixture.tensor.flat(Infinity).map(BigInt);
        validateUnit(units.slice(0, 3), tensor);
        validateUnit(units.slice(3, 6), tensor);
        assert(logs.some((x) => x !== 0n));
        const transform = values(call.args[6]);
        const determinant = transform[0] * transform[3] - transform[1] * transform[2];
        assert(determinant === 1n || determinant === -1n);
        const key = `${fixture.field}:${fixture.kind}`;
        if (backend === "javascript") reference.set(key, { units, logs });
        else assert.deepEqual({ units, logs }, reference.get(key));
        assert.equal(call.state[6], 2n);
      }
    }
  }
  const dynamicExpected = Object.fromEntries(
    [...reference].map(([key, entry]) => [
      key,
      {
        units: entry.units.map(String),
        logs: entry.logs.map(String),
      },
    ]),
  );
  const dynamic = JSON.parse(
    run(
      "python3",
      [
        "-c",
        `import importlib,json,sys
sys.set_int_max_str_digits(100000)
sys.path[:0]=sys.argv[1:3]
d=json.load(sys.stdin)
f=importlib.import_module('bench.pari-class-group-port.unit_reconstruction_cubic').pari_getfu_real_cubic
def flat(x):
    if isinstance(x,list):
        return [z for y in x for z in flat(y)]
    return [int(x)]
count=0
for fixture in d['fixtures']:
    exact=lambda n:[0]*n
    scratch=320 if fixture['precision']>1920 else 64
    state=[0]*8
    args=[flat(fixture['input']),flat(fixture['embedding']),flat(fixture['tensor']),int(fixture['precision']),
          exact(18),exact(6),exact(4),exact(18),exact(18),exact(27),exact(18),exact(18),
          exact(6),exact(9),exact(3),exact(6),exact(6),exact(18),state,
          exact(3),[0.0]*4,[0.0]*4,[0.0]*2,[0.0]*6,exact(2),[0.0]*4,exact(2),exact(3),exact(3),
          [0.0]*3,[0.0]*3,exact(4),exact(4),exact(4),exact(2),
          exact(scratch),exact(scratch),exact(scratch),exact(scratch),exact(scratch),exact(128)]
    result=f(*args)
    assert result==fixture['reason'] and state[0]==fixture['reason'],(fixture['field'],fixture['kind'],result,state)
    if result==0:
        expected=d['expected'][str(fixture['field'])+':'+str(fixture['kind'])]
        assert list(map(str,args[16]))==expected['units']
        assert list(map(str,args[17]))==expected['logs']
        count+=1
print(json.dumps({'fixtures':len(d['fixtures']),'successes':count}))`,
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "../../src/lib"),
      ],
      { input: JSON.stringify({ fixtures: oracle.fixtures, expected: dynamicExpected }) },
    ),
  );
  assert.equal(dynamic.fixtures, oracle.fixtures.length);
  // Atomic public output: an invalid owner is rejected before publication.
  const guard = makeArguments(f, oracle.fixtures[0], "gmp");
  guard.args[2] = [];
  const beforeUnits = values(guard.units).slice(), beforeLogs = values(guard.logs).slice();
  assert.throws(() => f.gmp(...guard.args));
  assert.deepEqual(values(guard.units), beforeUnits);
  assert.deepEqual(values(guard.logs), beforeLogs);

  console.log(JSON.stringify({
    fixtures: oracle.fixtures.length,
    successes: oracle.fixtures.filter((x) => x.reason === 0).length,
    precisionStops: oracle.fixtures.filter((x) => x.reason === 3).length,
    largeStops: oracle.fixtures.filter((x) => x.reason === 2).length,
    traceSha256: oracle.trace,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    cacheKey: built.cacheKey,
    dynamic,
    sourceSha256: "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
    ubsan: true,
    boundary: "Prepared sign-free all-real rank-two unit logs and nf embedding/multiplication packets to getfu units; relation lattice reduction, characteristic-two sign phase and complex signatures excluded.",
    artifactDirectory: oracle.directory,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
