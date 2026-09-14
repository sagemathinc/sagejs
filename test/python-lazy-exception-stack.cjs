// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createContext, runInContext } = require("node:vm");
const test = require("node:test");
const { types: { isNativeError } } = require("node:util");
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
supplied = [1, 2]
transferred = ValueError(*supplied)
assert transferred.args == (1, 2)
supplied.append(3)
assert transferred.args == (1, 2)
BaseException.__init__(transferred, *supplied)
assert transferred.args == (1, 2, 3)
supplied[0] = 9
assert transferred.args == (1, 2, 3)
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
def binding_requires_argument(value):
    raise AssertionError('binding must fail before entering this body')
try:
    binding_requires_argument()
except TypeError as binding_error:
    assert type(binding_error) is TypeError
    assert isinstance(binding_error, Exception)
    assert isinstance(binding_error.args, tuple)
    assert len(binding_error.args) == 1
    assert 'value' in binding_error.args[0]
    assert str(binding_error) == binding_error.args[0]
    BaseException.__init__(binding_error, 'reset binding')
    assert binding_error.args == ('reset binding',)
    assert str(binding_error) == 'reset binding'
try:
    raise created
except ValueError as caught:
    assert caught is created
try:
    raise created
except (KeyError, ValueError) as caught:
    assert caught is created
for handlers in [(ValueError, 3), (ValueError, (ValueError,))]:
    try:
        try:
            raise created
        except handlers:
            raise AssertionError('invalid later handler was ignored')
    except TypeError:
        pass
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
      // Binding failures use the same owned representation as Python exceptions:
      // one lazy native capture, or no native capture in explicit records mode.
      runInContext(`
        (() => {
          const factory = __sagejs_baselib_modules__["sagejs._baselib.errors"].ρσ_function_argument_error;
          const original = Error.captureStackTrace;
          const previousFormatter = Error.prepareStackTrace;
          let captures = 0, formats = 0;
          Error.captureStackTrace = function(error, target) {
            captures++;
            return original(error, target);
          };
          Error.prepareStackTrace = function(error, frames) {
            formats++;
            return error.name + ': ' + error.message + '\\n' + frames.map(String).join('\\n');
          };
          function unentered_binding_target() {
            return factory('missing argument', unentered_binding_target);
          }
          function binding_caller() { return unentered_binding_target(); }
          try {
            const error = binding_caller();
            globalThis.__binding_native_probe__ = {
              captures, formats, error,
              descriptor: Object.getOwnPropertyDescriptor(error, 'message'),
              isTypeError: error instanceof TypeError,
              isError: error instanceof Error,
            };
            const stack = error.stack;
            globalThis.__binding_native_probe__.stack = stack;
            globalThis.__binding_native_probe__.formatted = formats;
            globalThis.__sagejs_traceback_records_enabled__ = true;
            const logical = binding_caller();
            globalThis.__binding_logical_probe__ = { error: logical, captures, formats };
            globalThis.__sagejs_traceback_records_enabled__ = false;
            Error.captureStackTrace = undefined;
            const fallback = binding_caller();
            globalThis.__binding_fallback_probe__ = fallback.stack;
          } finally {
            delete globalThis.__sagejs_traceback_records_enabled__;
            Error.captureStackTrace = original;
            Error.prepareStackTrace = previousFormatter;
          }
        })();
      `, context);
      const nativeProbe = context.__binding_native_probe__;
      assert.equal(nativeProbe.captures, 1);
      assert.equal(nativeProbe.formats, 0);
      assert.equal(nativeProbe.formatted, 1);
      assert.equal(nativeProbe.isTypeError, true);
      assert.equal(nativeProbe.isError, true);
      // Owned Python exceptions preserve Error prototypes, not the engine's
      // exotic native-error brand. Foreign errors retain their original brand.
      assert.equal(isNativeError(nativeProbe.error), false);
      assert.equal(isNativeError(foreign), true);
      assert.equal(normalize(nativeProbe.error), nativeProbe.error);
      assert.equal(nativeProbe.error.name, "TypeError");
      assert.deepEqual(Array.from(nativeProbe.error.args), ["missing argument"]);
      assert.equal(nativeProbe.descriptor.enumerable, false);
      assert.equal(nativeProbe.descriptor.writable, true);
      assert.equal(nativeProbe.descriptor.configurable, true);
      assert.match(nativeProbe.stack, /binding_caller/);
      assert.doesNotMatch(nativeProbe.stack, /unentered_binding_target/);
      const logicalProbe = context.__binding_logical_probe__;
      assert.equal(logicalProbe.captures, 1);
      assert.equal(logicalProbe.formats, 1);
      assert.equal(logicalProbe.error.__sagejs_logical_exception__, true);
      assert.equal(logicalProbe.error.__traceback__, null);
      assert.equal(logicalProbe.error.__cause__, null);
      assert.equal(logicalProbe.error.__context__, null);
      assert.equal(logicalProbe.error.__suppress_context__, false);
      assert.match(context.__binding_fallback_probe__, /TypeError: missing argument/);
      runInContext(`
        (() => {
          const factory = __sagejs_baselib_modules__["sagejs._baselib.errors"].ρσ_function_argument_error;
          const prototype = BaseException.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(prototype, '__init__');
          Object.defineProperty(prototype, '__init__', {
            configurable: true, value() { throw new Error('public initializer replacement'); }
          });
          function binding_target() { return factory('original initializer', binding_target); }
          try { globalThis.__binding_original_initializer__ = binding_target(); }
          finally { Object.defineProperty(prototype, '__init__', descriptor); }
        })();
      `, context);
      assert.deepEqual(Array.from(context.__binding_original_initializer__.args), ['original initializer']);
      assert.equal(context.__binding_original_initializer__.__sagejs_argument_error__, true);
      runInContext(`
        (() => {
          function direct() {}
          Object.defineProperty(direct, '__bases__', {get() { throw new Error('must not read bases'); }});
          function inherited() {}
          Object.setPrototypeOf(inherited, direct);
          const own = _builtins_is_python_class(direct);
          const inheritedOnly = _builtins_is_python_class(inherited);
          direct.__sagejs_callable_instance__ = true;
          globalThis.__class_ownership_probe__ = [own, inheritedOnly, _builtins_is_python_class(direct)];
        })();
      `, context);
      assert.deepEqual(Array.from(context.__class_ownership_probe__), [true, false, false]);
    } finally { frontend.close(); }
  });
}
