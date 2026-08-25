#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createSage } = require("../../dist/tools/kernel.js");

const repositoryRoot = resolve(__dirname, "../..");
const rankThreeMapBaselineSeconds = 8.103;
const rankThreeMapTargetSeconds = rankThreeMapBaselineSeconds / 10;

function parseArguments(argv) {
  const options = {
    rankThreeProcessCold: false,
    rankThreeProcessColdChild: false,
    repeat: 5,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--rank3-process-cold") {
      options.rankThreeProcessCold = true;
    } else if (argument === "--rank3-process-cold-child") {
      options.rankThreeProcessColdChild = true;
    } else if (argument === "--repeat") {
      options.repeat = Number(argv[++index]);
    } else if (argument === "--output") {
      options.output = argv[++index];
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (!Number.isInteger(options.repeat) || options.repeat < 1) {
    throw new Error("--repeat must be a positive integer");
  }
  return options;
}

async function rankThreeProcessColdChild() {
  const session = await createSage();
  try {
    const evaluated = await session.evaluate(
      String.raw`
import json
import time

R = PolynomialRing(GF(5), "x")
x = R.gen()
J = HyperellipticCurve(x**5 + x + 1, x**2 + 1).jacobian()

started = time.perf_counter()
order = J.order()
order_seconds = time.perf_counter() - started

started = time.perf_counter()
structure = J.group_structure(algorithm="auto", seed=3)
structure_seconds = time.perf_counter() - started

original_points = J.points
point_enumerations = [0]
def counted_points(*args, **kwds):
    point_enumerations[0] += 1
    return original_points(*args, **kwds)
J.points = counted_points
try:
    started = time.perf_counter()
    G, phi = J.abelian_group(algorithm="auto", seed=3)
    map_seconds = time.perf_counter() - started
finally:
    J.points = original_points

value = G((1, 1, 7))
started = time.perf_counter()
query = phi.preimage(phi(value)).coordinates()
query_seconds = time.perf_counter() - started

started = time.perf_counter()
verified = phi.verify()
verify_seconds = time.perf_counter() - started
capability = J.prepared_arithmetic(algorithm="auto").capability().to_dict()

assert order == 32
assert structure == (2, 2, 8)
assert query == (1, 1, 7)
assert verified
assert point_enumerations[0] == 1
assert len(phi._inverse_coordinates) == 32
assert phi._certificate is None
assert capability["available"]
assert capability["selected"] == "native"
print(json.dumps({
    "order": str(order),
    "structure": [int(entry) for entry in structure],
    "query": [int(entry) for entry in query],
    "verified": verified,
    "point_enumerations": point_enumerations[0],
    "inverse_table_size": len(phi._inverse_coordinates),
    "certificate": None,
    "prepared_capability": capability,
    "seconds": {
        "order": order_seconds,
        "structure": structure_seconds,
        "explicit_map": map_seconds,
        "query": query_seconds,
        "verify": verify_seconds,
    },
}, sort_keys=True))
True`,
      { timeout: 120_000 },
    );
    if (evaluated.repr !== "True") {
      throw new Error(`rank-three child did not finish exactly: ${evaluated.repr}`);
    }
    process.stdout.write(`${evaluated.stdout.trim()}\n`);
  } finally {
    await session.close();
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function gitOutput(arguments_) {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function rankThreeProcessColdReceipt(options) {
  const samples = [];
  for (let index = 0; index < options.repeat; index += 1) {
    const output = execFileSync(
      process.execPath,
      [__filename, "--rank3-process-cold-child"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
        },
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    samples.push(JSON.parse(output));
  }
  const exactRows = samples.map((sample) => ({
    order: sample.order,
    structure: sample.structure,
    query: sample.query,
    verified: sample.verified,
    point_enumerations: sample.point_enumerations,
    inverse_table_size: sample.inverse_table_size,
    certificate: sample.certificate,
    prepared_capability: sample.prepared_capability,
  }));
  const exactDigest = createHash("sha256")
    .update(JSON.stringify(exactRows))
    .digest("hex");
  if (exactRows.some((row) => JSON.stringify(row) !== JSON.stringify(exactRows[0]))) {
    throw new Error("rank-three process-cold samples disagree exactly");
  }
  const mapSeconds = samples.map((sample) => sample.seconds.explicit_map);
  const receipt = {
    schema: "sagejs.hyperelliptic.rank3-process-cold.v2",
    recorded_at: new Date().toISOString(),
    source: {
      commit: gitOutput(["rev-parse", "HEAD"]),
      status: gitOutput(["status", "--short"]) === "" ? "clean" : "dirty",
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    contract: {
      fixture: "Jacobian of y^2 + (x^2 + 1)y = x^5 + x + 1 over GF(5)",
      invariants: [2, 2, 8],
      query: [1, 1, 7],
      point_enumerations_per_map: 1,
      baseline_seconds: rankThreeMapBaselineSeconds,
      maximum_seconds: rankThreeMapTargetSeconds,
      process_per_sample: true,
      algorithm: "auto",
      auto_receipt_policy: "off-for-explicit-receipt-collection",
    },
    exact_digest: exactDigest,
    samples,
    summary: {
      repeat: samples.length,
      explicit_map_seconds: {
        minimum: Math.min(...mapSeconds),
        median: median(mapSeconds),
        maximum: Math.max(...mapSeconds),
      },
      speedup_at_median: rankThreeMapBaselineSeconds / median(mapSeconds),
      all_samples_below_target: mapSeconds.every(
        (seconds) => seconds <= rankThreeMapTargetSeconds,
      ),
    },
  };
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output !== null) {
    writeFileSync(resolve(options.output), serialized);
  }
  process.stdout.write(serialized);
}

async function main() {
  const session = await createSage();
  try {
    const evaluated = await session.evaluate(
      String.raw`
import json
import time
from sagejs.hyperelliptic_curves.genus3_completion import summarize_genus3_candidate_progressions
from sagejs.hyperelliptic_curves.rforest import rforest_hasse_witt_rows

def measure(
    prime, polynomial, h=None, seed=1, coordinates=None, algorithm="basis"
):
    R = PolynomialRing(GF(prime), "x")
    x = R.gen()
    f = R(polynomial)
    C = HyperellipticCurve(f) if h is None else HyperellipticCurve(f, R(h))
    J = C.jacobian()
    started = time.perf_counter()
    order = J.order()
    order_seconds = time.perf_counter() - started
    started = time.perf_counter()
    structure = J.group_structure(algorithm=algorithm, seed=seed)
    structure_seconds = time.perf_counter() - started
    exhaustive_seconds = None
    exhaustive_structure = None
    if coordinates is not None and len(coordinates) > 1:
        started = time.perf_counter()
        exhaustive_structure = J.group_structure(algorithm="exhaustive", seed=seed)
        exhaustive_seconds = time.perf_counter() - started
        assert exhaustive_structure == structure
    started = time.perf_counter()
    G, phi = J.abelian_group(algorithm=algorithm, seed=seed)
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
        algorithm="auto",
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

async function dispatch() {
  const options = parseArguments(process.argv.slice(2));
  if (options.rankThreeProcessColdChild) {
    await rankThreeProcessColdChild();
  } else if (options.rankThreeProcessCold) {
    rankThreeProcessColdReceipt(options);
  } else {
    await main();
  }
}

dispatch().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
