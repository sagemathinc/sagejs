"use strict";

// Exact mixed-signature quartic suffix fixture appended to pristine PARI
// 2.17.4 buch2.c so static fixarch/getfu state is observed directly.
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

function sourceFixture(pari, archive) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-getfu-quartic-"));
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
int main(void){
 pari_init(512000000,10000);long prec=nbits2prec(192);GEN nf=nfinit(gp_read_str("x^4-20*x-20"),prec),bnf=Buchall_param(nf,0.,0.,BNF_RELPID,0,prec),input=gcopy(bnf_get_logfu(bnf)),M=nf_get_M(nf),matep=cgetg(3,t_MAT);
 for(long j=1;j<3;j++){GEN Aj=gel(input,j),s=gdivgs(RgV_sum(real_i(Aj)),-4);gel(matep,j)=fixarch(Aj,s,2);}GEN U=lll(real_i(matep)),arch=RgM_ZM_mul(matep,U),clean=RgM_ZM_mul(input,U),z=gexp(arch,prec),sol=RgM_solve_realimag(M,z);long rounderr;GEN rounded=grndtoi(sol,&rounderr),tensor=cgetg(5,t_VEC);for(long j=1;j<=4;j++)gel(tensor,j)=zk_multable(nf,col_ei(4,j));
 oracle_reason=0;GEN A=gcopy(input),finalU=NULL,fu=getfu(nf,&A,&finalU,prec);
 printf("{\"precision\":192,\"archReal\":");rmat(arch);printf(",\"archImag\":");imat(arch);printf(",\"cleanReal\":");rmat(clean);printf(",\"cleanImag\":");imat(clean);printf(",\"factor\":");zmat(U);printf(",\"embeddingReal\":");rmat(M);printf(",\"embeddingImag\":");imat(M);printf(",\"expReal\":");rmat(z);printf(",\"expImag\":");imat(z);printf(",\"solvedReal\":");rmat(sol);printf(",\"rounded\":");zmat(rounded);printf(",\"tensor\":[");for(long j=1;j<=4;j++){if(j>1)putchar(',');zmat(gel(tensor,j));}printf("],\"roundError\":%ld,\"reason\":%ld,\"units\":[",rounderr,oracle_reason);if(fu)for(long j=1;j<lg(fu);j++){if(j>1)putchar(',');zmat(mkmat(algtobasis(nf,gel(fu,j))));}printf("],\"logsReal\":");if(fu)rmat(A);else printf("[]");printf(",\"logsImag\":");if(fu)imat(A);else printf("[]");printf(",\"finalFactor\":");if(fu)zmat(finalU);else printf("[]");puts("}");pari_close();return 0;
}
`;
  const c = path.join(directory, "oracle.c");
  const executable = path.join(directory, "oracle");
  fs.writeFileSync(c, source);
  run("cc", [
    "-O1", "-fsanitize=undefined", "-fno-sanitize-recover=undefined",
    "-I" + path.join(pari, "src/headers"), "-I" + library, c,
    "-L" + library, "-Wl,-rpath," + library, "-lpari", "-lm", "-o", executable,
  ]);
  const text = run(executable, []);
  return { directory, fixture: JSON.parse(text), trace: sha(text) };
}

const flat = (values) => values.flat(Infinity).map(BigInt);
const triples = (values) => values.flat().map(BigInt);
const values = (buffer) => (Array.isArray(buffer) ? buffer : buffer.toArray());
function argumentsFor(f, z, backend) {
  const exact = (n) =>
    backend === "javascript"
      ? Array(n).fill(0n)
      : f.createIntegerBuffer(n, 8192, Array(n).fill(0n));
  const state = Array(8).fill(0n);
  const args = [
    triples(z.archReal), triples(z.archImag), triples(z.cleanReal), triples(z.cleanImag),
    flat(z.factor), triples(z.embeddingReal), triples(z.embeddingImag), flat(z.tensor),
    BigInt(z.precision), exact(18), exact(18), exact(48), exact(24), exact(48),
    exact(24), exact(24), exact(8), exact(16), exact(4), exact(8), exact(4),
    exact(8), exact(18), exact(18), exact(4), state, Array(4).fill(0n), exact(3),
    exact(3), exact(512), exact(512), exact(512), exact(512), exact(1024),
  ];
  return { args, state, units: args[21], logsReal: args[22], logsImag: args[23], factor: args[24] };
}

function checkResult(runState, fixture) {
  assert.equal(runState.state[0], 0n);
  assert.equal(runState.state[6], 2n);
  assert(runState.state[7] === 1n || runState.state[7] === -1n);
  assert.deepEqual(values(runState.units), flat(fixture.units));
  assert.deepEqual(values(runState.logsReal), triples(fixture.logsReal));
  assert.deepEqual(values(runState.logsImag), triples(fixture.logsImag));
  assert.deepEqual(values(runState.factor), flat(fixture.finalFactor));
}

(async () => {
  const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
  const archive = path.resolve(process.argv[3] || "/home/user/upstream/pari-2.17.4.tar.gz");
  const oracle = sourceFixture(pari, archive);
  const z = oracle.fixture;
  assert.equal(
    oracle.trace,
    "bc117b22a77e474c6baab72e48643c19bfb6df5760f022cee2db6a1bf3f7b498",
  );
  assert.equal(z.reason, 0);
  assert(z.roundError < 0);
  assert.equal(z.units.length, 2);
  assert.equal(z.factor.length, 4);

  const dynamic = JSON.parse(run("python3", ["-c", `import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];z=json.load(sys.stdin);m=importlib.import_module('bench.pari-class-group-port.getfu_mixed_quartic')
