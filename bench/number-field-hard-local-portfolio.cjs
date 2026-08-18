#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

const samplesArgument = process.argv.indexOf("--samples");
const samples = samplesArgument < 0 ? 5 : Number(process.argv[samplesArgument + 1]);
if (!Number.isInteger(samples) || samples < 1) {
  throw new Error("--samples must be a positive integer");
}

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "..", "test", "fixtures", "number-field-round4.json"),
    "utf8",
  ),
);
const selected = ["pari-2510-p2", "pari-1710-p3"].map((id) =>
  fixture.cases.find((entry) => entry.id === id),
);

function sourceRecord(record) {
  return "{" +
    `'id': ${JSON.stringify(record.id)}, ` +
    `'coefficients': [${record.coefficients.join(",")}], ` +
    `'prime': ${record.prime}, ` +
    `'dv': ${record.local_discriminant_valuation}, ` +
    `'index_v': ${record.local_index_valuation}, ` +
    `'output_disc': ${record.local_output_discriminant}` +
    "}";
}

async function main() {
  const session = await createSage();
  try {
    const evaluated = await session.evaluate([
      "import time",
      "R.<x> = ZZ[]",
      "from sagejs.number_fields.local_algorithm_selector import select_local_algorithm_from_polygon",
      "from sagejs.number_fields.local_polygons import factor_mod_prime, dedekind_evidence, analyze_local_polygons",
      "from sagejs.number_fields.maximal_order import maximal_overorder_native, p_maximal_overorder_dynamic",
      "from sagejs.number_fields.order_resource import native_order_from_polynomial",
      "from sagejs.number_fields.round4 import round4_local_plan, modified_round4_local_order",
      "from sagejs.number_fields.om_maxmin import regular_local_basis",
      `cases = [${selected.map(sourceRecord).join(",")}]`,
      `samples = ${samples}`,
      "def measure(fn, count):",
      "    fn()",
      "    values = []",
      "    answer = None",
      "    for sample in range(count):",
      "        started = time.perf_counter()",
      "        answer = fn()",
      "        values.append(1000*(time.perf_counter()-started))",
      "    ordered = sorted(values)",
      "    return {'median_ms': ordered[len(ordered)//2], 'samples_ms': values}, answer",
      "report = []",
      "for case in cases:",
      "    coefficients = case['coefficients']",
      "    p = case['prime']",
      "    f = R(coefficients)",
      "    K = NumberField(f, 'a')",
      "    equation = K.equation_order()",
      "    factor_timing, factors = measure(lambda: factor_mod_prime(coefficients, p), samples)",
      "    dedekind_timing, dedekind = measure(lambda: dedekind_evidence(coefficients, p), samples)",
      "    polygon_timing, polygon = measure(lambda: analyze_local_polygons(coefficients, p, case['dv']), samples)",
      "    selection_timing, selection = measure(lambda: select_local_algorithm_from_polygon(polygon, native_round2_available=True, om_available=True), samples)",
      "    resource_timing, resource = measure(lambda: native_order_from_polynomial(coefficients, [p]), samples)",
      "    round2_timing, native_order = measure(lambda: maximal_overorder_native(equation, [p]), samples)",
      "    plan_timing, plan = measure(lambda: round4_local_plan(f, p), samples)",
      "    round4_timing, round4 = measure(lambda: modified_round4_local_order(equation, p, strict=False), 1)",
      "    dynamic_timing, dynamic_order = measure(lambda: p_maximal_overorder_dynamic(equation, p), 1)",
      "    om_timing, om = measure(lambda: regular_local_basis(tuple(coefficients), p, local_discriminant_valuation=case['dv'], differential_evidence=False), 1)",
      "    assert resource.complete",
      "    assert resource.order_discriminant == case['output_disc']",
      "    assert native_order.discriminant() == case['output_disc']",
      "    assert dynamic_order._basis_rows == native_order._basis_rows",
      "    assert round4.order._basis_rows == native_order._basis_rows",
      "    assert om.status == 'complete'",
      "    assert om.local_result.index == p**case['index_v']",
      "    if polygon.status == 'regular-enlargement':",
      "        polygon_rows = [[QQ(value, polygon.basis_denominator) for value in row] for row in polygon.basis_numerators]",
      "        assert polygon_rows == native_order._basis_rows",
      "    hnf_entries = [abs(value) for row in resource.basis.numerator for value in row]",
      "    report.append({",
      "        'id': case['id'],",
      "        'prime': p,",
      "        'degree': len(coefficients)-1,",
      "        'local_discriminant_valuation': case['dv'],",
      "        'local_index_valuation': case['index_v'],",
      "        'factor_degrees': [item['degree'] for item in factors],",
      "        'factor_multiplicities': [item['multiplicity'] for item in factors],",
      "        'polygon_regular': polygon['regular'],",
      "        'polygon_predicted_index_valuation': polygon.predicted_index_exponent,",
      "        'round4_required_precision': plan.required_precision,",
      "        'round4_predicted_work': plan.selector.predicted_round4_work,",
      "        'round2_predicted_work': plan.selector.predicted_round2_work,",
      "        'om_type_count': om.selector.type_count,",
      "        'om_maximum_type_depth': om.selector.maximum_type_depth,",
      "        'hnf_dimension': len(resource.basis.numerator),",
      "        'hnf_max_coefficient_bits': max([value.bit_length() for value in hnf_entries] or [0]),",
      "        'selection': selection,",
      "        'timings': {",
      "            'factor_mod_prime': factor_timing,",
      "            'dedekind_evidence': dedekind_timing,",
      "            'first_order_polygon': polygon_timing,",
      "            'selector_from_evidence': selection_timing,",
      "            'sealed_native_order_resource': resource_timing,",
      "            'native_round2_existing_order': round2_timing,",
      "            'round4_plan': plan_timing,",
      "            'forced_round4_local_order': round4_timing,",
      "            'dynamic_round2': dynamic_timing,",
      "            'forced_om_maxmin': om_timing,",
      "        },",
      "        'exact': True,",
      "    })",
      "report",
    ].join("\n"));
    const cases = JSON.parse(evaluated.repr
      .replaceAll("True", "true")
      .replaceAll("False", "false")
      .replaceAll("None", "null")
      .replaceAll("'", '"'));
    const receipt = JSON.parse(readFileSync(
      join(
        __dirname,
        "results",
        "number-field-maximal-order-current-head-0abc59da-2026-08-18.json",
      ),
      "utf8",
    ));
    const references = Object.fromEntries(
      receipt.measurements.six_public_cases
        .filter((entry) => ["pari-2510", "pari-1710"].includes(entry.id))
        .map((entry) => [entry.id, {
          native_order_kernel: entry.native_order_kernel,
          references: entry.references,
        }]),
    );
    const report = {
      schema: "sagejs.number-fields/hard-local-portfolio/v1",
      commit: require("node:child_process")
        .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
        .trim(),
      units: "milliseconds",
      policy: {
        samples,
        warmup: "one call per boundary; slow dynamic/Round4/OM paths retain one measured sample",
        exactness: "all complete paths compared to the same canonical local HNF and discriminant",
        caveat: "Sage.js host timings are sensitive to concurrent project load; isolated direct C resource and PARI/Hecke references come from the durable receipt",
      },
      cases,
      durableDirectReferences: references,
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
