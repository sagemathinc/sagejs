"use strict";

// Diagnostic language experiment. This checker does not alter production
// dispatch or substitute a C implementation for the translated mathematics.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

function functionBody(source, name) {
  const marker = `static int native_${name}(`;
  const declaration = source.indexOf(marker);
  assert.notEqual(declaration, -1, `missing declaration for ${name}`);
  const start = source.indexOf(marker, declaration + marker.length);
  assert.notEqual(start, -1, `missing definition for ${name}`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `missing body for ${name}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated definition for ${name}`);
}

function gmpCalls(body) {
  const pattern = /\b(?:__gmpz_|mpz_|sagejs_(?:mpz|integer)[A-Za-z0-9_]*)([A-Za-z0-9_]*)\s*\(/g;
  return [...body.matchAll(pattern)].map((match) => match[0].slice(0, -1));
}

function buildCases() {
  const primes = [3, 5, 101, 65_537, 2_147_483_659, 3_037_000_493];
  let state = 0x51f15e;
  const random = (limit) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % limit;
  };
  const polynomials = (degree, prime) => {
    if (degree < 0) return [[]];
    const dense = Array(degree + 1).fill(prime - 1);
    const sparse = Array(degree + 1).fill(0);
    sparse[degree] = prime - 1;
    const alternating = Array.from(
      { length: degree + 1 },
      (_, index) => (index % 2 === 0 ? prime - 1 : 1),
    );
    const pseudoRandom = Array.from(
      { length: degree + 1 },
      (_, index) => (index === degree ? 1 + random(prime - 1) : random(prime)),
    );
    return [dense, sparse, alternating, pseudoRandom];
  };
  const cases = [];
  for (const prime of primes) {
    for (let leftDegree = -1; leftDegree <= 4; leftDegree += 1) {
      for (const left of polynomials(leftDegree, prime)) {
        cases.push({ operation: "sqr", prime, leftDegree, rightDegree: -1, left, right: [] });
        for (let rightDegree = -1; rightDegree <= 4; rightDegree += 1) {
          for (const right of polynomials(rightDegree, prime)) {
            cases.push({ operation: "mul", prime, leftDegree, rightDegree, left, right });
          }
        }
      }
    }
  }
  return cases;
}

function padded(values) {
  return [...values.map(BigInt), ...Array(9 - values.length).fill(0n)];
}

function initialStorage(testCase) {
  return [
    ...padded(testCase.left),
    ...padded(testCase.right),
    ...Array(18).fill(0xdeadn),
    0xbeefn,
  ];
}

function runCompiledCase(module, backend, testCase, word) {
  const operation = testCase.operation;
  const functionName = word ? `flx_word_${operation}` : `pari_flx_${operation}`;
  const fn = module[functionName];
  assert(fn, `missing compiled function ${functionName}`);
  const initial = initialStorage(testCase);
  const owner = word
    ? fn.createUInt64Buffer(initial)
    : fn.createIntegerBuffer(initial.length, 2, initial);
  const args = [owner, 0n, BigInt(testCase.leftDegree)];
  if (operation === "mul") args.push(9n, BigInt(testCase.rightDegree));
  args.push(BigInt(testCase.prime), 18n);
  const degree = fn[backend](...args);
  const values = word ? Array.from(owner) : owner.toArray();
  assert.deepEqual(values.slice(0, 18), initial.slice(0, 18), `${backend} changed inputs`);
  assert.equal(values[36], 0xbeefn, `${backend} wrote beyond output slot`);
  return [degree, ...values.slice(18, 27)];
}

function measure(functionObject, backend, word, initial, degree, prime, count) {
  const owner = word
    ? functionObject.createUInt64Buffer(initial)
    : functionObject.createIntegerBuffer(initial.length, 2, initial);
  const start = process.hrtime.bigint();
  const checksum = functionObject[backend](owner, BigInt(degree), BigInt(prime), BigInt(count));
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  return { milliseconds: elapsed, checksum: String(checksum) };
}

