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
const piInput = Number(process.env.SAGEJS_NATIVE_COWASM_PI || 100000);
const largeGcdIterations = Number(
  process.env.SAGEJS_NATIVE_COWASM_LARGE_GCD_ITERATIONS || 100,
);
const repetitions = Number(process.env.SAGEJS_NATIVE_COWASM_REPETITIONS || 3);
const recursiveRepetitions = Number(
  process.env.SAGEJS_NATIVE_COWASM_RECURSIVE_REPETITIONS || 3,
);
const cacheRoot = process.env.SAGEJS_NATIVE_COWASM_CACHE_ROOT;

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
  const complete = await compile({
    sourcePath: join(__dirname, "cowasm", "src", "nt.py"),
    ...(cacheRoot ? { cacheRoot: join(cacheRoot, "complete") } : {}),
  });
  const completeModule = require(complete.modulePath);
  const algorithms = await compile({
    sourcePath: join(__dirname, "cowasm", "src", "native_number_theory.py"),
    ...(cacheRoot ? { cacheRoot: join(cacheRoot, "algorithms") } : {}),
  });
  const native = require(algorithms.modulePath);

  const automaticGcd = measure(native.native_bench_gcd, [iterations]);
  const nativeGcd = measure(native.native_bench_gcd.gmp, [iterations]);
  const bigintGcd = measure(native.native_bench_gcd.bigint, [iterations]);
  const automaticLargeGcd = measure(
    native.native_bench_large_gcd,
    [largeGcdIterations],
  );
  const nativeLargeGcd = measure(
    native.native_bench_large_gcd.gmp,
    [largeGcdIterations],
  );
  const bigintLargeGcd = measure(
    native.native_bench_large_gcd.bigint,
    [largeGcdIterations],
  );
  const automaticFibonacci = measure(
    native.native_rfib,
    [fibonacciInput],
    recursiveRepetitions,
  );
  const nativeFibonacci = measure(
    native.native_rfib.gmp,
    [fibonacciInput],
    recursiveRepetitions,
  );
  const bigintFibonacci = measure(
    native.native_rfib.bigint,
    [fibonacciInput],
    recursiveRepetitions,
  );
  const selectedGcd = completeModule.gcd(92250, 922350);
  const automaticPi = measure(completeModule.pi, [piInput]);
  const nativePi = measure(completeModule.pi.gmp, [piInput]);
  const bigintPi = measure(completeModule.pi.bigint, [piInput]);

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
  const cpythonPi = interpreter("python3", [pythonWorkload], "pi", piInput);
  const sagejsPi = interpreter(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python", pythonWorkload],
    "pi",
    piInput,
  );

  const report = {
    environment: {
      architecture: process.arch,
      node: process.version,
      platform: process.platform,
    },
    completeUnmodifiedNtCallGraph: complete.ir.callGraph,
    completeTaggedIntegerProofs: Object.fromEntries(
      complete.ir.functions.map((fn) => [fn.name, fn.analysis.taggedInteger]),
    ),
    completeUnmodifiedNtGcd: String(selectedGcd),
    callGraph: algorithms.ir.callGraph,
    backendPolicies: Object.fromEntries(
      [
        "native_bench_gcd",
        "native_bench_large_gcd",
        "native_rfib",
      ].map((name) => [name, native[name].backendPolicy]),
    ),
    gcd: {
      iterations,
      selectedBackend: native.native_bench_gcd.backendFor(iterations),
      automatic: automaticGcd,
      nativeGmp: nativeGcd,
      generatedBigInt: bigintGcd,
      cpython: cpythonGcd,
      sagejsPython: sagejsGcd,
    },
    largeGcd: {
      iterations: largeGcdIterations,
      digits: 314,
      selectedBackend:
        native.native_bench_large_gcd.backendFor(largeGcdIterations),
      automatic: automaticLargeGcd,
      nativeGmp: nativeLargeGcd,
      generatedBigInt: bigintLargeGcd,
      cpython: cpythonLargeGcd,
      sagejsPython: sagejsLargeGcd,
    },
    recursiveFibonacci: {
      input: fibonacciInput,
      selectedBackend: native.native_rfib.backendFor(fibonacciInput),
      automatic: automaticFibonacci,
      nativeGmp: nativeFibonacci,
      generatedBigInt: bigintFibonacci,
      cpython: cpythonFibonacci,
      sagejsPython: sagejsFibonacci,
    },
    primeCounting: {
      input: piInput,
      selectedBackend: completeModule.pi.backendFor(piInput),
      automatic: automaticPi,
      nativeGmp: nativePi,
      generatedBigInt: bigintPi,
      cpython: cpythonPi,
      sagejsPython: sagejsPi,
    },
  };
  const expectedGcd = "2414484";
  const gcdAnswers = [
    automaticGcd.answer,
    nativeGcd.answer,
    bigintGcd.answer,
    cpythonGcd.answer,
    sagejsGcd.answer,
  ];
  if (iterations === 100000 && gcdAnswers.some((answer) => answer !== expectedGcd)) {
    throw new Error(`GCD result mismatch: ${gcdAnswers.join(", ")}`);
  }
  const largeGcdAnswers = [
    automaticLargeGcd.answer,
    nativeLargeGcd.answer,
    bigintLargeGcd.answer,
    cpythonLargeGcd.answer,
    sagejsLargeGcd.answer,
  ];
  if (largeGcdAnswers.some((answer) => answer !== String(largeGcdIterations))) {
    throw new Error(`large GCD result mismatch: ${largeGcdAnswers.join(", ")}`);
  }
  const fibonacciAnswers = [
    automaticFibonacci.answer,
    nativeFibonacci.answer,
    bigintFibonacci.answer,
    cpythonFibonacci.answer,
    sagejsFibonacci.answer,
  ];
  if (new Set(fibonacciAnswers).size !== 1) {
    throw new Error(`Fibonacci result mismatch: ${fibonacciAnswers.join(", ")}`);
  }
  const piAnswers = [
    automaticPi.answer,
    nativePi.answer,
    bigintPi.answer,
    cpythonPi.answer,
    sagejsPi.answer,
  ];
  if (new Set(piAnswers).size !== 1) {
    throw new Error(`prime-counting mismatch: ${piAnswers.join(", ")}`);
  }
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  console.log("Native Kernel v7 — CoWasm number theory");
  console.log(`complete unmodified nt.py gcd(92250, 922350): ${selectedGcd}`);
  console.table({
    "GCD resumable int64/GMP": automaticGcd.seconds,
    "GCD forced GMP": nativeGcd.seconds,
    "GCD exact BigInt": bigintGcd.seconds,
    "GCD CPython": cpythonGcd.seconds,
    "GCD Sage.js Python": sagejsGcd.seconds,
    "large GCD selected exact backend": automaticLargeGcd.seconds,
    "large GCD forced GMP": nativeLargeGcd.seconds,
    "large GCD exact BigInt": bigintLargeGcd.seconds,
    "large GCD CPython": cpythonLargeGcd.seconds,
    "large GCD Sage.js Python": sagejsLargeGcd.seconds,
    "rfib resumable int64/GMP": automaticFibonacci.seconds,
    "rfib forced GMP": nativeFibonacci.seconds,
    "rfib exact BigInt": bigintFibonacci.seconds,
    "rfib CPython": cpythonFibonacci.seconds,
    "rfib Sage.js Python": sagejsFibonacci.seconds,
    "pi resumable int64/GMP": automaticPi.seconds,
    "pi forced GMP": nativePi.seconds,
    "pi exact BigInt": bigintPi.seconds,
    "pi CPython": cpythonPi.seconds,
    "pi Sage.js Python": sagejsPi.seconds,
  });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