deep=lambda x:sum((deep(y) if isinstance(y,list) else [int(y)] for y in x),[])
flat=deep
w=lambda n:[0]*n
args=[flat(z['archReal']),flat(z['archImag']),flat(z['cleanReal']),flat(z['cleanImag']),deep([z['factor']]),flat(z['embeddingReal']),flat(z['embeddingImag']),deep(z['tensor']),z['precision'],w(18),w(18),w(48),w(24),w(48),w(24),w(24),w(8),w(16),w(4),w(8),w(4),w(8),w(18),w(18),w(4),w(8),w(4),w(3),w(3),w(512),w(512),w(512),w(512),w(1024)]
status=m.pari_getfu_mixed_quartic(*args)
assert status==0 and args[21]==deep(z['units']) and args[22]==flat(z['logsReal']) and args[23]==flat(z['logsImag']) and args[24]==deep([z['finalFactor']]),(status,args[25],args[21],z['units'])
large=args.copy();large[0]=large[0][:];large[0][:3]=[1<<191,192,21];large[21]=w(8);large[22]=w(18);large[23]=w(18);large[24]=w(4);large[25]=w(8);assert m.pari_getfu_mixed_quartic(*large)==2 and large[25][0]==2
preci=args.copy();preci[1]=preci[1][:];preci[1][6:9]=[1<<63,64,60];preci[21]=w(8);preci[22]=w(18);preci[23]=w(18);preci[24]=w(4);preci[25]=w(8);assert m.pari_getfu_mixed_quartic(*preci)==3 and preci[25][0]==3
print(json.dumps({'success':1,'large':1,'preci':1,'state':args[25]}))`, path.resolve(__dirname, "../.."), path.resolve(__dirname, "../../src/lib")], { input: JSON.stringify(z) }));

  const built = await compileKernel({ sourcePath: path.join(__dirname, "getfu_mixed_quartic.py") });
  const f = require(built.modulePath).pari_getfu_mixed_quartic;
  assert(f.nativeAvailable);
  let exact = 0;
  let branchChecks = 0;
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const state = argumentsFor(f, z, backend);
    assert.equal(f[backend](...state.args), 0n);
    checkResult(state, z);
    exact++;
    const large = argumentsFor(f, z, backend);
    large.args[0][0] = 1n << 191n;
    large.args[0][1] = 192n;
    large.args[0][2] = 21n;
    assert.equal(f[backend](...large.args), 2n);
    assert.equal(large.state[0], 2n);
    assert(values(large.units).every((value) => value === 0n));
    const preci = argumentsFor(f, z, backend);
    preci.args[1][6] = 1n << 63n;
    preci.args[1][7] = 64n;
    preci.args[1][8] = 60n;
    assert.equal(f[backend](...preci.args), 3n);
    assert.equal(preci.state[0], 3n);
    assert(values(preci.units).every((value) => value === 0n));
    branchChecks += 2;
  }
  console.log(JSON.stringify({ fields: 1, exact, branchChecks, dynamic, traceSha256: oracle.trace,
    coreBytes: fs.statSync(built.coreSourcePath).size, cacheKey: built.cacheKey,
    ubsan: true, boundary: "mixed quartic LLL output -> cxexp -> RgM_solve_realimag -> exact units",
    artifactDirectory: oracle.directory }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
