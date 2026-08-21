#!/usr/bin/env node
"use strict";

const { arch, cpus, platform } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const executable =
  process.env.SAGEJS_BENCH_EXECUTABLE || join(root, "bin", "sagejs");
const check = process.argv.includes("--check");

const source = String.raw`
import json
import time

from sagejs.number_fields.class_group_factor_base import (
    bdf_bound,
    build_factor_base,
    factor_base_plan,
)

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**3 - x**2 - 6*x - 12
samples = []
build_seconds = None
digest = None
for index in range(6):
    field = NumberField(polynomial, "a" + str(index))
    order = field.maximal_order()
    started = time.perf_counter_ns()
    bound = bdf_bound(order, max_bound=10000)
    elapsed = (time.perf_counter_ns() - started) / 1000000000
    samples.append(elapsed)
    if index == 0:
        plan = factor_base_plan(
            order,
            proof=False,
            theorem="bdf",
            max_bound=10000,
        )
        started = time.perf_counter_ns()
        records = build_factor_base(plan)
        build_seconds = (time.perf_counter_ns() - started) / 1000000000
        margin = bound.interval.to_dyadic_dict(64)
        digest = {
            "discriminant": int(order.discriminant()),
            "bound": bound.bound,
            "precision_bits": bound.precision_bits,
            "margin_64": {
                "scale_bits": margin["scale_bits"],
                "lower_numerator": str(margin["lower_numerator"]),
                "upper_numerator": str(margin["upper_numerator"]),
            },
            "factor_base": [
                [
                    record.rational_prime,
                    record.norm,
                    record.ramification_index,
                    record.residue_degree,
                ]
                for record in records
            ],
        }

warm = sorted(samples[1:])
print(json.dumps({
    "cold_bdf_seconds": samples[0],
    "warm_fresh_field_bdf_median_seconds": warm[len(warm) // 2],
    "warm_fresh_field_bdf_samples_seconds": samples[1:],
    "factor_base_build_seconds": build_seconds,
    "digest": digest,
}, separators=(",", ":")))
`;

const result = spawnSync(executable, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
  maxBuffer: 10 * 1024 * 1024,
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const measured = JSON.parse(result.stdout.trim());
const report = {
  schema: "sagejs.number-fields/factor-base-dyadic-benchmark-v1",
  workload:
    "exact BDF bound and factor-base construction for x^3-x^2-6*x-12, excluding field and maximal-order construction",
  baseline: {
    commit: "01f0bdcc7973e07d000d560674f4ee55dc00627a",
    cold_bdf_seconds: 2.31,
    warm_fresh_field_bdf_seconds: 1.59,
  },
  sample_policy:
    "one cold primitive-cache sample followed by five fresh-field samples in one Sage.js process",
  host: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  measured,
};
console.log(JSON.stringify(report, null, 2));

if (check) {
  const digest = measured.digest;
  const expectedMargin = {
    scale_bits: 64,
    lower_numerator: "12923988274345410010",
    upper_numerator: "12923988274345410011",
  };
  if (
    digest.discriminant !== -1083 ||
    digest.bound !== 9 ||
    digest.precision_bits !== 64 ||
    JSON.stringify(digest.margin_64) !== JSON.stringify(expectedMargin) ||
    JSON.stringify(digest.factor_base) !==
      JSON.stringify([
        [2, 2, 1, 1],
        [3, 3, 1, 1],
        [3, 3, 2, 1],
        [2, 4, 1, 2],
        [5, 5, 1, 1],
      ])
  ) {
    throw new Error("the exact BDF/factor-base digest changed");
  }
  if (measured.cold_bdf_seconds >= 1.75) {
    throw new Error("cold exact BDF selection exceeds 1.75 seconds");
  }
  if (measured.warm_fresh_field_bdf_median_seconds >= 0.9) {
    throw new Error("warm fresh-field exact BDF selection exceeds 0.9 seconds");
  }
}
