"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("optimized calls, equality, and indexing retain Python semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "def increment(value):",
    "    return value + 1",
    "increment.__call__ = lambda value: 1000",
    "class Callable:",
    "    def __call__(self, value):",
    "        return value + 2",
    "print(increment(4), Callable()(4))",
    "print(True == 1, 1 == 1.0, 10**20 == 1e20)",
    "print('same' == 'same', 'left' == 'right')",
    "print([1, 2] == [1, 2], (1, 2) == (1, 2))",
    "print((1 < 2) == (3 < 4), (1 < 2) == (3 > 4))",
    "print(bool([]), bool([1]), bool(()), bool((1,)), not ())",
    "values = [10, 20, 30]",
    "frozen = (40, 50, 60)",
    "print(values[0], values[-1], frozen[1])",
    "class Alias:",
    "    @classmethod",
    "    def __class_getitem__(cls, key):",
    "        return (cls.__name__, key)",
    "print(Alias['parameter'])",
    "class StaticBase:",
    "    def selected(self): return 'base'",
    "class StaticAlias(StaticBase):",
    "    selected = staticmethod(lambda: 'static')",
    "print(StaticAlias.selected(), StaticAlias().selected())",
    "overridden = StaticAlias()",
    "overridden.selected = lambda: 'instance'",
    "print(overridden.selected())",
    "values = [-999, -24, 24, 999]",
    "print(sorted(values, key=lambda value: (0, value)))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "5 6",
    "True True True",
    "True False",
    "True True",
    "True False",
    "False True False True True",
    "10 30 50",
    "('Alias', 'parameter')",
    "static static",
    "instance",
    "[-999, -24, 24, 999]",
  ].join("\n"));
});

test("core type metadata follows the Python object model", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "import types",
    "print(type.__module__, type.__bases__)",
    "print(type.__mro__[:2] == (type, object))",
    "print(all(isinstance(cls, type) for cls in type.__mro__))",
    "print(type(None).__name__, type(None).__module__)",
    "print(types.NoneType is type(None), isinstance(None, types.NoneType))",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "builtins (<class 'object'>,)",
    "True",
    "True",
    "NoneType builtins",
    "True True",
  ].join("\n"));
});

test("with statements expose Python exception type and traceback", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class Expected(Exception): pass",
    "class Suppress:",
    "    def __enter__(self): return self",
    "    def __exit__(self, exc_type, value, traceback):",
    "        print(exc_type is type(value), traceback is value.__traceback__)",
    "        return True",
    "with Suppress():",
    "    raise Expected('handled')",
    "print('continued')",
  ].join("\n"));
  assert.equal(result.stdout.trim(), "True True\ncontinued");
});

test("nested with statements clear suppressed inner exceptions", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "events = []",
    "class Expected(Exception): pass",
    "class Outer:",
    "    def __enter__(self): return self",
    "    def __exit__(self, exc_type, value, traceback):",
    "        events.append(('outer', exc_type is None))",
    "class Inner:",
    "    def __enter__(self): return self",
    "    def __exit__(self, exc_type, value, traceback):",
    "        events.append(('inner', exc_type is Expected))",
    "        return True",
    "with Outer():",
    "    with Inner():",
    "        raise Expected('handled')",
    "    events.append(('continued', True))",
    "print(events)",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    "[('inner', True), ('continued', True), ('outer', True)]",
  );
});