function geometricMean(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

async function main() {
  const sourcePath = path.join(__dirname, "flx_word_experiment.py");
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.equal(
    sha256(source),
    "1bac3446aa92b350dc4c6270a57cb0cb3a6e47b4ce9a983fa213826f12503f0b",
    "review and update the frozen experiment when its source changes",
  );
  const cases = buildCases();
  const pythonProgram = String.raw`
import importlib, json, sys, time
sys.path[:0] = sys.argv[1:3]
m = importlib.import_module("bench.pari-class-group-port.flx_word_experiment")
cases = json.load(sys.stdin)
def padded(values): return values + [0] * (9 - len(values))
def one(c, word):
    w = padded(c["left"]) + padded(c["right"]) + [0xdead] * 18 + [0xbeef]
    name = ("flx_word_" if word else "pari_flx_") + c["operation"]
    args = [w, 0, c["leftDegree"]]
    if c["operation"] == "mul": args += [9, c["rightDegree"]]
    args += [c["prime"], 18]
    degree = getattr(m, name)(*args)
    assert w[:18] == padded(c["left"]) + padded(c["right"])
    assert w[36] == 0xbeef
    return [degree] + w[18:27]
outputs = []
for index, c in enumerate(cases):
    exact, word = one(c, False), one(c, True)
    assert exact == word, (index, c, exact, word)
    outputs.append(exact)
degree, prime, count = 4, 3037000493, int(sys.argv[3])
initial = [prime-1, 1, prime-2, 2, prime-3] + [0]*4
initial = initial + initial + [0]*18
timing = []
for _ in range(2):
    for name in ("flx_exact_batch", "flx_word_batch"):
        getattr(m, name)(initial[:], degree, prime, min(count, 100))
for pair in range(7):
    row = {"pair": pair + 1}
    order = ("exact", "word") if pair % 2 == 0 else ("word", "exact")
    for kind in order:
        name = "flx_exact_batch" if kind == "exact" else "flx_word_batch"
        owner = initial[:]
        started = time.perf_counter_ns()
        checksum = getattr(m, name)(owner, degree, prime, count)
        row[kind] = {"milliseconds": (time.perf_counter_ns()-started)/1e6,
                     "checksum": str(checksum)}
    assert row["exact"]["checksum"] == row["word"]["checksum"]
    timing.append(row)
print(json.dumps({"outputs": outputs, "timing": timing}))
`;
  const timingCount = Number(process.env.SAGEJS_FLX_WORD_TIMING_COUNT || 20_000);
  assert(Number.isSafeInteger(timingCount) && timingCount > 0 && timingCount <= 10_000_000);
  const pythonRaw = run(
    "python3",
    [
      "-c",
      pythonProgram,
      path.resolve(__dirname, "../.."),
      path.resolve(__dirname, "../../src/lib"),
      String(timingCount),
    ],
    { input: JSON.stringify(cases) },
  );
  const python = JSON.parse(pythonRaw);
  assert.equal(python.outputs.length, cases.length);

  const built = await compileKernel({ sourcePath });
  const module = require(built.modulePath);
  for (const backend of ["javascript", "gmp", "tagged"]) {
    for (const [index, testCase] of cases.entries()) {
      const exact = runCompiledCase(module, backend, testCase, false);
      const word = runCompiledCase(module, backend, testCase, true);
      const expected = python.outputs[index].map(BigInt);
      assert.deepEqual(exact, expected, `${backend} exact case ${index}`);
      assert.deepEqual(word, expected, `${backend} word case ${index}`);
    }
  }

  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  const structural = {};
  for (const name of ["flx_word_mul", "flx_word_sqr", "flx_word_batch"]) {
    const body = functionBody(core, name);
    const calls = gmpCalls(body);
    assert.match(body, /sagejs_uint64_buffer sagejs_arg_w/);
    assert.match(body, /uint64_t sagejs_arg_p/);
    assert.match(body, /uint64_t sagejs_(?:total|checksum)/);
    structural[name] = {
      bodyBytes: Buffer.byteLength(body),
      uint64Tokens: (body.match(/\buint64_t\b/g) || []).length,
      gmpCallCount: calls.length,
      gmpCallKinds: [...new Set(calls)].sort(),
      zeroGmpCalls: calls.length === 0,
    };
  }

  const degree = 4;
  const prime = 3_037_000_493;
  const polynomial = [prime - 1, 1, prime - 2, 2, prime - 3].map(BigInt);
  const timingInitial = [...padded(polynomial), ...padded(polynomial), ...Array(18).fill(0n)];
  const timing = { cpython: python.timing };
  for (const backend of ["javascript", "gmp", "tagged"]) {
    const rows = [];
    for (let warmup = 0; warmup < 2; warmup += 1) {
      measure(module.flx_exact_batch, backend, false, timingInitial, degree, prime, Math.min(100, timingCount));
      measure(module.flx_word_batch, backend, true, timingInitial, degree, prime, Math.min(100, timingCount));
    }
    for (let pair = 0; pair < 7; pair += 1) {
      const row = { pair: pair + 1 };
      const order = pair % 2 === 0 ? ["exact", "word"] : ["word", "exact"];
      for (const kind of order) {
        row[kind] = measure(
          kind === "exact" ? module.flx_exact_batch : module.flx_word_batch,
          backend,
          kind === "word",
          timingInitial,
          degree,
          prime,
          timingCount,
        );
      }
      assert.equal(row.exact.checksum, row.word.checksum, `${backend} timing checksum`);
      row.wordOverExact = row.word.milliseconds / row.exact.milliseconds;
      rows.push(row);
    }
    timing[backend] = rows;
  }
  const summaries = {};
  for (const [backend, rows] of Object.entries(timing)) {
    summaries[backend] = {
      exactGeometricMeanMilliseconds: geometricMean(rows.map((row) => row.exact.milliseconds)),
      wordGeometricMeanMilliseconds: geometricMean(rows.map((row) => row.word.milliseconds)),
      wordOverExactGeometricMean: geometricMean(rows.map((row) => row.wordOverExact || row.word.milliseconds / row.exact.milliseconds)),
    };
  }
  const zeroGmpCriterion = Object.values(structural).every((entry) => entry.zeroGmpCalls);
  const report = {
    qualifiedTiming: false,
    diagnosticOnly: true,
    sourceSha256: sha256(source),
    coreSha256: sha256(core),
    addonSha256: sha256(fs.readFileSync(built.addonPath)),
    cacheKey: built.cacheKey,
    cachedBuild: built.cached,
    coreBytes: fs.statSync(built.coreSourcePath).size,
    caseCount: cases.length,
    caseSha256: sha256(JSON.stringify(cases)),
    outputSha256: sha256(JSON.stringify(python.outputs)),
    backends: ["cpython", "javascript", "gmp", "tagged"],
    timingCount,
    timing,
    summaries,
    structural,
    zeroGmpCriterion,
    conclusion: zeroGmpCriterion
      ? "bounded word functions contain no GMP calls"
      : "bounded coefficient storage is retained, but exact signed degree/index arithmetic still emits GMP calls",
  };
  const output = process.argv.find((argument) => argument.startsWith("--output="));
  if (output) fs.writeFileSync(path.resolve(output.slice("--output=".length)), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  if (process.argv.includes("--require-zero-gmp")) {
    assert.equal(
      zeroGmpCriterion,
      true,
      "word functions still contain GMP calls; signed bounded scalar support is unresolved",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
