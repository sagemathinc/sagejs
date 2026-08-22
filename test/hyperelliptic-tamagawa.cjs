"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "data", "hyperelliptic", "tamagawa-v1.json"),
    "utf8",
  ),
);

function determinant(matrix) {
  if (matrix.length === 0) return 1;
  if (matrix.length === 1) return matrix[0][0];
  if (matrix.length === 2) {
    return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  }
  throw new Error("the tiny direct oracle only handles rank at most two");
}

function adjugate(matrix) {
  if (matrix.length === 0) return [];
  if (matrix.length === 1) return [[1]];
  return [
    [matrix[1][1], -matrix[0][1]],
    [-matrix[1][0], matrix[0][0]],
  ];
}

function multiply(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function transpose(matrix) {
  return matrix.length === 0
    ? []
    : matrix[0].map((_entry, column) => matrix.map((row) => row[column]));
}

function inverseUnimodular(matrix) {
  const det = determinant(matrix);
  return adjugate(matrix).map((row) => row.map((value) => value / det));
}

function vectors(size, bound) {
  let answer = [[]];
  for (let index = 0; index < size; index += 1) {
    answer = answer.flatMap((prefix) =>
      Array.from({ length: bound }, (_value, entry) => [...prefix, entry]),
    );
  }
  return answer;
}

function equivalent(left, right, pairing) {
  const det = Math.abs(determinant(pairing));
  const image = multiply(
    adjugate(pairing),
    left.map((value, index) => value - right[index]),
  );
  return image.every((value) => value % det === 0);
}

function directFixedCounts(pairing, frobenius) {
  const order = Math.abs(determinant(pairing));
  if (pairing.length === 0) return { geometric: 1, rational: 1 };
  const representatives = [];
  for (const candidate of vectors(pairing.length, order)) {
    if (!representatives.some((other) => equivalent(candidate, other, pairing))) {
      representatives.push(candidate);
    }
  }
  const dualFrobenius = transpose(inverseUnimodular(frobenius));
  const fixed = representatives.filter((representative) =>
    equivalent(multiply(dualFrobenius, representative), representative, pairing),
  );
  return { geometric: representatives.length, rational: fixed.length };
}

test("tiny graph lattices agree with direct Frobenius-class enumeration", async () => {
  for (const row of fixture.cases) {
    assert.deepEqual(directFixedCounts(row.pairing_matrix, row.frobenius_matrix), {
      geometric: row.geometric_order,
      rational: row.rational_order,
    });
  }
  const session = await createSage();
  try {
    const payload = JSON.stringify(fixture.cases);
    assert.equal(
      (
        await session.evaluate(
          [
            "import json",
            "T = __import__('sagejs.hyperelliptic_curves.tamagawa',",
            "               fromlist=['component_group_from_lattice'])",
            `rows = json.loads(${JSON.stringify(payload)})`,
            "answer = []",
            "for row in rows:",
            "    value = T.component_group_from_lattice(",
            "        row['pairing_matrix'], row['frobenius_matrix'], prime=5)",
            "    answer.append((value.geometric_invariants, value.geometric_order,",
            "                   value.rational_invariants, value.rational_order,",
            "                   T.verify_tamagawa_certificate(value)))",
            "answer",
          ].join("\n"),
        )
      ).repr,
      "[((), 1, (), 1, True), ((5,), 5, (5,), 5, True), " +
        "((5,), 5, (), 1, True), ((6,), 6, (2,), 2, True), " +
        "((3,), 3, (), 1, True), ((2, 12), 24, (2, 6), 12, True)]",
    );
  } finally {
    await session.close();
  }
});

test("good, almost-good, and split-cluster records use distinct proofs", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "T = __import__('sagejs.hyperelliptic_curves.tamagawa',",
            "               fromlist=['local_tamagawa_data'])",
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "good = T.tamagawa_from_local_reduction({",
            "  'prime': 19, 'reduction_type': 'good',",
            "  'jacobian_good_reduction': True, 'certificate': {}})",
            "p = 7",
            "almost = HyperellipticCurve((x)*(x-p)*(x-2*p)*(x-1)*(x-1-p)*(x-1-2*p))",
            "p = 5",
            "f = x*(x-p^2)*(x-1)*(x-2)*(x-3)",
            "split = HyperellipticCurve(f)",
            "twist = HyperellipticCurve(2*f)",
            "f3 = R(1)",
            "for a in [0,1,2,3]:",
            "    f3 *= (x-a)*(x-a-p)",
            "split3 = HyperellipticCurve(f3)",
            "twist3 = HyperellipticCurve(2*f3)",
            "rows = [good,",
            "        T.local_tamagawa_data(almost, 7),",
            "        T.local_tamagawa_data(split, 5),",
            "        T.local_tamagawa_data(twist, 5),",
            "        T.local_tamagawa_data(split3, 5),",
            "        T.local_tamagawa_data(twist3, 5)]",
            "[(row.method, row.geometric_invariants, row.geometric_order,",
            "  row.rational_invariants, row.rational_order,",
            "  T.verify_tamagawa_certificate(row)) for row in rows]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[('good-abelian-reduction', (), 1, (), 1, True), " +
        "('almost-good-jacobian-good-reduction', (), 1, (), 1, True), " +
        "('split-semistable-cluster-monodromy', (4,), 4, (4,), 4, True), " +
        "('split-semistable-cluster-monodromy', (4,), 4, (2,), 2, True), " +
        "('split-semistable-cluster-monodromy', (2, 2, 8), 32, " +
        "(2, 2, 8), 32, True), ('split-semistable-cluster-monodromy', " +
        "(2, 2, 8), 32, (2, 2, 2), 8, True)]",
    );
  } finally {
    await session.close();
  }
});

test("unsupported statuses and certificate corruption are explicit", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "T = __import__('sagejs.hyperelliptic_curves.tamagawa',",
            "               fromlist=['tamagawa_from_local_reduction'])",
            "records = [",
            " {'prime': 2, 'jacobian_good_reduction': False, 'semistable': True,",
            "  'reduction_type': 'semistable', 'certificate': {}},",
            " {'prime': 5, 'jacobian_good_reduction': False, 'semistable': False,",
            "  'reduction_type': 'wild', 'certificate': {'wild_inertia': True}},",
            " {'prime': 7, 'jacobian_good_reduction': False, 'semistable': True,",
            "  'reduction_type': 'semistable',",
            "  'certificate': {'model_is_minimal': False}},",
            " {'prime': 11, 'jacobian_good_reduction': False, 'semistable': True,",
            "  'reduction_type': 'semistable_nodal', 'certificate': {}}]",
            "values = [T.tamagawa_from_local_reduction(row) for row in records]",
            "valid = T.component_group_from_lattice([[6]], [[-1]])",
            "broken = valid.to_dict()",
            "broken['certificate']['rational_component_group_order'] = 3",
            "([row.status for row in values],",
            " [T.verify_tamagawa_certificate(row) for row in values],",
            " T.verify_tamagawa_certificate(broken))",
          ].join("\n"),
        )
      ).repr,
      "(['unsupported_at_2', 'unsupported_wild', 'model_not_minimal', " +
        "'insufficient_component_data'], [True, True, True, True], False)",
    );
  } finally {
    await session.close();
  }
});
