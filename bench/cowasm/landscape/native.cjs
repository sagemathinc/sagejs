"use strict";

const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { compile } = require("../../../tools/native-kernel.cjs");

const root = resolve(__dirname, "..", "..", "..");
const cacheRoot = process.env.SAGEJS_LANDSCAPE_NATIVE_CACHE ||
  join(tmpdir(), "sagejs-cowasm-landscape-native-cache");
const expected = {
  prime_counting: "9592",
  gcd_loop: "2414484",
  xgcd_loop: "2414484",
  inverse_mod_loop: "53532319533988",
  sum_stride: "333334",
  recursive_fibonacci: "1346269",
  int_to_float: "ok",
  float_abs: "ok",
  int_divmod: "17167493000000",
};

function close(left, right) {
  return 0.999999 <= left / right && left / right <= 1.000001;
}

function environmentInteger(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : Number(value);
}

function selectedIds() {
  const value = process.env.SAGEJS_LANDSCAPE_ONLY || "";
  return value === "" ? Object.keys(expected) : value.split(",");
}

async function main() {
  const numberTheory = await compile({
    sourcePath: join(root, "bench", "cowasm", "src", "nt.py"),
    cacheRoot: join(cacheRoot, "nt"),
  });
  const benchmarkKernels = await compile({
    sourcePath: join(
      root, "bench", "cowasm", "src", "native_number_theory.py",
    ),
    cacheRoot: join(cacheRoot, "number-theory"),
  });
  const scalarKernels = await compile({
    sourcePath: join(root, "bench", "cowasm", "native", "scalar_exact.py"),
    cacheRoot: join(cacheRoot, "scalar-exact"),
  });
  const floatKernels = await compile({
    sourcePath: join(root, "bench", "cowasm", "native", "scalar_float.py"),
    cacheRoot: join(cacheRoot, "scalar-float"),
  });
  const nt = require(numberTheory.modulePath);
  const benchmark = require(benchmarkKernels.modulePath);
  const scalar = require(scalarKernels.modulePath);
  const binary64 = require(floatKernels.modulePath);
  const operations = {
    prime_counting: () => nt.pi(100000),
    gcd_loop: () => benchmark.native_bench_gcd(100000),
    xgcd_loop: () => scalar.xgcd_loop(),
    inverse_mod_loop: () => scalar.inverse_mod_loop(),
    sum_stride: () => scalar.sum_stride(),
    recursive_fibonacci: () => benchmark.native_rfib(30),
    int_to_float: () => {
      const value = binary64.int_to_float(1000000, 1, 4, 6, 7, 8, 9);
      if (value !== 35000000) {
        throw new Error("int_to_float returned " + value);
      }
      return "ok";
    },
    float_abs: () => {
      const value = binary64.float_abs(
        1000000, 1, -1.234567, 44324, 23.4, -43.44e-4,
      );
      if (!close(value, 44349638911.052574)) {
        throw new Error("float_abs returned " + value);
      }
      return "ok";
    },
    int_divmod: () => scalar.int_divmod_loop(),
  };
  const warmups = environmentInteger("SAGEJS_LANDSCAPE_WARMUPS", 1);
  const samples = environmentInteger("SAGEJS_LANDSCAPE_SAMPLES", 3);
  const selected = selectedIds();
  process.stdout.write("SAGEJS_COWASM_LANDSCAPE 1\n");
  for (const [kind, count] of [["WARMUP", warmups], ["RESULT", samples]]) {
    for (let sample = 0; sample < count; sample += 1) {
      for (const id of selected) {
        const operation = operations[id];
        if (operation === undefined) throw new Error("unsupported native id " + id);
        const started = process.hrtime.bigint();
        const answer = String(operation());
        const elapsed = process.hrtime.bigint() - started;
        if (answer !== expected[id]) {
          throw new Error(id + " returned " + answer + "; expected " + expected[id]);
        }
        process.stdout.write(
          kind + "\t" + sample + "\t" + id + "\t" +
          elapsed + "\t" + answer + "\n",
        );
      }
    }
  }
  process.stdout.write(
    "COMPLETE\t" + warmups + "\t" + samples + "\t" + selected.length + "\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
