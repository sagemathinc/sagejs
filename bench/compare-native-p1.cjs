#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, mkdirSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");
const { compile } = require("../tools/native-kernel.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(root, "src", "lib", "sagejs", "kernels", "p1.py");
const workloadPath = join(__dirname, "native_p1_workload.py");
const referencePath = join(__dirname, "native-p1-heilbronn-reference.c");
const cacheRoot = process.env.SAGEJS_NATIVE_P1_CACHE_ROOT ||
  join(os.tmpdir(), "sagejs-native-p1-benchmark");
const prime = Number(process.env.SAGEJS_NATIVE_P1_PRIME || 1009);
const merelIndex = Number(process.env.SAGEJS_NATIVE_P1_MEREL_INDEX || 75);
const actionWeight = Number(process.env.SAGEJS_NATIVE_P1_ACTION_WEIGHT || 4);
const nativeRepetitions = Number(
  process.env.SAGEJS_NATIVE_P1_NATIVE_REPETITIONS || 50,
);
const referenceRepetitions = Number(
  process.env.SAGEJS_NATIVE_P1_REPETITIONS || 3,
);
const json = process.argv.includes("--json");

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measure(runtime, operation, repetitions, samples = 7) {
  for (let warmup = 0; warmup < 3; warmup += 1) operation();
  const timings = [];
  let value;
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      value = operation();
    }
    timings.push((performance.now() - start) * 1e6 / repetitions);
  }
  return { runtime, value: value.map(String), nanoseconds: median(timings) };
}

function measureMutation(runtime, operation, result, repetitions, samples = 7) {
  for (let warmup = 0; warmup < 3; warmup += 1) operation();
  const timings = [];
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now();
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      operation();
    }
    timings.push((performance.now() - start) * 1e6 / repetitions);
  }
  return { runtime, value: result().map(String), nanoseconds: median(timings) };
}

function actionDigest(values) {
  const answer = [BigInt(values.length), 0n, 0n, 0n, 0n, 0n];
  for (let index = 0; index < values.length; index += 1) {
    const value = BigInt(values[index]);
    answer[1] += value;
    answer[2] += BigInt(index % 3 + 1) * value;
    answer[3] += BigInt(index % 5 + 1) * value;
    answer[4] += BigInt(index % 7 + 1) * value;
    answer[5] += BigInt(index + 1) * value;
  }
  return answer;
}

