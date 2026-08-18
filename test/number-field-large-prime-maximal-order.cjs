"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const ids = [168, 250, 285, 314, 365].map(
  (index) => `pari-round4-vector-${index}`,
);

test(
  "proved primes beyond one word use an exact public local fallback",
  { timeout: 300_000 },
  async () => {
    const cases = ids.map((id) => fixture.cases.find((entry) => entry.id === id));
    assert.ok(cases.every(Boolean));
    const records = cases
      .map(
        (entry) =>
          `('${entry.id}', [${entry.polynomial.coefficients.join(",")}], ${entry.fieldDiscriminant}, ${entry.equationOrderIndex})`,
      )
      .join(",");
    const session = await createSage();
    try {
      const result = await session.evaluate(
        [
          "R.<x> = QQ[]",
          `records = [${records}]`,
          "answer = []",
          "for case_id, coefficients, expected_discriminant, expected_index in records:",
          "    K.<a> = NumberField(R(coefficients))",
          "    O = K.maximal_order(trace=True)",
          "    stages = [event['stage'] for event in O.maximal_order_trace()['events']]",
          "    answer.append((case_id, O.discriminant() == expected_discriminant, O.maximality_certificate()['index'] == expected_index, O.is_maximal(), 'arbitrary-prime-local-order' in stages))",
          "answer",
        ].join("\n"),
      );
      for (const id of ids) {
        assert.match(result.repr, new RegExp(`\\('${id}', True, True, True, True\\)`));
      }
    } finally {
      await session.close();
    }
  },
);
