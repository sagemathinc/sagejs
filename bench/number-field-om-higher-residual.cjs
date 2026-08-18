"use strict";

const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const polynomial = corpus.cases.find(
  (item) => item.id === "pari-round4-vector-429",
).polynomial.coefficients;
const samples = Math.max(
  1,
  Number(process.env.SAGEJS_OM_HIGHER_RESIDUAL_SAMPLES || 1),
);

function run(command, args, script) {
  const times = [];
  let output = "";
  for (let sample = 0; sample < samples; sample += 1) {
    const start = process.hrtime.bigint();
    const result = spawnSync(command, args, {
      cwd: root,
      encoding: "utf8",
      input: script,
      timeout: 120_000,
    });
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    if (result.status !== 0) {
      throw new Error(result.stderr);
    }
    times.push(elapsed);
    output = result.stdout.trim();
  }
  times.sort((left, right) => left - right);
  return { elapsed_ms: times[Math.floor(times.length / 2)], output };
}

const body = String.raw`
# Load the new residual operator before timing the local-order call so lazy
# module preparation is outside the measured mathematical path.
from dataclasses import dataclass
from sagejs.number_fields.om_higher_residue import order_two_residual_evidence
from sagejs.number_fields.om_maxmin import regular_local_basis
polynomial = tuple(int(value) for value in ${JSON.stringify(polynomial)})
result = regular_local_basis(polynomial, 5, local_discriminant_valuation=312)
print(result.status, result.type_tree.expected_index_valuation, result.certificate.maxmin.selection_kind)
`;
const cpython = run(
  "python3",
  ["-"],
  `import sys\nsys.path.append(${JSON.stringify(join(root, "src/lib"))})\n${body}`,
);
const sagejs = run(
  process.execPath,
  [join(root, "bin/sagejs"), "--python"],
  body,
);

process.stdout.write(
  `${JSON.stringify(
    {
      schema_version: 1,
      profile: "v429-p5-order-two-quotient-hnf",
      samples,
      cpython,
      sagejs,
      auto_selection: false,
    },
    null,
    2,
  )}\n`,
);
