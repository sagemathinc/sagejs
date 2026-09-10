// sagejs-test-tier: specialized
"use strict";
const assert = require("node:assert/strict");
const {mkdtempSync,writeFileSync,readFileSync} = require("node:fs");
const {tmpdir} = require("node:os");
const {join} = require("node:path");
const {spawnSync} = require("node:child_process");
const {pythonExecutable} = require("../tools/python-executable.cjs");
const test = require("node:test");
const {lowerSource} = require("../tools/native-kernel/ir.cjs");
const {compileKernel} = require("../tools/native-kernel/compiler.cjs");
const {removeLoadedNativeCache} = require("./helpers/native-cache-cleanup.cjs");

const source = `
from sagejs.native import NativeRecord, NativeWorkspace, NativeExactArena, NativeIntegerVector, IntegerBuffer, native, uint64
from sagejs.ffi.flint import FmpzMatrix, fmpz_matrix

class Layout(NativeRecord):
    count: uint64
    last: uint64

class Scratch(NativeWorkspace):
    values: NativeIntegerVector
    matrix: FmpzMatrix

def scalar(layout: Layout, value: int) -> int:
    return abs(value) + layout.count

def packed(layout: Layout, output: IntegerBuffer, value: int) -> int:
    output[layout.last] = scalar(layout, value)
    return output[layout.last]

def resident(layout: Layout, scratch: Scratch, value: int) -> int:
    scratch.values[layout.last] = abs(value)
    scratch.matrix[0, 0] = scratch.values[layout.last] + layout.count
    return scratch.matrix[0, 0]

def tuple_result(layout: Layout) -> tuple[uint64, uint64]:
    return layout.count, layout.last

def word_helper(layout: Layout, value: uint64) -> uint64:
    return layout.last + value

def recursive(layout: Layout, value: int, remaining: uint64) -> int:
    if remaining == 0:
        return scalar(layout, value)
    return recursive(layout, value, remaining - 1)

@native
def scalar_witness(value: int, choose: bool) -> int:
    layout = Layout(3, 2)
    alias = layout
    if choose:
        layout = Layout(7, 6)
    return recursive(alias, value, 3) + scalar(layout, value)

@native
def witness(output: IntegerBuffer, count: uint64, value: int) -> int:
    if count < 1 or count > 512 or len(output) != count:
        return -1
    layout = Layout(count, count - 1)
    sagejs_record_scalar_0: uint64 = 19
    first = packed(layout, output, value)
    with NativeExactArena(65536, 1048576) as arena:
        values = arena.integer_vector(count, 0)
        matrix = arena.foreign_resource(fmpz_matrix, 1, 1)
        scratch = Scratch(values, matrix)
        second = resident(layout, scratch, value)
        n, last = tuple_result(layout)
        if n != count or last != count - 1 or word_helper(layout, 1) != count:
            return -2
        return first + second + sagejs_record_scalar_0 - 19
`;

test("ordinary CPython record aliasing and recursion remain the source oracle", () => {
  const run=spawnSync(pythonExecutable(),["-c",String.raw`
import ast, importlib.util, sys, types
spec=importlib.util.spec_from_file_location("sagejs.native", "src/lib/sagejs/native.py")
module=importlib.util.module_from_spec(spec)
sys.modules["sagejs.native"]=module
spec.loader.exec_module(module)
tree=ast.parse(sys.stdin.read())
keep={"Layout","scalar","recursive","scalar_witness"}
tree.body=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in keep]
scope={"NativeRecord":module.NativeRecord,"native":module.native,"uint64":module.uint64}
exec(compile(tree,"layout.py","exec"),scope)
for x in [0,1,-1,2**300,-2**300]:
    for choose in [False,True]:
        assert scope["scalar_witness"](x,choose)==2*abs(x)+(10 if choose else 6)
`],{cwd:join(__dirname,".."),input:source,encoding:"utf8"});
  assert.equal(run.status,0,run.stderr);
});

test("exact record helpers use exact lowering, including expanded workspace and tuples", async () => {
  const ir = await lowerSource(source,"layout.py",{functions:["witness"]});
  for(const name of ["scalar","packed","resident","tuple_result","word_helper","witness"]) {
    const fn=ir.functions.find(f=>f.name===name);
    assert.ok(fn,name);
    assert.equal(fn.kernelKind,"integer",name);
    assert.ok(![...fn.params,...fn.locals].some(v=>v.type.startsWith("Record:")),name);
  }
  const helper=ir.functions.find(f=>f.name==="resident");
  assert.equal(helper.hostCallable,false);
  assert.ok(helper.params.some(p=>p.type==="NativeIntegerVector"));
  assert.ok(helper.params.some(p=>p.type==="FmpzMatrix"));
  assert.equal(ir.functions.find(f=>f.name==="witness").analysis.backend.kind,"fmpz");
  assert.ok(helper.scalarRecordBindings.some(v=>v.name==="layout"));
});

test("exact scalar record host parameters fail closed rather than silently changing ABI", async () => {
  await assert.rejects(()=>lowerSource(source,"layout.py",{functions:["scalar"]}),
    /private helper; select a closed caller/);
});

test("word-only and prime-bearing records retain their existing lowering", async () => {
  for(const extra of ["", "    modulus: PrimeFieldModulus\n"]) {
    const ir=await lowerSource(`from sagejs.native import NativeRecord, PrimeFieldModulus, native, uint64
class Layout(NativeRecord):
    count: uint64
${extra}
def helper(layout: Layout, value: uint64) -> uint64:
    return layout.count + value
@native
def f(layout: Layout, value: uint64) -> uint64:
    return helper(layout, value)
`,"word-layout.py");
    assert.equal(ir.functions[0].kernelKind,"prime-field-source");
    assert.equal(ir.functions[1].kernelKind,"prime-field-source");
  }
});

test("dimensioned record/arena call graph agrees in generated JavaScript, GMP and FLINT", async t => {
  const directory=mkdtempSync(join(tmpdir(),"sagejs-exact-layout-"));
  t.after(()=>removeLoadedNativeCache(directory));
  const sourcePath=join(directory,"layout.py");
  writeFileSync(sourcePath,source);
  const built=await compileKernel({sourcePath,cacheRoot:join(directory,"cache"),functions:["witness","scalar_witness"]});
  const addon=require(built.modulePath);
  assert.equal(addon.nativeAvailable,true);
  const k=addon.witness;
  const core=readFileSync(built.coreSourcePath,"utf8");
  assert.doesNotMatch(core,/napi_|PyObject|PyEval/);
  for(const backend of ["javascript","gmp","fmpz"]) {
    for(const count of [1,64,74,128,512]) {
      const output=k.createIntegerBuffer(count,16);
      for(const value of [0n,-17n,29n,-(1n<<300n),1n<<300n]) {
        const magnitude=value<0n?-value:value;
        assert.equal(k[backend](output,count,value),2n*(magnitude+BigInt(count)));
        assert.equal(output.toArray()[count-1],magnitude+BigInt(count));
      }
    }
    const output=k.createIntegerBuffer(1,16);
    for(const count of [0,513,64]) assert.equal(k[backend](output,count,3n),-1n);
  }
  for(const backend of ["javascript","gmp","tagged"]) {
    for(const choose of [false,true]) {
      assert.equal(addon.scalar_witness[backend](-(1n<<300n),choose),
        (1n<<301n)+BigInt(choose?10:6));
    }
  }
});
