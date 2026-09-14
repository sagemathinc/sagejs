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
    raise ValueError('original')
def bare():
    raise
def bare_finally():
    try:
        raise
    finally:
        pass
def bare_finally_call():
    try:
        raise
    finally:
        bare()
def bare_unmatched():
    try:
        raise
    except KeyError:
        pass
def bare_matched():
    try:
        raise
    except ValueError:
        bare()
def selector():
    raise
def bare_selector():
    try:
        raise
    except selector():
        pass
class Context:
    def __enter__(self):
        return self
    def __exit__(self, kind, value, tb):
        return False
class RaisingContext:
    def __enter__(self):
        return self
    def __exit__(self, kind, value, tb):
        bare()
def bare_with():
    with Context():
        raise
def bare_with_exit():
    with RaisingContext():
        raise
def repeated_callsite():
    try:
        leaf()
    except ValueError as error:
        for i in range(2):
            try:
                bare()
            except ValueError:
                pass
        raise error
def bare_finally_nested():
    try:
        raise
    finally:
        try:
            bare()
        except ValueError:
            pass
def active_error():
    try:
        raise
    except ValueError as error:
        return error
def bare_finally_clear():
    try:
        raise
    finally:
        active_error().__traceback__ = None
def explicit_from_helper():
    try:
        raise
    except ValueError as error:
        raise error
def recursive(n):
    if n:
        return recursive(n - 1)
    raise
def recursive_bare():
    recursive(3)
def drive(fn):
    try:
        leaf()
    except ValueError:
        fn()
`;
const cases = ['bare', 'bare_finally', 'bare_finally_call', 'bare_unmatched',
  'bare_matched', 'bare_selector', 'bare_with', 'bare_with_exit', 'repeated_callsite',
  'bare_finally_nested', 'bare_finally_clear', 'explicit_from_helper', 'recursive_bare'];
const oracle = spawnSync(pythonExecutable(), ['-c', source + `
import json, traceback
results = {}
for name in ${JSON.stringify(cases)}:
    try:
        drive(globals()[name])
    except ValueError as error:
        results[name] = [(f.name, f.lineno) for f in traceback.extract_tb(error.__traceback__) if f.name != '<module>']
try:
    bare()
except RuntimeError as error:
    results['no_active'] = [(f.name, f.lineno) for f in traceback.extract_tb(error.__traceback__) if f.name != '<module>']
print(json.dumps(results))
`], {encoding:'utf8', timeout:30000});
assert.equal(oracle.status, 0, oracle.stderr);
assert.equal(oracle.stderr, '');
const expected = JSON.parse(oracle.stdout);

for (const mode of ['python', 'sage']) test(`${mode}: bare-raise propagation matches CPython frames`, async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, mode);
  try {
    const ast = frontend.parse(source, {filename:'reraises.py', strict_python_scopes:true,
      scoped_flags:{dict_literals:true, bound_methods:true}});
    const output = new compiler.OutputStream({private_scope:false, write_name:false,
      baselib_plain:readFileSync(join(__dirname,'../dist/compiler/baselib-plain-pretty.js'),'utf8'),
      python_attributes:true, python_truthiness:true, python_tuples:true, python_traceback_records:true});
    ast.print(output);
    const context = createContext({require, process, Buffer, console, __sagejs_runtime_require__:require});
    runInContext(output.get(),context,{timeout:30000});
    context.__sagejs_traceback_records_enabled__ = true;
    const functions = context.ρσ_modules.__main__;
    for (const name of [...cases, 'no_active']) {
      let caught;
      try {name === 'no_active' ? functions.bare() : functions.drive(functions[name]);}
      catch (error) {caught = error;}
      assert.ok(caught, `${name} must throw`);
      const frames = [];
      for (let tb=caught.__traceback__; tb; tb=tb.tb_next) {
        assert.equal(tb.code.filename, 'reraises.py');
        assert.equal(tb.code.source.split('\n')[Number(tb.tb_lineno)-Number(tb.code.first_lineno)].trim(),
          source.split('\n')[Number(tb.tb_lineno)-1].trim());
        frames.push([tb.code.name,Number(tb.tb_lineno)]);
        assert.ok(frames.length < 30, 'cyclic traceback');
      }
      assert.deepEqual(frames, expected[name], name);
    }
  } finally {frontend.close();}
});
