// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { join } = require("node:path");

const root = join(__dirname, "..");

function python(source) {
  return JSON.parse(
    execFileSync("python3", ["-c", `import json, sys\nsys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})\n${source}`], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    }),
  );
}

test("direct Hasse-Witt matrix matches the published genus-3 example", () => {
  const observed = python(String.raw`
import json
from sagejs.hyperelliptic_curves.hasse_witt import (
    hasse_witt_lpolynomial_residues,
    hasse_witt_matrix,
)

# Harvey--Sutherland II, section 5: coefficients are ascending here.
f = [23, 19, 17, 13, 11, 7, 5, 3, 2]
print(json.dumps({
    "matrix": hasse_witt_matrix(f, 97),
    "residues": hasse_witt_lpolynomial_residues(f, 97),
}))
`);
  assert.deepEqual(observed.matrix, [
    [9, 37, 54],
    [70, 62, 16],
    [61, 4, 26],
  ]);
  // Sage 10.9: L(T)=1-52*T^2-594*T^3-5044*T^4+97^3*T^6.
  assert.deepEqual(observed.residues, [0, 45, 85]);
});

test("septic and octic residues match Sage Frobenius polynomials", () => {
  const observed = python(String.raw`
import json
from sagejs.hyperelliptic_curves.hasse_witt import (
    hasse_witt_lpolynomial_residues,
)

# SageMath 10.9 frobenius_polynomial() fixtures, including both points-at-
# infinity cases and small characteristics where c1 need not lift uniquely.
fixtures = [
    (7,  [1, 1, 0, 1, 0, 0, 0, 1],       (-3, 5, 7)),
    (11, [2, 1, 0, 2, 0, 0, 0, 1],       (-7, 25, -81)),
    (13, [1, 2, 3, 0, 1, 0, 0, 1],       (-3, -6, 34)),
    (17, [3, 0, 1, 0, 2, 0, 0, 1, 1],    (5, 21, 41)),
    (19, [1, 1, 0, 0, 0, 0, 0, 1],       (3, 25, 37)),
]
print(json.dumps([
    [hasse_witt_lpolynomial_residues(f, p), tuple(c % p for c in exact)]
    for p, f, exact in fixtures
]))
`);
  for (const [actual, expected] of observed) {
    assert.deepEqual(actual, expected);
  }
});

test("Hasse-Witt validates the model instead of changing genus silently", () => {
  const observed = python(String.raw`
import json
from sagejs.hyperelliptic_curves.hasse_witt import hasse_witt_matrix

bad = []
for f, p, genus in [
    ([1, 1, 0, 0, 0, 0, 0, 0], 2, 3),
    ([1, 1, 0, 0, 0, 0, 0, 1], 9, 3),
    ([0, 0, 1, 0, 0, 0, 0, 1], 7, 3),
    ([1, 1, 0, 0, 0, 1], 7, 3),
]:
    try:
        hasse_witt_matrix(f, p, genus)
    except Exception as error:
        bad.append([type(error).__name__, str(error)])
try:
    hasse_witt_matrix([1, -1, 0, 0, 0, 0, 0, 1], 1009, 3)
except Exception as error:
    bad.append([type(error).__name__, str(error)])
print(json.dumps(bad))
`);
  assert.equal(observed.length, 5);
  assert.match(observed[0][1], /odd characteristic/);
  assert.match(observed[1][1], /odd prime/);
  assert.match(observed[2][1], /singular/);
  assert.match(observed[3][1], /reduced degree/);
  assert.equal(observed[4][0], "HasseWittResourceError");
  assert.match(observed[4][1], /remainder-forest/);
});

test("exact Weil lifting preserves all ambiguity", () => {
  const observed = python(String.raw`
import json
from sagejs.hyperelliptic_curves.genus3_completion import (
    complete_genus3_lpolynomial,
    enumerate_genus3_weil_candidates,
)

# Sage 10.9 for y^2=x^7-x+1 over F_101:
# L(T)=1+12T+56T^2+186T^3+5656T^4+122412T^5+1030301T^6.
residues = (12, 56, 85)
enumeration = enumerate_genus3_weil_candidates(101, residues)
completion = complete_genus3_lpolynomial(101, residues)
boundary = enumerate_genus3_weil_candidates(5, (0, 0, 0))
repeated = enumerate_genus3_weil_candidates(5, (4, 0, 0))
print(json.dumps({
    "enum_status": enumeration["status"],
    "count": enumeration["candidate_count"],
    "contains_oracle": (12, 56, 186) in enumeration["candidates"],
    "completion_status": completion["status"],
    "completion_count": completion["remaining_candidate_count"],
    "coefficients": completion["coefficients"],
    # Q=X(X^2-4p) has roots exactly at both Weil interval endpoints.
    "contains_boundary": (0, -5, 0) in boundary["candidates"],
    # Q=X^2(X-1) has discriminant zero and a repeated real root.
    "contains_repeated": (-1, 15, -10) in repeated["candidates"],
}))
`);
  assert.equal(observed.enum_status, "ok");
  assert.equal(observed.count, 50);
  assert.equal(observed.contains_oracle, true);
  assert.equal(observed.completion_status, "indeterminate");
  assert.equal(observed.completion_count, 50);
  assert.equal(observed.coefficients, null);
  assert.equal(observed.contains_boundary, true);
  assert.equal(observed.contains_repeated, true);
});

