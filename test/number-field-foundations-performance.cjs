"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");

test(
  "number-field performance workloads reject wrong answers before timings",
  { timeout: 120_000 },
  () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "bench/number-field-foundations/measurements.json")),
    );
    assert.ok(
      manifest.workloads.every(
        (workload) => /^[0-9a-f]{64}$/.test(workload.expectedResultSha256),
      ),
    );
    const selected = [
      "prime-stream-cubic-mixed-250",
      "coefficients-cubic-mixed-1000",
    ];
    const executed = spawnSync(
      process.execPath,
      [
        "bench/number-field-foundations/run.cjs",
        "--allow-dirty",
        "--systems",
        "sagejs",
        "--samples",
        "1",
        "--warmups",
        "0",
        "--workloads",
        selected.join(","),
      ],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
    const report = JSON.parse(executed.stdout);
    assert.deepEqual(
      report.records.map((record) => record.workload),
      selected,
    );
    for (const record of report.records) {
      const workload = manifest.workloads.find((item) => item.id === record.workload);
      assert.equal(record.status, "ok");
      assert.equal(record.result_sha256, workload.expectedResultSha256);
      assert.ok(record.median_ms < 5_000, "catastrophic compact-stream regression");
    }
  },
);

test("compact streams materialize ideals only at index-dividing primes", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
import sagejs.number_fields.prime_ideals as prime_ideals
R = PolynomialRing(QQ, "x")
x = R.gen()
original = prime_ideals.factor_rational_prime
calls = []
def counted(order, prime, **options):
    calls.append(int(prime))
    return original(order, prime, **options)
prime_ideals.factor_rational_prime = counted
try:
    ordinary = NumberField(x**3 - x - 1, "a")
    ordinary_rows = list(ordinary.maximal_order().splitting_records(2, 64))
    ordinary_calls = list(calls)
    calls = []
    index_field = NumberField(x**3 - x**2 - 2*x - 8, "b")
    index_rows = list(index_field.maximal_order().splitting_records(2, 8))
    index_calls = list(calls)
finally:
    prime_ideals.factor_rational_prime = original
[
    len(ordinary_rows), ordinary_calls,
    [row["prime"] for row in index_rows], index_calls,
]
`);
    assert.equal(result.repr, "[18, [], [2, 3, 5, 7], [2]]");
  } finally {
    await session.close();
  }
});

test(
  "Magma compact-stream adapter agrees with the reviewed digest",
  { skip: !existsSync("/home/user/bin/magma"), timeout: 60_000 },
  () => {
    const executed = spawnSync(
      process.execPath,
      [
        "bench/number-field-foundations/run.cjs",
        "--allow-dirty",
        "--systems",
        "magma",
        "--samples",
        "1",
        "--warmups",
        "0",
        "--workloads",
        "prime-stream-cubic-mixed-250",
      ],
      { cwd: root, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
    const report = JSON.parse(executed.stdout);
    assert.equal(report.records[0].status, "ok");
    assert.equal(
      report.records[0].result_sha256,
      "ac9e9e4910bdde80734cc9cf602dfa608aa78d116d90e6d8292f160d66a9a776",
    );
  },
);

test(
  "Oscar/Hecke compact-stream adapter agrees with the reviewed digest",
  {
    skip:
      process.env.SAGEJS_HECKE_BENCH !== "1" ||
      !existsSync("/home/user/.juliaup/bin/julia") ||
      !existsSync(
        "/home/user/.local/share/sagejs-benchmarks/number-fields-julia/Project.toml",
      ),
    timeout: 120_000,
  },
  () => {
    const executed = spawnSync(
      process.execPath,
      [
        "bench/number-field-foundations/run.cjs",
        "--allow-dirty",
        "--systems",
        "hecke",
        "--samples",
        "1",
        "--warmups",
        "0",
        "--workloads",
        "prime-stream-cubic-mixed-250",
      ],
      { cwd: root, encoding: "utf8", timeout: 120_000 },
    );
    assert.equal(executed.status, 0, `${executed.stdout}\n${executed.stderr}`);
    const report = JSON.parse(executed.stdout);
    assert.equal(report.records[0].status, "ok");
    assert.equal(
      report.records[0].result_sha256,
      "ac9e9e4910bdde80734cc9cf602dfa608aa78d116d90e6d8292f160d66a9a776",
    );
  },
);
