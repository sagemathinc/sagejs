"use strict";

const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");
const { join } = require("node:path");
const { compile } = require("../tools/native-kernel.cjs");

const root = join(__dirname, "..");
const sourceRoot = join(root, "src", "lib");
const pythonWorkload = join(__dirname, "native_cowasm_workload.py");
const iterations = Number(process.env.SAGEJS_NATIVE_COWASM_ITERATIONS || 100000);
const fibonacciInput = Number(process.env.SAGEJS_NATIVE_COWASM_FIBONACCI || 30);
const largeGcdIterations = Number(
  process.env.SAGEJS_NATIVE_COWASM_LARGE_GCD_ITERATIONS || 100,
);
const repetitions = Number(process.env.SAGEJS_NATIVE_COWASM_REPETITIONS || 3);

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(fn, args, repeat = repetitions) {
  fn(...args);
  const samples = [];
  let answer;
  for (let index = 0; index < repeat; index += 1) {
    const start = performance.now();
    answer = fn(...args);
    samples.push((performance.now() - start) / 1000);
  }
  return { answer: String(answer), seconds: median(samples), samples };
}

function interpreter(command, args, mode, count) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      SAGEJS_NATIVE_AUTOLOAD: "0",
      SAGEJS_NATIVE_COWASM_COUNT: String(count),
      SAGEJS_NATIVE_COWASM_MODE: mode,
      SAGEJS_NATIVE_SOURCE_ROOT: sourceRoot,
    },
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  }
  const match = /^RESULT\s+(\S+)\s+(\S+)$/m.exec(result.stdout);
  if (!match) throw new Error(`missing RESULT from ${command}: ${result.stdout}`);
  return { answer: match[1], seconds: Number(match[2]) };
}

(async () => {
  const selected = await compile({
    sourcePath: join(__dirname, "cowasm", "src", "nt.py"),
    functions: ["gcd"],
  });
  const selectedModule = require(selected.modulePath);
  const algorithms = await compile({
    sourcePath: join(__dirname, "cowasm", "src", "native_number_theory.py"),
  });
  const native = require(algorithms.modulePath);

  const nativeGcd = measure(native.native_bench_gcd, [iterations]);
  const bigintGcd = measure(native.native_bench_gcd.javascript, [iterations]);
  const nativeLargeGcd = measure(
    native.native_bench_large_gcd,
    [largeGcdIterations],
  );
  const bigintLargeGcd = measure(
    native.native_bench_large_gcd.javascript,
    [largeGcdIterations],
  );
  const nativeFibonacci = measure(native.native_rfib, [fibonacciInput], 1);
  const bigintFibonacci = measure(
    native.native_rfib.javascript,
    [fibonacciInput],
    1,
  );
  const selectedGcd = selectedModule.gcd(92250, 922350);

  const cpythonGcd = interpreter(
    "python3",
    [pythonWorkload],
    "gcd",
    iterations,
  );
  const sagejsGcd = interpreter(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python", pythonWorkload],
    "gcd",
    iterations,
  );
  const cpythonLargeGcd = interpreter(
    "python3",
    [pythonWorkload],
    "large_gcd",
    largeGcdIterations,
  );
  const sagejsLargeGcd = interpreter(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python", pythonWorkload],
    "large_gcd",
    largeGcdIterations,
  );
  const cpythonFibonacci = interpreter(
    "python3",
    [pythonWorkload],
    "rfib",
    fibonacciInput,
  );
  const sagejsFibonacci = interpreter(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python", pythonWorkload],
    "rfib",
    fibonacciInput,
  );

  const report = {
    environment: {
      architecture: process.arch,
      node: process.version,
      platform: process.platform,
    },
    selectedUnmodifiedNtGcd: String(selectedGcd),
    callGraph: algorithms.ir.callGraph,
    gcd: {
      iterations,
      nativeGmp: nativeGcd,
      generatedBigInt: bigintGcd,
      cpython: cpythonGcd,
      sagejsPython: sagejsGcd,
    },
    largeGcd: {
      iterations: largeGcdIterations,
      digits: 314,
      nativeGmp: nativeLargeGcd,
      generatedBigInt: bigintLargeGcd,
      cpython: cpythonLargeGcd,
      sagejsPython: sagejsLargeGcd,
    },
    recursiveFibonacci: {
      input: fibonacciInput,
      nativeGmp: nativeFibonacci,
      generatedBigInt: bigintFibonacci,
      cpython: cpythonFibonacci,
      sagejsPython: sagejsFibonacci,
    },
  };
  const expectedGcd = "2414484";
  const gcdAnswers = [
    nativeGcd.answer,
    bigintGcd.answer,
    cpythonGcd.answer,
    sagejsGcd.answer,
  ];
  if (iterations === 100000 && gcdAnswers.some((answer) => answer !== expectedGcd)) {
    throw new Error(`GCD result mismatch: ${gcdAnswers.join(", ")}`);
  }
  const largeGcdAnswers = [
    nativeLargeGcd.answer,
    bigintLargeGcd.answer,
    cpythonLargeGcd.answer,
    sagejsLargeGcd.answer,
  ];
  if (largeGcdAnswers.some((answer) => answer !== String(largeGcdIterations))) {
    throw new Error(`large GCD result mismatch: ${largeGcdAnswers.join(", ")}`);
  }
  const fibonacciAnswers = [
    nativeFibonacci.answer,
    bigintFibonacci.answer,
    cpythonFibonacci.answer,
    sagejsFibonacci.answer,
  ];
  if (new Set(fibonacciAnswers).size !== 1) {
    throw new Error(`Fibonacci result mismatch: ${fibonacciAnswers.join(", ")}`);
  }
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log("Native Kernel v3 — CoWasm number theory");
  console.log(`unmodified nt.py gcd(92250, 922350): ${selectedGcd}`);
  console.table({
    "GCD AOT/GMP": nativeGcd.seconds,
    "GCD exact BigInt": bigintGcd.seconds,
    "GCD CPython": cpythonGcd.seconds,
    "GCD Sage.js Python": sagejsGcd.seconds,
    "large GCD AOT/GMP": nativeLargeGcd.seconds,
    "large GCD exact BigInt": bigintLargeGcd.seconds,
    "large GCD CPython": cpythonLargeGcd.seconds,
    "large GCD Sage.js Python": sagejsLargeGcd.seconds,
    "rfib AOT/GMP": nativeFibonacci.seconds,
    "rfib exact BigInt": bigintFibonacci.seconds,
    "rfib CPython": cpythonFibonacci.seconds,
    "rfib Sage.js Python": sagejsFibonacci.seconds,
  });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
