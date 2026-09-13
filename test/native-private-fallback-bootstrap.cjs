// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

for (const mode of ["python", "sage"]) {
  test(`builtins exposes the live native private-helper sentinel (${mode})`, async (t) => {
    const sage = await createSage({ mode });
    t.after(() => sage.close());
    const result = await sage.evaluate([
      "import builtins",
      "import sagejs.runtime as runtime",
      "sentinel = getattr(builtins, '__sagejs_native_private_fallback__', None)",
      "assert sentinel is not None",
      "assert sentinel is runtime.reflect.get(runtime.global_object, '__sagejs_native_private_fallback__')",
      "assert not callable(sentinel)",
      "True",
    ].join("\n"));
    assert.equal(result.repr, "True");
  });
}
