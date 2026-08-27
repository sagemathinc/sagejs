// sagejs-test-tier: integration
"use strict";

// Focused compatibility vectors derived from CPython 3.14's operator module.
const assert = require("node:assert/strict");

const { createSage } = require("../dist/tools/kernel.js");

async function testOperatorModule() {
  const session = await createSage({ mode: "python" });
  try {
    const result = await session.evaluate(
      [
        "import operator",
        "class EqualValue:",
        "    def __init__(self, value): self.value = value",
        "    def __eq__(self, other): return self.value == other.value",
        "left = EqualValue(5); right = EqualValue(5)",
        "print(operator.eq(left, right), operator.ne(left, right), operator.is_(left, right), operator.is_not(left, right))",
        "print(operator.lt(2, 3), operator.le(3, 3), operator.ge(4, 3), operator.gt(4, 3))",
        "print(operator.truth([1]), operator.not_([]), operator.is_none(None), operator.is_not_none(0))",
        "print(operator.abs(-7), operator.add(2, 3), operator.sub(9, 4), operator.mul(6, 7))",
        "print(operator.floordiv(7, 3), operator.truediv(7, 2), operator.mod(17, 5), operator.pow(3, 4))",
        "print(operator.and_(6, 3), operator.or_(4, 1), operator.xor(7, 3), operator.lshift(3, 2), operator.rshift(17, 2), operator.inv(2))",
        "class IndexValue:",
        "    def __index__(self): return 11",
        "print(operator.index(5), operator.index(IndexValue()))",
        "class InvalidIndex:",
        "    def __index__(self): return 1.5",
        "for indexed in (InvalidIndex(), object()):",
        "    try: operator.index(indexed)",
        "    except Exception as error: print(isinstance(error, TypeError), str(error))",
        "values = [10, 20, 10]",
        "print(operator.concat([1], [2, 3]), operator.contains(values, 20), operator.countOf(values, 10), operator.indexOf(values, 20), operator.getitem(values, -1))",
        "operator.setitem(values, 1, 99); operator.delitem(values, 0); print(values)",
        "class Child:",
        "    def __init__(self, value): self.value = value",
        "class Record:",
        "    def __init__(self):",
        "        self.name = 'sage'",
        "        self.child = Child(17)",
        "    def decorate(self, prefix, suffix=''): return prefix + self.name + suffix",
        "record = Record()",
        "print(operator.attrgetter('child.value', 'name')(record))",
        "print(operator.itemgetter(2, 0)('abcd'))",
        "print(operator.methodcaller('decorate', '<', suffix='>')(record))",
        "print(operator.call(pow, 2, 8), operator.length_hint([1, 2, 3]), operator.length_hint(object(), 9))",
        "mutable = [1]; returned = operator.iconcat(mutable, [2, 3])",
        "print(mutable, returned is mutable, operator.iadd(20, 22), operator.imul(6, 7))",
        "print(operator.__add__ is operator.add, operator.__getitem__ is operator.getitem)",
        "print(len(operator.__all__), all(hasattr(operator, name) for name in operator.__all__))",
      ].join("\n"),
    );
    assert.equal(
      result.stdout.trim(),
      [
        "True False False True",
        "True True True True",
        "True True True True",
        "7 5 5 42",
        "2 3.5 2 81",
        "2 5 4 12 4 -3",
        "5 11",
        "True __index__ returned non-int (type float)",
        "True 'object' object cannot be interpreted as an integer",
        "[1, 2, 3] True 2 1 10",
        "[99, 10]",
        "(17, 'sage')",
        "('c', 'a')",
        "<sage>",
        "256 3 9",
        "[1, 2, 3] True 42 42",
        "True True",
        "57 True",
      ].join("\n"),
    );
  } finally {
    await session.close();
  }
}

testOperatorModule()
  .then(() => console.log("Sage.js operator compatibility passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
