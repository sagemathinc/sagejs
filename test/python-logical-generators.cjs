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
const {normalizePythonDiagnostic,renderPythonDiagnostic} = require('../dist/tools/python/diagnostics.js');

const source = `def leaf():
    raise ValueError('leaf')
def generator():
    yield 1
    leaf()
def delegated():
    yield from generator()
def bare_generator():
    try:
        leaf()
    except ValueError:
        yield 1
        raise
def finally_generator():
    try:
        leaf()
    finally:
        yield 1
        raise
def injected_generator():
    try:
        leaf()
    except ValueError:
        yield 1
def run_generator():
    g = generator()
    next(g)
    next(g)
def run_delegated():
    g = delegated()
    next(g)
    next(g)
def run_bare():
    g = bare_generator()
    next(g)
    next(g)
def run_finally():
    g = finally_generator()
    next(g)
    next(g)
def run_injected():
    g = injected_generator()
    next(g)
    g.throw(TypeError('injected'))
def run_alternating():
    a = generator()
    b = bare_generator()
    next(a)
    next(b)
    next(a)
def close_generator():
    try:
        yield 1
    finally:
        leaf()
def run_close():
    g = close_generator()
    next(g)
    g.close()
def run_unstarted():
    g = generator()
    g.throw(ValueError('unstarted'))
def required_generator(value):
    yield value
def run_binding_error():
    required_generator()
def run_binding_context():
    try:
        leaf()
    except ValueError:
        required_generator()
class Awaitable:
    def __await__(self):
        yield 1
async def async_leaf():
    await Awaitable()
    leaf()
async def async_parent():
    await async_leaf()
def run_async():
    iterator = async_parent()
    iterator.send(None)
    iterator.send(None)
`;
const cases = ['run_generator','run_delegated','run_bare','run_finally',
  'run_injected','run_alternating','run_close','run_unstarted','run_binding_error',
  'run_binding_context','run_async'];
const oracle = spawnSync(pythonExecutable(), ['-c', source + `
import json, traceback
results = {}
for name in ${JSON.stringify(cases)}:
    try:
        globals()[name]()
    except BaseException as error:
        results[name] = {
            'type': type(error).__name__,
            'frames': [(f.name, f.lineno) for f in traceback.extract_tb(error.__traceback__) if f.name != '<module>'],
            'context': [(f.name, f.lineno) for f in traceback.extract_tb(error.__context__.__traceback__)] if error.__context__ else []
        }
print(json.dumps(results))
`], {encoding:'utf8', timeout:30000});
assert.equal(oracle.status,0,oracle.stderr);
assert.equal(oracle.stderr,'');
const expected = JSON.parse(oracle.stdout);

for (const mode of ['python','sage']) test(`${mode}: suspended logical frames match CPython`, async (t) => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler,mode);
  try {
    const ast = frontend.parse(source,{filename:'generators.py',strict_python_scopes:true,
      scoped_flags:{dict_literals:true,bound_methods:true}});
    const output = new compiler.OutputStream({private_scope:false,write_name:false,
      baselib_plain:readFileSync(join(__dirname,'../dist/compiler/baselib-plain-pretty.js'),'utf8'),
      python_attributes:true,python_truthiness:true,python_tuples:true,python_traceback_records:true});
    ast.print(output);
    const context = createContext({require,process,Buffer,console,__sagejs_runtime_require__:require});
    runInContext(output.get(),context,{timeout:30000});
    context.__sagejs_traceback_records_enabled__ = true;
    const functions = context.ρσ_modules.__main__;
    function frames(error) {
      const result=[];
      for(let tb=error?.__traceback__;tb;tb=tb.tb_next) {
        assert.equal(tb.code.filename,'generators.py');
        result.push([tb.code.name,Number(tb.tb_lineno)]);
        assert.ok(result.length<30,'cyclic traceback');
      }
      return result;
    }
    for(const name of cases) await t.test(name, () => {
      let caught;
      try {functions[name]();} catch(error) {caught=error;}
      assert.ok(caught,`${name} must throw`);
      assert.deepEqual({type:caught.name,frames:frames(caught),context:frames(caught.__context__)},expected[name],`${name}: ${caught.message}`);
      if(name==='run_injected') {
        assert.equal(caught.__sagejs_native_tb__,caught,'retain the native carrier');
        const nativeStack=caught.stack;
        const diagnostic=normalizePythonDiagnostic(caught,{phase:'execute',pythonExecution:true});
        assert.equal(diagnostic.nativeTraceback,nativeStack);
        assert.deepEqual(structuredClone(diagnostic),diagnostic);
        const rendered=renderPythonDiagnostic(diagnostic);
        assert.ok(rendered.includes(nativeStack),'render preserved native evidence');
        assert.match(rendered,/in injected_generator/);
        assert.equal(caught.stack,nativeStack,'logical records must not replace native stacks');
      }
    });
  } finally {frontend.close();}
});
