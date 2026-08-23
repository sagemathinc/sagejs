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
            "                   value.provenance, value.curve_certified,",
            "                   T.verify_tamagawa_certificate(value)))",
            "answer",
          ].join("\n"),
        )
      ).repr,
      "[((), 1, (), 1, 'supplied_lattice', False, True), " +
        "((5,), 5, (5,), 5, 'supplied_lattice', False, True), " +
        "((5,), 5, (), 1, 'supplied_lattice', False, True), " +
        "((6,), 6, (2,), 2, 'supplied_lattice', False, True), " +
        "((3,), 3, (), 1, 'supplied_lattice', False, True), " +
        "((2, 12), 24, (2, 6), 12, 'supplied_lattice', False, True)]",
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
            "good = T.local_tamagawa_data(HyperellipticCurve(x^5+x+1), 5)",
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
            "  row.provenance, row.curve_certified,",
            "  T.verify_tamagawa_certificate(row)) for row in rows]",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "[('good-abelian-reduction', (), 1, (), 1, 'curve_local_good', True, True), " +
        "('almost-good-jacobian-good-reduction', (), 1, (), 1, " +
        "'curve_local_almost_good', True, True), " +
        "('split-semistable-cluster-monodromy', (4,), 4, (4,), 4, " +
        "'replayed_cluster_certificate', True, True), " +
        "('split-semistable-cluster-monodromy', (4,), 4, (2,), 2, " +
        "'replayed_cluster_certificate', True, True), " +
        "('split-semistable-cluster-monodromy', (2, 2, 8), 32, " +
        "(2, 2, 8), 32, 'replayed_cluster_certificate', True, True), " +
        "('split-semistable-cluster-monodromy', (2, 2, 8), 32, " +
        "(2, 2, 2), 8, 'replayed_cluster_certificate', True, True)]",
    );
  } finally {
    await session.close();
  }
});

test("unbound records and inexact lattice scalars cannot forge certification", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "T = __import__('sagejs.hyperelliptic_curves.tamagawa',",
            "               fromlist=['tamagawa_from_local_reduction'])",
            "records = [",
            " {'prime': 5, 'certified': True, 'reduction_type': 'good',",
            "  'curve_good_reduction': True, 'jacobian_good_reduction': True,",
            "  'semistable': True, 'toric_rank': 0, 'conductor_exponent': 0,",
            "  'backend': 'good-reduction-frobenius',",
            "  'certificate': {'theorem': 'smooth proper base change'}},",
            " {'prime': 7, 'certified': True,",
            "  'certificate': {'component_pairing_matrix': [[4]],",
            "                  'component_frobenius_matrix': [[1]]}}]",
            "values = [T.tamagawa_from_local_reduction(row) for row in records]",
            "bad = [([[True]], [[1]]), ([['6']], [[1]]),",
            "       ([[3/2]], [[1]]), ([[6.0]], [[1]])]",
            "messages = []",
            "for M, F in bad:",
            "    try:",
            "        T.component_group_from_lattice(M, F)",
            "    except Exception as error:",
            "        messages.append(str(error))",
            "conditional = T.component_group_from_lattice([[6]], [[-1]])",
            "forged = conditional.to_dict()",
            "forged['curve_certified'] = True",
            "([row.status for row in values],",
            " [row.curve_certified for row in values], len(messages),",
            " all('integer matrix' in message for message in messages),",
            " T.verify_tamagawa_certificate(forged))",
          ].join("\n"),
        )
      ).repr,
      "(['untrusted_local_record', 'untrusted_local_record'], " +
        "[False, False], 4, True, False)",
    );
  } finally {
    await session.close();
  }
});

