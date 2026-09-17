// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("exact integer shifts preserve values, errors, and dispatch", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());
  const result = await session.evaluate([
    "print([7 << 3, -7 << 3, 7 >> 2, -7 >> 2])",
    "wide = 2 ** 60",
    "print(wide << 7, (-wide) >> 4)",
    "print(True << True, True >> True, type(True << True) is int)",
    "huge = 2 ** 80",
    "print(7 >> huge, -7 >> huge, 0 << huge)",
    "for expression in ('1 << -1', '1 >> -1'):",
    "    try:",
    "        eval(expression)",
    "    except ValueError as error:",
    "        print(type(error).__name__, str(error))",
    "class Reflected:",
    "    def __rlshift__(self, other):",
    "        return ('reflected-left', other)",
    "    def __rrshift__(self, other):",
    "        return ('reflected-right', other)",
    "item = Reflected()",
    "print(3 << item, 4 >> item)",
    "class InPlace:",
    "    def __ilshift__(self, other):",
    "        return ('in-place-left', other)",
    "item = InPlace()",
    "item <<= 5",
    "print(item)",
    "try:",
    "    1.5 << 1",
    "except TypeError as error:",
    "    print(type(error).__name__)",
  ].join("\n"));
  assert.equal(result.stdout.trim(), [
    "[56, -56, 1, -2]",
    "147573952589676412928 -72057594037927936",
    "2 0 True",
    "0 -1 0",
    "ValueError negative shift count",
    "ValueError negative shift count",
    "('reflected-left', 3) ('reflected-right', 4)",
    "('in-place-left', 5)",
    "TypeError",
  ].join("\n"));
});
