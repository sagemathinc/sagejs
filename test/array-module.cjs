// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("array float byte operations match native CPython vectors", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "from array import array",
      "import math",
      "import sys",
      "values = [0.0, -0.0, 1.0, -2.5, 1e309, -1e309]",
      "for code in ('f', 'd'):",
      "    original = array(code, values)",
      "    raw = original.tobytes()",
      "    print(code, raw.hex())",
      "    restored = array(code)",
      "    print(restored.frombytes(raw) is None)",
      "    print(restored.tobytes() == raw, len(restored), restored[2], restored[3])",
      "    print(restored[0] == 0, restored[1] == 0, restored[4] > 0, restored[5] < 0)",
      "    print(restored.byteswap() is None, restored.tobytes().hex())",
      "    restored.byteswap()",
      "    print(restored.tobytes() == raw)",
      "    copied = array(code, memoryview(raw))",
      "    copied.frombytes(raw)",
      "    print(len(copied), copied.tobytes() == raw + raw)",
      "    computed_nan = array(code, [1e309-1e309])",
      "    print(math.isnan(computed_nan[0]), len(computed_nan.tobytes()) == computed_nan.itemsize)",
      "    nan_hex = ('3412c0ff' if code == 'f' else '341200000000f8ff') if sys.byteorder == 'little' else ('ffc01234' if code == 'f' else 'fff8000000001234')",
      "    nan_raw = bytes.fromhex(nan_hex)",
      "    payload_nan = array(code); payload_nan.frombytes(nan_raw)",
      "    print(math.isnan(payload_nan[0]), payload_nan.tobytes() == nan_raw)",
      "    payload_nan.byteswap(); payload_nan.byteswap()",
      "    print(payload_nan.tobytes() == nan_raw)",
      "print(array('f', [0.1])[0])",
      "integers = array('h', [1, -2])",
      "print(integers.tobytes().hex(), array('h', integers.tobytes()))",
      "single = array('B', [1,2]); print(single.byteswap() is None, single)",
      "for code in ('f', 'd'):",
      "    try:",
      "        array(code).frombytes(b'\\x00')",
      "    except Exception as error:",
      "        print(isinstance(error, ValueError), str(error))",
    ].join("\n"),
  );

  assert.equal(
    result.stdout.trim(),
    [
      "f 00000000000000800000803f000020c00000807f000080ff",
      "True",
      "True 6 1.0 -2.5",
      "True True True True",
      "True 00000000800000003f800000c02000007f800000ff800000",
      "True",
      "12 True",
      "True True",
      "True True",
      "True",
      "d 00000000000000000000000000000080000000000000f03f00000000000004c0000000000000f07f000000000000f0ff",
      "True",
      "True 6 1.0 -2.5",
      "True True True True",
      "True 000000000000000080000000000000003ff0000000000000c0040000000000007ff0000000000000fff0000000000000",
      "True",
      "12 True",
      "True True",
      "True True",
      "True",
      "0.10000000149011612",
      "0100feff array('h', [1, -2])",
      "True array('B', [1, 2])",
      "True bytes length not a multiple of item size",
      "True bytes length not a multiple of item size",
    ].join("\n"),
  );
});
