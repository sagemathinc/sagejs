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
for degree in (4, 8, 16):
    polynomial = tuple([-(2 ** (degree + 1))] + [0] * (degree - 1) + [1])
    expected_index = degree * (degree - 1) // 2
    def run_once():
        result = regular_local_basis(
            polynomial,
            2,
            local_discriminant_valuation=(2 * degree + degree * (degree.bit_length() - 1)),
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
  schema_version: 1,
  workload: "certified first-order p-regular OM quotient basis plus independent closure",
  implementations: [
    measure("cpython", "python3", ["-"]),
    measure("sagejs-dynamic", process.execPath, [join(root, "bin/sagejs"), "--python"]),
  ],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
