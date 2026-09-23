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
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function sourceOracle(pari) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-cubic-embedding-"));
  const cfile = path.join(directory, "oracle.c");
  const binary = path.join(directory, "oracle");
  fs.writeFileSync(cfile, String.raw`
#include "pari.h"
static GEN realpart(GEN x){return typ(x)==t_COMPLEX?gel(x,1):x;}
static void scalar(GEN x){long e=0;x=realpart(x);if(typ(x)==t_INT)pari_printf("[\"%Ps\",-1,0]",x);else if(!signe(x))printf("[\"0\",0,%ld]",expo(x));else pari_printf("[\"%Ps\",%ld,%ld]",mantissa_real(x,&e),bit_prec(x),expo(x));}
static void vector(GEN x){putchar('[');for(long i=1;i<lg(x);i++){if(i>1)putchar(',');scalar(gel(x,i));}putchar(']');}
static void matrix(GEN x){putchar('[');for(long j=1;j<lg(x);j++)for(long i=1;i<lgcols(x);i++){if(j>1||i>1)putchar(',');scalar(gcoeff(x,i,j));}putchar(']');}
int main(void){pari_init(256000000,10000);long resident=nbits2prec(192),retry=nbits2prec(2048);GEN b=bnfinit0(gp_read_str("x^3-20018*x+20034"),1,NULL,resident);b=bnfnewprec(b,retry);GEN nf=bnf_get_nf(b);printf("{\"roots\":");vector(nf_get_roots(nf));printf(",\"embedding\":");matrix(nf_get_M(nf));puts("}");pari_close();return 0;}
`);
  const lib = path.join(pari, "Olinux-x86_64");
  run("cc", ["-O2", `-I${path.join(pari, "src/headers")}`, `-I${lib}`,
    cfile, `-L${lib}`, `-Wl,-rpath,${lib}`, "-lpari", "-lm", "-o", binary]);
  const text = run(binary, []);
  return { directory, text, value: JSON.parse(text), sha256: sha(text) };
}

const pari = path.resolve(process.argv[2] || "/home/user/upstream/pari-2.17.4");
const oracle = sourceOracle(pari);
if (process.argv.includes("--dump")) {
  console.log(oracle.text.trim());
  process.exit(0);
}

const polynomial = ["20034", "-20018", "0", "1"];
const basis = ["1", "0", "0", "0", "1", "0", "-13345", "2", "1"];
const payload = { polynomial, basis, roots: oracle.value.roots, embedding: oracle.value.embedding };
const python = JSON.parse(run("python3", ["-c", String.raw`
import importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path[:0]=sys.argv[1:3];d=json.load(sys.stdin)
f=importlib.import_module('bench.pari-class-group-port.cubic_embedding_rebuild').pari_cubic_embedding_rebuild
p=list(map(int,d['polynomial']));b=list(map(int,d['basis']))
rm=[777]*3;rp=[777]*3;re=[777]*3;em=[777]*9;ep=[777]*9;ee=[777]*9;state=[777]*4
assert f(p,b,2176,rm,rp,re,em,ep,ee,state)==0
roots=[[str(rm[i]),rp[i],re[i]] for i in range(3)]
embedding=[[str(em[i]),ep[i],ee[i]] for i in range(9)]
assert roots==d['roots'];assert embedding==d['embedding'];assert state==[3,2176,2496,1]
held=([777]*3,[777]*3,[777]*3,[777]*9,[777]*9,[777]*9,[777]*4)
try:f([0,0,0,1],b,2176,*held);raise AssertionError('invalid cubic accepted')
except ValueError:pass
assert all(all(x==777 for x in v) for v in held)
print(json.dumps({'status':'exact','state':state,'transactionalFailure':True}))
`, root, path.join(root, "src/lib")], { input: JSON.stringify(payload) }));

const values = (buffer) => Array.isArray(buffer)
  ? buffer
  : buffer.toArray
    ? buffer.toArray()
    : Array.from(buffer);
function argumentsFor(f, backend, failed = false) {
  const I = (data) => backend === "javascript"
    ? data.slice()
    : f.createIntegerBuffer(data.length, 8192, data);
  const S = (length) => backend === "javascript"
    ? Array(length).fill(777n)
    : f.createInt64Buffer(Array(length).fill(777n));
  const held = (length) => I(Array(length).fill(777n));
  const args = [
    I((failed ? [0, 0, 0, 1] : polynomial).map(BigInt)),
    I(basis.map(BigInt)), 2176n,
    held(3), held(3), held(3), held(9), held(9), held(9), S(4),
  ];
  return { args, outputs: args.slice(3) };
}

(async () => {
  const built = await compileKernel({
    sourcePath: path.join(__dirname, "cubic_embedding_rebuild.py"),
  });
  assert.doesNotMatch(fs.readFileSync(built.coreSourcePath, "utf8"),
    /napi_call_function|PyObject_Call/);
  const f = require(built.modulePath).pari_cubic_embedding_rebuild;
  assert.equal(f.nativeAvailable, true);
  const expectedRoots = oracle.value.roots.flat().map(BigInt);
  const expectedEmbedding = oracle.value.embedding.flat().map(BigInt);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const call = argumentsFor(f, backend);
    assert.equal(f[backend](...call.args), 0n, backend);
    const [rm, rp, re, em, ep, ee, state] = call.outputs.map(values);
    const roots = Array.from({ length: 3 }, (unused, index) =>
      [rm[index], rp[index], re[index]]).flat();
    const embedding = Array.from({ length: 9 }, (unused, index) =>
      [em[index], ep[index], ee[index]]).flat();
    assert.deepEqual(roots, expectedRoots, backend);
    assert.deepEqual(embedding, expectedEmbedding, backend);
    assert.deepEqual(state, [3n, 2176n, 2496n, 1n], backend);
    const failed = argumentsFor(f, backend, true);
    assert.throws(() => f[backend](...failed.args), /exact integral cubic roots/, backend);
    for (const output of failed.outputs) {
      assert.ok(values(output).every((value) => value === 777n), backend);
    }
  }
  console.log(JSON.stringify({
    cases: 1,
    polynomial: "x^3-20018*x+20034",
    rootPrecisionBits: oracle.value.roots.map((entry) => entry[1]),
    embeddingPrecisionBits: oracle.value.embedding.map((entry) => entry[1]),
    oracleTraceSha256: oracle.sha256,
    python,
    backends: ["cpython", "javascript", "gmp", "tagged"],
    highPrecisionRootsInjected: false,
    highPrecisionEmbeddingInjected: false,
    transactionalFailure: true,
    coreSha256: sha(fs.readFileSync(built.coreSourcePath)),
    artifactDirectory: oracle.directory,
  }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
