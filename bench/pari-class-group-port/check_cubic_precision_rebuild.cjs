"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
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

function sourceOracle(pari, archive) {
  assert.equal(
    sha(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(
    sha(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  source += String.raw`
static GEN ore(GEN x){return typ(x)==t_COMPLEX?gel(x,1):x;}
static GEN oim(GEN x){return typ(x)==t_COMPLEX?gel(x,2):gen_0;}
static void scalar(GEN x){long e=0;x=ore(x);if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static long phase(GEN x){GEN y=oim(x);if(gequal0(y))return 0;long n=lround(gtodouble(y)/M_PI);n%=2;if(n<0)n+=2;return n;}
static void smat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');scalar(gcoeff(x,i,j));}putchar(']');}
static void pmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');printf("%ld",phase(gcoeff(x,i,j)));}putchar(']');}
static void zmat(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');pari_printf("\"%Ps\"",gcoeff(x,i,j));}putchar(']');}
static void atoms(GEN nf,GEN X){putchar('[');for(long k=1;k<lg(X);k++){GEN x=gel(X,k),c;if(k>1)putchar(',');if(typ(x)==t_INT)c=mkcol3(x,gen_0,gen_0);else c=algtobasis(nf,x);for(long i=1;i<=3;i++){if(i>1)putchar(',');pari_printf("\"%Ps\"",gel(c,i));}}putchar(']');}
int main(void){
 pari_init(512000000,10000);long resident=nbits2prec(192),retry=nbits2prec(2048);GEN b0=bnfinit0(gp_read_str("x^3-20018*x+20034"),1,NULL,resident),S=bnf_get_sunits(b0),X=gel(S,1),U=gel(S,2),b=bnfnewprec(b0,retry),nf=bnf_get_nf(b),A=bnf_get_logfu(b),L=cgetg(lg(X),t_MAT);for(long k=1;k<lg(X);k++)gel(L,k)=nf_cxlog(nf,gel(X,k),gprecision(A));GEN T=RgM_ZM_mul(L,U);
 printf("{\"generators\":");atoms(nf,X);printf(",\"transform\":");zmat(U);printf(",\"generatorCount\":%ld,\"precision\":%ld,\"embedding\":",lg(X)-1,gprecision(A));smat(nf_get_M(nf));printf(",\"atomLogs\":");smat(L);printf(",\"transformed\":");smat(T);printf(",\"input\":");smat(A);printf(",\"phases\":");pmat(A);puts("}");pari_close();return 0;
}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-cubic-rebuild-"));
  const c = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(c, source);
  const library = path.join(pari, "Olinux-x86_64");
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
  return { value: JSON.parse(text), text, directory };
}

const flattenTriples = (entries) => entries.flatMap((entry) => entry).map(BigInt);
const splitEmbedding = (entries) => [0, 1, 2].map((index) => {
  const output = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      output.push(BigInt(entries[3 * column + row][index]));
    }
  }
  return output;
});
const values = (buffer) => Array.isArray(buffer)
  ? buffer
  : buffer.toArray
    ? buffer.toArray()
    : Array.from(buffer);
function packedRealAndPhases(entries) {
  const real = [];
  const phases = [];
  for (let i = 0; i < entries.length; i += 7) {
    real.push(entries[i + 1], entries[i + 2], entries[i + 3]);
    phases.push(entries[i] === 2n ? 1n : 0n);
  }
  return { real, phases };
}

function argumentsFor(f, fixture, backend, held = false) {
  const I = (length, data = Array(length).fill(0n)) =>
    backend === "javascript"
      ? data.slice()
      : f.createIntegerBuffer(length, 16384, data);
  const S = (length) =>
    backend === "javascript"
      ? Array(length).fill(0n)
      : f.createInt64Buffer(Array(length).fill(0n));
  const [matrixM, matrixP, matrixE] = splitEmbedding(fixture.embedding);
  const count = fixture.generatorCount;
  const generators = fixture.generators.map(BigInt);
  if (held) generators.splice(0, 3, 0n, 0n, 0n);
  const args = [
    I(9, matrixM), I(9, matrixP), I(9, matrixE),
    I(3 * count, generators),
    I(2 * count, fixture.transform.map(BigInt)),
    BigInt(count), BigInt(fixture.precision), I(21 * count), I(42), I(42), I(42),
    I(42, Array(42).fill(held ? 777n : 0n)), I(6),
    I(6, Array(6).fill(held ? 777n : 0n)), I(3), I(3), I(512), I(512),
    I(512), I(512), I(128), S(4), S(5),
  ];
  return { args, output: args[11], phases: args[13], state: args[22] };
}

(async () => {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
  const oracle = sourceOracle(pari, archive);
  const fixture = oracle.value;
  if (process.env.SAGEJS_DUMP_CUBIC_REBUILD === "1") {
    console.log(JSON.stringify(fixture));
    return;
  }
  assert.equal(fixture.generatorCount, 73);
  assert.equal(fixture.precision, 2176);
  assert.equal(Math.max(...fixture.embedding.map((x) => Number(x[1]))), 2240);
  assert.equal(fixture.generators.length, 3 * fixture.generatorCount);
  assert.equal(fixture.transform.length, 2 * fixture.generatorCount);
  const exactStateSha256 = sha(JSON.stringify({
    generators: fixture.generators,
    transform: fixture.transform,
  }));
  assert.equal(
    exactStateSha256,
    "73759685621162c87cc202ec97c41f3dd165005f81d6cf6595f27d2cdb50d885",
  );
  assert.equal(
    sha(oracle.text),
    "97f4b52b4aec474c965a84d63ca14130238e4e9ca10b324ea3f7a0999edc216b",
  );

  const python = JSON.parse(run("python3", ["-c", String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
m=importlib.import_module('bench.pari-class-group-port.cubic_precision_rebuild');I=lambda n:[0]*n;S=lambda n:[0]*n
E=d['embedding'];M=[[int(E[3*j+i][k]) for i in range(3) for j in range(3)] for k in range(3)];c=d['generatorCount'];out=[777]*42
a=[M[0],M[1],M[2],list(map(int,d['generators'])),list(map(int,d['transform'])),c,d['precision'],I(21*c),I(42),I(42),I(42),out,I(6),I(6),I(3),I(3),I(512),I(512),I(512),I(512),I(128),S(4),S(5)]
status=m.pari_cubic_sunit_precision_rebuild(*a)
assert status==0,(status,a[22]);assert a[22]==[0,c,2,2,d['precision']],a[22]
atoms=[]
for i in range(0,21*c,7):atoms.extend(a[7][i+1:i+4])
want_atoms=[str(x) for t in d['atomLogs'] for x in t]
assert list(map(str,atoms))==want_atoms,next((i,atoms[i:i+3],want_atoms[i:i+3]) for i in range(len(atoms)) if str(atoms[i])!=want_atoms[i])
trans=[]
for i in range(0,42,7):trans.extend(a[8][i+1:i+4])
want_trans=[str(x) for t in d['transformed'] for x in t]
assert list(map(str,trans))==want_trans,next((i,trans[i],want_trans[i]) for i in range(len(trans)) if str(trans[i])!=want_trans[i])
real=[];ph=[]
for i in range(0,42,7):real.extend(out[i+1:i+4])
ph=a[13]
want=[str(x) for t in d['input'] for x in t]
assert list(map(str,real))==want,next((i,real[i],want[i]) for i in range(len(real)) if str(real[i])!=want[i])
assert ph==d['phases'],(ph,d['phases'])
bad=a.copy();bad[3]=a[3].copy();bad[3][0]=0;bad[3][1]=0;bad[3][2]=0;held=[777]*42;heldp=[777]*6;bad[11]=held;bad[13]=heldp;bad[7]=I(21*c);bad[8]=I(42);bad[9]=I(42);bad[10]=I(42);bad[12]=I(6);bad[21]=S(4);bad[22]=S(5)
try:m.pari_cubic_sunit_precision_rebuild(*bad);raise AssertionError('zero atom accepted')
except ValueError:pass
assert held==[777]*42
assert heldp==[777]*6
print(json.dumps({'status':'exact','generators':c,'transactionalFailure':True}))
`, root, path.join(root, "src/lib")], { input: JSON.stringify(fixture) }));

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "cubic_precision_rebuild.py"),
  });
  const f = require(built.modulePath).pari_cubic_sunit_precision_rebuild;
  assert.equal(f.nativeAvailable, true);
  let expected;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const call = argumentsFor(f, fixture, backend);
    assert.equal(f[backend](...call.args), 0n, backend);
    const packed = packedRealAndPhases(values(call.output));
    assert.deepEqual(packed.real, flattenTriples(fixture.input), backend);
    assert.deepEqual(values(call.phases), fixture.phases.map(BigInt), backend);
    assert.deepEqual(values(call.state), [0n, 73n, 2n, 2n, 2176n]);
    if (expected === undefined) expected = values(call.output);
    else assert.deepEqual(values(call.output), expected);
    const failed = argumentsFor(f, fixture, backend, true);
    assert.throws(() => f[backend](...failed.args), /zero retained S-unit atom/);
    assert.deepEqual(values(failed.output), Array(42).fill(777n));
    assert.deepEqual(values(failed.phases), Array(6).fill(777n));
  }
  console.log(JSON.stringify({
    cases: 1,
    polynomial: "x^3-20018*x+20034",
    sourceCut: "Sunits_archclean(X,U) to p2176 logfu",
    exactStateSha256,
    oracleTraceSha256: sha(oracle.text),
    maximumEmbeddingBits: Math.max(...fixture.embedding.map((x) => Number(x[1]))),
    outputPrecisionBits: Math.max(...fixture.input.map((x) => Number(x[1]))),
    generators: fixture.generatorCount,
    python,
    backends: ["cpython", "javascript", "gmp", "tagged"],
    highPrecisionLogsInjected: false,
    highPrecisionEmbeddingInjected: true,
    transactionalFailure: true,
    coreSha256: sha(fs.readFileSync(built.coreSourcePath)),
    artifactDirectory: oracle.directory,
  }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
