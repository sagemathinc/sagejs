"use strict";

const { createSage } = require("../../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      String.raw`
import json
import time

rows = []
for prime, h_coefficients, expected, seed in (
    (13, (), (2160,), 1),
    (19, (), (6490,), 1),
    (5, (1, 0, 1), (2, 2, 8), 3),
):
    R = PolynomialRing(GF(prime), "x")
    x = R.gen()
    h = R(list(h_coefficients)) if h_coefficients else R(0)
    J = HyperellipticCurve(x**7 + 2*x + 1, h).jacobian() if prime != 5 else HyperellipticCurve(x**5 + x + 1, h).jacobian()
    started = time.perf_counter()
    order = J.order()
    order_seconds = time.perf_counter() - started
    started = time.perf_counter()
    structure = J.group_structure(algorithm="basis", seed=seed)
    structure_seconds = time.perf_counter() - started
    assert structure == expected
    started = time.perf_counter()
    G, phi = J.abelian_group(algorithm="basis", seed=seed)
    map_seconds = time.perf_counter() - started
    assert G.invariants() == expected and phi.verify()
    diagnostics = J.group_structure_diagnostics()
    rows.append({
        "prime": prime,
        "order": str(order),
        "invariants": [str(value) for value in structure],
        "seed": seed,
        "order_seconds": order_seconds,
        "structure_seconds": structure_seconds,
        "map_seconds": map_seconds,
        "samples": diagnostics.get("samples", 0),
        "group_operations": diagnostics.get("group_operations", 0),
        "baby_steps": diagnostics.get("baby_steps", 0),
        "peak_table_entries": diagnostics.get("peak_table_entries", 0),
        "sampling_seconds": diagnostics.get("sampling_seconds", 0),
        "element_order_seconds": diagnostics.get("element_order_seconds", 0),
        "basis_seconds": diagnostics.get("basis_seconds", 0),
        "verification_seconds": diagnostics.get("verification_seconds", 0),
    })
print(json.dumps({"schema":"sagejs.hyperelliptic-jacobian-structure-benchmark.v1","rows":rows}, sort_keys=True))
True`,
      { timeout: 180_000 },
    );
    if (result.repr !== "True") {
      throw new Error(`benchmark did not finish exactly: ${result.repr}`);
    }
    process.stdout.write(result.stdout);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
