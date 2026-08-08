"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");
const { generateC } = require("../tools/native-kernel/c-backend.cjs");
const { lowerSource } = require("../tools/native-kernel/ir.cjs");
const nativeApi = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
(async () => {
const sourcePath = join(root, "bench", "native-kernel-input.sage");
const mpmathSourcePath = join(root, "bench", "native-mpmath-kernel.sage");
const source = readFileSync(sourcePath, "utf8");
const ir = await lowerSource(source, sourcePath);
const complexFunction = ir.functions.find(
  (fn) => fn.name === "multiply_loop",
);
const realFunction = ir.functions.find(
  (fn) => fn.name === "real_multiply_loop",
);
const generatedC = generateC(ir);
const mpmathSource = readFileSync(mpmathSourcePath, "utf8");
const mpmathIr = await lowerSource(mpmathSource, mpmathSourcePath);
const harmonicFunction = mpmathIr.functions[0];
const harmonicC = generateC(mpmathIr);

assert.equal(ir.version, 1);
assert.equal(complexFunction.params[0].type, "ComplexField");
assert.equal(complexFunction.params[1].type, "uint64");
assert.equal(complexFunction.returnType, "ComplexNumber");
assert.equal(complexFunction.locals[0].storage, "return");
assert.deepEqual(complexFunction.body[2].body[0], {
  kind: "complex.binary",
  operation: "mul",
  target: "value",
  left: "value",
  right: "step",
});
assert.equal(realFunction.params[0].type, "RealField");
assert.equal(realFunction.returnType, "RealNumber");
assert.equal(realFunction.locals[0].type, "RealNumber");
assert.deepEqual(realFunction.body[2].body[0], {
  kind: "real.binary",
  operation: "mul",
  target: "value",
  left: "value",
  right: "step",
});
assert.match(
  generatedC,
  /mpc_mul\(sagejs_value->value, sagejs_value->value, sagejs_step/,
);
assert.match(
  generatedC,
  /mpfr_mul\(sagejs_value->value, sagejs_value->value, sagejs_step/,
);
assert.equal(harmonicFunction.name, "harmonic_cubic_loop");
assert.equal(harmonicFunction.decorated, true);
assert.deepEqual(
  harmonicFunction.body.find((item) => item.kind === "loop.range").body
    .map((item) => item.kind),
  [
    "real.from_uint64",
    "real.pow_uint",
    "real.binary",
    "real.binary",
  ],
);
assert.equal(
  harmonicFunction.body.filter((item) => item.kind === "real.constant")
    .length,
  2,
);
assert.match(
  harmonicC,
  /mpfr_set_uj\(sagejs_sagejs_native_tmp_3, sagejs_denominator/,
);
assert.match(
  harmonicC,
  /mpfr_pow_ui\(sagejs_sagejs_native_tmp_2, sagejs_sagejs_native_tmp_3, 3/,
);
assert.match(
  harmonicC,
  /sagejs_denominator - UINT64_C\(1\).*sagejs_terms/,
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field: ComplexField, n: uint64) -> ComplexNumber:\n" +
        "    return field(\"1\", \"0\")\n",
      "invalid.sage",
    ),
  /native function must return a ComplexNumber local/,
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field, n: uint64) -> ComplexNumber:\n" +
        "    return field(\"1\", \"0\")\n",
      "missing-annotation.sage",
    ),
  /native argument f\.field annotation is missing/,
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field: RealField, n: uint64) -> RealNumber:\n" +
        "    x = field(1)\n" +
        "    for k in range(2, n + 1):\n" +
        "        x += field(k)\n" +
        "    return x\n",
      "invalid-range.sage",
    ),
  /two-argument loop must use range\(k, n \+ k\)/,
);
await assert.rejects(
  () =>
    lowerSource(
      "def f(field: RealField, n: uint64) -> RealNumber:\n" +
        "    x = field(1)\n" +
        "    y = x ** 65\n" +
        "    return y\n",
      "invalid-power.sage",
    ),
  /nonnegative integer exponent at most 64/,
);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-kernel-"));

