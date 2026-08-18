#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const vector429 = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
).cases.find((item) => item.id === "pari-round4-vector-429");
const samples = Math.max(
  1,
  Number(process.env.SAGEJS_OM_P7_PROJECTION_SAMPLES || 3),
);

const script = String.raw`
import json
import sys
import time
sys.path.append("${join(root, "src/lib")}")

from sagejs.native import is_compiled
from sagejs.number_fields import om_maxmin
from sagejs.number_fields.om_authenticated_projection import (
    authenticate_first_order_om_type_tree,
    validate_triangular_basis_with_authenticated_tree,
)
from sagejs.number_fields.om_types import build_om_type_tree, validate_type_tree

polynomial = tuple(int(value) for value in ${JSON.stringify(
    vector429.polynomial.coefficients,
  )})
samples = ${samples}

def elapsed(call):
    started = time.perf_counter()
    value = call()
    return value, 1000 * (time.perf_counter() - started)

tree, construction_ms = elapsed(lambda: build_om_type_tree(polynomial, 7))
rebuilt, reconstruction_ms = elapsed(lambda: validate_type_tree(tree))
projection, authentication_ms = elapsed(
    lambda: authenticate_first_order_om_type_tree(tree)
)
if not rebuilt.valid or projection is None or not projection.certified:
    raise AssertionError("one OM type-tree proof path failed")

baseline = []
candidate = []
baseline_keys = []
candidate_keys = []
ordinary_validate = om_maxmin.validate_triangular_basis
for _sample in range(samples):
    ordinary, ordinary_ms = elapsed(
        lambda: om_maxmin.regular_local_basis(
            polynomial,
            7,
            local_discriminant_valuation=1008,
            differential_evidence=True,
        )
    )
    baseline.append(ordinary_ms)
    baseline_keys.append(ordinary.order_basis.canonical_key())

    def retained_validate(polynomial, prime, tree, basis, expected_index):
        retained = authenticate_first_order_om_type_tree(tree)
        if retained is None:
            return ordinary_validate(polynomial, prime, tree, basis, expected_index)
        return validate_triangular_basis_with_authenticated_tree(
            polynomial, prime, retained, basis, expected_index
        )

    om_maxmin.validate_triangular_basis = retained_validate
    try:
        retained, retained_ms = elapsed(
            lambda: om_maxmin.regular_local_basis(
                polynomial,
                7,
                local_discriminant_valuation=1008,
                differential_evidence=True,
            )
        )
    finally:
        om_maxmin.validate_triangular_basis = ordinary_validate
    candidate.append(retained_ms)
    candidate_keys.append(retained.order_basis.canonical_key())
    if (
        ordinary.status != "complete"
        or retained.status != "complete"
        or ordinary.certificate is None
        or retained.certificate is None
        or not ordinary.certificate.validation.valid
        or not retained.certificate.validation.valid
        or ordinary.type_tree.certificate_id != retained.type_tree.certificate_id
        or ordinary.order_basis.canonical_key() != retained.order_basis.canonical_key()
    ):
        raise AssertionError("paired OM results differ")

baseline.sort()
candidate.sort()
median = lambda rows: rows[len(rows) // 2]
print(json.dumps({
    "schema": "sagejs.number-fields/om-p7-authenticated-projection-benchmark-v1",
    "case_id": "pari-round4-vector-429",
    "prime": 7,
    "degree": 64,
    "samples": samples,
    "workload": "complete first-order p-regular OM tree, MaxMin/HNF, packed closure, and exact local certificate",
    "proof_boundary": {
        "construction_ms": construction_ms,
        "duplicate_reconstruction_ms": reconstruction_ms,
        "retained_authentication_ms": authentication_ms,
        "saved_proof_ms": reconstruction_ms - authentication_ms,
    },
    "end_to_end": {
        "ordinary_samples_ms": baseline,
        "retained_samples_ms": candidate,
        "ordinary_median_ms": median(baseline),
        "retained_median_ms": median(candidate),
        "saved_median_ms": median(baseline) - median(candidate),
        "speedup": median(baseline) / median(candidate),
    },
    "exactness": {
        "canonical_basis_equal": baseline_keys == candidate_keys,
        "local_index_valuation": 480,
    },
    "native": {
        "maxmin": is_compiled(om_maxmin.packed_maxmin_valuations_are_maximal),
        "closure": is_compiled(om_maxmin.packed_triangular_basis_is_closed),
    },
}, sort_keys=True))
`;

function measure(label, command, args) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: script,
    maxBuffer: 32 * 1024 * 1024,
    timeout: Number(process.env.SAGEJS_OM_P7_PROJECTION_TIMEOUT_MS || 120_000),
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return {
    label,
    cold_process_wall_ms: Number(process.hrtime.bigint() - started) / 1e6,
    ...JSON.parse(result.stdout.trim().split("\n").at(-1)),
  };
}

console.log(
  JSON.stringify(
    {
      schema: "sagejs.number-fields/om-p7-authenticated-projection-matrix-v1",
      policy: {
        samples,
        target_saved_median_ms: 500,
        exact_source: true,
        fixture_dispatch: false,
      },
      implementations: [
        measure("cpython", "python3", ["-"]),
        measure("sagejs", process.execPath, [
          join(root, "bin/sagejs"),
          "--python",
        ]),
      ],
    },
    null,
    2,
  ),
);
