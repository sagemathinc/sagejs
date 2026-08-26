#!/usr/bin/env node
"use strict";

const { arch, platform } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const executable = process.env.SAGEJS_BENCH_EXECUTABLE || join(root, "bin", "sagejs");
const check = process.argv.includes("--check");
const repetitions = check ? 8 : 64;
const samples = check ? 3 : 7;

const source = String.raw`
import json
import time
import sagejs.number_fields.cubic_class_number as cubic

coefficients = (170, 5745, 18000, 1585, 2345, 5115, 25215, 11100, 36900, 15075)
modulus = 19
positive_target = 5
negative_target = 14

def measure(force_readable):
    timings = []
    saved = cubic._cubic_norm_form_kernel_override
    if force_readable:
        cubic._cubic_norm_form_kernel_override = False
    for _sample in range(${samples}):
        started = time.perf_counter_ns()
        represented = None
        for _repetition in range(${repetitions}):
            represented = cubic._cubic_norm_form_represents_targets(
                coefficients,
                modulus,
                positive_target,
                negative_target,
                cancelled=None,
            )
        timings.append((time.perf_counter_ns() - started) / 1_000_000)
        assert represented is False
    cubic._cubic_norm_form_kernel_override = saved
    timings.sort()
    return {"samples_ms": timings, "median_ms": timings[len(timings) // 2]}

packed = measure(False)
readable = measure(True)
print(json.dumps({
    "schema": "sagejs.number-fields/cubic-norm-obstruction-benchmark-v1",
    "modulus": modulus,
    "residue_states_per_repetition": modulus**3,
    "repetitions": ${repetitions},
    "packed": packed,
    "readable": readable,
    "speedup": readable["median_ms"] / packed["median_ms"],
}, separators=(",", ":")))
`;

const result = spawnSync(executable, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
const report = {
  ...JSON.parse(result.stdout.trim()),
  host: { platform: platform(), arch: arch() },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!(report.speedup > 2)) {
  throw new Error(`packed cubic norm search did not improve the readable path: ${report.speedup}`);
}
