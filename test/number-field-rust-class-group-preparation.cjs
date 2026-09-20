// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("certified cubic preparation is exact and answer-free", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3-x+1)",
        "from sagejs.number_fields.rust_class_group_preparation import prepare_cubic_for_rust",
        "document = prepare_cubic_for_rust(K)",
        "[document['field']['coefficientsAscending'], document['preparation']['basisNumeratorsRowMajor'], document['preparation']['basisDenominator'], document['preparation']['discriminant'], document['preparation']['signature'], document['preparation']['irreducibilityPrime'], document['preparation']['indexPrimes'], document['containsOracleAnswers'], sorted(document.keys())]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[['1', '-1', '0', '1'], ['1', '0', '0', '0', '1', '0', '0', '0', '1'], '1', '-23', {'realPlaces': 1, 'complexPairs': 1}, 2, [], False, ['containsOracleAnswers', 'field', 'fieldId', 'inputId', 'preparation', 'randomness', 'request', 'schema']]",
    );
  } finally {
    await session.close();
  }
});

test("certified index-three preparation exports a unit-first basis", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3-20010*x+20018)",
        "from sagejs.number_fields.rust_class_group_preparation import prepare_cubic_for_rust",
        "document = prepare_cubic_for_rust(K)",
        "[document['field']['coefficientsAscending'], document['preparation']['basisNumeratorsRowMajor'], document['preparation']['basisDenominator'], document['preparation']['discriminant'], document['preparation']['indexPrimes'], document['preparation']['multiplicationTable'][0], document['containsOracleAnswers']]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "[['20018', '-20010', '0', '1'], ['3', '0', '0', '1', '1', '1', '3', '0', '3'], '3', '3559689395028', ['3'], [[{'numerator': '1', 'denominator': '1'}, {'numerator': '0', 'denominator': '1'}, {'numerator': '0', 'denominator': '1'}], [{'numerator': '0', 'denominator': '1'}, {'numerator': '1', 'denominator': '1'}, {'numerator': '0', 'denominator': '1'}], [{'numerator': '0', 'denominator': '1'}, {'numerator': '0', 'denominator': '1'}, {'numerator': '1', 'denominator': '1'}]], False]",
    );
  } finally {
    await session.close();
  }
});