function command(runtime, executable, args, environment = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${runtime} exited with ${result.status}\n${result.stdout}\n${result.stderr}`,
    );
  }
  const line = result.stdout.trim().split(/\r?\n/).find((value) =>
    value.startsWith("RESULT|")
  );
  assert(line, `${runtime} produced no result: ${result.stdout}`);
  const fields = line.split("|").slice(1);
  return {
    runtime,
    value: fields.slice(0, 6),
    nanoseconds: Number(fields[6]) * (runtime === "handwritten C" ? 1 : 1e9),
  };
}

function findPython() {
  for (const candidate of [process.env.PYTHON, "/usr/bin/python3", "python3"]) {
    if (!candidate) continue;
    const result = spawnSync(candidate, ["-V"], {
      encoding: "utf8",
      env: { ...process.env, PYTHONHOME: "", PYTHONPATH: "" },
    });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

function compileReference() {
  mkdirSync(cacheRoot, { recursive: true });
  const output = join(cacheRoot, "p1-heilbronn-reference");
  const compiler = process.env.CC || "cc";
  const result = spawnSync(compiler, [
    "-O3", "-std=c11", "-Wall", "-Wextra", "-o", output, referencePath,
  ], { cwd: root, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return { compiler, output };
}

(async () => {
  const generated = await compile({ sourcePath, cacheRoot });
  const kernel = require(generated.modulePath);
  const digest = kernel.heilbronn_cremona_digest;

  // Compare every representative, not only the digest, across the compiled C
  // target and the generated same-source JavaScript fallback.
  const validationPrimes = [2, 3, 5, 7, 11, 23, 101];
  let validatedMatrices = 0;
  for (const validationPrime of validationPrimes) {
    const count = Number(kernel.heilbronn_cremona_count(validationPrime));
    assert.equal(
      BigInt(count),
      kernel.heilbronn_cremona_count.javascript(validationPrime),
    );
    const packed = Array(4 * count).fill(0);
    const fallbackPacked = Array(4 * count).fill(0);
    assert.equal(
      kernel.heilbronn_cremona_fill(validationPrime, packed),
      BigInt(count),
    );
    assert.equal(
      kernel.heilbronn_cremona_fill.javascript(
        validationPrime, fallbackPacked,
      ),
      BigInt(count),
    );
    assert.deepEqual(packed.map(BigInt), fallbackPacked.map(BigInt));
    for (let position = 0; position < count; position += 1) {
      const entry = kernel.heilbronn_cremona_entry(validationPrime, position);
      assert.deepEqual(
        entry,
        kernel.heilbronn_cremona_entry.javascript(validationPrime, position),
      );
      assert.deepEqual(
        packed.slice(4 * position, 4 * position + 4).map(BigInt),
        entry.slice(1),
      );
      validatedMatrices += 1;
    }
    assert.equal(kernel.heilbronn_cremona_entry(validationPrime, count)[0], false);
  }

  let validatedNormalizations = 0;
  let validatedMerelMatrices = 0;
  for (const index of [1, 2, 3, 4, 5, 11, 20]) {
    const expected = kernel.heilbronn_merel_digest.javascript(index);
    assert.deepEqual(kernel.heilbronn_merel_digest(index), expected);
    const count = Number(expected[0]);
    const packed = Array(4 * count).fill(0);
    assert.equal(kernel.heilbronn_merel_fill(index, packed), BigInt(count));
    for (let position = 0; position < count; position += 1) {
      const entry = kernel.heilbronn_merel_entry(index, position);
      assert.deepEqual(
        entry,
        kernel.heilbronn_merel_entry.javascript(index, position),
      );
      assert.deepEqual(
        packed.slice(4 * position, 4 * position + 4).map(BigInt),
        entry.slice(1),
      );
      validatedMerelMatrices += 1;
    }
  }
  const normalizationLevels = [1, 2, 3, 4, 5, 6, 11, 12, 16, 25, 37, 60, 97, 100, 389];
  const flintPath = join(root, "packages", "flint", "index.cjs");
  if (existsSync(join(root, "packages", "flint", "build", "Release", "sagejs_flint.node"))) {
    const flint = require(flintPath);
    for (const level of normalizationLevels) {
      const line = flint.p1List(level);
      for (let sample = 0; sample < 80; sample += 1) {
        const u = ((sample * 104729 + level * 97) % 200001) - 100000;
        const v = ((sample * 130363 + level * 193) % 200001) - 100000;
        const expected = flint.p1ListNormalize(line, u, v, 1);
        const actual = kernel.p1_normalize_with_scalar(level, u, v);
        const javascript = kernel.p1_normalize_with_scalar.javascript(level, u, v);
        assert.deepEqual(actual, javascript);
        assert.deepEqual(actual.slice(1).map(Number), expected);
        assert.equal(
          actual[0],
          level === 1 || expected[0] !== 0 || expected[1] !== 0,
        );
        validatedNormalizations += 1;
      }
    }
  }

  const rows = [
    measure("compiled typed Python", () => digest(prime), nativeRepetitions),
    measure(
      "generated JavaScript fallback",
      () => digest.javascript(prime),
      Math.max(1, Math.floor(nativeRepetitions / 5)),
    ),
  ];
  const reference = compileReference();
  rows.push(command(
    "handwritten C", reference.output,
    [String(prime), String(Math.max(10, nativeRepetitions))],
  ));
  const merelRows = [
    measure(
      "compiled typed Python",
      () => kernel.heilbronn_merel_digest(merelIndex),
      nativeRepetitions,
    ),
    measure(
      "generated JavaScript fallback",
      () => kernel.heilbronn_merel_digest.javascript(merelIndex),
      Math.max(1, Math.floor(nativeRepetitions / 5)),
    ),
    command(
      "handwritten C", reference.output,
      ["merel", String(merelIndex), String(Math.max(10, nativeRepetitions))],
    ),
  ];
  const actionCount = Number(kernel.heilbronn_cremona_count(prime));
  const actionMatrices = new BigInt64Array(4 * actionCount);
  kernel.heilbronn_cremona_fill(prime, actionMatrices);
  const actionWidth = actionWeight - 1;
  const actionOutput = new BigInt64Array(
    actionCount * actionWidth * actionWidth,
  );
  const fallbackActionOutput = new BigInt64Array(actionOutput.length);
  const actionRows = [
    measureMutation(
      "compiled typed Python",
      () => kernel.heilbronn_higher_weight_action_fill(
        actionWeight, actionMatrices, actionCount, actionOutput,
      ),
      () => actionDigest(actionOutput),
      nativeRepetitions,
    ),
    measureMutation(
      "generated JavaScript fallback",
      () => kernel.heilbronn_higher_weight_action_fill.javascript(
        actionWeight, actionMatrices, actionCount, fallbackActionOutput,
      ),
      () => actionDigest(fallbackActionOutput),
      Math.max(1, Math.floor(nativeRepetitions / 5)),
    ),
    command(
      "handwritten C", reference.output,
      ["action", String(prime), String(actionWeight),
        String(Math.max(10, nativeRepetitions))],
    ),
  ];
  for (const row of actionRows) {
    assert.deepEqual(row.value, actionRows[0].value, `action ${row.runtime}`);
  }
  for (const index of [1, 2, 3, 5, 11, 20]) {
    const typed = kernel.heilbronn_merel_digest(index).map(String);
    const c = command("handwritten C", reference.output, ["merel", String(index), "1"]);
    assert.deepEqual(c.value, typed, `Merel index ${index}`);
  }

  const python = findPython();
  if (python !== null) {
    rows.push(command(
      "CPython fallback", python, [workloadPath],
      {
        PYTHONHOME: "",
        PYTHONPATH: "",
        SAGEJS_NATIVE_P1_PRIME: String(prime),
        SAGEJS_NATIVE_P1_REPETITIONS: String(referenceRepetitions),
      },
    ));
  }
  rows.push(command(
    "Sage.js dynamic fallback",
    process.execPath,
    [join(root, "bin", "sagejs-source.cjs"), "--python", workloadPath],
    {
      SAGEJS_NATIVE_AUTOLOAD: "0",
      SAGEJS_NATIVE_P1_PRIME: String(prime),
      SAGEJS_NATIVE_P1_REPETITIONS: String(referenceRepetitions),
    },
  ));
  const expected = rows[0].value;
  for (const row of rows) assert.deepEqual(row.value, expected, row.runtime);
  const expectedMerel = merelRows[0].value;
  for (const row of merelRows) {
    assert.deepEqual(row.value, expectedMerel, `Merel ${row.runtime}`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpus: os.cpus().length,
      cCompiler: reference.compiler,
    },
    workload: `Cremona Heilbronn representatives for T_${prime}`,
    source: "src/lib/sagejs/kernels/p1.py",
    handwrittenReference: "bench/native-p1-heilbronn-reference.c",
    validatedPrimes: validationPrimes,
    validatedMatrices,
    validatedMerelMatrices,
    validatedNormalizations,
    backendPolicy: digest.backendPolicy,
    taggedIntegerProof: digest.taggedInteger,
    rows: rows.map((row) => ({
      ...row,
      versusCompiled: row.nanoseconds / rows[0].nanoseconds,
    })),
    merel: {
      index: merelIndex,
      rows: merelRows.map((row) => ({
        ...row,
        versusCompiled: row.nanoseconds / merelRows[0].nanoseconds,
      })),
    },
    higherWeightAction: {
      weight: actionWeight,
      matrixCount: actionCount,
      coefficients: actionOutput.length,
      rows: actionRows.map((row) => ({
        ...row,
        versusCompiled: row.nanoseconds / actionRows[0].nanoseconds,
      })),
    },
  };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(report.workload);
    console.log(
      `${validatedMatrices} matrices differentially checked across ` +
      `${validationPrimes.length} primes; ${validatedNormalizations} P1 ` +
      `normalizations checked against p1_core.c; ${validatedMerelMatrices} ` +
      "Merel matrices checked",
    );
    console.log("runtime".padEnd(32), "median/call".padStart(16), "vs compiled".padStart(14));
    console.log("-".repeat(66));
    for (const row of report.rows) {
      console.log(
        row.runtime.padEnd(32),
        `${(row.nanoseconds / 1e3).toFixed(3)} us`.padStart(16),
        `${row.versusCompiled.toFixed(2)}x`.padStart(14),
      );
    }
    console.log(`digest: ${expected.join(", ")}`);
    console.log(`Merel determinant-${merelIndex} representatives`);
    for (const row of report.merel.rows) {
      console.log(
        row.runtime.padEnd(32),
        `${(row.nanoseconds / 1e3).toFixed(3)} us`.padStart(16),
        `${row.versusCompiled.toFixed(2)}x`.padStart(14),
      );
    }
    console.log(`digest: ${expectedMerel.join(", ")}`);
    console.log(
      `weight-${actionWeight} polynomial action: ` +
      `${actionOutput.length} coefficients`,
    );
    for (const row of report.higherWeightAction.rows) {
      console.log(
        row.runtime.padEnd(32),
        `${(row.nanoseconds / 1e3).toFixed(3)} us`.padStart(16),
        `${row.versusCompiled.toFixed(2)}x`.padStart(14),
      );
    }
    console.log(`digest: ${actionRows[0].value.join(", ")}`);
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
