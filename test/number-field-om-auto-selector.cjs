"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const vector429 = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
);

function runPython(command, args, script, timeout = 60_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: script,
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
  );
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

const selectionScript = String.raw`
import json
import sys
sys.path.append(${JSON.stringify(join(root, "src/lib"))})

from sagejs.number_fields.om_auto_selector import (
    om_auto_prefilter,
    om_auto_shape_prefilter,
    select_om_local_basis,
)
from sagejs.number_fields.om_maxmin import (
    regular_local_basis,
)
from sagejs.number_fields.maximal_order_engine import _auto_om_local_order_with_proof

case = json.loads(r'''${JSON.stringify(vector429)}''')
polynomial = tuple(int(value) for value in case["polynomial"]["coefficients"])
R = PolynomialRing(ZZ, "x")
K = NumberField(R(polynomial), "a")
prime = 7
valuation = 1008
degrees = (1,)
multiplicities = (64,)

def basis_coordinates_are_integral(value_numerator, value_denominator, basis):
    degree = len(basis)
    values = [0] * degree
    for index, coefficient in enumerate(value_numerator):
        if index < degree:
            values[index] = coefficient
        elif coefficient:
            return False
    for index in range(degree - 1, -1, -1):
        element = basis[index]
        leading = values[index]
        if leading * element.denominator % value_denominator != 0:
            return False
        for exponent, coefficient in enumerate(element.numerator):
            values[exponent] -= leading * coefficient
    return not any(values)

selected = select_om_local_basis(
    polynomial,
    prime,
    local_discriminant_valuation=valuation,
    factor_degrees=degrees,
    factor_multiplicities=multiplicities,
    native_capable=True,
)
if not selected.selected or selected.result is None:
    raise AssertionError(selected.reason)
forced = regular_local_basis(
    polynomial,
    prime,
    local_discriminant_valuation=valuation,
    differential_evidence=True,
)

degree = len(polynomial) - 1
selected_basis = selected.result.order_basis
forced_basis = forced.order_basis
if selected_basis is None or forced_basis is None:
    raise AssertionError("a complete OM result omitted its basis")
selected_equals_forced = selected_basis.canonical_key() == forced_basis.canonical_key()

external_denominator = int(case["basis"]["denominator"])
external_exponent = 0
while external_denominator % prime == 0:
    external_denominator //= prime
    external_exponent += 1
primary_denominator = prime ** external_exponent
external_rows = [
    [int(value) % primary_denominator for value in row]
    for row in case["basis"]["numerator"]
]
external_contained = all(
    basis_coordinates_are_integral(
        tuple(row),
        primary_denominator,
        selected.result.certificate.basis,
    )
    for row in external_rows
)

corrupt_rows = [list(row) for row in external_rows]
corrupt_rows[0][0] = (corrupt_rows[0][0] + 1) % primary_denominator
corruption_rejected = not basis_coordinates_are_integral(
    tuple(corrupt_rows[0]),
    primary_denominator,
    selected.result.certificate.basis,
)

unavailable = select_om_local_basis(
    polynomial,
    prime,
    local_discriminant_valuation=valuation,
    factor_degrees=degrees,
    factor_multiplicities=multiplicities,
    native_capable=False,
)
bounded = om_auto_prefilter(
    polynomial,
    prime,
    local_discriminant_valuation=valuation,
    factor_degrees=degrees,
    factor_multiplicities=multiplicities,
    memory_budget_bytes=1,
    native_capable=True,
)
malformed = om_auto_prefilter(
    polynomial,
    prime,
    local_discriminant_valuation=valuation,
    factor_degrees=degrees,
    factor_multiplicities=(63,),
    native_capable=True,
)
small = om_auto_prefilter(
    polynomial,
    prime,
    local_discriminant_valuation=64,
    factor_degrees=degrees,
    factor_multiplicities=multiplicities,
    native_capable=True,
)
unmeasured_small_characteristics = {
    prime: om_auto_shape_prefilter(
        polynomial,
        prime,
        local_discriminant_valuation=valuation,
        native_capable=True,
    ).as_dict()
    for prime in (2, 3, 5)
}
engine_unmeasured_small_characteristics = {}
for small_prime in (2, 3, 5):
    engine_order, engine_evidence, engine_proof = _auto_om_local_order_with_proof(
        K,
        list(polynomial),
        1,
        int(case["equationDiscriminant"]),
        small_prime,
    )
    engine_unmeasured_small_characteristics[small_prime] = {
        "returned_order": engine_order is not None,
        "evidence": engine_evidence,
        "returned_proof": engine_proof is not None,
    }
immutable = False
try:
    selected.prefilter.eligible = False
except AttributeError:
    immutable = True

evidence = selected.as_dict()
print(json.dumps({
    "selected": selected.selected,
    "selected_equals_forced": selected_equals_forced,
    "selected_equals_external": (
        selected_basis.denominator == primary_denominator
        and external_contained
        and selected.result.certificate.local_index_valuation == next(
            int(item["valuation"])
            for item in case["localIndexFactors"]
            if int(item["value"]) == prime
        )
    ),
    "corruption_rejected": corruption_rejected,
    "local_index": selected.result.certificate.local_index_valuation,
    "external_index": next(
        int(item["valuation"])
        for item in case["localIndexFactors"]
        if int(item["value"]) == prime
    ),
    "unavailable_selected": unavailable.selected,
    "unavailable_ran_om": unavailable.result is not None,
    "bounded": bounded.eligible,
    "malformed": malformed.eligible,
    "small": small.eligible,
    "unmeasured_small_characteristics": unmeasured_small_characteristics,
    "engine_unmeasured_small_characteristics": (
        engine_unmeasured_small_characteristics
    ),
    "immutable": immutable,
    "evidence": evidence,
}, sort_keys=True))
`;

