// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");
const sourcePath = join(root, "src/lib/sagejs/kernels/matrix/imaginary_map.py");
const rows = [
  1, 1, 6, 1, 1, 6, 1, 1, 0, -1, 1, 0,
  2, -1, 3, 2, 1, 3, 2, 2, 0, 0, 1, 1,
  2, 1, 3, 2, -1, 3, 2, 2, 0, -1, 1, 2,
];
const certificate = [1, 1, 6, 2, -1, 3, 2, 1, 3];
const invariants = [3];
const coreRows = [1, 1, 0, 2, -1, 1, 2, 1, 2];

function check(module, implementation, input) {
  const packed = (values) => module.verify_packed_imaginary_map.packExactInt64Buffer(values);
  const seen = module.createUInt64Buffer(certificate.length / 3);
  return Number(implementation(
    packed(input.rows), packed(input.certificate), packed(input.invariants),
    seen, BigInt(input.discriminant), BigInt(input.linear),
  ));
}

function pythonCheck(input) {
  const code = [
    "import json, sys",
    `sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})`,
    "from sagejs.kernels.matrix.imaginary_map import verify_packed_imaginary_map",
    "data = json.loads(sys.stdin.read())",
    "print(verify_packed_imaginary_map(data['rows'], data['certificate'], data['invariants'],",
    "    [0] * (len(data['certificate']) // 3), data['discriminant'], data['linear']))",
  ].join("\n");
  const python = process.env.SAGEJS_CPYTHON || (process.platform === "win32" ? "python" : "python3");
  const result = spawnSync(python, ["-c", code], {
    cwd: root,
    env: process.env,
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim());
}

test("native imaginary map verifier agrees with CPython and emitted JavaScript", async () => {
  const cacheRoot = mkdtempSync(join(tmpdir(), "sagejs-imaginary-map-"));
  try {
    const compiled = await compileKernel({
      sourcePath, cacheRoot, functions: ["verify_packed_imaginary_map"], jobs: 1,
    });
    const module = require(compiled.modulePath);
    const kernel = module.verify_packed_imaginary_map;
    for (const malformed of [true, "1", 1.5, 1n << 63n]) {
      assert.throws(() => kernel.packExactInt64Buffer([malformed]), TypeError);
    }
    const pristine = { rows, certificate, invariants, discriminant: -23, linear: -1 };
    const cases = [
      [pristine, 0],
      [{ ...pristine, rows: rows.map((value, index) => index === 4 ? 0 : value) }, 1],
      [{ ...pristine, rows: rows.map((value, index) => index === 23 ? 0 : value) }, 1],
      [{ ...pristine, rows: rows.map((value, index) => index === 25 ? -1 : value) }, 1],
      [{ ...pristine, certificate: certificate.map((value, index) => index === 4 ? 1 : value) }, 1],
      [{ ...pristine, invariants: [4] }, 1],
      [{ ...pristine, linear: 0 }, 1],
      [{ ...pristine, rows: coreRows }, 0],
      [{ ...pristine, rows: coreRows.map((value, index) => index === 4 ? 0 : value) }, 1],
      [{ ...pristine, rows: coreRows.map((value, index) => index === 5 ? 2 : value) }, 1],
      [{ ...pristine, rows: coreRows.map((value, index) => index === 6 ? 0 : value) }, 1],
      [{ ...pristine, rows: coreRows.map((value, index) => index === 0 ? Number.MAX_SAFE_INTEGER : value) }, 1],
      [{ ...pristine, rows: coreRows.map((value, index) => index === 1 ? Number.MAX_SAFE_INTEGER : value) }, 1],
    ];
    for (const [input, expected] of cases) {
      assert.equal(pythonCheck(input), expected);
      for (const implementation of [kernel, kernel.javascript, kernel.gmp, kernel.tagged]) {
        if (implementation) assert.equal(check(module, implementation, input), expected);
      }
    }
  } finally {
    rmSync(cacheRoot, { recursive: true, force: true });
  }
});
