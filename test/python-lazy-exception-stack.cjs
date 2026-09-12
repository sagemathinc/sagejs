// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createContext, runInContext } = require("node:vm");
const test = require("node:test");
const createCompiler = require("../dist/tools/compiler.js").default;
const { createPythonCompilerFrontend } = require("../dist/tools/python/compiler-frontend.js");

for (const mode of ["python", "sage"]) {
  test(`${mode}: exception stacks capture eagerly and format lazily`, async () => {
    const compiler = createCompiler();
    const frontend = await createPythonCompilerFrontend(compiler, mode);
    try {
      const ast = frontend.parse(`
import sagejs.runtime as runtime
formats = []
assert ValueError().args == ()
assert str(ValueError()) == ''
assert ValueError(1, 'two').args == (1, 'two')
assert str(ValueError(1, 'two')) == "(1, 'two')"
payload = []
first = ValueError(payload)
second = ValueError(payload)
assert first.args[0] is payload
assert second.args[0] is payload
payload.append(7)
assert first.args == ([7],)
BaseException.__init__(first, 'reset', 2)
assert first.args == ('reset', 2)
assert second.args == ([7],)
assert bool(True) is True
assert bool(False) is False
assert bool(0) is False
assert bool(1) is True
assert bool([]) is False
assert bool([0]) is True
truth_calls = []
class Truth:
    def __bool__(self):
        truth_calls.append('bool')
        return False
    def __len__(self):
        raise AssertionError('bool must take precedence')
assert bool(Truth()) is False
assert truth_calls == ['bool']
previous = runtime.reflect.get(runtime.error, 'prepareStackTrace')
capture = runtime.reflect.get(runtime.error, 'captureStackTrace')
def format_stack(error, frames):
    formats.append(error.message)
    return 'formatted:' + error.message
runtime.reflect.set(runtime.error, 'prepareStackTrace', format_stack)
try:
    for i in range(100):
        try:
            raise ValueError('caught')
        except Exception:
            pass
    assert formats == []
    error = ValueError('visible')
    assert error.args == ('visible',)
    assert str(error) == 'visible'
    assert error.__traceback__ is error
    assert error.__cause__ is None
    assert formats == []
    assert error.stack == 'formatted:visible'
    assert error.stack == 'formatted:visible'
    assert formats == ['visible']
    error.stack = 'assigned'
    assert error.stack == 'assigned'
    assert formats == ['visible']
    runtime.reflect.set(runtime.error, 'captureStackTrace', runtime.undefined)
    fallback = ValueError('fallback')
    assert fallback.stack == 'formatted:fallback'
    assert formats == ['visible', 'fallback']
finally:
    runtime.reflect.set(runtime.error, 'prepareStackTrace', previous)
    runtime.reflect.set(runtime.error, 'captureStackTrace', capture)
def creation_site():
    return ValueError('creation-site')
created = creation_site()
assert 'creation_site' in created.stack
assert 'creation-site' in created.stack
try:
    raise created
except ValueError as caught:
    assert caught is created
`, { filename: "<lazy-exception-stack>", libdir: join(__dirname, "../src/lib"),
        strict_python_scopes: true, exact_integer_literals: true,
        scoped_flags: { dict_literals: true, overload_getitem: true,
          bound_methods: true, sequential_definitions: true } });
      const output = new compiler.OutputStream({
        baselib_plain: readFileSync(join(__dirname, "../dist/compiler/baselib-plain-pretty.js"), "utf8"),
        private_scope: false, write_name: false, python_attributes: true,
        python_truthiness: true, python_tuples: true, exact_integers: true,
      });
      ast.print(output);
      const context = createContext({ require, process, Buffer, console,
        __sagejs_runtime_require__: require });
      assert.doesNotThrow(() => runInContext(output.get(), context, { timeout: 30000 }));
      const created = context.ρσ_modules.__main__.created;
      Object.defineProperty(created, Symbol.toStringTag, {
        get() { throw new Error("valid exceptions must not require a string tag"); },
      });
      const normalize = context.__sagejs_baselib_modules__["sagejs._baselib.errors"].ρσ_exception_value;
      assert.equal(normalize(created), created);
      const foreign = new Error("foreign-realm");
      assert.equal(normalize(foreign), foreign);
      assert.throws(() => normalize({}), /exceptions must derive/);
    } finally { frontend.close(); }
  });
}
