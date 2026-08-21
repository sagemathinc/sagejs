import assert from "node:assert/strict";
import test from "node:test";

test("public Node/browser evaluator routes AA matrix arithmetic to algebraic Wasm", async () => {
  // node-kernel installs the Node Worker host around the same kernel.mjs and
  // distribution assets used by the browser. This exercises public Sage
  // source, rather than calling the algebraic adapter directly.
  const { createSage } = await import("../node-kernel.mjs");
  const sage = await createSage({ timeout: 30_000 });
  try {
    const result = await sage.evaluate(`
R.<x> = QQ[]
r = (x^2 - 2).roots(AA, multiplicities=False)[1]
M = matrix(AA, 4, 4, [r,1,0,0, 0,r,1,0, 0,0,r,1, 1,0,0,r])
print(M.det())
print(M.rank())
print((M*M)[0,0])
print(M.charpoly()(r))
`);

    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "3\n4\n2\n-1\n");
    assert.deepEqual(result.instrumentation.routes, [
      {
        capability_id: "algebraic:qqbar-resource-core",
        selected_route: "receipt-backed-wasm-artifact",
        execution_target: "wasm-artifact",
        call_count: 7,
        ingress_bytes: 126,
        egress_bytes: 56,
      },
    ]);
    assert.equal(result.instrumentation.boundary_crossings, 7);
  } finally {
    await sage.close();
  }
});
