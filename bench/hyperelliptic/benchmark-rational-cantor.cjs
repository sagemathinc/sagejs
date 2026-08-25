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
      "from sagejs.hyperelliptic_curves.jacobian_rational_native import rational_cantor_add_prepared_mumford_results, rational_mumford_result_from_polynomials",
      "R=PolynomialRing(QQ,'x')",
      "x=R.gen()",
      "J=HyperellipticCurve(x**5-x).jacobian()",
      "P=J((0,0))",
      "context=J.prepared_arithmetic(algorithm='native')",
      "assert context is J.prepared_arithmetic(algorithm='native')",
      "assert context.native_available",
      "scalar=2**256+1",
      `iterations=${iterations}`,
      "for _index in range(100): answer=scalar*P",
      "started=perf_counter_ns()",
      "for _index in range(iterations): answer=scalar*P",
      "scalar_elapsed=perf_counter_ns()-started",
      "assert answer == P",
      "K=HyperellipticCurve(x**5+x+1).jacobian()",
      "A=K((0,1))",
      "B=A.add(A,algorithm='reference')",
      "expected=A.add(B,algorithm='reference')",
      "add_context=K.prepared_arithmetic(algorithm='native')",
      "A_result=rational_mumford_result_from_polynomials(add_context._workspace,A[0]._exact_polynomial_resource(),A[1]._exact_polynomial_resource(),K.genus())",
      "B_result=rational_mumford_result_from_polynomials(add_context._workspace,B[0]._exact_polynomial_resource(),B[1]._exact_polynomial_resource(),K.genus())",
      "for _index in range(100): direct_result=rational_cantor_add_prepared_mumford_results(add_context._workspace,A_result,B_result,K.genus()); direct_result.close()",
      "started=perf_counter_ns()",
      "for _index in range(iterations): direct_result=rational_cantor_add_prepared_mumford_results(add_context._workspace,A_result,B_result,K.genus()); direct_result.close()",
      "direct_add_elapsed=perf_counter_ns()-started",
      "for _index in range(100): added=A+B",
      "started=perf_counter_ns()",
      "for _index in range(iterations): added=A+B",
      "add_elapsed=perf_counter_ns()-started",
      "assert added == expected",
      "started=perf_counter_ns()",
      "for _index in range(iterations): prepared_added=add_context.add_batch((A,),(B,))[0]",
      "prepared_add_elapsed=perf_counter_ns()-started",
      "assert prepared_added == expected",
      "seed=A+B",
      "seed2=seed+seed",
      "assert not seed.is_materialized()",
      "assert not seed2.is_materialized()",
      "for _index in range(100): same_added=seed+seed",
      "started=perf_counter_ns()",
      "for _index in range(iterations): same_added=seed+seed",
      "same_add_elapsed=perf_counter_ns()-started",
      "assert same_added == seed.add(seed,algorithm='reference')",
      "started=perf_counter_ns()",
      "for _index in range(iterations): chained=seed+B",
      "chained_add_elapsed=perf_counter_ns()-started",
      "assert chained == seed.add(B,algorithm='reference')",
      "for _index in range(100): larger_added=seed+seed2",
      "started=perf_counter_ns()",
      "for _index in range(iterations): larger_added=seed+seed2",
      "larger_add_elapsed=perf_counter_ns()-started",
      "assert larger_added == seed.add(seed2,algorithm='reference')",
      "started=perf_counter_ns()",
      "for _index in range(iterations): materialized=(A+B).uv()",
      "materialized_add_elapsed=perf_counter_ns()-started",
      "started=perf_counter_ns()",
      "for _index in range(iterations): hashed=hash(A+B)",
      "hashed_add_elapsed=perf_counter_ns()-started",
      "A_result.close(); B_result.close()",
      "print(repr({'iterations':iterations,'scalar_elapsed_ns':scalar_elapsed,'ns_per_scalar':scalar_elapsed/iterations,'direct_add_elapsed_ns':direct_add_elapsed,'ns_per_direct_add':direct_add_elapsed/iterations,'add_elapsed_ns':add_elapsed,'ns_per_add':add_elapsed/iterations,'prepared_add_elapsed_ns':prepared_add_elapsed,'ns_per_prepared_add':prepared_add_elapsed/iterations,'same_add_elapsed_ns':same_add_elapsed,'ns_per_same_add':same_add_elapsed/iterations,'chained_add_elapsed_ns':chained_add_elapsed,'ns_per_chained_add':chained_add_elapsed/iterations,'larger_add_elapsed_ns':larger_add_elapsed,'ns_per_larger_add':larger_add_elapsed/iterations,'materialized_add_elapsed_ns':materialized_add_elapsed,'ns_per_materialized_add':materialized_add_elapsed/iterations,'hashed_add_elapsed_ns':hashed_add_elapsed,'ns_per_hashed_add':hashed_add_elapsed/iterations,'compiled':context.native_available,'scalar_bits':scalar.bit_length(),'scalar_curve':'y^2=x^5-x','scalar_point':'(x,0) rational 2-torsion','add_curve':'y^2=x^5+x+1','add_left':'(x,1)','add_right':'2*(x,1)','same_operands':'3*(x,1)+3*(x,1)','larger_operands':'3*(x,1)+6*(x,1)','public_operators':True,'ordinary_outputs_are_lazy':True,'forced_observations_are_timed_separately':True}))",
    ].join("\n"),
  );
  const output = run(process.execPath, [sagejs, program], {
    env: { SAGEJS_NATIVE_CACHE_DIR: cache },
  });
  process.stdout.write(output + "\n");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
