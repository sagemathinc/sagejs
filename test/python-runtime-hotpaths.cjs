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
    "values = [10, 20, 30]",
    "frozen = (40, 50, 60)",
    "print(values[0], values[-1], frozen[1])",
    "class Alias:",
    "    @classmethod",
    "    def __class_getitem__(cls, key):",
    "        return (cls.__name__, key)",
    "print(Alias['parameter'])",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "5 6",
    "True True True",
    "True False",
    "True True",
    "10 30 50",
    "('Alias', 'parameter')",
  ].join("\n"));
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
  ].join("\n"));
  assert.equal(
    result.stdout.trim(),
    ["71", "101", "103", "79", "107", "109", "True", "113"].join(
      "\n",
    ),
  );
});