test("OM auto selection is input-derived, exact, and fail-closed", () => {
  const output = runPython(
    process.execPath,
    [join(root, "bin/sagejs"), "--python"],
    selectionScript,
    180_000,
  );
  assert.equal(output.selected, true);
  assert.equal(output.selected_equals_forced, true);
  assert.equal(output.selected_equals_external, true);
  assert.equal(output.corruption_rejected, true);
  assert.equal(output.local_index, output.external_index);
  assert.equal(output.unavailable_selected, false);
  assert.equal(output.unavailable_ran_om, false);
  assert.equal(output.bounded, false);
  assert.equal(output.malformed, false);
  assert.equal(output.small, false);
  for (const prime of [2, 3, 5]) {
    const decision = output.unmeasured_small_characteristics[String(prime)];
    assert.equal(decision.eligible, false);
    assert.match(decision.reason, /starts at p=7/);
    const engineDecision =
      output.engine_unmeasured_small_characteristics[String(prime)];
    assert.equal(engineDecision.returned_order, false);
    assert.equal(engineDecision.evidence.stage, "shape-prefilter");
    assert.equal(engineDecision.evidence.eligible, false);
    assert.match(engineDecision.evidence.reason, /starts at p=7/);
  }
  assert.equal(output.immutable, true);
  assert.equal(output.evidence.algorithm, "om-maxmin");
  assert.equal(output.evidence.complete, true);
  assert.equal(output.evidence.native_capable, true);
  assert.equal(
    output.evidence.measured_crossover_region,
    "deep-index-shallow-types-v1",
  );
  assert.equal(output.evidence.local_validation.multiplication_closed, true);
  assert.equal(output.evidence.local_validation.locally_maximal, true);
  assert.ok(output.evidence.suppressed_alternatives.length >= 2);
});

test("production Sage.js exposes both OM proof kernels to the selector", () => {
  const script = String.raw`
import json
from sagejs.number_fields.om_auto_selector import om_auto_prefilter
polynomial = tuple(int(value) for value in ${JSON.stringify(
    vector429.polynomial.coefficients,
  )})
decision = om_auto_prefilter(
    polynomial,
    7,
    local_discriminant_valuation=1008,
    factor_degrees=(1,),
    factor_multiplicities=(64,),
)
print(json.dumps(decision.as_dict(), sort_keys=True))
`;
  const output = runPython(
    process.execPath,
    [join(root, "bin/sagejs"), "--python"],
    script,
    180_000,
  );
  assert.equal(output.native_capable, true);
  assert.equal(output.eligible, true);
  assert.equal(output.predicted_work["om-maxmin"] * 4 < output.predicted_work.best_competitor, true);
});

test("the precompiled OM worker issues an exact current-call proof", () => {
  const script = String.raw`
import json
import time
from sagejs.number_fields.local_parallel import make_local_job
from sagejs.number_fields.local_parallel_worker import (
    authenticated_om_worker_proof_matches,
    finish_public_om_candidate_job,
    start_public_om_candidate_job,
)
polynomial = tuple(int(value) for value in ${JSON.stringify(
    vector429.polynomial.coefficients,
  )})
job = make_local_job(
    polynomial, 7, 0, (0, 1), 1008, 3355000, 450000000,
    algorithm="om-maxmin",
)
started = time.perf_counter_ns()
handle = start_public_om_candidate_job(job)
if handle is None:
    raise AssertionError("the exact precompiled OM worker is unavailable")
issued = finish_public_om_candidate_job(handle, timeout=15)
if issued is None:
    raise AssertionError("the exact precompiled OM worker did not issue a proof")
candidate, proof = issued
rows = [list(row) for row in candidate[3]]
matched = authenticated_om_worker_proof_matches(
    proof,
    job=job,
    basis_numerator=rows,
    basis_denominator=candidate[4],
    index=candidate[5],
)
rows[0][0] += 1
corruption_rejected = not authenticated_om_worker_proof_matches(
    proof,
    job=job,
    basis_numerator=rows,
    basis_denominator=candidate[4],
    index=candidate[5],
)
print(json.dumps({
    "elapsed_us": (time.perf_counter_ns() - started) // 1000,
    "matched": matched,
    "corruption_rejected": corruption_rejected,
    "index": str(candidate[5]),
    "certificate_id": proof.certificate_id,
}))
`;
  const output = runPython(
    process.execPath,
    [join(root, "bin/sagejs")],
    script,
    30_000,
  );
  assert.equal(output.matched, true);
  assert.equal(output.corruption_rejected, true);
  assert.equal(output.index, (7n ** 480n).toString());
  assert.match(output.certificate_id, /^om2-[a-f0-9]{16}$/);
  assert.ok(output.elapsed_us < 10_000_000);
});
