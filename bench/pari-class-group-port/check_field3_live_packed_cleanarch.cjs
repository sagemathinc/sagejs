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

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "field3_packed_class_cleanarch.py");
const lowPrecision = 192;
const highPrecision = 153088;
const columns = 2;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
};
const values = (owner) =>
  Array.isArray(owner) ? owner : owner.toArray ? owner.toArray() : Array.from(owner);

function normalized(precision, offset = 0n) {
  return (1n << BigInt(precision - 1)) + (offset << BigInt(precision - 72));
}
function generatedInput(precision, complex) {
  const answer = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < 3; row += 1) {
      const serial = BigInt(1 + 3 * column + row);
      const kind = complex ? 2n : 1n;
      const imaginary = complex ? normalized(precision, serial + 9n) : 0n;
      answer.push(
        kind,
        normalized(precision, serial),
        BigInt(precision),
        BigInt(-5 + row),
        imaginary,
        complex ? BigInt(precision) : -1n,
        complex ? BigInt(-7 + row) : 0n,
      );
    }
  }
  return answer;
}
function exactZeros() {
  return Array.from({ length: columns * 3 }, () =>
    [1n, 0n, 0n, 0n, 0n, -1n, 0n]).flat();
}

function pariOracle(input, pari, archive) {
  assert.equal(
    sha256(fs.readFileSync(archive)),
    "02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53",
  );
  let source = run("tar", ["-xOf", archive, "pari-2.17.4/src/basemath/buch2.c"]);
  assert.equal(
    sha256(source),
    "904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac",
  );
  const quoted = input.map((value) => `"${value}"`).join(",");
  source += String.raw`
static GEN f3_real(const char *m,long p,long e){GEN z=m[0]=='-'?negi(strtoi(m+1)):strtoi(m);if(p<0)return z;if(!signe(z))return real_0(nbits2prec(${lowPrecision}));return gmul2n(itor(z,nbits2prec(p)),e+1-p);}
static void f3_scalar(GEN x){long e=0;if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static void f3_entry(GEN x){if(typ(x)==t_COMPLEX){printf("[\"2\",");f3_scalar(gel(x,1));printf(",");f3_scalar(gel(x,2));printf("]");}else{printf("[\"1\",");f3_scalar(x);printf(",[\"0\",-1,0]]");}}
int main(void){static const char *v[]={${quoted}};pari_init(512000000,10000);GEN C=cgetg(${columns + 1},t_MAT);long k=0;
for(long j=1;j<=${columns};j++){GEN c=cgetg(4,t_COL);for(long i=1;i<=3;i++){long kind=atol(v[k++]);GEN re=f3_real(v[k],atol(v[k+1]),atol(v[k+2]));k+=3;GEN im=f3_real(v[k],atol(v[k+1]),atol(v[k+2]));k+=3;gel(c,i)=kind==2?mkcomplex(re,im):re;}gel(C,j)=c;}
GEN z=cleanarch(C,4,NULL,nbits2prec(${lowPrecision}));if(!z)return 2;printf("{\"cleaned\":[");for(long j=1;j<=${columns};j++)for(long i=1;i<=3;i++){if(j>1||i>1)putchar(',');f3_entry(gcoeff(z,i,j));}
long add=nbits2extraprec(gexpo(C)+64)-gprecision(C);printf("],\"retry\":[1,%ld,%ld,%ld,%ld,%ld]}\n",(long)${lowPrecision},(long)${lowPrecision}+maxss(add,1),maxss(add,1),gexpo(C),gprecision(C));pari_close();return 0;}
`;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-field3-cleanarch-"));
  try {
    const cPath = path.join(temporary, "oracle.c");
    const executable = path.join(temporary, "oracle");
    fs.writeFileSync(cPath, source);
    const library = path.join(pari, "Olinux-x86_64");
    run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${library}`,
      cPath, `-L${library}`, `-Wl,-rpath,${library}`, "-lpari", "-lm", "-o", executable]);
    return JSON.parse(run(executable, []));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
function flatten(entries) {
  return entries.flatMap(([kind, real, imaginary]) =>
    [kind, ...real, ...imaginary]).map(BigInt);
}

function cpythonEvidence(lowInput, lowExpected, retry, highInput) {
  const program = String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(1000000);sys.path.extend(sys.argv[1:3])
m=importlib.import_module('bench.pari-class-group-port.field3_packed_class_cleanarch')
p=importlib.import_module('bench.pari-class-group-port.pi_constant')
d=json.load(sys.stdin);I=lambda n:[0]*n
low=list(map(int,d['lowInput']));want=list(map(int,d['lowExpected']))
scratch=I(len(low));out=[777]*len(low);state=I(7)
assert m.pari_field3_packed_class_cleanarch(low,2,192,I(3),I(512),I(512),I(512),I(512),I(1024),scratch,out,state)==0
assert out==want and state[:3]==[0,2,2]
retry=I(6);assert m.pari_field3_cleanarch_retry_status(low,6,192,retry)==1
assert retry==d['retry']
precision=153088;cells,stack_cells=p.pari_pi_workspace_capacity(precision)
assert cells>512 and stack_cells>=91
neutral=list(map(int,d['neutral']));cache=I(3);neutral_out=[777]*len(neutral);neutral_state=I(7)
assert m.pari_field3_packed_class_cleanarch(neutral,2,precision,cache,I(cells),I(cells),I(cells),I(cells),I(stack_cells),I(len(neutral)),neutral_out,neutral_state)==0
assert neutral_out==neutral and cache[1]==precision and neutral_state[:3]==[0,2,2]
high=list(map(int,d['highInput']));high_out=[777]*len(high);high_state=I(7)
assert m.pari_field3_packed_class_cleanarch(high,2,precision,cache,I(0),I(0),I(0),I(0),I(0),I(len(high)),high_out,high_state)==0
held=[777]*len(high);held_state=[77]*7
try:m.pari_field3_packed_class_cleanarch(high,2,precision,I(3),I(cells-1),I(cells),I(cells),I(cells),I(stack_cells),I(len(high)),held,held_state);raise AssertionError('short capacity accepted')
except ValueError:pass
assert held==[777]*len(high) and held_state==[77]*7
try:m.pari_field3_packed_class_cleanarch(high,2,153152,I(3),I(cells),I(cells),I(cells),I(cells),I(stack_cells),I(len(high)),held,held_state);raise AssertionError('invalid PRECI accepted')
except ValueError:pass
assert held==[777]*len(high) and held_state==[77]*7
bad=high[:];bad[2]=153152;bad[1]=1<<153151;held=[777]*len(high)
try:m.pari_field3_packed_class_cleanarch(bad,2,precision,cache,I(0),I(0),I(0),I(0),I(0),I(len(high)),held,I(7));raise AssertionError('oversized packed input accepted')
except ValueError:pass
assert held==[777]*len(high)
print(json.dumps({'cells':cells,'stackCells':stack_cells,'highState':high_state,'highCells':len(high_out)}))
`;
  return JSON.parse(run("python3", ["-c", program, root, path.join(root, "src/lib")], {
    input: JSON.stringify({ lowInput: lowInput.map(String), lowExpected: lowExpected.map(String),
      retry, neutral: exactZeros().map(String), highInput: highInput.map(String) }),
  }));
}

(async () => {
  assert(process.argv.length === 2 || process.argv.length === 4,
    "usage: check_field3_live_packed_cleanarch.cjs [PARI_ROOT PARI_ARCHIVE]");
  const pari = path.resolve(process.argv[2] ||
    "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4");
  const archive = path.resolve(process.argv[3] ||
    "/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz");
  const lowInput = generatedInput(lowPrecision, true);
  const highInput = generatedInput(highPrecision, false);
  const oracle = pariOracle(lowInput, pari, archive);
  const lowExpected = flatten(oracle.cleaned);
  const evidence = cpythonEvidence(lowInput, lowExpected, oracle.retry, highInput);
  const compilerRoot = process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root;
  const { compileKernel } = require(path.join(compilerRoot, "tools/native-kernel/compiler.cjs"));
  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);
  const clean = module.pari_field3_packed_class_cleanarch;
  const retry = module.pari_field3_cleanarch_retry_status;
  assert(clean.nativeAvailable && retry.nativeAvailable);
  const summaries = {};
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const I = (length, data = Array(length).fill(0n), precision = 4352) =>
      backend === "javascript" ? data.slice() : clean.createIntegerBuffer(length, precision, data);
    const S = (length, fill = 0n) => backend === "javascript"
      ? Array(length).fill(fill) : clean.createInt64Buffer(Array(length).fill(fill));
    const lowOutput = I(lowInput.length, Array(lowInput.length).fill(777n));
    const lowState = S(7);
    assert.equal(clean[backend](I(lowInput.length, lowInput), 2n, 192n, I(3), I(512),
      I(512), I(512), I(512), I(1024), I(lowInput.length), lowOutput, lowState), 0n);
    assert.deepEqual(values(lowOutput), lowExpected, `${backend}: pristine low differential`);
    const retryState = S(6);
    assert.equal(retry[backend](I(lowInput.length, lowInput), 6n, 192n, retryState), 1n);
    assert.deepEqual(values(retryState), oracle.retry.map(BigInt), `${backend}: PRECI retry`);
    // Native capacity rejection needs no maximum-sized element allocation:
    // a cold cache and truly empty workspaces fail at the same preflight.
    const held = I(lowInput.length, Array(lowInput.length).fill(777n));
    const heldState = S(7, 77n);
    assert.throws(() => clean[backend](I(lowInput.length, lowInput), 2n, 192n,
      I(3), I(0), I(0), I(0), I(0), I(0), I(lowInput.length), held, heldState));
    assert.deepEqual(values(held), Array(lowInput.length).fill(777n));
    assert.deepEqual(values(heldState), Array(7).fill(77n));
    summaries[backend] = { lowState: values(lowState).map(String) };
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({
    schema: "field3-packed-cleanarch-153088-check-v1", lowPrecision, highPrecision,
    coefficientCells: evidence.cells, stackCells: evidence.stackCells,
    lowOracle: "pristine PARI 2.17.4 generated input",
    highOracle: "CPython same source generated neutral/synthetic input",
    backends: ["PARI-2.17.4", "CPython", "javascript", "gmp", "tagged"],
    highPrecisionBackends: ["CPython"],
    atomicCapacityFailure: true, atomicPrecisionMutation: true, summaries,
  }));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
