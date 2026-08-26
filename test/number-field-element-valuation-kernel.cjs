#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function run(executable, args, source, timeout = 120_000) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const kernelDifferential = String.raw`
from sagejs.native import integer_buffer_values, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.bl_composite_kernel import packed_lattice_memberships_in_place

packed = packed_lattice_memberships_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)
bases = [2, 0, 0, 1, 4, 0, 0, 1]

def outcome(function, vector):
    output = kernel_integer_zeros(function, 2, 1)
    assert function(
        output,
        kernel_integer_zeros(function, 2, 16),
        kernel_integer_buffer(function, bases),
        kernel_integer_buffer(function, [1, 1]),
        kernel_integer_buffer(function, vector),
        1,
        2,
        2,
    )
    return [int(value) for value in integer_buffer_values(output)]

for function in (dynamic, packed):
    assert outcome(function, [4, 3]) == [1, 1]
    assert outcome(function, [2, 3]) == [1, 0]
    assert outcome(function, [1, 3]) == [0, 0]
    assert not function(
        kernel_integer_zeros(function, 2, 1),
        kernel_integer_zeros(function, 2, 16),
        kernel_integer_buffer(function, [2, 0, 1, 1, 4, 0, 0, 1]),
        kernel_integer_buffer(function, [1, 1]),
        kernel_integer_buffer(function, [4, 3]),
        1,
        2,
        2,
    )
`;

test("batched lattice membership matches in CPython and compiled Sage.js", () => {
  run(
    pythonExecutable(),
    ["-c", `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})\n${kernelDifferential}`],
    "",
  );
  const output = run(
    sagejs,
    ["--python", "-"],
    `${kernelDifferential}\nfrom sagejs.native import is_compiled\nprint(is_compiled(packed))\n`,
  );
  assert.equal(output, "True");
});

test("packed element valuations agree with exact lattice membership", () => {
  const output = run(sagejs, ["--python", "-"], String.raw`
import sagejs.number_fields.ideal_arithmetic as ideals
import sagejs.runtime as runtime
from sagejs.number_fields.class_group_relations import ExactRelationCollector

R = PolynomialRing(QQ, "x")
x = R.gen()
for polynomial in (x**2 - 5, x**3 + 4*x - 1, x**4 - x + 1):
    K = NumberField(polynomial, "a")
    O = K.maximal_order()
    factor_base = []
    for rational_prime in (2, 3, 5):
        factor_base.extend(O.factor_rational_prime(rational_prime).prime_ideals())
    elements = list(O.basis()) + [K(2), K(8), K(1) / K(2), O.basis()[0] + O.basis()[-1], O.basis()[0] - 2 * O.basis()[-1]]
    membership_ideals = list(factor_base[:3]) + [O.ideal(2), O.ideal(K.gen() + 1)]
    for ideal in membership_ideals:
        for element in elements:
            actual_member = element in ideal
            saved_membership = ideals._element_membership_kernel_override
            ideals._element_membership_kernel_override = False
            expected_member = element in ideal
            ideals._element_membership_kernel_override = saved_membership
            assert actual_member == expected_member
    for container in membership_ideals:
        for contained in membership_ideals:
            actual_containment = container.contains_ideal(contained)
            saved_batch_membership = ideals._element_membership_batch_kernel_override
            ideals._element_membership_batch_kernel_override = False
            expected_containment = container.contains_ideal(contained)
            ideals._element_membership_batch_kernel_override = saved_batch_membership
            assert actual_containment == expected_containment
    for element in elements:
        assert not element.is_zero()
        actual = ideals.element_valuations(element, factor_base)
        saved = ideals._element_valuations_kernel_override
        ideals._element_valuations_kernel_override = False
        expected = ideals.element_valuations(element, factor_base)
        ideals._element_valuations_kernel_override = saved
        assert actual == expected
    assert any(prime._packed_basis_cache is not runtime.undefined for prime in factor_base)
    primes_over_two = tuple(O.factor_rational_prime(2).prime_ideals())
    packed_collector = ExactRelationCollector(O, primes_over_two)
    packed_record = packed_collector.admit_witness(K(8)).record
    saved = ideals._element_valuations_kernel_override
    ideals._element_valuations_kernel_override = False
    readable_collector = ExactRelationCollector(O, primes_over_two)
    readable_record = readable_collector.admit_witness(K(8)).record
    ideals._element_valuations_kernel_override = saved
    assert packed_record.row == readable_record.row
    assert packed_record.to_dict() == readable_record.to_dict()
    assert packed_record.verify(O, primes_over_two)["certified"]
print("element-valuation-kernel-ok")
`, 180_000);
  assert.equal(output, "element-valuation-kernel-ok");
});
