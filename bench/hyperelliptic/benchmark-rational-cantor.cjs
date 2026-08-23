#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..", "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_rational_native.py",
);
const iterations = Number.parseInt(
  process.env.SAGEJS_RATIONAL_CANTOR_ITERATIONS || "10000",
  10,
);
if (!Number.isSafeInteger(iterations) || iterations <= 0) {
  throw new Error("SAGEJS_RATIONAL_CANTOR_ITERATIONS must be positive");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-rational-cantor-bench-"));
try {
  const cache = join(temporary, "cache");
  const program = join(temporary, "benchmark.py");
  run(process.execPath, [
    sagejs,
    "native",
    "compile",
    source,
    "--cache-root",
    cache,
  ]);
  writeFileSync(
    program,
    [
      "from time import perf_counter_ns",
      "from sagejs.hyperelliptic_curves.jacobian_rational_native import PreparedRationalJacobianArithmetic",
      "R=PolynomialRing(QQ,'x')",
      "x=R.gen()",
      "J=HyperellipticCurve(x**5-x).jacobian()",
      "P=J((0,0))",
      "context=PreparedRationalJacobianArithmetic(J,algorithm='native')",
      "scalar=2**256+1",
      `iterations=${iterations}`,
      "for _index in range(100): context.scalar_batch((P,),(scalar,))",
      "started=perf_counter_ns()",
      "for _index in range(iterations): answer=context.scalar_batch((P,),(scalar,))[0]",
      "elapsed=perf_counter_ns()-started",
      "assert answer == P",
      "print(repr({'iterations':iterations,'elapsed_ns':elapsed,'ns_per_scalar':elapsed/iterations,'compiled':context.native_available,'scalar_bits':scalar.bit_length(),'curve':'y^2=x^5-x','point':'(x,0) rational 2-torsion'}))",
    ].join("\n"),
  );
  const output = run(process.execPath, [sagejs, program], {
    env: { SAGEJS_NATIVE_CACHE_DIR: cache },
  });
  process.stdout.write(output + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
