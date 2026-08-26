#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");

function runSage(source, environment = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-boundary-"));
  try {
    const script = join(directory, "check.py");
    writeFileSync(script, source);
    const result = spawnSync(process.execPath, [join(root, "bin", "sagejs"), script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_FORBID_MATRIX_NAPI: "1",
        ...environment,
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const correctness = String.raw`
def expect_failure(function, exception):
    try:
        function()
        raise AssertionError("operation unexpectedly succeeded")
    except exception:
        pass


for prime in [2, 97, 65521, 4294967291]:
    field = GF(prime)
    source = matrix(field, 3, 5, [
        0, 1, 2, 3, 4,
        0, 0, 0, 6, 7,
        0, 0, 0, 0, 0,
    ])
    expected = [1, 4] if prime == 2 else [1, 3]
    first = source.pivots()
    assert list(first) == expected
    assert source.pivots() is first
    reduced = source.rref()
    if prime == 2:
        reduced._packed_residues = lambda width: 1 / 0
        reduced._prime_residues = lambda: 1 / 0
    assert list(reduced.pivots()) == expected
    assert reduced.pivots() is reduced.pivots()

    # Canonical field elements take the scalar mutation path directly.
    source[0, 0] = field(prime - 1)
    assert source[0, 0] == field(prime - 1)
    assert source.pivots() is not first
    cached = source.pivots()
    expect_failure(lambda: source.__setitem__((0, 0), object()), TypeError)
    assert source.pivots() is cached

    values = source.list()
    assert source[0, 0] is values[0]
    source[-1, -1] = -1
    assert source[-1, -1] == field(-1)
    assert source.list() is not values

    for index in [(-4, 0), (3, 0), (0, -6), (0, 5)]:
        expect_failure(lambda index=index: source[index[0], index[1]], IndexError)
        expect_failure(
            lambda index=index: source.__setitem__(index, 0),
            IndexError,
        )

for rows, columns in [(0, 0), (0, 7), (5, 0)]:
    for prime in [2, 97, 65521, 4294967291]:
        source = matrix(GF(prime), rows, columns, [])
        assert source.pivots() == ()
        assert source.pivots() is source.pivots()

print("dense-prime-host-boundary-ok")
`;

const compiledCorrectness = String.raw`
from sagejs.kernels.matrix.dense_word_prime_flint import flint_word_prime_matrix_pivots
from sagejs.native import is_compiled

assert is_compiled(flint_word_prime_matrix_pivots)
assert flint_word_prime_matrix_pivots.nativeAvailable
` + correctness;

const dynamicCorrectness = String.raw`
from sagejs.kernels.matrix.dense_word_prime_flint import flint_word_prime_matrix_pivots

assert not flint_word_prime_matrix_pivots.nativeAvailable
` + correctness;

assert.equal(
  runSage(compiledCorrectness),
  "dense-prime-host-boundary-ok",
);
assert.equal(
  runSage(dynamicCorrectness, { SAGEJS_NATIVE_DISABLE: "1" }),
  "dense-prime-host-boundary-ok",
);

const performance = String.raw`
from time import perf_counter


def minimum_time(function, repetitions=5):
    answer = 10**100
    for _repeat in range(repetitions):
        start = perf_counter()
        function()
        answer = min(answer, perf_counter() - start)
    return answer


def measurements(prime):
    field = GF(prime)
    set_random_seed(20260812 + prime)
    source = random_matrix(field, 200, 240)
    source[17, 31]
    reads = 2000

    def read_entries():
        value = source[0, 0]
        for index in range(reads):
            value = source[index % 200, (index * 37) % 240]
        return value

    read_seconds = minimum_time(read_entries, 3) / reads
    writes = 500

    def write_entries():
        for index in range(writes):
            source[index % 200, (index * 37) % 240] = field(index)

    write_seconds = minimum_time(write_entries, 3) / writes
    source.rref()
    source.pivots()
    cached_pivots = minimum_time(lambda: source.pivots(), 20)

    entries = source.list()
    rref_seconds = minimum_time(
        lambda: matrix(field, 200, 240, entries).rref(), 3
    )
    pivot_seconds = minimum_time(
        lambda: matrix(field, 200, 240, entries).pivots(), 3
    )
    fresh_rref_source = matrix(field, 200, 240, entries)
    fresh_pivot_source = matrix(field, 200, 240, entries)
    assert fresh_pivot_source.pivots() == fresh_rref_source.pivots()
    return read_seconds, write_seconds, cached_pivots, rref_seconds, pivot_seconds


for prime in [2, 97, 65521]:
    values = measurements(prime)
    print(prime, values[0], values[1], values[2], values[3], values[4])
`;

const lines = runSage(performance).split("\n");
assert.equal(lines.length, 3);
for (const line of lines) {
  const [prime, read, write, cached, rref, pivots] =
    line.split(/\s+/).map(Number);
  // These are regression ceilings, deliberately above the uncontended
  // benchmark medians. The benchmark records the sharper optimization
  // targets without making shared CI load a source of false failures.
  const readLimit = process.platform === "win32"
    ? 100e-6
    : prime === 2
      ? 25e-6
      : prime === 97
        ? 20e-6
        : 25e-6;
  const writeLimit = process.platform === "win32"
    ? 150e-6
    : prime === 2
      ? 50e-6
      : 40e-6;
  assert.ok(read < readLimit, `GF(${prime}) scalar read took ${read}s`);
  assert.ok(write < writeLimit, `GF(${prime}) scalar write took ${write}s`);
  // The identity check above proves that this is the cached O(1) accessor.
  // Keep a generous microsecond-scale ceiling: sub-10us measurements are too
  // sensitive to Windows timer and process-scheduling noise for a release gate.
  const cachedLimit = process.platform === "win32" ? 50e-6 : 25e-6;
  assert.ok(cached < cachedLimit, `GF(${prime}) cached pivots took ${cached}s`);
  // Fresh-pivot and RREF timings are two separate short measurements.  A
  // shared release runner can deschedule either one independently (Linux has
  // exhibited a 1.45x inversion even though isolated reruns were healthy).
  // This remains a catastrophic-regression guard; the dedicated matrix
  // performance suite owns sharper budgets on controlled measurements.
  const freshPivotFactor = 2;
  assert.ok(
    pivots < rref * freshPivotFactor + 0.005,
    `GF(${prime}) fresh pivots ${pivots}s versus RREF ${rref}s`,
  );
}

console.log("dense prime host-boundary tests passed");
