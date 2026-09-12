// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const createCompiler = require("../dist/tools/compiler.js").default;

test("only immediate Python dot calls use prepared method lookup", () => {
  const compiler = createCompiler();
  const dot = (name, property) => new compiler.AST_Dot({
    expression: new compiler.AST_SymbolRef({ name }), property,
  });
  const emit = (expression, pythonAttributes = true) => {
    const output = new compiler.OutputStream({
      beautify: true, python_attributes: pythonAttributes, omit_baselib: true,
    });
    expression.print(output);
    return output.get();
  };
  const call = (name, property, args = []) => new compiler.AST_Call({
    expression: dot(name, property), args,
  });
  assert.match(emit(call("obj", "method")), /ρσ_invoke_prepared_method\(ρσ_prepare_method_call\(/u);
  assert.doesNotMatch(emit(dot("obj", "method")), /prepared_method|prepare_method/u);
  assert.doesNotMatch(emit(call("obj", "method"), false), /prepared_method|prepare_method/u);
  assert.doesNotMatch(emit(call("Object", "keys")), /prepared_method|prepare_method/u);
  assert.doesNotMatch(emit(call("obj", "ρσ_internal")), /prepared_method|prepare_method/u);
  const keywordArgs = [];
  keywordArgs.kwargs = [[
    new compiler.AST_SymbolRef({ name: "value" }),
    new compiler.AST_Number({ value: 1 }),
  ]];
  assert.doesNotMatch(emit(call("obj", "method", keywordArgs)), /prepared_method|prepare_method/u);
  const spread = new compiler.AST_SymbolRef({ name: "values" });
  spread.is_array = true;
  const starArgs = [spread];
  starArgs.starargs = true;
  assert.doesNotMatch(emit(call("obj", "method", starArgs)), /prepared_method|prepare_method/u);
});

const source = `
events = []
class A:
    def method(self, value=0):
        return ('old', value)
a = A()
saved = a.method
assert saved.__self__ is a
assert saved.__func__ is A.method
assert saved.__func__.__name__ == 'method'
assert a.method is not a.method

def new_method(self, value=0):
    return ('new', value)
def mutate():
    A.method = new_method
    return 7
assert a.method(mutate()) == ('old', 7)
assert a.method(8) == ('new', 8)
assert saved(9) == ('old', 9)

def own(value=0):
    return ('own', value)
a.method = own
assert a.method(1) == ('own', 1)
del a.method
assert a.method(2) == ('new', 2)
def replace_instance_method():
    a.method = own
    return 3
assert a.method(replace_instance_method()) == ('new', 3)
assert a.method(4) == ('own', 4)
del a.method

def receiver():
    events.append('receiver')
    return a
def argument():
    events.append('argument')
    return 10
assert receiver().method(argument()) == ('new', 10)
assert events == ['receiver', 'argument']
events.clear()
try:
    receiver().missing(argument())
except AttributeError:
    pass
else:
    assert False
assert events == ['receiver']
events.clear()
a.not_callable = 1
try:
    receiver().not_callable(argument())
except TypeError:
    pass
else:
    assert False
assert events == ['receiver', 'argument']
events.clear()

class Data:
    def __get__(self, instance, owner):
        events.append('get')
        return lambda value: ('data', value)
    def __set__(self, instance, value):
        events.append('set')
class NonData:
    def __get__(self, instance, owner):
        events.append('nondata')
        return lambda value: ('nondata', value)
class Descriptors:
    data = Data()
    nondata = NonData()
    @property
    def failing(self):
        events.append('failing')
        raise ValueError('lookup failed')
d = Descriptors()
d.__dict__['data'] = own
d.nondata = own
assert d.data(argument()) == ('data', 10)
assert events == ['get', 'argument']
events.clear()
assert d.nondata(11) == ('own', 11)
assert events == []
del d.nondata
assert d.nondata(argument()) == ('nondata', 10)
assert events == ['nondata', 'argument']
events.clear()
try:
    d.failing(argument())
except ValueError:
    pass
else:
    assert False
assert events == ['failing']
events.clear()

class Missing:
    def __getattr__(self, name):
        events.append(name)
        return lambda value: value
assert Missing().unknown(argument()) == 10
assert events == ['unknown', 'argument']
events.clear()

class Callable:
    def __call__(self, value):
        return ('call-old', value)
d.callable = Callable()
def mutate_callable():
    d.callable = lambda value: ('call-new', value)
    return 20
assert d.callable(mutate_callable()) == ('call-old', 20)
assert d.callable(21) == ('call-new', 21)
d.dynamic = Callable()
def replace_call(self, value):
    return ('slot-new', value)
def mutate_callable_type():
    Callable.__call__ = replace_call
    return 22
assert d.dynamic(mutate_callable_type()) == ('slot-new', 22)

class Other:
    @staticmethod
    def static(value):
        return value
    @classmethod
    def class_method(cls, value):
        return (cls, value)
class Child(Other):
    pass
o = Child()
assert o.static(12) == 12
assert o.class_method(13) == (Child, 13)
assert Child.static(14) == 14
assert Child.class_method(15) == (Child, 15)

class Nested:
    def outer(self, value):
        return value
    def inner(self):
        return 16
n = Nested()
assert n.outer(n.inner()) == 16
assert n.outer(a.method(17)) == ('new', 17)
class Caller:
    def call(self):
        return a.method(18)
assert Caller().call() == ('new', 18)

# Assigned namespace functions are values, never implicit-self methods.
a.__dict__ = {'method': own}
assert a.method(19) == ('own', 19)
print('prepared-method-call-ok')
`;

test("prepared method calls agree with CPython", async (context) => {
  const python = spawnSync("python3", ["-c", source], { encoding: "utf8" });
  assert.equal(python.status, 0, python.stderr);
  const session = await createSage({ mode: "python" });
  context.after(() => session.close());
  const result = await session.evaluate(source);
  assert.equal(result.stderr ?? "", "");
  assert.equal(result.stdout, python.stdout.replaceAll("\r\n", "\n"));
});

for (const [name, regression] of [
  ["saved method function identity agrees with class lookup", `
class A:
    def method(self):
        return 1
a = A()
saved = a.method
assert saved.__func__ is A.method
print('method-identity-ok')
`],
  ["callable slot replacement accepts an explicit-self Python function", `
class Callable:
    def __call__(self, value):
        return ('old', value)
c = Callable()
def replacement(self, value):
    return ('new', value)
Callable.__call__ = replacement
assert c(20) == ('new', 20)
print('callable-slot-replacement-ok')
`],
]) {
  test(name, async (context) => {
    const python = spawnSync("python3", ["-c", regression], { encoding: "utf8" });
    assert.equal(python.status, 0, python.stderr);
    const session = await createSage({ mode: "python" });
    context.after(() => session.close());
    const result = await session.evaluate(regression);
    assert.equal(result.stderr ?? "", "");
    assert.equal(result.stdout, python.stdout.replaceAll("\r\n", "\n"));
  });
}