test("orders and certified exponent divisors complete the lift exactly", () => {
  const observed = python(String.raw`
import json
from sagejs.hyperelliptic_curves.genus3_completion import (
    complete_genus3_lpolynomial,
    jacobian_order_from_coefficients,
    twist_order_from_coefficients,
)

p = 101
residues = (12, 56, 85)
oracle = (12, 56, 186)
order = jacobian_order_from_coefficients(oracle, p)
twist_order = twist_order_from_coefficients(oracle, p)
annihilation_orders = []
def annihilates_witness(order):
    annihilation_orders.append(order)
    return order % 149 == 0
answers = [
    # Completion streams filters, so an output cap of one is sufficient even
    # though the unfiltered residue class has fifty Weil lifts.
    complete_genus3_lpolynomial(
        p, residues, jacobian_order=order, max_candidates=1
    ),
    complete_genus3_lpolynomial(p, residues, twist_order=twist_order),
    # 149 is the exact order of a witnessed Jacobian element and divides #J.
    complete_genus3_lpolynomial(
        p, residues, jacobian_exponent_witnesses=(149,)
    ),
    # 739 analogously witnesses the quadratic-twist exponent.
    complete_genus3_lpolynomial(
        p, residues, twist_exponent_witnesses=(739,)
    ),
    complete_genus3_lpolynomial(
        p, residues, jacobian_annihilation_tests=(annihilates_witness,)
    ),
]
print(json.dumps({
    "order": order,
    "twist_order": twist_order,
    "statuses": [answer["status"] for answer in answers],
    "coefficients": [answer["coefficients"] for answer in answers],
    "lpolynomial": answers[0]["lpolynomial"],
    "annihilation_calls": answers[-1]["diagnostics"]["annihilation_test_calls"],
    "observed_calls": len(annihilation_orders),
}))
`);
  assert.equal(observed.order, 1158624);
  assert.equal(observed.twist_order, 913404);
  assert.deepEqual(observed.statuses, [
    "unique",
    "unique",
    "unique",
    "unique",
    "unique",
  ]);
  assert.deepEqual(observed.coefficients, [
    [12, 56, 186],
    [12, 56, 186],
    [12, 56, 186],
    [12, 56, 186],
    [12, 56, 186],
  ]);
  assert.deepEqual(observed.lpolynomial, [
    1, 12, 56, 186, 5656, 122412, 1030301,
  ]);
  assert.deepEqual(observed.annihilation_calls, { jacobian: 50, twist: 0 });
  assert.equal(observed.observed_calls, 50);
});

test("inconsistent evidence and resource exhaustion are explicit", () => {
  const observed = python(String.raw`
import json
from sagejs.hyperelliptic_curves.genus3_completion import (
    complete_genus3_lpolynomial,
    enumerate_genus3_weil_candidates,
)

residues = (12, 56, 85)
inconsistent = complete_genus3_lpolynomial(101, residues, jacobian_order=1)
limited = enumerate_genus3_weil_candidates(
    101, residues, max_combinations=10
)
output_limited = enumerate_genus3_weil_candidates(
    101, residues, max_candidates=1
)
def explode(_order):
    raise RuntimeError("group operation failed")
try:
    complete_genus3_lpolynomial(
        101, residues, jacobian_annihilation_tests=(explode,)
    )
except Exception as error:
    callback_error = [type(error).__name__, str(error)]
try:
    complete_genus3_lpolynomial(
        101, residues, jacobian_annihilation_tests=(lambda _order: 1,)
    )
except Exception as error:
    callback_type_error = [type(error).__name__, str(error)]
print(json.dumps({
    "inconsistent": inconsistent["status"],
    "limited": limited,
    "output_limited": output_limited,
    "callback_error": callback_error,
    "callback_type_error": callback_type_error,
}))
`);
  assert.equal(observed.inconsistent, "inconsistent");
  assert.equal(observed.limited.status, "resource_limit");
  assert.equal(observed.limited.truncated, true);
  assert.deepEqual(observed.limited.candidates, []);
  assert.match(observed.limited.diagnostics.reason, /max_combinations/);
  assert.equal(observed.output_limited.status, "resource_limit");
  assert.deepEqual(observed.output_limited.candidates, []);
  assert.match(observed.output_limited.diagnostics.reason, /max_candidates/);
  assert.deepEqual(observed.callback_error, [
    "RuntimeError",
    "group operation failed",
  ]);
  assert.equal(observed.callback_type_error[0], "TypeError");
  assert.match(observed.callback_type_error[1], /must return bool/);
});

test("completion rejects inexact integer evidence instead of truncating it", () => {
  const observed = python(String.raw`
import json
from fractions import Fraction
from sagejs.hyperelliptic_curves.genus3_completion import (
    complete_genus3_lpolynomial,
    enumerate_genus3_weil_candidates,
)

failures = []
calls = [
    lambda: complete_genus3_lpolynomial(
        101, (12, 56, 85), jacobian_order=Fraction(2317249, 2)
    ),
    lambda: complete_genus3_lpolynomial(
        101, (12, 56, 85), jacobian_exponent_witnesses=(149.5,)
    ),
    lambda: enumerate_genus3_weil_candidates(101, (12, 56, 85.5)),
    lambda: enumerate_genus3_weil_candidates(
        101, (12, 56, 85), max_candidates=1.5
    ),
    lambda: enumerate_genus3_weil_candidates(
        101, (12, 56, 85), max_combinations=True
    ),
]
for call in calls:
    try:
        call()
    except Exception as error:
        failures.append([type(error).__name__, str(error)])
integral_primes = [
    enumerate_genus3_weil_candidates(value, (12, 56, 85))["prime"]
    for value in (101.0, Fraction(101, 1))
]
print(json.dumps([failures, integral_primes]))
`);
  assert.equal(observed[0].length, 5);
  assert.ok(
    observed[0].every(([name]) => ["TypeError", "ValueError"].includes(name)),
  );
  assert.ok(observed[0].every(([, message]) => /integer/.test(message)));
  assert.deepEqual(observed[1], [101, 101]);
});
