#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "mixed_signature_cleanarch.py");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};
const close = (actual, expected, tolerance = 2e-12) => {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert(Math.abs(actual[index] - expected[index]) <= tolerance,
      `${index}: ${actual[index]} != ${expected[index]}`);
  }
};
const values = value => Array.isArray(value) ? value
  : value.toArray ? value.toArray() : Array.from(value);

const pi = Math.PI;
// Generated neutral inputs, not answer fixtures. Layout is row-major over
// three archimedean slots, then column, with `(real, imaginary)` pairs.
const classColumns = 2;
const classInput = [
  1.25, 5 * pi + 0.125, -2.5, -3 * pi + 0.25,
  -0.5, -7 * pi + 0.375, 4.0, 4 * pi + 0.5,
  0.75, 9 * pi + 0.625, -1.25, -5 * pi + 0.75,
];
const unitColumns = 2;
const unitInput = [
  1.25, 3 * pi + 0.125, -0.75, -2 * pi + 0.25,
  -0.5, -5 * pi + 0.375, 2.0, 4 * pi + 0.5,
  -0.75, 7 * pi + 0.625, -1.25, -3 * pi + 0.75,
];
const expectedRegulator = 2.125;

function pariOracle() {
  const pari = path.resolve(process.argv[2] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4");
  const archive = path.resolve(process.argv[3] || "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz");
  const archiveBytes = fs.readFileSync(archive);
  assert.equal(sha256(archiveBytes), "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53");
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(sha256(source), "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac");
  const encodedClass = classInput.map(value => value.toPrecision(17)).join(",");
  const encodedUnit = unitInput.map(value => value.toPrecision(17)).join(",");
  source += String.raw`
static GEN ms_entry(double re,double im){GEN r=dbltor(re),i=dbltor(im);return im==0.0?r:mkcomplex(r,i);}
static GEN ms_matrix(const double *v,long columns){GEN M=cgetg(columns+1,t_MAT);for(long c=0;c<columns;c++){GEN C=cgetg(4,t_COL);for(long r=0;r<3;r++){long at=2*(r*columns+c);gel(C,r+1)=ms_entry(v[at],v[at+1]);}gel(M,c+1)=C;}return M;}
static void ms_emit(GEN M,long columns){for(long r=1;r<=3;r++)for(long c=1;c<=columns;c++){GEN x=gcoeff(M,r,c);double re=gtodouble(real_i(x)),im=typ(x)==t_COMPLEX?gtodouble(gel(x,2)):0.0;printf("%.17g %.17g ",re,im);}}
int main(void){
  static const double cv[]={${encodedClass}},uv[]={${encodedUnit}};
  pari_init(128000000,10000);GEN C=ms_matrix(cv,${classColumns}),U=ms_matrix(uv,${unitColumns});
  GEN D=cleanarch(C,4,NULL,DEFAULTPREC),V=cleanarchunit(U,4,NULL,DEFAULTPREC);
  if(!D||!V)return 2;ms_emit(D,${classColumns});putchar('\n');ms_emit(V,${unitColumns});putchar('\n');pari_close();return 0;
}`;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-mixed-cleanarch-"));
  const cPath = path.join(temporary, "oracle.c");
  const executable = path.join(temporary, "oracle");
  fs.writeFileSync(cPath, source);
  const library = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${library}`,
    cPath, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", executable]);
  const lines = run(executable, []).trim().split(/\r?\n/);
  return {
    clean: lines[0].trim().split(/\s+/).map(Number),
    unit: lines[1].trim().split(/\s+/).map(Number),
    sourceSha256: sha256(source.slice(0, source.indexOf("static GEN ms_entry"))),
  };
}

function cpython(oracle) {
  const program = String.raw`
import importlib,json,sys
sys.path[:0]=sys.argv[1:3]
m=importlib.import_module("bench.pari-class-group-port.mixed_signature_cleanarch")
d=json.load(sys.stdin);I=lambda n:[0]*n;F=lambda n:[0.0]*n
scratch=F(len(d["classInput"]));out=[777.0]*len(scratch);state=I(4);trace=F(3)
assert m.pari_cleanarch_mixed_quartic(d["classInput"],d["classColumns"],scratch,out,state,trace)==0
assert all(abs(a-b)<2e-12 for a,b in zip(out,d["clean"]))
assert state==[0,d["classColumns"],d["classColumns"],-1] and trace[1]<2e-15
uscratch=F(len(d["unitInput"]));uout=[777.0]*len(uscratch);ustate=I(4);utrace=F(6)
assert m.pari_cleanarchunit_mixed_quartic(d["unitInput"],2,d["regulator"],uscratch,uout,ustate,utrace)==0
assert all(abs(a-b)<2e-12 for a,b in zip(uout,d["unit"]))
assert ustate==[0,2,2,-1] and utrace[5]<2e-15
bad=d["unitInput"][:];bad[8]+=0.01;held=[777.0]*len(bad);s=I(4)
assert m.pari_cleanarchunit_mixed_quartic(bad,2,d["regulator"],F(len(bad)),held,s,F(6))==1
assert held==[777.0]*len(bad) and s[2]==0
held=[777.0]*len(bad);s=I(4)
assert m.pari_cleanarchunit_mixed_quartic(d["unitInput"],2,d["regulator"]+1,F(len(bad)),held,s,F(6))==2
assert held==[777.0]*len(bad) and s[2]==0
huge=d["classInput"][:];huge[1]=1e20;held=[777.0]*len(huge);s=I(4)
assert m.pari_cleanarch_mixed_quartic(huge,2,F(len(huge)),held,s,F(3))==1
assert held==[777.0]*len(huge) and s[2]==0
`;
  run("python3", ["-c", program, root, path.join(root, "src/lib")], {
    input: JSON.stringify({ classInput, classColumns, unitInput,
      regulator: expectedRegulator, clean: oracle.clean, unit: oracle.unit }),
  });
}

(async () => {
  const oracle = pariOracle();
  cpython(oracle);
  if (process.argv.includes("--cpython-only")) {
    console.log(JSON.stringify({ field: "x^4-2000022*x-2000042", signature: [2, 1],
      backends: ["pari-2.17.4", "cpython"], transactionalFailures: 3 }));
    return;
  }
  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);
  const clean = module.pari_cleanarch_mixed_quartic;
  const unit = module.pari_cleanarchunit_mixed_quartic;
  assert(clean.nativeAvailable && unit.nativeAvailable);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const F = data => backend === "javascript" ? data.slice() : clean.createFloat64Buffer(data);
    const I = length => backend === "javascript" ? Array(length).fill(0n)
      : clean.createInt64Buffer(Array(length).fill(0n));
    const output = F(Array(classInput.length).fill(0));
    const state = I(4); const trace = F(Array(3).fill(0));
    assert.equal(clean[backend](F(classInput), BigInt(classColumns),
      F(Array(classInput.length).fill(0)), output, state, trace), 0n);
    close(values(output), oracle.clean);
    const unitOutput = F(Array(unitInput.length).fill(0));
    assert.equal(unit[backend](F(unitInput), 2n, expectedRegulator,
      F(Array(unitInput.length).fill(0)), unitOutput, I(4), F(Array(6).fill(0))), 0n);
    close(values(unitOutput), oracle.unit);
  }
  console.log(JSON.stringify({ field: "x^4-2000022*x-2000042", signature: [2, 1],
    classColumns, unitColumns, periods: ["2*pi", "2*pi", "4*pi"],
    productFormula: true, transactionalFailures: 3,
    backends: ["pari-2.17.4", "cpython", "javascript", "gmp", "tagged"],
    cacheKey: built.cacheKey }));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
