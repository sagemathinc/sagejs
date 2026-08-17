#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const samples = Math.max(1, Number(process.env.SAGEJS_OM_MAXMIN_SAMPLES || 7));
const iterations = Math.max(
  1,
  Number(process.env.SAGEJS_OM_MAXMIN_ITERATIONS || 10),
);

const script = String.raw`
import json
import sys
import time
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis

samples = ${samples}
iterations = ${iterations}
rows = []
cases = (
    ("linear-regular-d8", tuple([-512] + [0] * 7 + [1]), 8, 28, 87),
    ("representative-refined-d8", tuple([-768] + [0] * 7 + [1]), 8, 28, 80),
    (
        "residual-f4-d6",
        (5, 3, 6, 7, 6, 3, 1),
        6,
        2,
        8,
    ),
    (
        "two-branch-maxmin-d4",
        (72, 16, -15, -2, 1),
        4,
        2,
        10,
    ),
    (
        "degree-raising-higher-d4",
        (4, 4, 0, 0, 1),
        4,
        2,
        8,
    ),
    (
        "degree-raising-deep-index-d8",
        tuple([16, 16] + [0] * 6 + [1]),
        8,
        12,
        32,
    ),
    (
        "representative-refined-d16",
        tuple([-(3 * 2 ** 16)] + [0] * 15 + [1]),
        16,
        120,
        304,
    ),
)
for name, polynomial, degree, expected_index, discriminant_valuation in cases:
    def run_once():
        result = regular_local_basis(
            polynomial,
            2,
            local_discriminant_valuation=discriminant_valuation,
        )
        if result.status != "complete" or result.certificate is None:
            raise RuntimeError(result.reason)
        if result.certificate.local_index_valuation != expected_index:
            raise ArithmeticError("unexpected local index")
        if not result.certificate.validation.valid:
            raise ArithmeticError("basis validation failed")
        return result.type_tree.certificate_id
    run_once()
    timings = []
    digest = ""
    for _sample in range(samples):
        started = time.perf_counter()
        for _iteration in range(iterations):
            digest = run_once()
        timings.append((time.perf_counter() - started) * 1000 / iterations)
    timings.sort()
    rows.append({
        "name": name,
        "degree": degree,
        "index_valuation": expected_index,
        "median_ms": timings[len(timings) // 2],
        "minimum_ms": timings[0],
        "maximum_ms": timings[-1],
        "certificate_id": digest,
    })
print(json.dumps({"samples": samples, "iterations": iterations, "rows": rows}, sort_keys=True))
`;

function measure(label, command, args) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: script,
    maxBuffer: 16 * 1024 * 1024,
  });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return {
    label,
    cold_process_wall_ms: wallMs,
    ...JSON.parse(result.stdout.trim().split("\n").at(-1)),
  };
}

const report = {
  schema_version: 2,
  workload:
    "certified first- and second-order OM quotient bases plus independent closure",
  implementations: [
    measure("cpython", "python3", ["-"]),
    measure("sagejs-dynamic", process.execPath, [join(root, "bin/sagejs"), "--python"]),
  ],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
