#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { performance } = require("node:perf_hooks");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length);
}

async function collectEvidence({ precisionBits = 64, timeoutMs = 600_000 } = {}) {
  if (!Number.isInteger(precisionBits) || precisionBits < 32 || precisionBits > 256) {
    throw new Error("precisionBits must be an integer from 32 through 256");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
    throw new Error("timeoutMs must be at least 1000");
  }
  const directory = mkdtempSync(join(tmpdir(), "sagejs-phase9-acceptance-"));
  const coefficientCache = join(directory, "coefficient-cache");
  const { createSage } = require("../../../dist/tools/kernel.js");
  const session = await createSage();
  const started = performance.now();
  try {
    const result = await session.evaluate(
      String.raw`
import hashlib
import json
import time
from mpmath import mp
from sagejs.hyperelliptic_curves.lseries import GlobalCoefficientPrefix, clear_central_weight_cache, native_central_weight_values
from sagejs.hyperelliptic_curves.twists import _QuadraticTwistCoefficientPrefix, _quadratic_character, fundamental_discriminants

R = PolynomialRing(QQ, "x")
x = R.gen()
C2 = HyperellipticCurve(x, x**3-x+1)
C3 = HyperellipticCurve(R([0,1,3,5,7,6,4,1]), R([1]))

def raw_pairs(value):
    return [[str(pair[0]), str(pair[1])] for pair in value["values"][0]["raw_derivatives"]]

def relative_error(left, right):
    answer = mp.mpf("0")
    for left_pair, right_pair in zip(left, right):
        left_value = mp.mpc(left_pair[0], left_pair[1])
        right_value = mp.mpc(right_pair[0], right_pair[1])
        answer = max(answer, abs(left_value-right_value)/max(1,abs(right_value)))
    return answer

clear_central_weight_cache()
prefix2 = GlobalCoefficientPrefix(C2)
prefix2.through(5000)
universal2_started = time.monotonic()
universal2 = native_central_weight_values(C2, ${precisionBits}, prefix2, 4)
universal2_cold_ms = 1000*(time.monotonic()-universal2_started)
universal2_warm_started = time.monotonic()
universal2_warm = native_central_weight_values(C2, ${precisionBits}, prefix2, 4)
universal2_warm_ms = 1000*(time.monotonic()-universal2_warm_started)
direct2_started = time.monotonic()
direct2 = native_central_weight_values(C2, ${precisionBits}, prefix2, 4, coefficient_workers=1, use_universal_table=False)
direct2_ms = 1000*(time.monotonic()-direct2_started)
direct2_bounded4_started = time.monotonic()
direct2_bounded4 = native_central_weight_values(C2, ${precisionBits}, prefix2, 4, coefficient_workers=4, use_universal_table=False)
direct2_bounded4_ms = 1000*(time.monotonic()-direct2_bounded4_started)
assert universal2 is not None and direct2 is not None
assert universal2_warm is not None and direct2_bounded4 is not None
prefix3 = GlobalCoefficientPrefix(C3)
prefix3.through(1000)
universal3 = native_central_weight_values(C3, 16, prefix3, 4)
direct3 = native_central_weight_values(C3, 16, prefix3, 4, coefficient_workers=1, use_universal_table=False)
assert universal3 is not None and direct3 is not None

direct_evidence = []
for genus, precision, universal, direct, tolerance in [
    (2, ${precisionBits}, universal2, direct2, mp.mpf(2)**-32),
    (3, 16, universal3, direct3, mp.mpf(2)**-20),
]:
    universal_pairs = raw_pairs(universal)
    direct_pairs = raw_pairs(direct)
    error = relative_error(universal_pairs, direct_pairs)
    direct_evidence.append({
        "genus": genus,
        "precision_bits": precision,
        "orders": [0,1,2,3,4],
        "universal_algorithm": universal["algorithm"],
        "direct_algorithm": direct["algorithm"],
        "universal_raw_derivatives": universal_pairs,
        "direct_raw_derivatives": direct_pairs,
        "maximum_scaled_difference": str(error),
        "tolerance": str(tolerance),
        "universal_refinement_stable": bool(universal["refinement_stable"]),
        "direct_refinement_stable": bool(direct["refinement_stable"]),
        "arithmetic_balls_rigorous": bool(universal["arithmetic_balls_rigorous"] and direct["arithmetic_balls_rigorous"]),
        "universal_cutoff": int(universal["cutoff"]),
        "direct_cutoff": int(direct["cutoff"]),
        "passed": bool(error <= tolerance and universal["refinement_stable"] and direct["refinement_stable"]),
    })

discriminants = list(fundamental_discriminants(-11,13))
base_prefix = GlobalCoefficientPrefix(C2)
coefficient_cutoff = 257
base_values = base_prefix.through(coefficient_cutoff)
coefficient_rows = []
exact_coefficients = True
for discriminant in discriminants:
    twist_values = _QuadraticTwistCoefficientPrefix(base_prefix, discriminant).through(coefficient_cutoff)
    exact_coefficients = exact_coefficients and all(
        int(twist_values[index]) == int(base_values[index])*_quadratic_character(discriminant,index)
        for index in range(1,coefficient_cutoff+1)
    )
    coefficient_rows.append({
        "discriminant": discriminant,
        "values": [str(value) for value in twist_values[1:]],
        "sha256": hashlib.sha256(json.dumps(
            [str(value) for value in twist_values[1:]],
            separators=(",",":"),
        ).encode("utf-8")).hexdigest(),
    })
coefficient_serialized = json.dumps(coefficient_rows,sort_keys=True,separators=(",",":"))
coefficient_digest = hashlib.sha256(coefficient_serialized.encode("utf-8")).hexdigest()

family_arguments = {
    "prec": 16,
    "max_order": 0,
    "algorithm": "native",
    "mode": "candidates",
    "backend": "cpu",
    "candidate_threshold": 1000000,
    "cache_dir": ${JSON.stringify(coefficientCache)},
}
sequential_family = C2.quadratic_twists(-11,13,workers=1,**family_arguments)
sequential = list(sequential_family)
parallel_family = C2.quadratic_twists(-11,13,workers=2,tile_size=2,**family_arguments)
parallel = list(parallel_family)

def row_payload(records):
    return [{
        "discriminant": int(record.discriminant),
        "status": record.status,
        "conductor": None if record.conductor is None else int(record.conductor),
        "root_number": None if record.root_number is None else int(record.root_number),
        "central_derivatives": [[str(value.real()),str(value.imag())] for value in record.central_derivatives],
        "algorithm": record.algorithm,
        "refinement_stable": bool(record.refinement_stable),
        "arithmetic_balls_rigorous": bool(record.arithmetic_balls_rigorous),
        "candidate": bool(record.screening.get("candidate",False)),
        "screening_backend": record.screening.get("backend"),
        "cpu_engine": record.screening.get("cpu_engine"),
    } for record in records]

def mathematical_signature(records):
    return [(
        int(record.discriminant),
        record.status,
        None if record.conductor is None else int(record.conductor),
        None if record.root_number is None else int(record.root_number),
        tuple((str(value.real()),str(value.imag())) for value in record.central_derivatives),
    ) for record in records]

parallel_rows = row_payload(parallel)
base_conductor = int(C2.conductor())
base_root_number = int(C2.root_number())
for row in parallel_rows:
    row["expected_conductor"] = base_conductor*abs(row["discriminant"])**4
    row["expected_root_number"] = base_root_number*_quadratic_character(
        row["discriminant"],base_conductor
    )
exact_signs = all(
    row["root_number"] == row["expected_root_number"]
    for row in parallel_rows if row["status"] == "ok"
)
candidate_rows = [row for row in parallel_rows if row["candidate"]]
numerical_candidate_rows = [
    row for row in candidate_rows
    if row["algorithm"] != "functional-equation-parity"
]
all_candidates_cpu_refined = all(
    row["screening_backend"] == "cpu" and row["refinement_stable"] and row["arithmetic_balls_rigorous"]
    for row in candidate_rows
)
all_numerical_candidates_cpu_refined = all(
    row["screening_backend"] == "cpu" and row["refinement_stable"] and row["arithmetic_balls_rigorous"]
    for row in numerical_candidate_rows
)
family_info = parallel_family.diagnostics()

payload = {
    "schema": "sagejs.hyperelliptic/analytic-phase9-evidence-v1",
    "direct_arb_differentials": direct_evidence,
    "cold_table_timing": {
        "genus": 2,
        "precision_bits": ${precisionBits},
        "observations": 1,
        "cold_table_cache_miss_call_ms": universal2_cold_ms,
        "cold_table_construction_ms": 1000*float(universal2["native_stage_diagnostics"]["universal_weight_table"]["construction_wall_seconds"]),
        "warm_table_cache_hit_call_ms": universal2_warm_ms,
        "direct_one_worker_call_ms": direct2_ms,
        "direct_bounded4_call_ms": direct2_bounded4_ms,
        "cold_cache_hit": bool(universal2["native_stage_diagnostics"]["universal_weight_table"]["cache_hit"]),
        "warm_cache_hit": bool(universal2_warm["native_stage_diagnostics"]["universal_weight_table"]["cache_hit"]),
        "direct_one_worker_count": int(direct2["native_stage_diagnostics"]["coefficient_worker_count"]),
        "direct_bounded4_worker_count": int(direct2_bounded4["native_stage_diagnostics"]["coefficient_worker_count"]),
        "contract": "one explicitly cleared process-local table cache; exact coefficients prewarmed; public Python result materialization included in call timings",
    },
    "family_scan": {
        "interval": [-11,13],
        "precision_bits": 16,
        "maximum_derivative": 0,
        "mode": "candidates",
        "candidate_threshold": "1000000",
        "base_conductor": base_conductor,
        "base_root_number": base_root_number,
        "coefficient_cutoff": coefficient_cutoff,
        "coefficient_digest_sha256": coefficient_digest,
        "coefficient_digest_contract": "canonical JSON of every exact a_n*chi_D(n), 1<=n<=257, ordered by fundamental discriminant",
        "exact_coefficients": bool(exact_coefficients),
        "exact_signs": bool(exact_signs),
        "sequential_parallel_equal": mathematical_signature(sequential) == mathematical_signature(parallel),
        "records": len(parallel_rows),
        "candidate_count": len(candidate_rows),
        "numerical_candidate_count": len(numerical_candidate_rows),
        "exact_parity_candidate_count": len(candidate_rows)-len(numerical_candidate_rows),
        "all_status_ok": all(row["status"] == "ok" for row in parallel_rows),
        "all_candidates_cpu_refined": bool(all_candidates_cpu_refined),
        "all_numerical_candidates_cpu_refined": bool(all_numerical_candidates_cpu_refined),
        "rows": parallel_rows,
        "parallel_engine": family_info["engine"],
        "workers": int(family_info["workers"]),
        "tile_size": int(family_info["tile_size"]),
        "coefficient_cache_hits": int(family_info["cache"].get("hits",0)),
        "coefficient_cache_entries": int(family_info["cache"].get("entries",0)),
        "coefficient_rows": [{
            "discriminant": row["discriminant"],
            "sha256": row["sha256"],
        } for row in coefficient_rows],
    },
}
print("PHASE9_EVIDENCE|"+json.dumps(payload,sort_keys=True,separators=(",",":")))
True
`,
      { timeout: Math.floor(timeoutMs) },
    );
    if (result.repr !== "True") {
      throw new Error(`evidence session returned ${result.repr}`);
    }
    const line = result.stdout
      .split(/\r?\n/u)
      .find((value) => value.startsWith("PHASE9_EVIDENCE|"));
    if (line === undefined) throw new Error("evidence session emitted no payload");
    const payload = JSON.parse(line.slice("PHASE9_EVIDENCE|".length));
    payload.wall_ms = Number((performance.now() - started).toFixed(3));
    return payload;
  } finally {
    await session.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  const precisionBits = Number(option("precision", "64"));
  const payload = await collectEvidence({ precisionBits });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { collectEvidence };
