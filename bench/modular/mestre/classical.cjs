#!/usr/bin/env node
"use strict";

const { performance } = require("node:perf_hooks");
const { createSage } = require("../../../dist/tools/kernel.js");

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length);
}

function positiveInteger(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

async function main() {
  const repeat = positiveInteger("repeat", 3);
  const primes = option("primes", "389,10007")
    .split(",")
    .map((value) => Number(value));
  if (primes.some((value) => !Number.isSafeInteger(value) || value < 5)) {
    throw new Error("--primes must contain integers at least five");
  }

  const session = await createSage();
  const started = performance.now();
  try {
    const result = await session.evaluate(`
import json
import time
from sagejs.kernels.matrix.sparse_prime_field import word_prime_csr_projected_sequence
from sagejs.native import is_compiled

assert is_compiled(word_prime_csr_projected_sequence)
rows = []
for characteristic in ${JSON.stringify(primes)}:
    samples = []
    for sample in range(${repeat}):
        begin = time.perf_counter()
        module = SupersingularModule(characteristic)
        construction = time.perf_counter() - begin

        begin = time.perf_counter()
        operator = module.T(2)
        first_operator = time.perf_counter() - begin

        source = vector(ZZ, [index + 1 for index in range(module.dimension())])
        begin = time.perf_counter()
        image = operator * source
        matvec = time.perf_counter() - begin

        begin = time.perf_counter()
        candidate = operator.wiedemann_certificate(
            1000003, projections=2, replay_count=1, proof="replay"
        )
        krylov = time.perf_counter() - begin
        assert candidate.degree() == module.dimension()
        assert not candidate.is_exact()

        exact = None
        exact_seconds = None
        if module.dimension() <= 64:
            begin = time.perf_counter()
            certificate = operator.characteristic_polynomial_certificate()
            exact_seconds = time.perf_counter() - begin
            assert certificate.verify(operator)
            assert certificate.polynomial() == operator.matrix().charpoly()
            exact = [int(value) for value in certificate.coefficients()]

        samples.append({
            "construction_seconds": construction,
            "first_t2_seconds": first_operator,
            "matvec_seconds": matvec,
            "projected_krylov_seconds": krylov,
            "exact_charpoly_seconds": exact_seconds,
            "dimension": module.dimension(),
            "nonzeros": operator.nnz(),
            "row_sum": int(operator.row_sums()[0]),
            "matvec_checksum": int(sum(image)),
            "candidate_degree": candidate.degree(),
            "candidate_coefficients_checksum": int(sum(candidate.coefficients())),
            "exact_coefficients": exact,
        })
    rows.append({"prime": characteristic, "samples": samples})
json.dumps(rows, sort_keys=True)
`);
    process.stdout.write(
      `${JSON.stringify(
        {
          schema: "sagejs.mestre-classical-sparse-benchmark.v1",
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          outer_wall_ms: performance.now() - started,
          repeat,
          records: JSON.parse(result.repr.slice(1, -1)),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
