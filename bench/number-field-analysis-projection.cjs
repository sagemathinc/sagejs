#!/usr/bin/env node
"use strict";

const { createSage } = require("../dist/tools/kernel.js");

async function main() {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "import time",
        "import sagejs.number_fields.maximal_order_engine as engine",
        "import sagejs.number_fields.field_analysis_resource as resource",
        "from sagejs.native import is_compiled",
        "R.<x> = QQ[]",
        "cases = [('cubic', x^3 - 2), ('essential', x^3 + x^2 - 2*x + 8), ('degree7', x^7 - 2*x + 3)]",
        "records = []",
        "for label, polynomial in cases:",
        "    K.<a> = NumberField(polynomial)",
        "    engine.compute_maximal_order(K)",
        "    samples = []",
        "    lazy = []",
        "    for repeat in range(101):",
        "        start = time.perf_counter_ns()",
        "        order = engine.compute_maximal_order(K)",
        "        samples.append(time.perf_counter_ns() - start)",
        "        lazy.append(order._basis_rows_cache is None and order._maximal_order_certificate_factory is not None)",
        "    samples.sort()",
        "    records.append({'case': label, 'samples': len(samples), 'median_ns': samples[50], 'p90_ns': samples[90], 'minimum_ns': samples[0], 'maximum_ns': samples[-1], 'lazy_first_return': all(lazy)})",
        "{'schema': 'sagejs.number-fields/field-analysis-public-benchmark-v1', 'compiled': is_compiled(resource.packed_field_analysis_authenticate_projection), 'records': records}",
      ].join("\n"),
    );
    console.log(result.repr);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
