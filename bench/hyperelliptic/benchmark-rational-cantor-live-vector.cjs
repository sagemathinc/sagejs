#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
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
  process.env.SAGEJS_RATIONAL_CANTOR_VECTOR_ITERATIONS || "20000",
  10,
);
const samples = Number.parseInt(
  process.env.SAGEJS_RATIONAL_CANTOR_VECTOR_SAMPLES || "5",
  10,
);
if (!Number.isSafeInteger(iterations) || iterations <= 0) {
  throw new Error("SAGEJS_RATIONAL_CANTOR_VECTOR_ITERATIONS must be positive");
}
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 20) {
  throw new Error("SAGEJS_RATIONAL_CANTOR_VECTOR_SAMPLES must be from 1 through 20");
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
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

const temporary = mkdtempSync(join(tmpdir(), "sagejs-rational-cantor-vector-"));
try {
  const cache = join(temporary, "cache");
  const program = join(temporary, "benchmark.py");
  run(process.execPath, [sagejs, "native", "compile", source, "--cache-root", cache]);
  writeFileSync(
    program,
    [
      "import hashlib",
      "import json",
      "from time import perf_counter_ns",
      "from sagejs.native import integer_buffer_values, is_compiled",
      "from sagejs.hyperelliptic_curves.jacobian_rational_native import rational_cantor_add_prepared_mumford_results, rational_mumford_result_from_polynomials, rational_mumford_result_write_row",
      "R=PolynomialRing(QQ,'x')",
      "x=R.gen()",
      "J=HyperellipticCurve(x**5+x+1).jacobian()",
      "A=J((0,1))",
      "B=A.add(A,algorithm='reference')",
      "expected=A.add(B,algorithm='reference')",
      "context=J.prepared_arithmetic(algorithm='native')",
      "assert context.native_available and is_compiled(rational_mumford_result_write_row)",
      "left=rational_mumford_result_from_polynomials(context._workspace,A[0]._exact_polynomial_resource(),A[1]._exact_polynomial_resource(),J.genus())",
      "right=rational_mumford_result_from_polynomials(context._workspace,B[0]._exact_polynomial_resource(),B[1]._exact_polynomial_resource(),J.genus())",
      "retained=rational_cantor_add_prepared_mumford_results(context._workspace,left,right,J.genus())",
      "for _index in range(100): assert rational_mumford_result_write_row(context._add_output,context._workspace,retained,J.genus())",
      `iterations=${iterations}`,
      `sample_count=${samples}`,
      "write_samples=[]",
      "for _sample in range(sample_count):",
      "    started=perf_counter_ns()",
      "    for _index in range(iterations): ok=rational_mumford_result_write_row(context._add_output,context._workspace,retained,J.genus())",
      "    write_samples.append(perf_counter_ns()-started)",
      "    assert ok",
      "add_samples=[]",
      "for _sample in range(sample_count):",
      "    started=perf_counter_ns()",
      "    for _index in range(iterations):",
      "        result=rational_cantor_add_prepared_mumford_results(context._workspace,left,right,J.genus())",
      "        result.close()",
      "    add_samples.append(perf_counter_ns()-started)",
      "combined_samples=[]",
      "for _sample in range(sample_count):",
      "    started=perf_counter_ns()",
      "    for _index in range(iterations):",
      "        result=rational_cantor_add_prepared_mumford_results(context._workspace,left,right,J.genus())",
      "        ok=rational_mumford_result_write_row(context._add_output,context._workspace,result,J.genus())",
      "        result.close()",
      "    combined_samples.append(perf_counter_ns()-started)",
      "    assert ok",
      "row=tuple(integer_buffer_values(context._add_output))",
      "assert context._unpack_output(row)==expected",
      "digest=hashlib.sha256(json.dumps([str(value) for value in row],separators=(',',':')).encode('utf-8')).hexdigest()",
      "retained.close(); left.close(); right.close(); context.close()",
      "def result(samples):",
      "    ordered=sorted(samples)",
      "    median=ordered[len(ordered)//2]",
      "    return {'samples_ns':samples,'median_ns':median,'median_ns_per_operation':median/iterations}",
      "print(json.dumps({'schema':'sagejs.hyperelliptic/rational-cantor-live-vector-evaluation-v1','iterations':iterations,'samples':sample_count,'compiled':True,'write_row':result(write_samples),'retained_add_and_close':result(add_samples),'add_write_and_close':result(combined_samples),'exact_row_sha256':digest,'exact_reference_equal':True},sort_keys=True,separators=(',',':')))",
    ].join("\n"),
  );
  const output = run(process.execPath, [sagejs, program], {
    env: { SAGEJS_NATIVE_CACHE_DIR: cache },
  });
  const payload = JSON.parse(output.split(/\r?\n/u).at(-1));
  payload.source = {
    commit: run("git", ["rev-parse", "HEAD"]),
    jacobian_rational_native_sha256: createHash("sha256")
      .update(readFileSync(source))
      .digest("hex"),
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
