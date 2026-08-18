#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const polynomial = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
).polynomial.coefficients;
const samples = Math.max(1, Number(process.env.SAGEJS_OM_P2_SAMPLES || 3));

const script = String.raw`
import json
import sys
import time
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis

polynomial = tuple(int(value) for value in ${JSON.stringify(polynomial)})
samples = ${samples}
timings = []
result = None
for _sample in range(samples):
    started = time.perf_counter()
    result = regular_local_basis(
        polynomial,
        2,
        local_discriminant_valuation=792,
        differential_evidence=True,
    )
    timings.append((time.perf_counter() - started) * 1000)
    if result.status != "complete" or result.certificate is None:
        raise RuntimeError(result.reason)
    if not result.certificate.validation.valid:
        raise ArithmeticError(result.certificate.validation.failures)
timings.sort()
print(json.dumps({
    "samples": samples,
    "minimum_ms": timings[0],
    "median_ms": timings[len(timings) // 2],
    "maximum_ms": timings[-1],
    "certificate_id": result.type_tree.certificate_id,
    "index_valuation": result.certificate.local_index_valuation,
    "selection_kind": result.certificate.maxmin.selection_kind,
    "region": result.selector.measured_crossover_region,
    "auto_selectable": result.selector.auto_selectable,
}))
`;

function measure(label, command, args, timeout) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: script,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stdout + result.stderr);
  }
  return {
    label,
    cold_process_wall_ms: Number(process.hrtime.bigint() - started) / 1e6,
    ...JSON.parse(result.stdout.trim().split("\n").at(-1)),
  };
}

const report = {
  schema_version: 1,
  workload: "complete certified vector429 p=2 OM local basis",
  comparison: {
    label: "native-round2-same-local-input",
    milliseconds: 6_129,
    provenance:
      "integrated sparse Round-2 calibration at integration commit 285c223d",
  },
  implementations: [
    measure("cpython", "python3", ["-"], 30_000),
    measure(
      "sagejs-native",
      process.execPath,
      [join(root, "bin/sagejs"), "--python"],
      Math.max(30_000, samples * 20_000),
    ),
  ],
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