test("cluster replay rejects tree, basis, metric, and binding tampering", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "import json",
            "T = __import__('sagejs.hyperelliptic_curves.tamagawa',",
            "               fromlist=['local_tamagawa_data'])",
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "p = 5",
            "f = R(1)",
            "for a in [0,1,2,3]:",
            "    f *= (x-a)*(x-a-p)",
            "valid = T.local_tamagawa_data(HyperellipticCurve(2*f), p)",
            "payload = json.dumps(valid.to_dict())",
            "def fresh():",
            "    return json.loads(payload)",
            "rows = []",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['cluster_picture']['children'][0]['depth'] = '1'",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['cluster_picture']['children'][0]['depth'] = QQ(3)/QQ(2)",
            "rows.append(bad)",
            "bad = fresh()",
            "tree = bad['certificate']['source']['cluster_replay']['certificate']['cluster_picture']",
            "tree['children'][0]['root_indices'] = list(tree['children'][1]['root_indices'])",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['cluster_picture']['ubereven'] = False",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['toric_basis'].pop()",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['record_schema'] = 'forged'",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['completed_branch_coefficients_ascending'][0] += 1",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['rational_roots'][0][0] += 1",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['cluster_picture']['principal'] = not bad['certificate']['source']['cluster_replay']['certificate']['cluster_picture']['principal']",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['genus'] = 2",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['model_binding']['prime'] = 7",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['model_binding']['integral_f_coefficients'][0] += 1",
            "rows.append(bad)",
            "bad = fresh()",
            "replay = bad['certificate']['source']['cluster_replay']['certificate']",
            "replay['completed_branch_coefficients_ascending'] = [p*c for c in replay['completed_branch_coefficients_ascending']]",
            "binding = bad['certificate']['source']['model_binding']",
            "binding['integral_f_coefficients'] = [p*c for c in binding['integral_f_coefficients']]",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['source']['cluster_replay']['certificate']['component_curves'][0]['nu'] += 2",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['certificate']['pairing_matrix'][0][0] += 1",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['rational_component_group_order'] += 1",
            "rows.append(bad)",
            "bad = fresh()",
            "bad['rational_component_group_invariants'] = [99]",
            "rows.append(bad)",
            "(T.verify_tamagawa_certificate(valid),",
            " [T.verify_tamagawa_certificate(row) for row in rows])",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "(True, [False, False, False, False, False, False, False, False, " +
        "False, False, False, False, False, False, False, False, False])",
    );
  } finally {
    await session.close();
  }
});

test("good-reduction proofs require a bound recognized local record", async () => {
  const session = await createSage();
  try {
    assert.equal(
      (
        await session.evaluate(
          [
            "import json",
            "T = __import__('sagejs.hyperelliptic_curves.tamagawa',",
            "               fromlist=['local_tamagawa_data'])",
            "R = PolynomialRing(QQ, 'x')",
            "x = R.gen()",
            "good = T.local_tamagawa_data(HyperellipticCurve(x^5+x+1), 5)",
            "p = 7",
            "curve = HyperellipticCurve((x)*(x-p)*(x-2*p)*(x-1)*(x-1-p)*(x-1-2*p))",
            "almost = T.local_tamagawa_data(curve, p)",
            "rows = []",
            "for valid in [good, almost]:",
            "    payload = json.dumps(valid.to_dict())",
            "    bad = json.loads(payload)",
            "    bad['certificate']['source_local_record']['record_schema'] = 'forged'",
            "    rows.append(bad)",
            "    bad = json.loads(payload)",
            "    bad['certificate']['source_local_record']['toric_rank'] = 1",
            "    rows.append(bad)",
            "    bad = json.loads(payload)",
            "    bad['certificate']['model_binding']['prime'] += 2",
            "    rows.append(bad)",
            "bad = json.loads(json.dumps(good.to_dict()))",
            "bad['certificate']['model_binding']['integral_f_coefficients'] = [0,0,0,0,0,1]",
            "bad['certificate']['model_binding']['integral_h_coefficients'] = []",
            "rows.append(bad)",
            "bad = json.loads(json.dumps(almost.to_dict()))",
            "bad['certificate']['model_binding']['integral_f_coefficients'] = [0,0,0,0,0,1]",
            "bad['certificate']['model_binding']['integral_h_coefficients'] = []",
            "rows.append(bad)",
            "([T.verify_tamagawa_certificate(good),",
            "  T.verify_tamagawa_certificate(almost)],",
            " [T.verify_tamagawa_certificate(row) for row in rows])",
          ].join("\n"),
          { timeout: 120_000 },
        )
      ).repr,
      "([True, True], [False, False, False, False, False, False, False, False])",
    );
  } finally {
    await session.close();
  }
});
