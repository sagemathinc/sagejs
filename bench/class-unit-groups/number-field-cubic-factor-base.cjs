#!/usr/bin/env node
"use strict";

const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../..");
const executionRoot = resolve(process.env.SAGEJS_BENCH_ROOT || root);
const fixturePath = join(
  root,
  "test/fixtures/number-field-lmfdb-cubic-class-numbers.json",
);

function samplesFrom(argv) {
  const position = argv.indexOf("--samples");
  const samples = position < 0 ? 7 : Number(argv[position + 1]);
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error("--samples must be a positive integer");
  }
  return samples;
}

function benchmarkSource(records, samples) {
  return String.raw`
import hashlib
import json
import time
import sagejs.number_fields.class_group_factor_base as factor_bases
import sagejs.number_fields.cubic_class_number as cubic

records = json.loads(${JSON.stringify(JSON.stringify(records))})
samples = ${samples}

def median(values):
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2

def field_from(record, name):
    R = PolynomialRing(QQ, "x")
    x = R.gen()
    polynomial = R(0)
    for exponent in range(len(record["coefficients"])):
        polynomial += int(record["coefficients"][exponent]) * x**exponent
    return NumberField(polynomial, name)

# Exclude source, native-kernel, and public-routing initialization.
warm_record = records[4]
warm = field_from(warm_record, "warm_factor")
warm_order = warm.maximal_order()
warm_plan = factor_bases.factor_base_plan(
    warm_order, proof=True, theorem="minkowski"
)
cubic.packed_cubic_factor_records(warm_plan)
warm_public = field_from(warm_record, "warm_public")
warm_public.maximal_order()
warm_public.class_number(proof=False)

results = []
for case_index, record in enumerate(records):
    factor_seconds = []
    public_seconds = []
    payload_hashes = []
    answer = None
    bound = None
    factor_base_size = None
    for sample in range(samples):
        field = field_from(record, "f" + str(case_index) + "_" + str(sample))
        order = field.maximal_order()
        started = time.perf_counter()
        plan = factor_bases.factor_base_plan(
            order, proof=True, theorem="minkowski"
        )
        packed = cubic.packed_cubic_factor_records(plan)
        factor_seconds.append(time.perf_counter() - started)
        payload = [item.to_dict() for item in packed]
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        payload_hashes.append(hashlib.sha256(encoded.encode("utf-8")).hexdigest())
        bound = int(plan.bound)
        factor_base_size = len(packed)

        if int(record["class_number"]) in (1, 3):
            public = field_from(
                record, "p" + str(case_index) + "_" + str(sample)
            )
            public.maximal_order()
            public_started = time.perf_counter()
            answer = int(public.class_number(proof=False))
            public_seconds.append(time.perf_counter() - public_started)
    assert answer is None or answer == int(record["class_number"])
    assert len(set(payload_hashes)) == 1
    results.append({
        "label": record["label"],
        "class_number": int(record["class_number"]),
        "bound": bound,
        "factor_base_size": factor_base_size,
        "factor_base_median_seconds": median(factor_seconds),
        "public_median_seconds": (
            None if not public_seconds else median(public_seconds)
        ),
        "payload_sha256": payload_hashes[0],
    })
print("CUBIC_FACTOR_BASE_BENCHMARK|" + json.dumps({
    "samples": samples,
    "records": results,
}, sort_keys=True, separators=(",", ":")))
`;
}

function main(argv = process.argv.slice(2)) {
  const samples = samplesFrom(argv);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  const directory = mkdtempSync(join(tmpdir(), "sagejs-cubic-factor-base-"));
  try {
    const sourcePath = join(directory, "benchmark.py");
    writeFileSync(sourcePath, benchmarkSource(fixture.records, samples));
    const run = spawnSync(
      process.execPath,
      [join(executionRoot, "bin/sagejs-source.cjs"), "--python", sourcePath],
      {
        cwd: executionRoot,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        timeout: 300_000,
      },
    );
    if (run.status !== 0) {
      throw new Error(run.stderr || run.stdout || `benchmark exited ${run.status}`);
    }
    const line = run.stdout
      .split(/\r?\n/)
      .find((entry) => entry.startsWith("CUBIC_FACTOR_BASE_BENCHMARK|"));
    if (!line) throw new Error("benchmark emitted no receipt");
    const receipt = JSON.parse(line.slice("CUBIC_FACTOR_BASE_BENCHMARK|".length));
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (require.main === module) main();

module.exports = { benchmarkSource, main, samplesFrom };
