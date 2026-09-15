"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const hash = (value) => createHash("sha256").update(value).digest("hex");

function snapshot(argument) {
  return argument.map((value) => {
    if (typeof value === "bigint") return String(value);
    if (typeof value.toArray === "function") return value.toArray().map(String);
    return Array.from(value).map(String);
  });
}

(async () => {
  const catalogPath = path.resolve(
    process.argv[2] || "/tmp/sagejs-analytic-invhr-d88QqB/fixtures.json",
  );
  const catalogBytes = fs.readFileSync(catalogPath);
  const catalog = JSON.parse(catalogBytes);
  const polynomials = [
    [20034, -20018, 0, 1],
    [20018, -20010, 0, 1],
    [-20034, -20018, 0, 0, 1],
    [-2000042, -2000022, 0, 0, 1],
  ];
  const indices = [1, 3, 1, 37];
  const rows = catalog.cases.map((entry, field) => {
    const selected = entry.primes
      .map((prime, index) => ({ prime, index }))
      .filter(({ prime }, position) =>
        (field === 0 || position < 64) &&
        BigInt(indices[field]) % BigInt(prime) !== 0n,
      );
    return {
      field,
      polynomial: polynomials[field].map(String),
      index: indices[field],
      primes: selected.map(({ prime }) => prime),
      expected: selected.map(({ index }) => {
        const offset = Number(entry.offsets[index]);
        const count = Number(entry.counts[index]);
        return {
          degrees: entry.degrees.slice(offset, offset + count).map(String),
          counts: entry.multiplicities
            .slice(offset, offset + count)
            .map(String),
        };
      }),
    };
  });
  const packets = rows.map((row) => {
    const degree = row.polynomial.length - 1;
    const count = row.primes.length;
    const fill = (length) => Array(length).fill("77");
    return [
      row.polynomial,
      String(degree),
      String(row.index),
      row.primes,
      String(count),
      fill(393),
      fill(degree + 2),
      fill(degree + 2),
      fill(393),
      fill(393),
      fill(degree + 2),
      fill(degree + 2),
      fill(degree + 2),
      fill(degree + 2),
      fill(5),
      fill(count + 2),
      fill(count + 2),
      fill(count * degree + 2),
      fill(count * degree + 2),
      fill(count + 2),
      fill(count + 2),
      fill(count * degree + 2),
      fill(6),
    ];
  });

  const cp = spawnSync(
    "python3",
    [
      "-c",
      String.raw`
import importlib, json, sys
sys.path[:0] = sys.argv[1:3]
f = importlib.import_module(
    "bench.pari-class-group-port.int64_prime_degree_catalog"
).int64_pari_prime_degree_catalog
out = []
for packet in json.load(sys.stdin):
    args = [list(map(int, x)) if isinstance(x, list) else int(x) for x in packet]
    result = f(*args)
    out.append({"result": result, "args": [
        [str(v) for v in x] if isinstance(x, list) else str(x) for x in args
    ]})
print(json.dumps(out))
`,
      path.resolve(__dirname, "../.."),
      path.resolve(__dirname, "../../src/lib"),
    ],
    {
      input: JSON.stringify(packets),
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  assert.equal(cp.status, 0, cp.stderr);
  const expected = JSON.parse(cp.stdout);

  function verify(row, got, packetIndex) {
    assert.equal(got.result, 0);
    const args = got.args;
    const patternOffsets = [];
    const patternCounts = [];
    const patternDegrees = [];
    const patternMultiplicities = [];
    const fullOffsets = [];
    const fullCounts = [];
    const fullDegrees = [];
    for (const entry of row.expected) {
      patternOffsets.push(String(patternDegrees.length));
      patternCounts.push(String(entry.degrees.length));
      fullOffsets.push(String(fullDegrees.length));
      let count = 0;
      for (let index = 0; index < entry.degrees.length; index += 1) {
        patternDegrees.push(entry.degrees[index]);
        patternMultiplicities.push(entry.counts[index]);
        for (let copy = 0; copy < Number(entry.counts[index]); copy += 1) {
          fullDegrees.push(entry.degrees[index]);
          count += 1;
        }
      }
      fullCounts.push(String(count));
    }
    for (const [index, active] of [
      [15, patternOffsets],
      [16, patternCounts],
      [17, patternDegrees],
      [18, patternMultiplicities],
      [19, fullOffsets],
      [20, fullCounts],
      [21, fullDegrees],
    ]) {
      assert.deepEqual(args[index], [
        ...active,
        ...Array(packets[packetIndex][index].length - active.length).fill("77"),
      ]);
    }
    assert.deepEqual(args[22], [
      "0",
      String(row.primes.length),
      String(patternDegrees.length),
      String(fullDegrees.length),
      "77",
      "77",
    ]);
    assert.deepEqual(args[0], row.polynomial);
    assert.deepEqual(args[3], row.primes.map(String));
  }
  rows.forEach((row, index) => verify(row, expected[index], index));

  const built = await require("../../tools/native-kernel/compiler.cjs").compileKernel({
    sourcePath: path.join(__dirname, "int64_prime_degree_catalog.py"),
  });
  const kernel = require(built.modulePath).int64_pari_prime_degree_catalog;
  const nativeOutputs = [];
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (let index = 0; index < rows.length; index += 1) {
      const args = packets[index].map((entry, argument) => {
        if (!Array.isArray(entry)) return BigInt(entry);
        if (argument === 8) return kernel.createUInt64Buffer(entry.map(BigInt));
        if (argument === 0 || argument === 5 || argument === 6 || argument === 7) {
          return kernel.createIntegerBuffer(entry.length, 16, entry.map(BigInt));
        }
        return kernel.createInt64Buffer(entry.map(BigInt));
      });
      const result = Number(kernel[backend](...args));
      const got = { result, args: snapshot(args) };
      assert.deepEqual(got, expected[index]);
      verify(rows[index], got, index);
      nativeOutputs.push({ backend, field: rows[index].field, state: got.args[22] });
    }
  }

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  const wordMul = core.match(
    /static int native_int64_pari_flx_mul\([^;]*\)\n\{[\s\S]*?\n}\n/,
  );
  assert(wordMul, "missing int64 native Flx multiplication");
  assert.match(wordMul[0], /sagejs_uint64_buffer/);
  assert.match(wordMul[0], /\.data\[/);
  assert.doesNotMatch(wordMul[0], /sagejs_mpz_integer_buffer_index/);

  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sagejs-int64-prime-degree-catalog-"),
  );
  const result = {
    cases: rows.length,
    primeCounts: rows.map((row) => row.primes.length),
    backends: ["cpython", "javascript", "gmp", "tagged"],
    directory,
    catalogHash: hash(catalogBytes),
    sourceHash: hash(
      fs.readFileSync(path.join(__dirname, "int64_prime_degree_catalog.py")),
    ),
    coreHash: hash(fs.readFileSync(built.coreSourcePath)),
    coreSourcePath: built.coreSourcePath,
    int64MulContainsMpz: /\bmpz_/.test(wordMul[0]),
    int64MulMpzLocals: (wordMul[0].match(/^    mpz_t /gm) || []).length,
    int64MulMpzOperations: (wordMul[0].match(/\bmpz_[a-z0-9_]+\(/g) || [])
      .length,
    int64MulDirectWordAccesses: (wordMul[0].match(/\.data\[/g) || []).length,
    int64MulExactBufferIndexes: (
      wordMul[0].match(/sagejs_mpz_integer_buffer_index/g) || []
    ).length,
    int64MulHeapCalls: (
      wordMul[0].match(/\b(?:malloc|calloc|realloc|free)\(/g) || []
    ).length,
    wholeCoreMpzLocals: (core.match(/^    mpz_t /gm) || []).length,
    wholeCoreMpzOperations: (core.match(/\bmpz_[a-z0-9_]+\(/g) || []).length,
    wholeCoreInt64CheckedArithmeticSites: (
      core.match(/sagejs_word_(?:add|sub|mul)_int64\(/g) || []
    ).length,
    wholeCoreHeapCalls: (
      core.match(/\b(?:malloc|calloc|realloc|free)\(/g) || []
    ).length,
    qualifiedTiming: false,
  };
  fs.writeFileSync(
    path.join(directory, "fixtures.json"),
    JSON.stringify({ rows, packets, expected, nativeOutputs, result }),
  );
  console.log(JSON.stringify(result));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
