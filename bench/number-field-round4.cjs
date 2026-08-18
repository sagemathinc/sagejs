#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "..", "test", "fixtures", "number-field-round4.json"),
    "utf8",
  ),
);

const sampleArgument = process.argv.indexOf("--samples");
const samples = sampleArgument < 0 ? 7 : Number(process.argv[sampleArgument + 1]);
if (!Number.isInteger(samples) || samples < 1) {
  throw new Error("--samples must be a positive integer");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function main() {
  // The two Ford--Letard examples exercise decomposition; the two PARI cases
  // exercise deep primary and high-degree/many-component behavior.
  const selected = fixture.cases.filter((entry) =>
    [
      "ford-letard-example-1-p2",
      "ford-letard-example-2-p3",
      "pari-1735-p20533",
      "pari-2510-p2",
    ].includes(entry.id),
  );
  const sageRecords = selected
    .map(
      (entry) =>
        `([${entry.coefficients.join(",")}], ${entry.prime}, ${entry.local_output_discriminant})`,
    )
    .join(",");
  const session = await createSage();
  try {
    const evaluated = await session.evaluate(
      [
        "import time",
        "R.<x> = ZZ[]",
        "from sagejs.number_fields.round4 import round4_local_plan, modified_round4_local_order",
        "from sagejs.number_fields.maximal_order import maximal_overorder_native",
        `records = [${sageRecords}]`,
        `samples = ${samples}`,
        "answer = []",
        "for coefficients, p, expected in records:",
        "    f = R(coefficients)",
        "    round4_local_plan(f, p)",
        "    warm_field = NumberField(f, 'a')",
        "    modified_round4_local_order(warm_field.equation_order(), p)",
        "    plan_times = []",
        "    local_times = []",
        "    round2_times = []",
        "    for sample in range(samples):",
        "        started = time.perf_counter()",
        "        plan = round4_local_plan(f, p)",
        "        plan_times.append(1000*(time.perf_counter()-started))",
        "        field = NumberField(f, 'a')",
        "        started = time.perf_counter()",
        "        result = modified_round4_local_order(field.equation_order(), p)",
        "        local_times.append(1000*(time.perf_counter()-started))",
        "        assert result.order.discriminant() == expected",
        "        field2 = NumberField(f, 'b')",
        "        started = time.perf_counter()",
        "        oracle = maximal_overorder_native(field2.equation_order(), [p])",
        "        round2_times.append(1000*(time.perf_counter()-started))",
        "        assert oracle.discriminant() == expected",
        "        assert oracle._basis_rows == result.order._basis_rows",
        "    answer.append([plan_times, local_times, round2_times, plan.required_precision, plan.selector.predicted_round2_work, plan.selector.predicted_round4_work])",
        "answer",
      ].join("\n"),
    );
    const rows = JSON.parse(evaluated.repr);
    const report = {
      schema: 1,
      samples,
      units: "milliseconds",
      warmup: "one untimed plan and one untimed local computation per case",
      boundary:
        "fresh NumberField equation order to certified local HNF; result materialized and checked",
      cases: rows.map((row, index) => ({
        id: selected[index].id,
        prime: selected[index].prime,
        required_precision: row[3],
        plan: { median: median(row[0]), samples: row[0] },
        modified_round4_local_order: {
          median: median(row[1]),
          samples: row[1],
        },
        native_round2_oracle: { median: median(row[2]), samples: row[2] },
        selector_work: { round2: row[4], round4: row[5] },
      })),
    };
    if (process.argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      for (const record of report.cases) {
        console.log(
          record.id,
          `p=${record.prime}`,
          `plan=${record.plan.median.toFixed(3)}ms`,
          `local=${record.modified_round4_local_order.median.toFixed(3)}ms`,
          `round2=${record.native_round2_oracle.median.toFixed(3)}ms`,
        );
      }
    }
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
