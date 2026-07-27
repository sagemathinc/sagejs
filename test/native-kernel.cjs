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
const mpc = require("../packages/flint");

const root = join(__dirname, "..");
const sourcePath = join(root, "bench", "native-kernel-input.sage");
const source = readFileSync(sourcePath, "utf8");
const signatures = {
  multiply_loop: {
    arguments: ["ComplexField", "uint64"],
    returns: "ComplexNumber",
  },
  real_multiply_loop: {
    arguments: ["RealField", "uint64"],
    returns: "RealNumber",
  },
};
const ir = lowerSource(source, sourcePath, signatures);
const complexFunction = ir.functions.find(
  (fn) => fn.name === "multiply_loop",
);
const realFunction = ir.functions.find(
  (fn) => fn.name === "real_multiply_loop",
);
const generatedC = generateC(ir);

assert.equal(ir.version, 0);
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
assert.throws(
  () =>
    lowerSource(
      "def f(field, n):\n    return field(\"1\", \"0\")\n",
      "invalid.sage",
      {
        f: {
          arguments: ["ComplexField", "uint64"],
          returns: "ComplexNumber",
        },
      },
    ),
  /native function must return a ComplexNumber local/,
);

const temporary = mkdtempSync(join(tmpdir(), "sagejs-native-kernel-"));

function complex(realText, imagText, precision) {
  return mpc.complexFromReals(
    mpc.realFromString(realText, precision),
    mpc.realFromString(imagText, precision),
  );
}

function reference(precision, iterations) {
  let value = complex("1.25", "-0.75", precision);
  const step = complex(
    "1.0000000000000002",
    "0.0000000000000001",
    precision,
  );
  for (let index = 0; index < iterations; index += 1)
    value = mpc.complexMul(value, step);
  return value;
}

function realReference(precision, iterations) {
  let value = mpc.realFromString("1.25", precision);
  const step = mpc.realFromString("1.0000000000000002", precision);
  for (let index = 0; index < iterations; index += 1)
    value = mpc.realMul(value, step);
  return value;
}

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
    signatures,
  };
  const first = compileKernel(options);
  const second = compileKernel(options);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(first.cacheKey, second.cacheKey);
  assert.equal(first.modulePath, second.modulePath);

  const addon = require(first.addonPath);
  for (const precision of [53, 1000, 10000]) {
    const actual = addon.multiply_loop(precision, 25);
    assert.equal(mpc.complexPrecision(actual), precision);
    assert.equal(
      mpc.complexToString(actual),
      mpc.complexToString(reference(precision, 25)),
    );
    const actualReal = addon.real_multiply_loop(precision, 25);
    assert.equal(mpc.realPrecision(actualReal), precision);
    assert.equal(
      mpc.realToString(actualReal),
      mpc.realToString(realReference(precision, 25)),
    );
  }

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
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log("Native Kernel v0 typed IR, cache, ABI, and fallback passed.");