function runSage(script, env = {}) {
  const scriptPath = join(temporary, "integration.sage");
  writeFileSync(scriptPath, script);
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), scriptPath],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...env },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  assert.equal(result.status, 0);
  return result.stdout.trim().split("\n");
}

try {
  const options = {
    sourcePath,
    cacheRoot: join(temporary, "cache"),
  };
  const first = await nativeApi.compile(options);
  const second = await compileKernel(options);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.cacheKey, second.cacheKey);
  assert.equal(first.modulePath, second.modulePath);

  const mpmathKernel = await compileKernel({
    sourcePath: mpmathSourcePath,
    cacheRoot: join(temporary, "mpmath-cache"),
  });
  const harmonicAddon = require(mpmathKernel.addonPath);
  const flint = require("../packages/flint");
  assert.match(
    flint.realToString(harmonicAddon.harmonic_cubic_loop(269, 400)),
    /^1\.20205378596232868074466308969974913071858345926099644512838/,
  );
  const harmonicModulePath = JSON.stringify(mpmathKernel.modulePath);
  const harmonicScript = `kernel = require(${harmonicModulePath})

def reference(field, terms):
    total = field(0)
    for denominator in range(1, terms + 1):
        total += field(1) / field(denominator) ** 3
    return total

expected = reference(RR, 40)
print(kernel.harmonic_cubic_loop(RR, 40) == expected)
print(kernel.harmonic_cubic_loop.javascript(RR, 40) == expected)
print(kernel.nativeAvailable)
`;
  assert.deepEqual(runSage(harmonicScript), ["True", "True", "True"]);
  assert.deepEqual(
    runSage(harmonicScript, { SAGEJS_NATIVE_DISABLE: "1" }),
    ["True", "True", "False"],
  );

  const direct = spawnSync(
    process.execPath,
    [join(__dirname, "native-kernel-addon-child.cjs"), first.addonPath],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(direct.status, 0, direct.stderr);

  const modulePath = JSON.stringify(first.modulePath);
  const script = `kernel = require(${modulePath})

def reference(field, iterations):
    value = field("1.25", "-0.75")
    step = field("1.0000000000000002", "0.0000000000000001")
    for _ in range(iterations):
        value = value * step
    return value

def real_reference(field, iterations):
    value = field("1.25")
    step = field("1.0000000000000002")
    for _ in range(iterations):
        value = value * step
    return value

actual = kernel.multiply_loop(CC, 25)
fallback = kernel.multiply_loop.javascript(CC, 25)
expected = reference(CC, 25)
real_actual = kernel.real_multiply_loop(RR, 25)
real_fallback = kernel.real_multiply_loop.javascript(RR, 25)
real_expected = real_reference(RR, 25)
print(type(actual))
print(parent(actual))
print(actual == expected)
print(fallback == expected)
print(type(real_actual))
print(parent(real_actual))
print(real_actual == real_expected)
print(real_fallback == real_expected)
print(kernel.nativeAvailable)
`;
  assert.deepEqual(runSage(script), [
    "<class 'ComplexNumber'>",
    "Complex Field with 53 bits of precision",
    "True",
    "True",
    "<class 'RealNumber'>",
    "Real Field with 53 bits of precision",
    "True",
    "True",
    "True",
  ]);
  assert.deepEqual(runSage(script, { SAGEJS_NATIVE_DISABLE: "1" }), [
    "<class 'ComplexNumber'>",
    "Complex Field with 53 bits of precision",
    "True",
    "True",
    "<class 'RealNumber'>",
    "Real Field with 53 bits of precision",
    "True",
    "True",
    "False",
  ]);
  assert.deepEqual(
    runSage(`from sagejs.native import is_native, native

@native
def square(value):
    return value * value

print(square(9))
print(is_native(square))
`),
    ["81", "True"],
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Native Kernel v1 typed IR, cache, ABI, and fallback passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
