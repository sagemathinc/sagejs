"use strict";

// Differential precision schedule for PARI 2.17.4 getfu on the
// frozen hard mixed quartic. This appends a diagnostic entry point to pristine
// buch2.c so its static getfu routine is observed without modifying PARI.
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
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

const pari = path.resolve(
  process.argv[2] ||
    "/scratch/sagejs-runtime/pari-class-group-e2e-20260916/toolchains/src/pari-2.17.4-phase0",
);
const archive = path.resolve(
  process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-getfu-q4-prec-"));
const library = path.join(pari, "Olinux-x86_64");
assert.equal(
  sha(fs.readFileSync(archive)),
  "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
);
let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
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
static GEN ore(GEN x){return typ(x)==t_COMPLEX?gel(x,1):x;}
static GEN oim(GEN x){return typ(x)==t_COMPLEX?gel(x,2):gen_0;}
static void scalar(GEN x){long e=0;if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static void rmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');scalar(ore(gcoeff(x,i,j)));}putchar(']');}
static void imat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');scalar(oim(gcoeff(x,i,j)));}putchar(']');}
static void zmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(x,i,j));}putchar(']');}
int main(int argc,char **argv){
 pari_init(1024000000,10000);long bits=argc>1?atol(argv[1]):192,prec=nbits2prec(bits);GEN nf=nfinit(gp_read_str("x^4-20018*x-20034"),prec),bnf=Buchall_param(nf,0.,0.,BNF_RELPID,0,prec),input=gcopy(bnf_get_logfu(bnf)),M=nf_get_M(nf),matep=cgetg(3,t_MAT);
 for(long j=1;j<3;j++){GEN Aj=gel(input,j),s=gdivgs(RgV_sum(real_i(Aj)),-4);gel(matep,j)=fixarch(Aj,s,2);}GEN U=lll(real_i(matep)),arch=RgM_ZM_mul(matep,U),clean=RgM_ZM_mul(input,U),z=gexp(arch,prec),sol=RgM_solve_realimag(M,z);long rounderr;GEN rounded=grndtoi(sol,&rounderr),tensor=cgetg(5,t_VEC);for(long j=1;j<=4;j++)gel(tensor,j)=zk_multable(nf,col_ei(4,j));
 oracle_reason=0;GEN A=gcopy(input),finalU=NULL,fu=getfu(nf,&A,&finalU,prec);
 printf("{\"precision\":%ld,\"archReal\":",bits);rmat(arch);printf(",\"archImag\":");imat(arch);printf(",\"cleanReal\":");rmat(clean);printf(",\"cleanImag\":");imat(clean);printf(",\"factor\":");zmat(U);printf(",\"embeddingReal\":");rmat(M);printf(",\"embeddingImag\":");imat(M);printf(",\"expReal\":");rmat(z);printf(",\"expImag\":");imat(z);printf(",\"solvedReal\":");rmat(sol);printf(",\"rounded\":");zmat(rounded);printf(",\"tensor\":[");for(long j=1;j<=4;j++){if(j>1)putchar(',');zmat(gel(tensor,j));}printf("],\"roundError\":%ld,\"reason\":%ld,\"units\":[",rounderr,oracle_reason);if(fu)for(long j=1;j<lg(fu);j++){if(j>1)putchar(',');zmat(mkmat(algtobasis(nf,gel(fu,j))));}printf("],\"logsReal\":");if(fu)rmat(A);else printf("[]");printf(",\"logsImag\":");if(fu)imat(A);else printf("[]");printf(",\"finalFactor\":");if(fu)zmat(finalU);else printf("[]");puts("}");pari_close();return 0;
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
const flat = (values) => values.flat(Infinity).map(BigInt);
const triples = (values) => values.flat().map(BigInt);
const values = (buffer) => (Array.isArray(buffer) ? buffer : buffer.toArray());

function argumentsFor(f, fixture, backend) {
  const exact = (length) =>
    backend === "javascript"
      ? Array(length).fill(0n)
      : f.createIntegerBuffer(length, 8192, Array(length).fill(0n));
  const state = Array(8).fill(0n);
  const args = [
    triples(fixture.archReal),
    triples(fixture.archImag),
    triples(fixture.cleanReal),
    triples(fixture.cleanImag),
    flat(fixture.factor),
    triples(fixture.embeddingReal),
    triples(fixture.embeddingImag),
    flat(fixture.tensor),
    BigInt(fixture.precision),
    exact(18),
    exact(18),
    exact(48),
    exact(24),
    exact(48),
    exact(24),
    exact(24),
    exact(8),
    exact(16),
    exact(4),
    exact(8),
    exact(4),
    exact(8),
    exact(18),
    exact(18),
    exact(4),
    state,
    Array(4).fill(0n),
    exact(3),
    exact(3),
    exact(512),
    exact(512),
    exact(512),
    exact(512),
    exact(1024),
  ];
  return { args, state, units: args[21], logsReal: args[22], logsImag: args[23], factor: args[24] };
}

function expectedState(fixture) {
  const maximumRealExponent = Math.max(
    ...fixture.archReal.map((entry) => Number(entry[2])),
  );
  const phaseAccuracy = Math.max(
    ...fixture.archImag
      .filter((entry) => Number(entry[1]) >= 0)
      .map((entry) => Number(entry[2]) + 5 - Number(entry[1])),
  );
  return [
    3n,
    BigInt(maximumRealExponent),
    BigInt(phaseAccuracy),
    0n,
    BigInt(fixture.roundError),
    0n,
    0n,
    BigInt(fixture.factor[0]) * BigInt(fixture.factor[3]) -
      BigInt(fixture.factor[1]) * BigInt(fixture.factor[2]),
  ];
}

(async () => {
  const fixtures = [];
  let capacityFixture;
  const summaries = [];
  const traces = [];
  for (const bits of [192, 384, 512, 768, 1024, 2496, 70080, 70144]) {
    const text = run(executable, [String(bits)]);
    const fixture = JSON.parse(text);
    traces.push(sha(text));
    summaries.push({
      bits,
      reason: fixture.reason,
      roundError: fixture.roundError,
      units: fixture.units.length,
      maximumRealExponent: Math.max(
        ...fixture.archReal.map((entry) => Number(entry[2])),
      ),
      phaseAccuracy: Math.max(
        ...fixture.archImag
          .filter((entry) => Number(entry[1]) >= 0)
          .map((entry) => Number(entry[2]) + 5 - Number(entry[1])),
      ),
      maxInputPrecision: Math.max(
        ...fixture.archReal
          .concat(fixture.archImag)
          .map((entry) => Number(entry[1])),
      ),
      maxEmbeddingPrecision: Math.max(
        ...fixture.embeddingReal
          .concat(fixture.embeddingImag)
          .map((entry) => Number(entry[1])),
      ),
    });
    if (bits <= 768) fixtures.push(fixture);
    if (bits === 1024) capacityFixture = fixture;
  }
  assert.deepEqual(
    summaries.map(({ bits, reason, roundError, units }) => ({ bits, reason, roundError, units })),
    [
      { bits: 192, reason: 3, roundError: 69863, units: 0 },
      { bits: 384, reason: 3, roundError: 69671, units: 0 },
      { bits: 512, reason: 3, roundError: 69543, units: 0 },
      { bits: 768, reason: 3, roundError: 69287, units: 0 },
      { bits: 1024, reason: 3, roundError: 69031, units: 0 },
      { bits: 2496, reason: 3, roundError: 67559, units: 0 },
      { bits: 70080, reason: 3, roundError: -2, units: 0 },
      { bits: 70144, reason: 0, roundError: -35898, units: 2 },
    ],
  );
  assert.deepEqual(traces, [
    "86e7af31f6f9eea67fc0504a0764d7845e2f80ad4c99140b7879bee0e12abb1d",
    "478bfbc6906d3835eea7235a8606ac895b61a905c83bb0c0795f22f1621c53e4",
    "559478b642f9d8eca0cec13c1e8a87e627b2e649b45bbdb28d732cc3d7e14e94",
    "80474873db54a78c1ae1a90aa0ee2ca78451a9cbc0e56df8341d16c493d5b52a",
    "205708fb1af58d35b01872c7230893b32e0b54647b66b568903fdbd515a438c3",
    "b2b1d560545971048765c67ee819004200bf2e96b22a5d0149b38680c9c51a59",
    "4948903f09f8647d156c4e973abe1a419295774b7121db9962879fba62b0c026",
    "07003640a64ec26ae1188b468407e21cc00a8cfff4557262db57babbc98e24fa",
  ]);

  const dynamic = JSON.parse(
    run(
      "python3",
      [
        "-c",
        `import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path.extend(sys.argv[1:3]);payload=json.load(sys.stdin);data=payload['fixtures']
m=importlib.import_module('bench.pari-class-group-port.getfu_mixed_quartic');cm=importlib.import_module('bench.pari-class-group-port.getfu_mixed_complex')
flat=lambda x:sum((flat(y) if isinstance(y,list) else [int(y)] for y in x),[])
for z in data:
 w=lambda n:[0]*n;state=w(8)
 args=[flat(z['archReal']),flat(z['archImag']),flat(z['cleanReal']),flat(z['cleanImag']),flat(z['factor']),flat(z['embeddingReal']),flat(z['embeddingImag']),flat(z['tensor']),z['precision'],w(18),w(18),w(48),w(24),w(48),w(24),w(24),w(8),w(16),w(4),w(8),w(4),w(8),w(18),w(18),w(4),state,w(4),w(3),w(3),w(512),w(512),w(512),w(512),w(1024)]
 try: status=m.pari_getfu_mixed_quartic(*args)
 except Exception as error:
  details=[]
  for row in z['archImag']:
   if row[0]=='0': continue
   try:
    zm,zp,ze,mod8=cm.pari_mpcosm1(*map(int,row),w(3),w(512),w(512),w(512),w(512),w(1024))
    details.append((zp,ze,mod8,zp+64*((-ze+63)//64) if ze<=0 else zp))
   except Exception as inner: details.append(repr(inner))
  raise RuntimeError((z['precision'],repr(error),details)) from error
 maximum=max(x[2] for x in z['archReal']);phase=max(x[2]+5-x[1] for x in z['archImag'] if x[1]>=0)
 determinant=int(z['factor'][0])*int(z['factor'][3])-int(z['factor'][1])*int(z['factor'][2])
 assert status==3 and state==[3,maximum,phase,0,z['roundError'],0,0,determinant],(z['precision'],status,state)
 assert args[9]==flat(z['expReal']) and args[10]==flat(z['expImag'])
 assert args[15]==flat(z['solvedReal']) and args[16]==flat(z['rounded'])
 assert args[21]==w(8) and args[22]==w(18) and args[23]==w(18) and args[24]==w(4)
z=payload['capacityFixture'];w=lambda n:[0]*n;state=w(8)
args=[flat(z['archReal']),flat(z['archImag']),flat(z['cleanReal']),flat(z['cleanImag']),flat(z['factor']),flat(z['embeddingReal']),flat(z['embeddingImag']),flat(z['tensor']),z['precision'],w(18),w(18),w(48),w(24),w(48),w(24),w(24),w(8),w(16),w(4),w(8),w(4),w(8),w(18),w(18),w(4),state,w(4),w(3),w(3),w(512),w(512),w(512),w(512),w(1024)]
try: m.pari_getfu_mixed_quartic(*args);raise AssertionError('expected capacity rejection')
except ValueError as error: assert str(error)=='unsupported mixed quartic getfu precision'
assert state==w(8) and args[21]==w(8) and args[22]==w(18) and args[23]==w(18) and args[24]==w(4)
print(json.dumps({'fixtures':len(data),'precisions':[z['precision'] for z in data],'capacityRejected':True}))`,
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "../../src/lib"),
      ],
      { input: JSON.stringify({ fixtures, capacityFixture }) },
    ),
  );

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "getfu_mixed_quartic.py"),
  });
  const f = require(built.modulePath).pari_getfu_mixed_quartic;
  assert(f.nativeAvailable);
  let exact = 0;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const fixture of fixtures) {
      const call = argumentsFor(f, fixture, backend);
      assert.equal(f[backend](...call.args), 3n);
      assert.deepEqual(call.state, expectedState(fixture));
      assert.deepEqual(values(call.args[9]), triples(fixture.expReal));
      assert.deepEqual(values(call.args[10]), triples(fixture.expImag));
      assert.deepEqual(values(call.args[15]), triples(fixture.solvedReal));
      assert.deepEqual(values(call.args[16]), flat(fixture.rounded));
      assert(values(call.units).every((value) => value === 0n));
      assert(values(call.logsReal).every((value) => value === 0n));
      assert(values(call.logsImag).every((value) => value === 0n));
      assert(values(call.factor).every((value) => value === 0n));
      exact++;
    }
    const rejected = argumentsFor(f, capacityFixture, backend);
    assert.throws(
      () => f[backend](...rejected.args),
      /unsupported mixed quartic getfu precision/,
    );
    assert.deepEqual(rejected.state, Array(8).fill(0n));
    assert(values(rejected.units).every((value) => value === 0n));
    assert(values(rejected.logsReal).every((value) => value === 0n));
    assert(values(rejected.logsImag).every((value) => value === 0n));
    assert(values(rejected.factor).every((value) => value === 0n));
  }
  console.log(
    JSON.stringify(
      {
        field: "x^4-20018*x-20034",
        translatedPrecisions: fixtures.map((fixture) => fixture.precision),
        nativeExactComparisons: exact,
        dynamic,
        summaries,
        traceSha256: traces,
        coreBytes: fs.statSync(built.coreSourcePath).size,
        cacheKey: built.cacheKey,
        minimumSuccessfulWholeWordPrecision: 70144,
        translatedCapacity: 768,
        arithmeticCapacity: 2496,
        firstRejectedPrecision: 1024,
        firstRejectedRequiredRealSumCapacity: 3136,
        transactionalPreci: true,
        artifactDirectory: directory,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
