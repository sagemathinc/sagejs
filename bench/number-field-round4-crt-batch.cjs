#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { compile } = require("@sagemath/sagejs/native");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sourcePath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "matrix",
  "word_prime_krylov.py",
);
const fixture = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-round4-primary.json"),
    "utf8",
  ),
).cases.find((record) => record.id === "pari-round4-vector-010-p2");

async function main() {
  const compiled = await compile({
    sourcePath,
    cacheRoot: join(dirname(sourcePath), ".sagejs-native-kernels"),
  });
  const program = String.raw`
import time
from sagejs.native import is_compiled
from sagejs.kernels.matrix.word_prime_krylov import integer_matrix_word_prime_minimal_polynomial_batch
from sagejs.number_fields.round4 import modified_round4_local_order, verify_round4_local_result
R = PolynomialRing(ZZ, 'x')
x = R.gen()
K = NumberField(R([${fixture.coefficients.join(",")}]), 'a')
metrics = {}
started = time.perf_counter()
result = modified_round4_local_order(K.equation_order(), ${fixture.prime}, strict=True)
construction_ms = 1000 * (time.perf_counter() - started)
assert result.certificate.local_index == ${fixture.local_index}
assert result.order.discriminant() == ${fixture.local_output_discriminant}
verification_started = time.perf_counter()
assert verify_round4_local_result(result)
verification_ms = 1000 * (time.perf_counter() - verification_started)
elapsed_ms = construction_ms + verification_ms
final = [stage for stage in result.plan.stages if stage.name == 'assemble-power-basis-hnf'][-1]
metrics = final.evidence['characteristic_polynomial_metrics']
print(repr({
    'elapsed_ms': elapsed_ms,
    'construction_ms': construction_ms,
    'verification_ms': verification_ms,
    'compiled_batch': is_compiled(integer_matrix_word_prime_minimal_polynomial_batch),
    'characteristic_calls': metrics['characteristic_polynomial_calls'],
    'modular_calls': metrics['modular_characteristic_calls'],
    'crt_primes': metrics['modular_characteristic_primes'],
    'batch_calls': metrics.get('modular_characteristic_batch_calls', 0),
    'batch_primes': metrics.get('modular_characteristic_batch_primes', 0),
    'reconstruction_attempts': metrics.get('modular_characteristic_reconstruction_attempts', 0),
    'local_index_valuation': result.certificate.local_index_valuation,
    'ramification_degree': final.evidence['ramification_degree'],
    'residue_degree': final.evidence['residue_degree'],
}))
`;
  const run = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input: program,
    timeout: 300_000,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(run.stderr || run.stdout);
  const record = JSON.parse(
    run.stdout.trim().replaceAll("'", '"').replace("True", "true"),
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: 1,
        workload: "PARI Round-4 vector010, exact p=2 local maximal order",
        sourceHash: compiled.sourceHash,
        nativeAbi: compiled.nativeAbi,
        proof:
          "exact minimal-polynomial coefficient bounds, unique centered CRT, exact integer annihilation, and charpoly=minpoly^(n/d)",
        ...record,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
