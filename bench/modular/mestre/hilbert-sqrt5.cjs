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
  const repeat = positiveInteger("repeat", 5);
  const levels = option("levels", "31,389,809,2011")
    .split(",")
    .map((value) => Number(value));
  const fixtures = {
    31: [19, 2],
    389: [238, 7],
    809: [467, 14],
    2011: [736, 35],
  };
  for (const level of levels) {
    if (fixtures[level] === undefined) {
      throw new Error(`no checked split-level fixture for ${level}`);
    }
  }

  const session = await createSage();
  const started = performance.now();
  try {
    const result = await session.evaluate(`
import json
import time
from sagejs.modular_forms import HilbertModularFormsQsqrt5

fixtures = ${JSON.stringify(fixtures)}
levels = ${JSON.stringify(levels)}
repeat = ${repeat}
rows = []
for level in levels:
    root, expected_dimension = fixtures[str(level)] if str(level) in fixtures else fixtures[level]
    construction = []
    first_t2 = []
    first_t3 = []
    matvec = []
    structural = None
    for sample in range(repeat):
        begin = time.perf_counter()
        module = HilbertModularFormsQsqrt5((level,root))
        construction.append(time.perf_counter()-begin)
        assert module.dimension() == expected_dimension

        begin = time.perf_counter()
        t2 = module.T(2)
        first_t2.append(time.perf_counter()-begin)

        begin = time.perf_counter()
        t3 = module.T(3)
        first_t3.append(time.perf_counter()-begin)

        vector0 = vector(ZZ, [position+1 for position in range(module.dimension())])
        begin = time.perf_counter()
        image = t2 * vector0
        matvec.append(time.perf_counter()-begin)
        structural = {
            'dimension': module.dimension(),
            'projective_points': module.finite_hecke_set().projective_cardinality(),
            't2_nnz': t2.nnz(),
            't3_nnz': t3.nnz(),
            't2_row_sum': t2.row_sums()[0],
            't3_row_sum': t3.row_sums()[0],
            'matvec_checksum': int(sum(image)),
        }
    construction.sort(); first_t2.sort(); first_t3.sort(); matvec.sort()
    middle = repeat//2
    rows.append({
        'level_norm': level,
        'omega_residue': root,
        **structural,
        'samples': repeat,
        'construction_median_ms': 1000*construction[middle],
        'first_t2_median_ms': 1000*first_t2[middle],
        'first_t3_median_ms': 1000*first_t3[middle],
        't2_matvec_median_ms': 1000*matvec[middle],
    })
json.dumps(rows, sort_keys=True)
`);
    const payload = {
      schema: "sagejs.mestre-hilbert-sqrt5-benchmark/v1",
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      outer_wall_ms: performance.now() - started,
      records: JSON.parse(result.repr.slice(1, -1)),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

