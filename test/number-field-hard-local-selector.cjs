// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const python = process.env.SAGEJS_PYTHON ?? pythonExecutable();
const fixture = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "number-field-round4.json"), "utf8"),
);
const selected = ["pari-2510-p2", "pari-1710-p3"].map((id) => {
  const record = fixture.cases.find((entry) => entry.id === id);
  assert.ok(record, `missing ${id}`);
  return record;
});

function recordSource(record) {
  return "{" +
    `'id': ${JSON.stringify(record.id)}, ` +
    `'coefficients': [${record.coefficients.join(",")}], ` +
    `'prime': ${record.prime}, ` +
    `'dv': ${record.local_discriminant_valuation}, ` +
    `'index_v': ${record.local_index_valuation}, ` +
    `'output_disc': ${record.local_output_discriminant}` +
    "}";
}

test("hard-local selector uses proved input features and preserves forced paths", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "from sagejs.number_fields.local_algorithm_selector import select_local_algorithm, select_local_algorithm_from_polygon",
      "from sagejs.number_fields.local_polygons import analyze_local_polygons",
      `cases = [${selected.map(recordSource).join(",")}]`,
      "answer = []",
      "for case in cases:",
      "    evidence = analyze_local_polygons(case['coefficients'], case['prime'], case['dv'])",
      "    auto = select_local_algorithm_from_polygon(evidence, native_round2_available=True, om_available=True)",
      "    forced_polygon = select_local_algorithm_from_polygon(evidence, native_round2_available=True, om_available=True, algorithm='polygon')",
      "    forced_round4 = select_local_algorithm_from_polygon(evidence, native_round2_available=True, om_available=True, algorithm='round4')",
      "    assert auto['features']['degree'] == len(case['coefficients']) - 1",
      "    assert auto['features']['prime'] == case['prime']",
      "    assert auto['features']['predicted_index_valuation'] == evidence.predicted_index_exponent",
      "    assert auto['features']['factor_degrees'] == [q['degree'] for q in evidence['dedekind']['modular_factors']]",
      "    assert auto['features']['factor_multiplicities'] == [q['multiplicity'] for q in evidence['dedekind']['modular_factors']]",
      "    assert forced_round4['algorithm'] == 'round4'",
      "    answer.append((case['id'], auto['algorithm'], auto['features']['polygon_regular'], auto['features']['predicted_index_valuation'], forced_polygon['algorithm'], len(auto['suppressed'])))",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[('pari-2510-p2', 'polygon', True, 18, 'polygon', 4), " +
        "('pari-1710-p3', 'round2', False, 5, None, 4)]",
    );
  } finally {
    await session.close();
  }
});

test("selected and forced complete algorithms give the same exact local orders", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "R.<x> = ZZ[]",
      "from sagejs.number_fields.local_polygons import analyze_local_polygons",
      "from sagejs.number_fields.maximal_order import maximal_overorder_native",
      "from sagejs.number_fields.round4 import modified_round4_local_order",
      `cases = [${selected.map(recordSource).join(",")}]`,
      "answer = []",
      "for case in cases:",
      "    K = NumberField(R(case['coefficients']), 'a')",
      "    equation = K.equation_order()",
      "    native = maximal_overorder_native(equation, [case['prime']])",
      "    round4 = modified_round4_local_order(equation, case['prime'], strict=False).order",
      "    assert native._basis_rows == round4._basis_rows",
      "    assert native.discriminant() == case['output_disc']",
      "    if case['id'] == 'pari-2510-p2':",
      "        polygon = analyze_local_polygons(case['coefficients'], case['prime'], case['dv'])",
      "        assert polygon.predicted_index_exponent == case['index_v']",
      "        polygon_rows = [[QQ(value, polygon.basis_denominator) for value in row] for row in polygon.basis_numerators]",
      "        assert polygon_rows == native._basis_rows",
      "    answer.append((case['id'], native.discriminant() == round4.discriminant()))",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[('pari-2510-p2', True), ('pari-1710-p3', True)]",
    );
  } finally {
    await session.close();
  }
});

test("selector is CPython-parseable and fixture-name independent", () => {
  const record = selected[0];
  const source = [
    `import json,sys;sys.path.insert(0,${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.number_fields.local_algorithm_selector import select_local_algorithm",
    `r=select_local_algorithm([${record.coefficients.join(",")}],${record.prime},${record.local_discriminant_valuation},native_round2_available=True,om_available=True)`,
    "print(json.dumps(r,sort_keys=True,separators=(',',':')))",
  ].join(";");
  const output = execFileSync(python, ["-c", source], {
    cwd: root,
    encoding: "utf8",
  });
  const result = JSON.parse(output);
  assert.equal(result.algorithm, "polygon");
  assert.equal(result.features.predicted_index_valuation, 18);
  assert.equal(JSON.stringify(result).includes("2510"), false);
});