test("optimized comparisons and integer kernels retain Python semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "print(False == 0, True == 1, 0 == 0.0, 10**20 == 1e20)",
    "print(bool(0), bool(1), bool(0.0), bool(1.0), bool(object()))",
    "class Sized:",
    "    def __len__(self):",
    "        return 0",
    "class Truthful:",
    "    def __bool__(self):",
    "        return True",
    "print(bool(Sized()), bool(Truthful()))",
    "class Compared:",
    "    def __eq__(self, other):",
    "        return 117",
    "    def __lt__(self, other):",
    "        return 119",
    "print(Compared() == object(), Compared() < object())",
    "print(-5 // 2, -5 % 2, 5 // -2, 5 % -2)",
    "quotient = 0",
    "quotient /= 4",
    "print(quotient, isinstance(quotient, float), quotient < 0.5)",
    "numerator = 123456789012345678901234567890",
    "denominator = -1000000007",
    "print(numerator // denominator, numerator % denominator)",
    "for zero in (0, False, 0.0):",
    "    try:",
    "        1 // zero",
    "    except ZeroDivisionError:",
    "        print('zero', end=' ')",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "True True True True",
      "False True False True True",
      "False True",
      "117 119",
      "-3 1 -3 -1",
      "0.0 True True",
      "-123456788148148161865 -802565165",
      "zero zero zero",
    ].join("\n"),
  );
});

test("list construction rejects scalars and honors Python iteration protocols", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "errors = []",
    "for value in (0, 1, 2.0, object()):",
    "    try:",
    "        list(value)",
    "    except TypeError:",
    "        errors.append('not-iterable')",
    "class Items:",
    "    def __getitem__(self, index):",
    "        if index >= 3:",
    "            raise IndexError",
    "        return index + 10",
    "print(' '.join(errors))",
    "print(list(Items()))",
    "print(list(iter([4, 5, 6])))",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "not-iterable not-iterable not-iterable not-iterable",
      "[10, 11, 12]",
      "[4, 5, 6]",
    ].join("\n"),
  );
});

