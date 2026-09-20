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

test("Sage.js independently replays a Rust class-generator order witness", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3-8*x^2-30*x-34)",
        "from sagejs.number_fields.rust_class_group_preparation import _is_prime_integer, prepare_cubic_for_rust, verify_rust_class_generator_orders",
        "assert _is_prime_integer(193)",
        "document = prepare_cubic_for_rust(K)",
        "p2 = {'factorBaseIndexZeroBased': 0, 'exponent': 3, 'prime': 2, 'norm': 2, 'generator': [0, 1, 0], 'hnf': [2, 0, 0, 0, 1, 0, 0, 0, 1]}",
        "p7 = {'factorBaseIndexZeroBased': 1, 'exponent': 3, 'prime': 7, 'norm': 7, 'generator': [2, 1, 0], 'hnf': [1, 0, 5, 0, 1, 4, 0, 0, 7]}",
        "p11 = {'factorBaseIndexZeroBased': 2, 'exponent': 1, 'prime': 11, 'norm': 11, 'generator': [5, 1, 0], 'hnf': [1, 0, 7, 0, 1, 9, 0, 0, 11]}",
        "p19 = {'factorBaseIndexZeroBased': 7, 'exponent': 1, 'prime': 19, 'norm': 19, 'generator': [5, 1, 0], 'hnf': [1, 0, 3, 0, 1, 4, 0, 0, 19]}",
        "catalog = [{key: value for key, value in descriptor.items() if key != 'exponent'} for descriptor in [p2, p7, p11, p19]]",
        "factor = lambda index, exponent: {'factorBaseIndexZeroBased': index, 'exponent': exponent}",
        "rust_result = {'inputId': document['inputId'], 'analyticCompletion': {'candidateInvariantFactors': [6]}, 'classMap': {'selectedGeneratorIndicesZeroBased': [2], 'selectedGeneratorPrimeIdeals': [{'prime': 11, 'norm': 11, 'generator': [5, 1, 0], 'hnf': [1, 0, 7, 0, 1, 9, 0, 0, 11]}], 'generatorOrderFactorBaseCatalog': catalog, 'generatorOrderPrimePowerHnfs': [], 'generatorOrderRelations': [{'generatorCoordinateZeroBased': 0, 'factorBaseIndexZeroBased': 2, 'order': 6, 'factors': [{'relationIndexZeroBased': 0, 'exponent': '2', 'integralBasisCoordinates': ['2', '0', '0'], 'primeIdealFactors': [factor(0, 3)]}, {'relationIndexZeroBased': 1, 'exponent': '1', 'integralBasisCoordinates': ['7', '0', '0'], 'primeIdealFactors': [factor(1, 3)]}, {'relationIndexZeroBased': 2, 'exponent': '6', 'integralBasisCoordinates': ['-5', '-1', '0'], 'primeIdealFactors': [factor(2, 1), factor(7, 1)]}, {'relationIndexZeroBased': 3, 'exponent': '-3', 'integralBasisCoordinates': ['-28', '-12', '1'], 'primeIdealFactors': [factor(0, 2), factor(1, 1), factor(7, 2)]}]}]}}",
        "certificate = verify_rust_class_generator_orders(K, document, rust_result)",
        "[certificate['authority'], certificate['verifiedGeneratorCount'], certificate['generators']]",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "['independent-sagejs-ideal-arithmetic', 1, [{'generatorCoordinateZeroBased': 0, 'factorBaseIndexZeroBased': 2, 'order': 6, 'prime': 11, 'norm': 11, 'factorCount': 4, 'hnfReplayed': True, 'principalIdealEquality': True}]]",
    );
  } finally {
    await session.close();
  }
});
