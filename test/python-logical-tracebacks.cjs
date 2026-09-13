// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {createContext, runInContext} = require("node:vm");
const test = require("node:test");
const createCompiler = require("../dist/tools/compiler.js").default;
const {createPythonCompilerFrontend} = require("../dist/tools/python/compiler-frontend.js");
const {createSage} = require("../dist/tools/kernel.js");
const source = `def leaf():
    raise ValueError('boom')
def middle():
    leaf()
def entry():
    try:
        middle()
    except ValueError as error:
        return error
def reraised():
    try:
        leaf()
    except ValueError:
        raise
def local():
    try:
        raise ValueError('local')
    except ValueError as error:
        return error
def constructed():
    return ValueError('not raised')
def finalized():
    try:
        leaf()
    finally:
        finished = True
def recursive(n):
    if n:
        return recursive(n - 1)
    raise ValueError('depth')
`;
for (const mode of ["python", "sage"]) test(`${mode}: compiler unwind records avoid native capture`, async () => {
  const compiler = createCompiler(), frontend = await createPythonCompilerFrontend(compiler, mode);
  try {
    const ast = frontend.parse(source, {filename:"logical.py", strict_python_scopes:true,
      scoped_flags:{dict_literals:true,bound_methods:true}});
    const output = new compiler.OutputStream({private_scope:false,write_name:false,
      baselib_plain:readFileSync(join(__dirname,"../dist/compiler/baselib-plain-pretty.js"),"utf8"),
      python_attributes:true,python_truthiness:true,python_tuples:true,python_traceback_records:true});
    ast.print(output);
    const context = createContext({require,process,Buffer,console,__sagejs_runtime_require__:require});
    runInContext(output.get(),context,{timeout:30000});
    const hostError = runInContext("Error",context), original = hostError.captureStackTrace;
    let captures=0;
    hostError.captureStackTrace = (...args) => {captures++;return original(...args);};
    context.__sagejs_traceback_records_enabled__ = true;
    const functions = context.ρσ_modules.__main__;
    assert.equal(functions.constructed().__traceback__,null);
    const foreign = new hostError('foreign');
    const foreignStack = foreign.stack;
    assert.equal(context.ρσ_record_traceback(foreign, {}, 1, {}, false),foreign);
    assert.equal(foreign.stack,foreignStack);
    assert.equal(foreign.__traceback__,undefined);
    function frames(error) {
      const answer=[];
      for(let tb=error.__traceback__;tb;tb=tb.tb_next) {
        assert.equal(tb.__sagejs_traceback_record__,true);
        assert.equal(tb.code.filename,"logical.py");
        assert.ok(Object.isFrozen(tb.code));
        assert.ok(tb.code.source.includes("def " + tb.code.name));
        answer.push([tb.code.name,Number(tb.tb_lineno)]);
        assert.ok(answer.length<10,"traceback cycle");
      }
      return answer;
    }
    assert.deepEqual(frames(functions.entry()),[["entry",7],["middle",4],["leaf",2]]);
    assert.deepEqual(frames(functions.local()),[["local",17]]);
    let caught;
    try {functions.reraised();} catch(e) {caught=e;}
    assert.ok(caught);
    assert.deepEqual(frames(caught),[["reraised",12],["leaf",2]]);
    try {functions.finalized();} catch(e) {caught=e;}
    assert.deepEqual(frames(caught),[["finalized",24],["leaf",2]]);
    try {functions.recursive(3);} catch(e) {caught=e;}
    assert.deepEqual(frames(caught).map(frame => frame[0]),Array(4).fill('recursive'));
    assert.equal(captures,0);
    context.__sagejs_traceback_records_enabled__ = false;
    const native = functions.constructed();
    assert.equal(native.__traceback__,native);
    assert.equal(captures,1);
    hostError.captureStackTrace = original;
  } finally {frontend.close();}
});

test('stdlib extracts logical records with Python limit direction', async (t) => {
  const session = await createSage({mode:'python'});
  t.after(() => session.close());
  const result = await session.evaluate(`
import traceback
class Record:
    pass
def frame(name, line, next):
    code = Record()
    code.filename = 'saved.py'
    code.name = name
    code.source = 'def f():\\n    raise ValueError()'
    code.first_lineno = line - 1
    tb = Record()
    tb.__sagejs_traceback_record__ = True
    tb.code = code
    tb.tb_lineno = line
    tb.tb_next = next
    return tb
inner = frame('inner', 8, None)
outer = frame('outer', 3, inner)
frames = traceback.extract_tb(outer)
assert [f.name for f in frames] == ['outer', 'inner']
assert frames[1].line == 'raise ValueError()'
assert [f.name for f in traceback.extract_tb(outer, 1)] == ['outer']
assert [f.name for f in traceback.extract_tb(outer, -1)] == ['inner']
assert traceback.extract_tb(outer, 0) == []
error = ValueError('boom')
error.__traceback__ = outer
text = ''.join(traceback.format_exception(error))
assert text.index('outer') < text.index('inner')
assert 'ValueError: boom' in text
assert 'raise ValueError()' in text
assert 'inner' not in ''.join(traceback.format_exception(error, limit=1))
assert 'outer' not in ''.join(traceback.format_exception(error, limit=-1))
print('logical-format-ok')
`);
  assert.equal(result.stderr ?? '', '');
  assert.equal(result.stdout, 'logical-format-ok\n');
});
