// sagejs-test-tier: specialized
// sagejs-test-portable: true
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compileKernel } = require("../compiler.cjs");
const { lowerSource } = require("../ir.cjs");

test("imported math.isqrt preserves exact roots, remainders and failure effects", async (t) => {
  const previousValueError = globalThis.ValueError;
  class PythonValueError extends Error {}
  globalThis.ValueError = PythonValueError;
  t.after(() => {
    if (previousValueError === undefined) delete globalThis.ValueError;
    else globalThis.ValueError = previousValueError;
  });
  const negativeError = error => error instanceof PythonValueError &&
    error.message === "isqrt() argument must be nonnegative";
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-isqrt-"));
  const sourcePath = path.join(directory, "roots.py");
  fs.writeFileSync(sourcePath, `from sagejs.native import native, Float64Buffer, Int64Buffer
from math import isqrt as floor_root
@native
def root(a: int) -> int:
    return floor_root(a)
@native
def pair(a: int) -> tuple[int, int]:
    r = floor_root(a)
    return r, a - r*r
@native
def reassigned(a: int) -> int:
    a = floor_root(a)
    return floor_root(a + 1)
@native
def mixed(a: int, values: Float64Buffer) -> int:
    values[0] = 1.0
    return floor_root(a)
@native
def discarded(a: int, values: Int64Buffer) -> int:
    values[0] = 7
    root(a)
    values[1] = 9
    return 0
`);
  const built = await compileKernel({ sourcePath }), module = require(built.modulePath);
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.match(core, /mpz_sqrt\(/);
  assert.match(core, /sagejs_word_isqrt_uint64\(/);
  assert.doesNotMatch(core, /nearbyint\(sqrt|sqrt\(\(double\)/);
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call/);
  const ir = await lowerSource(fs.readFileSync(sourcePath, "utf8"), sourcePath);
  assert(ir.functions.some(f => JSON.stringify(f.body).includes('"integer.isqrt"')));
  assert(ir.functions.find(f => f.name === "root").analysis.effects.mayRaise.includes("ValueError"));
  const values = new Set(Array.from({ length: 256 }, (_, i) => String(i)));
  for (const bits of [1, 2, 4, 15, 31, 32, 53, 62, 63, 64, 65, 127, 128, 192, 256, 512, 1024, 4096, 8192]) {
    for (const delta of [-1n, 0n, 1n, 3n]) {
      const root = (1n << BigInt(bits)) + delta;
      for (const offset of [-1n, 0n, 1n]) values.add(String(root * root + offset));
    }
    for (const offset of [-1n, 0n, 1n]) values.add(String((1n << BigInt(bits)) + offset));
  }
  const inputs = [...values].map(BigInt);
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const oracle = spawnSync(python, ["-c", `import sys,json,math
if hasattr(sys,'set_int_max_str_digits'): sys.set_int_max_str_digits(0)
values=list(map(int,json.load(sys.stdin)))
print(json.dumps([[str(math.isqrt(n)),str(n-math.isqrt(n)**2),str(math.isqrt(math.isqrt(n)+1))] for n in values]))`],
  { input: JSON.stringify(inputs.map(String)), encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(oracle.status, 0, oracle.stderr);
  const expected = JSON.parse(oracle.stdout);
  for (let i = 0; i < inputs.length; i++) for (const backend of ["javascript", "gmp", "tagged"]) {
    const n = inputs[i], [r, remainder, repeated] = expected[i].map(BigInt);
    assert.equal(module.root[backend](n), r);
    assert.deepEqual(module.pair[backend](n), [r, remainder]);
    assert.equal(module.reassigned[backend](n), repeated);
    const sidecar = [0];
    assert.equal(module.mixed[backend](n, sidecar), r); assert.equal(sidecar[0], 1);
    assert(r*r <= n && (r+1n)*(r+1n) > n);
  }
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const n of [-1n, -(1n << 63n), -(1n << 8192n)]) {
      assert.throws(() => module.root[backend](n), negativeError);
      assert.throws(() => module.reassigned[backend](n), negativeError);
      const state = [0, 0];
      assert.throws(() => module.discarded[backend](n, state), negativeError);
      assert.deepEqual(state.map(Number), [7, 0]);
    }
    const state = [0, 0];
    assert.equal(module.discarded[backend](81n, state), 0n);
    assert.deepEqual(state.map(Number), [7, 9]);
  }

  // Exercise representation aliasing directly, including big-to-small and
  // negative failure atomicity. UBSan needs no ASan shadow-address exception.
  if (process.platform === "linux" && process.env.SAGEJS_FLINT_PREFIX) {
    const prefix = process.env.SAGEJS_FLINT_PREFIX;
    const harness = path.join(directory, "alias.c"), executable = path.join(directory, "alias");
    fs.writeFileSync(harness, `#include "${built.coreSourcePath}"
#include <assert.h>
int main(void) {
  mpz_t n,r; mpz_inits(n,r,NULL);
  sagejs_tagged_int value; sagejs_tagged_init(&value);
  for (uint64_t i=0;i<65536;i++) {
    set_mpz_uint64(n,i); mpz_sqrt(r,n);
    assert(sagejs_word_isqrt_uint64(i)==mpz_get_ui(r));
  }
  const uint64_t edge[]={UINT64_MAX,UINT64_C(1)<<63,INT64_MAX};
  for(int i=0;i<3;i++) {set_mpz_uint64(n,edge[i]);mpz_sqrt(r,n);assert(sagejs_word_isqrt_uint64(edge[i])==mpz_get_ui(r));}
  for(int bits=0;bits<=4096;bits+=17) {
    for(int delta=-1;delta<=1;delta++) {
      mpz_set_ui(n,1);mpz_mul_2exp(n,n,bits);
      if(delta<0)mpz_sub_ui(n,n,1); else if(delta>0)mpz_add_ui(n,n,1);
      mpz_sqrt(r,n);sagejs_tagged_make_big(&value);mpz_set(value.big,n);
      sagejs_native_status status={0};assert(sagejs_tagged_isqrt(&status,&value,&value));
      int64_t small;if(mpz_to_int64(r,&small))assert(!value.is_big&&value.small==small);
      sagejs_tagged_make_big(&value);assert(mpz_cmp(value.big,r)==0);
    }
  }
  sagejs_tagged_set_small(&value,-1);sagejs_native_status status={0};
  assert(!sagejs_tagged_isqrt(&status,&value,&value));assert(!value.is_big&&value.small==-1);
  sagejs_tagged_make_big(&value);mpz_set_si(value.big,-17);status.code=0;
  assert(!sagejs_tagged_isqrt(&status,&value,&value));assert(mpz_cmp_si(value.big,-17)==0);
  sagejs_tagged_clear(&value);mpz_clears(n,r,NULL);return 0;
}`);
    const cc = spawnSync("cc", ["-O1", "-fsanitize=undefined", "-fno-sanitize-recover=undefined",
      "-I" + path.join(prefix, "include"), harness, path.join(prefix, "lib/libgmp.a"), "-lm", "-o", executable],
    { encoding: "utf8", timeout: 30000 });
    assert.equal(cc.status, 0, cc.stderr);
    const check = spawnSync(executable, [], { encoding: "utf8", timeout: 30000 });
    assert.equal(check.status, 0, check.stderr);
  }
});

test("math.isqrt resolves imported identity and rejects unsupported bindings", async () => {
  for (const call of ["isqrt()", "isqrt(a,a)", "isqrt(n=a)", "isqrt(1.5)", "isqrt(*a)"])
    await assert.rejects(() => lowerSource(`from math import isqrt\ndef f(a:int)->int:\n    return ${call}\n`, "bad.py"), /isqrt|native/);
  for (const source of [
    "def f(a:int)->int:\n    return isqrt(a)\n",
    "from math import isqrt\ndef f(isqrt:int)->int:\n    return isqrt(4)\n",
    "from math import isqrt\ndef f(a:int)->int:\n    isqrt=2\n    return isqrt(a)\n",
    "from math import isqrt\nfrom math import gcd as isqrt\ndef f(a:int)->int:\n    return isqrt(a)\n",
    "from math import isqrt\ndef isqrt(a:int)->int:\n    return a\ndef f(a:int)->int:\n    return isqrt(a)\n",
  ]) await assert.rejects(() => lowerSource(source, "binding.py"), /isqrt|shadowed|ambiguous|unsupported/);
});