test("optimized own-field lookup preserves descriptor precedence", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "class DataDescriptor:",
    "    def __get__(self, instance, owner):",
    "        return 71",
    "    def __set__(self, instance, value):",
    "        instance.stored = value",
    "class WithDataDescriptor:",
    "    answer = DataDescriptor()",
    "data = WithDataDescriptor()",
    "data.__dict__['answer'] = 99",
    "print(data.answer)",
    "class NonDataDescriptor:",
    "    def __get__(self, instance, owner):",
    "        return 73",
    "class WithNonDataDescriptor:",
    "    answer = NonDataDescriptor()",
    "non_data = WithNonDataDescriptor()",
    "non_data.__dict__['answer'] = 101",
    "print(non_data.answer)",
    "class Dynamic:",
    "    pass",
    "dynamic = Dynamic()",
    "dynamic.answer = 103",
    "print(dynamic.answer)",
    "setattr(Dynamic, 'answer', property(lambda self: 79))",
    "print(dynamic.answer)",
    "class MutableClassField:",
    "    answer = 107",
    "mutable = MutableClassField()",
    "print(mutable.answer)",
    "MutableClassField.answer = 109",
    "print(mutable.answer)",
    "class LateDescriptor:",
    "    pass",
    "late_descriptor = LateDescriptor()",
    "class WithLateDescriptor:",
    "    answer = late_descriptor",
    "late = WithLateDescriptor()",
    "print(late.answer is late_descriptor)",
    "LateDescriptor.__get__ = lambda self, instance, owner: 113",
    "print(late.answer)",
    "class DynamicSet(set):",
    "    pass",
    "dynamic_set = DynamicSet()",
    "DynamicSet.__contains__ = lambda self, item: item == 'needle'",
    "print('needle' in dynamic_set, 'other' not in dynamic_set)",
    "def late_method(self, value): return self.offset + value",
    "class DynamicMethod:",
    "    def __init__(self): self.offset = 5",
    "setattr(DynamicMethod, 'add', late_method)",
    "print(DynamicMethod().add(8), DynamicMethod.add(DynamicMethod(), 9))",
    "class ReplaceMethod:",
    "    def add(self, value): return value + 1",
    "original_add = ReplaceMethod.add",
    "setattr(ReplaceMethod, 'add', lambda self, value: value + 2)",
    "replaced = ReplaceMethod().add(10)",
    "setattr(ReplaceMethod, 'add', original_add)",
    "print(replaced, ReplaceMethod().add(10))",
    "class BoundSource:",
    "    def __init__(self): self.tag = 17",
    "    def add(self, value): return self.tag + value",
    "class BoundTarget:",
    "    pass",
    "setattr(BoundTarget, 'add', BoundSource().add)",
    "print(BoundTarget().add(4))",
    "class BoundReplacement:",
    "    def add(self, value): return value",
    "setattr(BoundReplacement, 'add', BoundSource().add)",
    "print(BoundReplacement().add(4))",
    "class CallableDescriptor:",
    "    def __get__(self, instance, owner): return lambda value: value * 10",
    "class StaticTarget:",
    "    @staticmethod",
    "    def compute(value): return value",
    "class ClassTarget:",
    "    @classmethod",
    "    def compute(cls, value): return value",
    "setattr(StaticTarget, 'compute', CallableDescriptor())",
    "setattr(ClassTarget, 'compute', CallableDescriptor())",
    "print(StaticTarget.compute(3), ClassTarget.compute(3), StaticTarget().compute(4), ClassTarget().compute(4))",
    "class EmptyKeywordMethod:",
    "    pass",
    "def late_keyword_method(self, *, value): return value + 1",
    "setattr(EmptyKeywordMethod, 'compute', late_keyword_method)",
    "print(EmptyKeywordMethod().compute(value=40))",
    "class DivmodBase:",
    "    def __divmod__(self, other): return 'base'",
    "class DivmodSubclass(DivmodBase):",
    "    def __rdivmod__(self, other): return 'reflected-subclass'",
    "print(divmod(DivmodBase(), DivmodSubclass()))",
    "class DivmodBoth:",
    "    def __divmod__(self, other): return 'inherited-left'",
    "    def __rdivmod__(self, other): return 'inherited-right'",
    "class DivmodInherited(DivmodBoth):",
    "    pass",
    "print(divmod(DivmodBoth(), DivmodInherited()))",
    "class DivmodAlias(DivmodBoth):",
    "    __rdivmod__ = DivmodBoth.__rdivmod__",
    "print(divmod(DivmodBoth(), DivmodAlias()))",
    "class DivmodDynamic(DivmodBoth):",
    "    pass",
    "def dynamic_rdivmod(self, other): return 'dynamic-right'",
    "setattr(DivmodDynamic, '__rdivmod__', dynamic_rdivmod)",
    "print(divmod(DivmodBoth(), DivmodDynamic()))",
    "divmod_instance = DivmodBoth()",
    "divmod_instance.__divmod__ = lambda other: 'instance-left'",
    "divmod_instance.__rdivmod__ = lambda other: 'instance-right'",
    "print(divmod(divmod_instance, DivmodBoth()), divmod(1, divmod_instance))",
    "class DivmodBad(DivmodBoth):",
    "    __rdivmod__ = 1",
    "try:",
    "    divmod(DivmodBoth(), DivmodBad())",
    "except TypeError:",
    "    print('noncallable-reflected')",
    "class Applicable:",
    "    def __init__(self): self.ready = True",
    "    def apply(self): return 127",
    "applicable = Applicable()",
    "print(applicable.ready, applicable.apply())",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    [
      "71", "101", "103", "79", "107", "109", "True", "113",
      "True True", "13 14", "12 11", "21", "21", "30 30 40 40", "41",
      "reflected-subclass", "inherited-left", "inherited-left", "dynamic-right",
      "inherited-left inherited-right", "noncallable-reflected", "True 127",
    ].join("\n"),
  );
});

test("instance subscription ignores class-only generic hooks", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "from collections import defaultdict",
    "groups = defaultdict(list)",
    "groups['odd'].extend([1, 3])",
    "print(groups['odd'])",
    "class Derived(defaultdict):",
    "    def __missing__(self, key):",
    "        return ['override', key]",
    "print(Derived(list)['x'])",
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    ["[1, 3]", "['override', 'x']"].join("\n"),
  );
});
