#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compile } = require("@sagemath/sagejs/native");

const root = resolve(__dirname, "..");
const packagePath = join(root, "packages", "flint");
const sourcePath = join(
  root,
  "src/lib/sagejs/kernels/polynomial/extension_flint.py",
);
const witnessPath = join(
  root,
  "test/fixtures/native-ffi-flint-extension/witness.py",
);
const expectedProduct = [[2n, 1n], [2n, 2n], [0n, 2n], [0n, 1n]];

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function closeAll(flint, resources) {
  for (const [resource, close] of resources.reverse()) close(resource);
}

test("generated extension resources preserve identity and retained contexts", () => {
  const flint = require(packagePath);
  const manifest = require(join(
    packagePath,
    "build/generated-ffi/manifest.json",
  ));
  const addon = require(join(
    packagePath,
    "build/generated-ffi",
    manifest.addon,
  ));
  const accounted = addon.__sagejsFfiResourceExternalMemory;
  const resources = [];
  const context = flint.ffiFqContextCreate(
    new BigUint64Array([1n, 0n, 1n]),
    3n,
    3n,
  );
  const otherContext = flint.ffiFqContextCreate(
    new BigUint64Array([1n, 0n, 1n]),
    3n,
    3n,
  );
  resources.push([context, flint.ffiFqContextClose]);
  resources.push([otherContext, flint.ffiFqContextClose]);
  const left = flint.ffiFqPolynomialCreate(
    context,
    new BigUint64Array([1n, 2n, 0n, 1n, 2n, 2n]),
    6n,
    3n,
  );
  const right = flint.ffiFqPolynomialCreate(
    context,
    new BigUint64Array([2n, 0n, 1n, 1n]),
    4n,
    2n,
  );
  const other = flint.ffiFqPolynomialCreate(
    otherContext,
    new BigUint64Array([2n, 0n, 1n, 1n]),
    4n,
    2n,
  );
  const product = flint.ffiFqPolynomialMul(left, right);
  for (const resource of [left, right, other, product]) {
    resources.push([resource, flint.ffiFqPolynomialClose]);
  }
  try {
    assert.equal(flint.ffiFqContextCharacteristic(context), 3n);
    assert.equal(flint.ffiFqContextDegree(context), 2n);
    assert.ok(accounted(context) > 0n);
    assert.ok(accounted(product) > 0n);
    assert.equal(flint.ffiFqPolynomialLength(product), 4n);
    for (let coefficient = 0; coefficient < 4; coefficient += 1) {
      for (let basis = 0; basis < 2; basis += 1) {
        assert.equal(
          flint.ffiFqPolynomialCoordinate(
            product,
            BigInt(coefficient),
            BigInt(basis),
          ),
          expectedProduct[coefficient][basis],
        );
      }
    }
    assert.throws(
      () => flint.ffiFqPolynomialAdd(left, other),
      /contexts differ/,
    );
    const bytes = flint.ffiFqPolynomialCoordinateBytes(product);
    try {
      const copied = flint.ffiFlintByteRegionCopyBytes(bytes);
      assert.equal(copied.subarray(0, 4).toString(), "SJFC");
      assert.equal(copied.readBigUInt64LE(8), 2n);
      assert.equal(copied.readBigUInt64LE(16), 4n);
    } finally {
      flint.ffiFlintByteRegionClose(bytes);
    }

    flint.ffiFqContextClose(context);
    assert.equal(accounted(context), 0n);
    assert.equal(flint.ffiFqPolynomialCoordinate(product, 3n, 1n), 1n);
    flint.ffiFqContextClose(context);
  } finally {
    closeAll(flint, resources);
  }
});

test("all extension declarations are explicitly thread-affine", () => {
  const declaration = require(join(root, "ffi/flint.ffi.json"));
  const functions = declaration.functions.filter((item) =>
    item.id.startsWith("fq_"));
  assert.equal(functions.length, 23);
  assert.ok(functions.every((item) => item.effects.thread_safe === false));
});

test("typed Python safely borrows and traverses an extension resource", async () => {
  const compiled = await compile({ sourcePath });
  const module = require(compiled.modulePath);
  assert.equal(module.nativeAvailable, true);
  for (const name of [
    "flint_extension_polynomial_from_coordinates",
    "flint_extension_polynomial_add",
    "flint_extension_polynomial_multiply",
    "flint_extension_polynomial_coordinate_sum",
  ]) {
    assert.equal(module[name].nativeAvailable, true);
    const fn = compiled.ir.functions.find((candidate) => candidate.name === name);
    assert.ok(fn, `missing ${name}`);
    assert.ok(fn.foreignDependencies.every((item) => item.startsWith("flint@")));
  }
  const core = readFileSync(compiled.coreSourcePath, "utf8");
  assert.match(core, /sagejs_fq_polynomial_coordinate/);
  assert.doesNotMatch(core, /\b(?:napi_|node_api|PyObject|Py_|JSValue|v8::)/);

  for (const environment of [
    { SAGEJS_NATIVE_REQUIRED: "1" },
    { SAGEJS_NATIVE_AUTOLOAD: "0" },
    { SAGEJS_NATIVE_DISABLE: "1" },
  ]) {
    assert.equal(
      run(process.execPath, [join(root, "bin/sagejs"), "--python", witnessPath], environment),
      "extension-resource-kernel-ok",
    );
  }
});

test("generated product coordinates agree with SageMath", () => {
  const sage = process.env.SAGE_BIN || "/home/user/sagelite/sage";
  if (!existsSync(sage)) return;
  const source = [
    "import json",
    "F.<a> = GF(9, modulus=x^2 + 1)",
    "R.<t> = F[]",
    "left = F([1,2]) + F([0,1])*t + F([2,2])*t^2",
    "right = F([2,0]) + F([1,1])*t",
    "print(json.dumps([[int(v) for v in list(c)] + [0]*(2-len(list(c))) for c in (left*right).list()]))",
  ].join("; ");
  const actual = JSON.parse(run(sage, ["-c", source]).split(/\r?\n/).at(-1));
  assert.deepEqual(actual, expectedProduct.map((row) => row.map(Number)));
});
