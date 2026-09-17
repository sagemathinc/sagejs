"use strict";

// Stage-local oracle for the first genuinely mixed getfu exponential boundary.
// The wrapper is appended to pristine PARI 2.17.4 buch2.c so it can enter
// through the same static fixarch/lll preparation used by getfu.
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-getfu-mixed-"));
  const library = path.join(pari, "Olinux-x86_64");
  assert.equal(
    sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  const trans1 = run("tar", [
    "-xOf",
    archive,
    "pari-2.17.4/src/basemath/trans1.c",
  ]);
  assert.equal(
    sha(trans1),
    "287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835",
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
  source += String.raw`
static GEN ore(GEN x){return typ(x)==t_COMPLEX?gel(x,1):x;}
static GEN oim(GEN x){return typ(x)==t_COMPLEX?gel(x,2):gen_0;}
static void scalar(GEN x){long e=0;if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static void realmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');scalar(ore(gcoeff(x,i,j)));}putchar(']');}
static void imagmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');scalar(oim(gcoeff(x,i,j)));}putchar(']');}
static void intmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(x,i,j));}putchar(']');}
static void emit(const char *polynomial,long field,long prec){
 pari_sp av=avma;GEN nf=nfinit(gp_read_str(polynomial),prec),bnf=Buchall_param(nf,0.,0.,BNF_RELPID,0,prec),A=gcopy(bnf_get_logfu(bnf));long N=4,R1=2,RU=3;
 GEN matep=cgetg(RU,t_MAT);for(long j=1;j<RU;j++){GEN Aj=gel(A,j),s=gdivgs(RgV_sum(real_i(Aj)),-N);gel(matep,j)=fixarch(Aj,s,R1);}GEN U=lll(real_i(matep)),y=RgM_ZM_mul(matep,U),clean=RgM_ZM_mul(A,U),z=gexp(y,prec);
 printf("{\"field\":%ld,\"precision\":%ld,\"inputReal\":",field,prec2nbits(prec));realmat(A);printf(",\"inputImag\":");imagmat(A);printf(",\"factor\":");intmat(U);printf(",\"archReal\":");realmat(y);printf(",\"archImag\":");imagmat(y);printf(",\"expReal\":");realmat(z);printf(",\"expImag\":");imagmat(z);printf(",\"sincos\":[");
 long first=1;for(long j=1;j<lg(y);j++)for(long i=1;i<lgcols(y);i++){GEN im=oim(gcoeff(y,i,j)),s,c,s1,c1;if(typ(im)!=t_REAL)im=real_0(prec);mpsincos(im,&s,&c);mpsincosm1(im,&s1,&c1);if(!first)putchar(',');first=0;printf("[");scalar(im);printf(",");scalar(s);printf(",");scalar(c);printf(",");scalar(s1);printf(",");scalar(c1);printf("]");}printf("],\"cleanReal\":");realmat(clean);printf(",\"cleanImag\":");imagmat(clean);puts("}");avma=av;
}
int main(void){pari_init(512000000,10000);long p=nbits2prec(192);emit("x^4-20018*x-20034",0,p);emit("x^4-2000022*x-2000042",1,p);pari_close();return 0;}
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

const integers = (triple) => triple.map(BigInt);
function workspaces(f, backend) {
  const make = (length) =>
    backend === "javascript"
      ? Array(length).fill(0n)
      : f.createIntegerBuffer(length, 4096, Array(length).fill(0n));
  return {
    expCache: make(3),
    piCache: make(3),
    a: make(512),
    b: make(512),
    p: make(512),
    q: make(512),
    stack: make(1024),
  };
}

(async () => {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(
    process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz",
  );
  const oracle = sourceFixtures(pari, archive);
  assert.equal(oracle.fixtures.length, 2);
  assert.equal(
    oracle.trace,
    "283bb8266ed6ffbaef9cc8747c1e59c842102949e6780ffef8506d2dab77baa6",
  );
  for (const fixture of oracle.fixtures) {
    assert.equal(fixture.precision, 192);
    assert.equal(fixture.factor.length, 4);
    assert.equal(fixture.sincos.length, 6);
    assert(fixture.sincos.some((row) => row[0][0] !== "0"));
  }
  const frozenArguments = oracle.fixtures.flatMap((fixture) => fixture.sincos);
  assert.equal(
    frozenArguments.filter((row) => row[0][0] === "0").length,
    2,
  );
  assert.equal(
    frozenArguments.filter((row) => row[0][1] === 64).length,
    2,
  );
  assert.equal(
    Math.max(...frozenArguments.flatMap((row) => [row[1][1], row[2][1]])),
    640,
  );

  const dynamic = JSON.parse(
    run(
      "python3",
      [
        "-c",
        `import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
m=importlib.import_module('bench.pari-class-group-port.getfu_mixed_complex')
count=0
for z in d:
 for i,row in enumerate(z['sincos']):
  w=lambda n:[0]*n
  got=m.pari_mpsincos(*map(int,row[0]),w(3),w(512),w(512),w(512),w(512),w(1024))
  assert got==tuple(map(int,row[1]+row[2])),(z['field'],i,got,row)
  got=m.pari_mpsincosm1(*map(int,row[0]),w(3),w(512),w(512),w(512),w(512),w(1024))
  assert got==tuple(map(int,row[3]+row[4])),(z['field'],i,got,row)
  got=m.pari_mixed_complex_exp(*map(int,z['archReal'][i]),*map(int,z['archImag'][i]),w(3),w(3),w(512),w(512),w(512),w(512),w(1024))
  want=tuple(map(int,z['expReal'][i]+z['expImag'][i]));assert got==want,(z['field'],i,got,want);count+=1
print(json.dumps({'exact':count}))`,
        path.resolve(__dirname, "../.."),
        path.resolve(__dirname, "../../src/lib"),
      ],
      { input: JSON.stringify(oracle.fixtures) },
    ),
  );

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "getfu_mixed_complex.py"),
  });
  const module = require(built.modulePath);
  const sincos = module.pari_mpsincos;
  const sincosm1 = module.pari_mpsincosm1;
  const complexExp = module.pari_mixed_complex_exp;
  assert(sincos.nativeAvailable);
  assert(sincosm1.nativeAvailable);
  assert(complexExp.nativeAvailable);
  let exact = 0;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const fixture of oracle.fixtures) {
      for (let i = 0; i < fixture.sincos.length; i++) {
        let w = workspaces(sincos, backend);
        const row = fixture.sincos[i];
        const got = sincos[backend](
          ...integers(row[0]),
          w.piCache,
          w.a,
          w.b,
          w.p,
          w.q,
          w.stack,
        );
        assert.deepEqual(
          got,
          integers(row[1].concat(row[2])),
          `${backend} sincos field=${fixture.field} row=${i}`,
        );
        w = workspaces(sincosm1, backend);
        const gotM1 = sincosm1[backend](
          ...integers(row[0]),
          w.piCache,
          w.a,
          w.b,
          w.p,
          w.q,
          w.stack,
        );
        assert.deepEqual(
          gotM1,
          integers(row[3].concat(row[4])),
          `${backend} sincosm1 field=${fixture.field} row=${i}`,
        );
        w = workspaces(complexExp, backend);
        const exponential = complexExp[backend](
          ...integers(fixture.archReal[i]),
          ...integers(fixture.archImag[i]),
          w.expCache,
          w.piCache,
          w.a,
          w.b,
          w.p,
          w.q,
          w.stack,
        );
        assert.deepEqual(
          exponential,
          integers(fixture.expReal[i].concat(fixture.expImag[i])),
          `${backend} cxexp field=${fixture.field} row=${i}`,
        );
        exact++;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        fields: oracle.fixtures.length,
        connectedArguments: 12,
        nativeExactComparisons: exact,
        dynamic,
        traceSha256: oracle.trace,
        sourceSha256:
          "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
        trans1Sha256:
          "287fbc089af72e8abcae073ea059880fdb138d7b4cd3c2bea39be547f3ca7835",
        coreBytes: fs.statSync(built.coreSourcePath).size,
        cacheKey: built.cacheKey,
        ubsan: true,
        boundary:
          "actual frozen-quartic bnf_get_logfu -> fixarch -> real LLL -> mpsincos/cxexp",
        branchCoverage: {
          exactZeroArguments: 2,
          shortPrecisionArguments: 2,
          maximumOutputPrecision: 640,
        },
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
