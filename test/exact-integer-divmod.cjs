// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("exact floor division and modulo preserve signs, errors, and dispatch", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "print([7 // 3, -7 // 3, 7 // -3, -7 // -3])",
    "print([7 % 3, -7 % 3, 7 % -3, -7 % -3])",
    "wide = 2 ** 60",
    "print(wide // 3, (-wide) % 7)",
    "print(True // True, True % 2, type(True // True) is int)",
    "for expression in ('1 // 0', '1 % 0', '1 // False', '1 % False', 'wide // False', 'wide % False'):",
    "    try:",
    "        eval(expression)",
    "    except ZeroDivisionError as error:",
    "        print(type(error).__name__, str(error))",
    "for expression in ('value = 1\\nvalue //= False', 'value = wide\\nvalue %= False'):",
    "    try:",
    "        exec(expression)",
    "    except ZeroDivisionError as error:",
    "        print(type(error).__name__, str(error))",
    "class UsesFloor:",
    "    def __ifloordiv__(self, other):",
    "        return ('ifloor', other)",
    "item = UsesFloor()",
    "item //= 4",
    "print(item)",
    "class UsesMod:",
    "    def __mod__(self, other):",
    "        return ('mod', other)",
    "item = UsesMod()",
    "item %= 5",
    "print(item)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "[2, -3, -3, 2]",
    "[1, 2, -2, -1]",
    "384307168202282325 6",
    "1 1 True",
    "ZeroDivisionError integer division or modulo by zero",
    "ZeroDivisionError integer modulo by zero",
    "ZeroDivisionError integer division or modulo by zero",
    "ZeroDivisionError integer modulo by zero",
    "ZeroDivisionError integer division or modulo by zero",
    "ZeroDivisionError integer modulo by zero",
    "ZeroDivisionError integer division or modulo by zero",
    "ZeroDivisionError integer modulo by zero",
    "('ifloor', 4)",
    "('mod', 5)",
  ].join("\n"));
});
