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
from sagejs.hyperelliptic_curves.genus3_completion import summarize_genus3_candidate_progressions
from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows

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
    exhaustive_seconds = None
    exhaustive_structure = None
    if coordinates is not None and len(coordinates) > 1:
        started = time.perf_counter()
        exhaustive_structure = J.group_structure(algorithm="exhaustive", seed=seed)
        exhaustive_seconds = time.perf_counter() - started
        assert exhaustive_structure == structure
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
        "exhaustive_seconds": exhaustive_seconds,
        "map_seconds": map_seconds,
        "inverse_query_seconds": query_seconds,
        "inverse_query": None if query is None else [str(value) for value in query],
        "diagnostics": J.group_structure_diagnostics(),
    }

def measure_candidate_stream(stop=10007):
    R = PolynomialRing(QQ, "x")
    x = R.gen()
    curve = HyperellipticCurve(x**7 + x + 1)
    started = time.perf_counter()
    forest = rforest_hasse_witt_rows(curve, 3, stop)
    residue_seconds = time.perf_counter() - started
    started = time.perf_counter()
    candidate_count = 0
    progression_count = 0
    exact_digest = 0
    available_rows = 0
    for row in forest["rows"]:
        if not row["available"]:
            continue
        summary = summarize_genus3_candidate_progressions(
            int(row["prime"]),
            row["residues"],
            max_candidates=500000,
            max_combinations=2000000,
        )
        if summary is None:
            return {"status": "unavailable", "stop": stop}
        if summary["status"] != "ok":
            raise RuntimeError("candidate stream exhausted its benchmark budget")
        available_rows += 1
        candidate_count += int(summary["candidate_count"])
        progression_count += len(summary["progressions"])
        exact_digest = (
            exact_digest * 1000003
            + int(row["prime"])
            + 17 * int(summary["candidate_count"])
        ) % 170141183460469231731687303715884105727
        for progression in summary["progressions"]:
            exact_digest = (
                exact_digest * 1000003
                + progression["base"]
                + 31 * progression["count"]
            ) % 170141183460469231731687303715884105727
    candidate_seconds = time.perf_counter() - started
    return {
        "status": "ok",
        "stop": stop,
        "available_rows": available_rows,
        "candidate_count": candidate_count,
        "progression_count": progression_count,
        "exact_digest": str(exact_digest),
        "residue_seconds": residue_seconds,
        "candidate_seconds": candidate_seconds,
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
candidate_stream = measure_candidate_stream()
print(json.dumps({"rows": rows, "candidate_stream": candidate_stream}, sort_keys=True))
True`,
      { timeout: 600_000 },
    );
    if (evaluated.repr !== "True") {
      throw new Error(`benchmark did not finish exactly: ${evaluated.repr}`);
    }
    const payload = JSON.parse(evaluated.stdout);
    const rows = payload.rows;
    const exact = rows.map((row) => ({
      prime: row.prime,
      order: String(row.order),
      structure: row.structure,
      inverse_query: row.inverse_query,
    }));
    const candidateExact = {
      status: payload.candidate_stream.status,
      stop: payload.candidate_stream.stop,
      available_rows: payload.candidate_stream.available_rows,
      candidate_count: payload.candidate_stream.candidate_count,
      progression_count: payload.candidate_stream.progression_count,
      exact_digest: payload.candidate_stream.exact_digest,
    };
    const digest = createHash("sha256")
      .update(JSON.stringify({ exact, candidate_stream: candidateExact }))
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
          candidate_stream: payload.candidate_stream,
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
