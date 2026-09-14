// sagejs-test-tier: integration
"use strict";
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const {createContext, runInContext} = require('node:vm');
const test = require('node:test');
const {pythonExecutable} = require('../tools/python-executable.cjs');
const createCompiler = require('../dist/tools/compiler.js').default;
const {createPythonCompilerFrontend} = require('../dist/tools/python/compiler-frontend.js');

const source = `def leaf():
    raise ValueError('leaf')
def direct():
    return (lambda: leaf())()
def nested():
    return (lambda: (lambda: leaf())())()
def closure():
    callback = (lambda n: lambda: leaf() if n else 42)(1)
    return callback()
def binding():
    return (lambda required: leaf())()
def successful():
    return (lambda a, b=3: (a + b, a * b))(2)
def multiline():
    return (lambda:
        leaf()
    )()
`;
const cases = ['direct', 'nested', 'closure', 'binding', 'multiline'];
const oracle = spawnSync(pythonExecutable(), ['-c', source + `
import json, traceback
result = {}
for name in ${JSON.stringify(cases)}:
    try:
        globals()[name]()
    except BaseException as error:
        result[name] = [type(error).__name__, [(f.name, f.lineno) for f in traceback.extract_tb(error.__traceback__) if f.name != '<module>']]
print(json.dumps(result))
`], {encoding:'utf8', timeout:30000});
assert.equal(oracle.status, 0, oracle.stderr);
const expected = JSON.parse(oracle.stdout);

for (const mode of ['python', 'sage']) test(`${mode}: lambda traceback records match CPython`, async t => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, mode);
  try {
    const ast = frontend.parse(source, {filename:'lambdas.py', strict_python_scopes:true,
      scoped_flags:{dict_literals:true, bound_methods:true}});
    const output = new compiler.OutputStream({private_scope:false, write_name:false,
      baselib_plain:readFileSync(join(__dirname, '../dist/compiler/baselib-plain-pretty.js'), 'utf8'),
      python_attributes:true, python_truthiness:true, python_tuples:true, python_traceback_records:true});
    ast.print(output);
    const context = createContext({require, process, Buffer, console, __sagejs_runtime_require__:require});
    runInContext(output.get(), context, {timeout:30000});
    context.__sagejs_traceback_records_enabled__ = true;
    const functions = context.ρσ_modules.__main__;
    assert.deepEqual(Array.from(functions.successful(), Number), [5, 6]);
    for (const name of cases) await t.test(name, () => {
      let caught;
      try { functions[name](); } catch (error) { caught = error; }
      assert.ok(caught, `${name} must throw`);
      const frames = [];
      for (let tb = caught.__traceback__; tb; tb = tb.tb_next) {
        assert.equal(tb.code.filename, 'lambdas.py');
        frames.push([tb.code.name, Number(tb.tb_lineno)]);
        assert.ok(frames.length < 10, 'traceback cycle');
      }
      assert.deepEqual([caught.name, frames], expected[name]);
    });
  } finally { frontend.close(); }
});
