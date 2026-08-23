#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { createSage } = require("../../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    const evaluated = await session.evaluate(
      String.raw`
import json
import time

def measure(prime, polynomial, h=None, seed=1, coordinates=None):
    R = PolynomialRing(GF(prime), "x")
    x = R.gen()
    f = R(polynomial)
    C = HyperellipticCurve(f) if h is None else HyperellipticCurve(f, R(h))
    J = C.jacobian()
    started = time.perf_counter()
    order = J.order()
    order_seconds = time.perf_counter() - started
    started = time.perf_counter()
    structure = J.group_structure(algorithm="basis", seed=seed)
    structure_seconds = time.perf_counter() - started
    started = time.perf_counter()
    G, phi = J.abelian_group(algorithm="basis", seed=seed)
    map_seconds = time.perf_counter() - started
    query_seconds = None
    query = None
    if coordinates is not None:
        value = G(coordinates)
        started = time.perf_counter()
        query = phi.preimage(phi(value)).coordinates()
        query_seconds = time.perf_counter() - started
    assert phi.verify()
    return {
        "prime": prime,
        "order": str(order),
        "structure": [str(value) for value in structure],
        "order_seconds": order_seconds,
        "structure_seconds": structure_seconds,
        "map_seconds": map_seconds,
        "inverse_query_seconds": query_seconds,
        "inverse_query": None if query is None else [str(value) for value in query],
        "diagnostics": J.group_structure_diagnostics(),
    }

rows = (
    measure(13, (1,2,0,0,0,0,0,1), seed=1, coordinates=(777,)),
    measure(19, (1,2,0,0,0,0,0,1), seed=1, coordinates=(1234,)),
    measure(
        5,
        (1,1,0,0,0,1),
        h=(1,0,1),
        seed=3,
        coordinates=(1,1,7),
    ),
)
print(json.dumps({"rows": rows}, sort_keys=True))
True`,
      { timeout: 600_000 },
    );
    if (evaluated.repr !== "True") {
      throw new Error(`benchmark did not finish exactly: ${evaluated.repr}`);
    }
    const rows = JSON.parse(evaluated.stdout).rows;
    const exact = rows.map((row) => ({
      prime: row.prime,
      order: String(row.order),
      structure: row.structure,
      inverse_query: row.inverse_query,
    }));
    const digest = createHash("sha256")
      .update(JSON.stringify(exact))
      .digest("hex");
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "sagejs.hyperelliptic.group-consumers-benchmark.v1",
          node: process.version,
          platform: process.platform,
          architecture: process.arch,
          digest,
          rows,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
