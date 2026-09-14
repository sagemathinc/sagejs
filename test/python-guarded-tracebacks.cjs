// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const createCompiler = require("../dist/tools/compiler.js").default;
const {createPythonCompilerFrontend} = require("../dist/tools/python/compiler-frontend.js");

for (const mode of ["python", "sage"]) test(`${mode}: guarded compiled and opaque calls preserve traceback evidence`, async () => {
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(compiler, mode);
  try {
    const source = `def leaf():
    raise ValueError('guarded')
def caught():
    try:
        leaf()
    except ValueError as error:
        return error
def needs(value):
    return value
def binding():
    try:
        needs()
    except TypeError as error:
        return error
def suspended():
    yield caught()
def defaulted(value=3):
    return value
def identity():
    return identity
def tagged():
    return tagged.tag
def bridge(callback, fn):
    return callback(fn)
def reraised():
    try:
        leaf()
    except ValueError:
        raise
def chained():
    try:
        leaf()
    except ValueError as original:
        raise RuntimeError('outer') from original
def finalized():
    try:
        leaf()
    finally:
        finished = True
def recursive(n):
    if n:
        recursive(n-1)
    else:
        leaf()
def captured(fn):
    try:
        fn()
    except Exception as error:
        return error
class Pause:
    def __await__(self):
        yield 1
class DefaultFactory:
    def make(self):
        def nested(value=caught()):
            return value
        return nested()
async def asynchronous():
    await Pause()
    return caught()
tagged.tag = 19
saved = caught()
missing = binding()
normal = defaulted()
generator = suspended()
again = captured(reraised)
chain = captured(chained)
final = captured(finalized)
coroutine = asynchronous()
factory = DefaultFactory()
comprehension = (caught() for i in [1])
`;
    const ast = frontend.parse(source, {filename:"guarded.py", strict_python_scopes:true,
      scoped_flags:{dict_literals:true,bound_methods:true}});
    const output = new compiler.OutputStream({private_scope:false,write_name:false,
      baselib_plain:readFileSync(join(__dirname,"../dist/compiler/baselib-plain-pretty.js"),"utf8"),
      python_attributes:true,python_truthiness:true,python_tuples:true,
      python_traceback_records:true,python_traceback_guarded:true});
    ast.print(output);
    const context = vm.createContext({require,process,Buffer,console,__sagejs_runtime_require__:require});
    vm.runInContext(output.get(), context, {timeout:30000});
    const main = context.ρσ_modules.__main__;
    assert.equal(main.saved.__sagejs_logical_exception__, true);
    assert.equal(main.missing.__sagejs_logical_exception__, true);
    assert.equal(main.saved.__sagejs_native_tb__, main.missing.__sagejs_native_tb__);
    assert.equal(Number(main.normal), 3);
    const names = error => {
      const result=[];
      for(let tb=error.__traceback__;tb && tb.__sagejs_traceback_record__;tb=tb.tb_next) {
        result.push(tb.code.name);
        assert.ok(result.length<10);
      }
      return result;
    };
    assert.deepEqual(names(main.saved), ["caught","leaf"]);
    assert.deepEqual(names(main.missing), ["binding"]);
    assert.deepEqual(names(main.again), ["captured","reraised","leaf"]);
    assert.deepEqual(names(main.chain), ["captured","chained"]);
    assert.deepEqual(names(main.chain.__cause__), ["chained","leaf"]);
    assert.deepEqual(names(main.final), ["captured","finalized","leaf"]);
    function opaqueShim(){return main.caught();}
    const opaque = opaqueShim();
    assert.equal(opaque.__sagejs_logical_exception__, false);
    assert.match(opaque.stack, /opaqueShim/);
    assert.equal(main.generator.next().value.__sagejs_logical_exception__, false);
    main.defaulted.__defaults__ = [8];
    assert.equal(main.defaulted(), 8);
    assert.equal(main.defaulted.__argnames__[0], "value");
    assert.equal(main.identity(), main.identity);
    assert.equal(Number(main.tagged()), 19);
    const policy = context.ρσ_traceback_policy;
    const token = policy.enter();
    try {
      const defaultError = main.factory.make();
      assert.equal(defaultError.__sagejs_logical_exception__, false,
        "a nested default expression executes in its uninstrumented enclosing method");
      assert.match(defaultError.stack, /make/);
      assert.equal(main.comprehension.next().value.__sagejs_logical_exception__, false,
        "a suspended generator expression must retain native capture");
      assert.equal(Number(main.coroutine.next().value), 1);
      const resumed = main.coroutine.next();
      assert.equal(resumed.done, true);
      assert.equal(resumed.value.__sagejs_logical_exception__, false,
        "resumed async code retains native capture even inside another guarded root");
      function nestedOpaque(callback){return callback();}
      const nested = policy.target(main.bridge)(nestedOpaque, main.caught);
      assert.equal(nested.__sagejs_logical_exception__, false);
      assert.match(nested.stack, /nestedOpaque/);
      let recursive;
      try {policy.target(main.recursive)(3);} catch(error) {recursive=error;}
      assert.equal(recursive.__sagejs_logical_exception__, true);
      assert.deepEqual(names(recursive), [...Array(4).fill("recursive"), "leaf"]);
      const original = context.BaseException.prototype.__init__;
      context.BaseException.prototype.__init__ = function foreignInitializer(...args) {
        return Reflect.apply(original, this, args);
      };
      try {
        const changed = policy.target(main.caught)();
        assert.equal(changed.__sagejs_logical_exception__, false);
        assert.match(changed.stack, /foreignInitializer/);
      } finally {context.BaseException.prototype.__init__ = original;}
    } finally {policy.leave(token);}
    function fragment(source) {
      const ast = frontend.parse(source, {filename:"fragment.py",strict_python_scopes:true,
        scoped_flags:{dict_literals:true,bound_methods:true}});
      const stream = new compiler.OutputStream({private_scope:false,write_name:false,
        omit_baselib:true,reuse_main_module:true,python_attributes:true,
        python_truthiness:true,python_tuples:true,python_traceback_records:true,
        python_traceback_guarded:true});
      ast.print(stream);
      return stream.get();
    }
    const inner = fragment("pass\n");
    main.nested_eval = function nestedEvaluation(){vm.runInContext(inner, context);};
    vm.runInContext(fragment("bridge(nested_eval, caught)\n"), context);
    const outside = Reflect.construct(policy.constructorTarget(context.ValueError), ["outside"]);
    assert.equal(outside.__sagejs_logical_exception__, false,
      "a nested bare evaluation must not leave a transparent root active");
  } finally { frontend.close(); }
});
