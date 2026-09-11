// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {mkdtempSync, readFileSync, writeFileSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join, resolve} = require("node:path");
const test = require("node:test");
const {generateHostCore} = require("../c-backend.cjs");
const {compileKernel} = require("../compiler.cjs");
const {lowerSource} = require("../ir.cjs");
const {sanitizerEnvironment} = require("../../../test/helpers/sanitizers.cjs");
const {removeLoadedNativeCache} = require("../../../test/helpers/native-cache-cleanup.cjs");

const root = resolve(__dirname, "../../..");
const filename = join(root, "test/fixtures/native-fmpz-owned-helpers.py");
const source = readFileSync(filename, "utf8");
const prefix = process.env.SAGEJS_FLINT_PREFIX || join(root, "packages/flint/.native/prefix");

function body(core, name) {
  const pattern = new RegExp("^static int " + name + "\\([^\\n]*\\)\\n\\{", "m");
  const match = pattern.exec(core);
  assert(match, name);
  const end = core.indexOf("\nstatic ", match.index + match[0].length);
  return core.slice(match.index, end < 0 ? undefined : end);
}

test("owned matrix helpers have direct fmpz calls and complete cleanup", async () => {
  const ir = await lowerSource(source, filename);
  assert.equal(ir.functions.length, 3);
  for (const fn of ir.functions) assert.equal(fn.analysis.backend.kind, "fmpz", fn.name);
  assert.equal(ir.functions[0].analysis.backend.qualification, "direct-fmpz-owned-matrix-helper-call-graph-v5");
  const core = generateHostCore(ir).source;
  const helper = body(core, "fmpz_native_matrix_helper");
  assert.match(helper, /fmpz_gcd\(/);
  assert.match(helper, /sagejs_fmpz_matrix_right_kernel\(/);
  assert.match(helper, /fmpz_native_squared_kernel_length\(/);
  assert.doesNotMatch(helper, /\bmpz_|fmpz_(?:get|set)_mpz|checkpoint_(?:open|close)/);
  const fn = ir.functions.find(fn => fn.name === "matrix_helper");
  const matrix = "sagejs_" + fn.resourceAliases.source;
  const kernel = "sagejs_" + fn.resourceAliases.kernel;
  for (const label of ["success:", "fail:"]) {
    const cleanup = helper.slice(helper.indexOf(label));
    assert(cleanup.indexOf(`sagejs_fmpz_matrix_clear(${kernel})`) >= 0);
    assert(cleanup.indexOf(`sagejs_fmpz_matrix_clear(${kernel})`) < cleanup.indexOf(`sagejs_fmpz_matrix_clear(${matrix})`));
  }
  // An internal borrowed callee must survive even though it has no host ABI.
  assert.match(body(core, "tagged_matrix_helper"), /tagged_squared_kernel_length\(/);
  assert.match(core, /static int tagged_squared_kernel_length\(/);
  const gmpRoot = body(core, "native_owned_helper_witness");
  const checkpointCleanup = ir.foreignLibraries.find(library => library.id === "flint").native.checkpoint_cleanup;
  for (const label of ["success:", "fail:"]) {
    const cleanup = gmpRoot.slice(gmpRoot.indexOf(label));
    assert(cleanup.indexOf(`${checkpointCleanup}();`) >= 0);
    assert(cleanup.indexOf(`${checkpointCleanup}();`) < cleanup.indexOf("sagejs_native_exact_arena_clear("));
  }
  assert(!body(core, "native_matrix_helper").includes(`${checkpointCleanup}(`));
  const indirect = source.replace("@native\ndef owned_helper_witness", "def indirect_helper(value: int, mode: uint64, rows: uint64) -> int:\n    return matrix_helper(value, mode, rows)\n\n\n@native\ndef owned_helper_witness")
    .replace("total += matrix_helper(value, mode, rows)", "total += indirect_helper(value, mode, rows)");
  const indirectIr = await lowerSource(indirect, filename);
  assert.equal(indirectIr.functions.length, 4);
  const indirectCore = generateHostCore(indirectIr).source;
  assert(body(indirectCore, "native_owned_helper_witness").includes(`${checkpointCleanup}(`));
  assert(!body(indirectCore, "native_indirect_helper").includes(`${checkpointCleanup}(`));
});

test("owned helper qualification does not permit control-dependent allocation or escapes", async () => {
  await assert.rejects(lowerSource(source.replace("    source = fmpz_matrix(rows, 3)", "    if mode == 0:\n        source = fmpz_matrix(rows, 3)"), "conditional-owner.py"), /top-level native block/);
  // A second top-level constructor is another owned temporary, not an escape.
  const rebound = await lowerSource(source.replace("    alias = source", "    source = fmpz_matrix(rows, 3)\n    alias = source"), "rebound-owner.py");
  assert.equal(rebound.functions[0].analysis.backend.kind, "fmpz");
  const nested = source.replace("    source = fmpz_matrix(rows, 3)", "    with NativeExactArena(4096, 4096) as nested:\n        temporary = nested.integer_vector(1, 0)\n    source = fmpz_matrix(rows, 3)");
  await assert.rejects(lowerSource(nested, "nested-checkpoint.py"), /arena|checkpoint/i);
  const unsupported = source.replace("    fmpz_gcd,", "    fmpz_gcd,\n    fmpz_matrix_rank,").replace("    length = squared_kernel_length(kernel)", "    length = squared_kernel_length(kernel) + fmpz_matrix_rank(source)");
  const ir = await lowerSource(unsupported, "unqualified-declaration.py");
  assert.notEqual(ir.functions.find(fn => fn.name === "owned_helper_witness").analysis.backend.kind, "fmpz");
});

test("owned helpers agree across actual fmpz, GMP and JavaScript execution", {timeout:180000}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-fmpz-owned-"));
  try {
    const built = await compileKernel({sourcePath:filename,cacheRoot:join(temporary,"cache")});
    const runner = String.raw`
const assert=require('node:assert/strict');
const k=require(process.argv[1]).owned_helper_witness;
assert.equal(k.backendPolicy.kind,'fmpz');assert.equal(typeof k.fmpz,'function');
for(const name of ['fmpz','gmp','javascript']){
  const run=k[name];
  for(const value of [0n,1n,-1n,7n,-19n,(1n<<260n)+3n,-((1n<<260n)+3n)]){
    for(const repeats of [0,1,5]){
      const output=k.packIntegerBuffer([313n],512);
      const expected=BigInt(repeats)*(value===0n?-7n:34n+2n*(value<0n?-value:value));
      assert.equal(run(output,value,0,2,repeats,1048576,3145728),expected,name);
      assert.equal(output.toArray()[0],expected);
    }
  }
  const output=k.packIntegerBuffer([313n],512);
  assert.equal(run(output,23n,1,2,3,1048576,3145728),51n);
  for(const mode of [2,3]){
    const sentinel=k.packIntegerBuffer([313n],512);
    assert.throws(()=>run(sentinel,23n,mode,2,1,1048576,3145728));
    assert.equal(sentinel.toArray()[0],313n);
  }
  assert.throws(()=>run(k.packIntegerBuffer([313n],512),1n,0,0,1,1048576,3145728));
  assert.equal(run(output,23n,0,2,100,1048576,3145728),8000n);
}
console.log('three actual implementations, 63 formula checks, early/error/repeated calls');
`;
    const result=spawnSync(process.execPath,["-e",runner,built.modulePath],{cwd:root,encoding:"utf8",timeout:120000});
    assert.equal(result.status,0,JSON.stringify({signal:result.signal,error:result.error?.message,stdout:result.stdout,stderr:result.stderr}));
  } finally { removeLoadedNativeCache(temporary); }
});

test("CPython executes the witness with an independent rational matrix oracle", () => {
  const oracle = String.raw`
import ast
import math
import sys
from fractions import Fraction
sys.path.insert(0, sys.argv[1])

class Matrix:
    def __init__(self, rows, cols):
        self.rows, self.cols = rows, cols
        self.data = [[0] * cols for _ in range(rows)]
    def __getitem__(self, index):
        row, col = index
        if not (0 <= row < self.rows and 0 <= col < self.cols):
            raise IndexError
        return self.data[row][col]
    def __setitem__(self, index, value):
        self[index]
        row, col = index
        self.data[row][col] = value

def kernel(matrix):
    # Fraction RREF, independent of FLINT's integer right-kernel routine.
    a = [[Fraction(x) for x in row] for row in matrix.data]
    pivots = []
    for col in range(matrix.cols):
        row = next((i for i in range(len(pivots), matrix.rows) if a[i][col]), None)
        if row is None:
            continue
        pivot = len(pivots)
        a[pivot], a[row] = a[row], a[pivot]
        scale = a[pivot][col]
        a[pivot] = [x / scale for x in a[pivot]]
        for i in range(matrix.rows):
            if i != pivot:
                scale = a[i][col]
                a[i] = [x - scale*y for x, y in zip(a[i], a[pivot])]
        pivots.append(col)
    vectors = []
    for col in range(matrix.cols):
        if col in pivots:
            continue
        vector = [Fraction(0)] * matrix.cols
        vector[col] = Fraction(1)
        for row, pivot in enumerate(pivots):
            vector[pivot] = -a[row][col]
        denominator = math.lcm(*(x.denominator for x in vector))
        integers = [int(x * denominator) for x in vector]
        common = math.gcd(*integers)
        integers = [x // common for x in integers]
        assert all(sum(x*y for x, y in zip(row, integers)) == 0 for row in matrix.data)
        vectors.append(integers)
    result = Matrix(len(vectors), matrix.cols)
    result.data = vectors
    return result

namespace = dict(__name__='__main__', FmpzMatrix=Matrix, fmpz_matrix=Matrix,
    fmpz_matrix_nrows=lambda a: a.rows, fmpz_matrix_ncols=lambda a: a.cols,
    fmpz_matrix_right_kernel=kernel, fmpz_gcd=math.gcd)
with open(sys.argv[2], encoding='utf8') as f:
    tree = ast.parse(f.read(), sys.argv[2])
# Replace only the external FFI boundary, not the source algorithm or arena.
tree.body = [s for s in tree.body if not (isinstance(s, ast.ImportFrom) and s.module == 'sagejs.ffi.flint')]
exec(compile(tree, sys.argv[2], 'exec'), namespace)
run = namespace['owned_helper_witness']
for value in [0, 1, -1, 7, -19, 2**260+3, -(2**260+3)]:
    for repeats in [0, 1, 5]:
        output = [313]
        expected = repeats * (-7 if value == 0 else 34 + 2*abs(value))
        assert run(output, value, 0, 2, repeats, 1048576, 3145728) == expected
        assert output == [expected]
for mode in [2, 3]:
    output = [313]
    try:
        run(output, 23, mode, 2, 1, 1048576, 3145728)
    except (IndexError, ZeroDivisionError):
        assert output == [313]
    else:
        raise AssertionError('expected failure')
print('CPython same-source control flow, independent Fraction kernel: 21 cases')
`;
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const run = spawnSync(python, ["-I", "-c", oracle, join(root, "src/lib"), filename], {encoding:"utf8",timeout:30000});
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /21 cases/);
});

test("owned helper cleanup and caller borrows survive sanitizers", {skip:process.platform==="win32",timeout:180000}, async () => {
  const ir=await lowerSource(source,filename),core=generateHostCore(ir);
  const temporary=mkdtempSync(join(tmpdir(),"sagejs-fmpz-owned-asan-"));
  const harness=String.raw`
#include <assert.h>
#include "kernel_core.c"
int main(void) {
  sagejs_native_status status={SAGEJS_NATIVE_OK,NULL};
  int32_t sizes[1]={1}; uint64_t limbs[8]={313};
  sagejs_integer_buffer output={sizes,limbs,1,8};
  mpz_t value,result; mpz_init_set_ui(value,23);mpz_init(result);
  for(unsigned i=0;i<100;i++){
    sagejs_native_status_reset(&status);
    assert(sagejs_kernel_owned_helper_witness(&status,result,output,value,0,2,10,1048576,3145728));
    assert(mpz_cmp_ui(result,800)==0);
  }
  for(unsigned mode=1;mode<=3;mode++){
    sizes[0]=1;limbs[0]=313;sagejs_native_status_reset(&status);
    int ok=sagejs_kernel_owned_helper_witness(&status,result,output,value,mode,2,1,1048576,3145728);
    if(mode==1){assert(ok);assert(mpz_cmp_ui(result,17)==0);}
    else{assert(!ok);assert(status.code!=SAGEJS_NATIVE_OK);assert(sizes[0]==1&&limbs[0]==313);}
  }
  sagejs_native_status_reset(&status);
  assert(!sagejs_kernel_owned_helper_witness(&status,result,output,value,0,UINT64_MAX,1,1048576,3145728));
  sagejs_native_status_reset(&status);
  assert(!sagejs_kernel_owned_helper_witness(&status,result,output,value,0,2,1,1,1));
  sagejs_native_status_reset(&status);
  assert(sagejs_kernel_owned_helper_witness(&status,result,output,value,0,2,10,1048576,3145728));
  assert(mpz_cmp_ui(result,800)==0);
  mpz_mul_2exp(value,value,260);
  mpz_t expected; mpz_init(expected);
  mpz_mul_ui(expected,value,2);mpz_add_ui(expected,expected,34);mpz_mul_ui(expected,expected,5);
  for(unsigned i=0;i<20;i++){
    sagejs_native_status_reset(&status);
    assert(native_owned_helper_witness(&status,result,output,value,0,2,5,1048576,3145728));
    assert(mpz_cmp(result,expected)==0);
    for(unsigned mode=2;mode<=3;mode++){
      sizes[0]=1;limbs[0]=313;sagejs_native_status_reset(&status);
      assert(!native_owned_helper_witness(&status,result,output,value,mode,2,1,1048576,3145728));
      assert(status.code!=SAGEJS_NATIVE_OK);assert(sizes[0]==1&&limbs[0]==313);
    }
  }
  mpz_clear(expected);mpz_clear(value);mpz_clear(result);flint_cleanup();return 0;
}
`;
  try {
    writeFileSync(join(temporary,"kernel_core.c"),core.source);
    writeFileSync(join(temporary,"kernel_core.h"),core.header);
    writeFileSync(join(temporary,"harness.c"),harness);
    const libraries=["flint","mpfr","gmp","openblas"].map(n=>join(prefix,"lib","lib"+n+".a"));
    const executable=join(temporary,"witness");
    const flags=process.platform==="darwin"?["-fsanitize=undefined"]:["-fsanitize=address,undefined"];
    const link=process.platform==="darwin"?libraries:["-Wl,--start-group",...libraries,"-Wl,--end-group"];
    const build=spawnSync(process.env.CC||"cc",["-std=c11","-O1","-g","-fno-omit-frame-pointer",...flags,"-I"+temporary,"-I"+join(root,"packages/flint/include"),"-I"+join(prefix,"include"),join(temporary,"harness.c"),...link,"-lm","-lpthread","-ldl","-o",executable],{cwd:root,encoding:"utf8",timeout:120000});
    assert.equal(build.status,0,build.stderr||build.stdout);
    const run=spawnSync(executable,[],{cwd:root,encoding:"utf8",env:sanitizerEnvironment(),timeout:120000});
    assert.equal(run.status,0,run.stderr||run.stdout);
  } finally { removeLoadedNativeCache(temporary); }
});
