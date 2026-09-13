import test from "node:test";
import assert from "node:assert/strict";
import {createSage} from "../node-kernel.mjs";

test("bundled package shells retain lazy children and module identity", {timeout: 120000}, async () => {
  const sage = await createSage();
  try {
    assert.equal((await sage.evaluate(
      "from sagejs.polynomial_algorithms import zero_dimensional as zd\nprint(zd.__name__)",
    )).stdout, "sagejs.polynomial_algorithms.zero_dimensional\n");
    await sage.evaluate("import sagejs.polynomial_algorithms as pkg\npkg._import_witness = 17");
    assert.equal((await sage.evaluate(
      "import sagejs.polynomial_algorithms as pkg\nfrom sagejs.polynomial_algorithms import zero_dimensional as zd\nprint(pkg._import_witness, pkg.zero_dimensional is zd)",
    )).stdout, "17 True\n");
    await assert.rejects(sage.evaluate(
      "from sagejs.polynomial_algorithms import _nonexistent_import_witness",
    ), error => error.name === "ImportError" && /cannot import name/.test(error.message));
    assert.equal((await sage.evaluate("2 + 2")).repr, "4");
  } finally {await sage.close();}
});
