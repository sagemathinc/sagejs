#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const profile = process.env.SAGEJS_OM_MAXMIN_PROFILE || "standard";
if (!new Set(["standard", "scalable", "v429-p7"]).has(profile)) {
  throw new Error(`unknown SAGEJS_OM_MAXMIN_PROFILE: ${profile}`);
}
const stress = profile !== "standard";
const samples = Math.max(
  1,
  Number(process.env.SAGEJS_OM_MAXMIN_SAMPLES || (stress ? 1 : 7)),
);
const iterations = Math.max(
  1,
  Number(process.env.SAGEJS_OM_MAXMIN_ITERATIONS || (stress ? 1 : 10)),
);
const v429Polynomial =
  profile === "v429-p7"
    ? JSON.parse(
        readFileSync(
          join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
          "utf8",
        ),
      ).cases.find((item) => item.id === "pari-round4-vector-429").polynomial
        .coefficients
    : [];

const script = String.raw`
import json
import sys
import time
sys.path.append("${join(root, "src/lib")}")
from sagejs.number_fields.om_maxmin import regular_local_basis

samples = ${samples}
iterations = ${iterations}
rows = []
profile = "${profile}"

def bad_generator_polynomial(degree, coefficient):
    previous = [2]
    current = [-1]
    for _index in range(2, degree + 1):
        following = [0] * max(len(current), len(previous) + 1)
        for index in range(len(current)):
            following[index] -= current[index]
        for index in range(len(previous)):
            following[index + 1] += coefficient * previous[index]
        previous, current = current, following
    answer = [-2 * value for value in current]
    answer[0] += 4 * coefficient ** degree
    answer.extend([0] * (degree + 1 - len(answer)))
    answer[degree] += 1
    return tuple(answer)

standard_cases = (
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
        "gmn-multiple-higher-sides-d12",
        (832, -256, -288, 256, -80, 128, 80, 32, 60, 0, 14, 0, 1),
        12,
        39,
        97,
    ),
    (
        "gmn-translated-generator-d12",
        (779, 1592, 5528, 9196, 10515, 8960, 5848, 2984, 1185, 360, 80, 12, 1),
        12,
        39,
        97,
    ),
    (
        "representative-refined-d16",
        tuple([-(3 * 2 ** 16)] + [0] * 15 + [1]),
        16,
        120,
        304,
    ),
)
if profile == "scalable":
    cases = (
        ("bad-generator-d32-c1009-p2", bad_generator_polynomial(32, 1009), 32, 0, 191, 2),
        ("bad-generator-d48-c1009-p2", bad_generator_polynomial(48, 1009), 48, 0, 239, 2),
        ("bad-generator-d32-k32-p2", bad_generator_polynomial(32, 2 ** 32), 32, 0, 191, 2),
        ("bad-generator-d32-k128-p2", bad_generator_polynomial(32, 2 ** 128), 32, 0, 191, 2),
    )
elif profile == "v429-p7":
    cases = (("pari-round4-vector-429-p7", tuple(int(value) for value in ${JSON.stringify(v429Polynomial)}), 64, 480, 1008, 7),)
else:
    cases = tuple(item + (2,) for item in standard_cases)

for name, polynomial, degree, expected_index, discriminant_valuation, prime in cases:
    def run_once():
        result = regular_local_basis(
            polynomial,
            prime,
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
        "prime": prime,
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
    timeout: Number(process.env.SAGEJS_OM_MAXMIN_TIMEOUT_MS || 60000),
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
  schema_version: 3,
  profile,
  workload:
    "certified first- and second-order OM quotient bases plus independent closure",
  comparison_scope:
    profile === "scalable"
      ? "OM rows are p=2 local components; direct PARI nfbasis and Hecke maximal_order timings are full-global and are not crossover-equivalent"
      : "same exact local OM type, MaxMin, and independent lattice certificate",
  implementations: [
    measure("cpython", "python3", ["-"]),
    measure("sagejs-dynamic", process.execPath, [join(root, "bin/sagejs"), "--python"]),
  ],
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
