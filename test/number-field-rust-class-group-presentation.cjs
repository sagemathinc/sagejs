// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const verifiedClaims = [
  "classMapAnnihilatesEveryRelation",
  "dependencyCountEqualsRowsMinusColumns",
  "dependencyLatticeEqualsIntegralLeftKernel",
  "dependencyLatticeIsPrimitive",
  "dependencyRankEqualsRowsMinusColumns",
  "everyDependencyReplaysToZero",
  "fullRelationLatticeIndexEqualsGroupOrder",
  "generatorOrderWitnessesReplayExactly",
  "invariantProductEqualsClaimedClassNumber",
  "projectedDependencyIndexDividesSquareDeterminant",
  "standardGeneratorLiftsMapToCoordinateBasis",
];

function preparedResult() {
  return {
    schema: "sagejs.rust-class-group/prepared-cubic-class-unit-v2",
    inputId: `sha256:${"0".repeat(64)}`,
    qualificationStatus: "grh-conditional-class-unit-index-one",
    usesClassGroupAnswersAsInput: false,
    usesOracleAsInput: false,
    polynomialAscending: [],
    relations: { rows: 2, columns: 1 },
    relationLatticeEvidence: {
      schema: "sagejs.rust-class-group/prepared-cubic-relation-lattice-v1",
      factorBaseCatalog: [{
        factorBaseIndexZeroBased: 0,
        generator: null,
        hnf: [2, 0, 0, 0, 1, 0, 0, 0, 1],
        norm: 2,
        prime: 2,
        ramification: 3,
        residueDegree: 1,
      }],
      relationRecords: [
        {
          relationIndexZeroBased: 0,
          integralBasisCoordinates: ["2", "0", "0"],
          primeIdealFactors: [
            { factorBaseIndexZeroBased: 0, exponent: 3 },
          ],
        },
        {
          relationIndexZeroBased: 1,
          integralBasisCoordinates: ["2", "0", "0"],
          primeIdealFactors: [
            { factorBaseIndexZeroBased: 0, exponent: 3 },
          ],
        },
      ],
    },
    analyticCompletion: {},
    classMap: {},
    kernel: {},
    mathematicalBoundary: {},
    presentationIndexEvidence: {},
    reconstructedUnitLattice: {},
    relationCollectionProfile: {},
    timingsNanoseconds: {},
  };
}

function certificate() {
  return {
    schema: "sagejs.rust-class-group/compact-presentation-certificate-v1",
    sourceInputId: `sha256:${"0".repeat(64)}`,
    qualificationStatus: "closed-exact-lattice-index-certificate",
    relationShape: { rows: 2, columns: 1 },
    invariantFactors: ["3"],
    groupOrder: "3",
    modularClassMap: {
      moduli: ["3"],
      rows: [
        { factorBaseIndexZeroBased: 0, residues: [1] },
      ],
    },
    standardGeneratorLifts: [
      {
        coordinateZeroBased: 0,
        modulus: "3",
        factorBaseLift: [
          { factorBaseIndexZeroBased: 0, coefficient: "1" },
        ],
        orderRelationCombination: [
          { relationIndexZeroBased: 0, coefficient: "1" },
        ],
      },
    ],
    relationDependencies: [
      {
        dependencyIndexZeroBased: 0,
        terms: [
          { relationIndexZeroBased: 0, coefficient: "1" },
          { relationIndexZeroBased: 1, coefficient: "-1" },
        ],
      },
    ],
    latticeIndexEvidence: {
      squareRowIndicesZeroBased: [0],
      surplusRowIndicesZeroBased: [1],
      squareDeterminant: "3",
      projectedDependencyDeterminant: "1",
      dependencySaturation: {
        criterion: "gcd-of-exhibited-maximal-dependency-minors-is-one",
        selectedMinors: [
          { relationRowIndicesZeroBased: [0], determinant: "1" },
        ],
        gcd: "1",
      },
      fullRelationLatticeIndex: "3",
    },
    verified: Object.fromEntries(verifiedClaims.map((name) => [name, true])),
  };
}

async function evaluate(lines, resultDocument = preparedResult(), certDocument = certificate()) {
  const session = await createSage();
  try {
    return await session.evaluate(
      [
        "import json",
        "from copy import deepcopy",
        "from sagejs.number_fields.rust_class_group_preparation import prepare_cubic_for_rust",
        "from sagejs.number_fields.rust_class_group_presentation import adapt_rust_prepared_cubic_v2_presentation",
        "exec(open('bench/pari-class-group-rust/qualification/public-adapter/query_transport.py').read(), globals())",
        `result = json.loads(${JSON.stringify(JSON.stringify(resultDocument))})`,
        `certificate = json.loads(${JSON.stringify(JSON.stringify(certDocument))})`,
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3-2)",
        "prepared = prepare_cubic_for_rust(K)",
        "result['inputId'] = prepared['inputId']",
        "result['polynomialAscending'] = prepared['field']['coefficientsAscending']",
        "certificate['sourceInputId'] = prepared['inputId']",
        ...lines,
      ].join("\n"),
    );
  } finally {
    await session.close();
  }
}

test("v2 replay proves principal rows and exposes live factor-base ideals", async () => {
  const answer = await evaluate([
    "answer = adapt_rust_prepared_cubic_v2_presentation(K, prepared, result, certificate)",
    "context = answer.context",
    "class_error = ''",
    "try:",
    "    answer.class_group()",
    "except ValueError as error:",
    "    class_error = str(error)",
    "prime = context.factor_base_ideal(0)",
    "query = {'schema': 'sagejs.rust-class-group/arbitrary-ideal-class-query-v1', 'sourceInputId': context.producer_input_id, 'preparedResultIdentity': context.prepared_result_identity, 'compactCertificateIdentity': context.certificate_identity, 'maximalOrderEvidence': 'rust-proved-maximal-order', 'factorBaseSize': 1, 'principalElementIntegralBasisCoordinates': ['2', '0', '0'], 'quotientFactorBaseExponents': [{'factorBaseIndexZeroBased': 0, 'exponent': '2'}], 'classCoordinates': ['1'], 'presentationZero': False}",
    "relative = prime.basis_matrix() * K.maximal_order()._basis_inverse_matrix()",
    "public_query = {'schema': 'sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1', 'outcome': 'complete-conditional-grh-ideal-class', 'polynomialAscending': result['polynomialAscending'], 'completion': {'schema': 'sagejs.rust-class-group/public-cubic-e2e-receipt-v2', 'outcome': 'complete-conditional-grh', 'publicComplete': True, 'usesPariInput': False, 'usesPreparedFixture': False, 'usesFieldAnswersAsInput': False, 'completion': {'invariantFactors': ['3']}}, 'queriedIdealIntegralBasisRows': [[str(value._numerator) for value in row] for row in relative.rows()], 'certificate': {'maximalOrderEvidence': 'rust-proved-maximal-order', 'factorBaseSize': 1, 'principalElementIntegralBasisCoordinates': ['2', '0', '0'], 'quotientFactorBaseExponents': [{'factorBaseIndexZeroBased': 0, 'exponent': '2'}], 'classCoordinates': ['1'], 'presentationZero': False, 'cursorTrials': 3, 'primitiveCandidates': 1, 'smoothQuotientNorms': 1}}",
    "[answer.complete, answer.proof_status, answer.tentative_invariants, context.verify(), context.factor_base_class_coordinates(0), context.class_coordinates((4,)), context.lift_class_coordinates((1,)), prime == K.maximal_order().ideal(2, a), context.smooth_ideal_class_coordinates(prime), context.smooth_ideal_class_coordinates(prime^3), context.class_generator_ideal(0) == prime, context.representative_ideal((2,)) == prime^2, context.replay_arbitrary_ideal_class_certificate(prime, query), replay_public_arbitrary_ideal_query_receipt(context, prime, result['polynomialAscending'], public_query), answer.diagnostics['relationPresentationReplay'], answer.diagnostics['relationIdealReplay']['allPrincipalIdealEqualitiesReplayed'], answer.diagnostics['arbitraryIdealClassMap'], answer.diagnostics['automaticDispatch'], len(answer.diagnostics['acceptedEvidenceJoins']), len(answer.diagnostics['remainingEvidenceGaps']), [(stage.name, stage.state) for stage in answer.stages], class_error]",
  ]);
  assert.equal(
    answer.repr,
    "[False, 'incomplete-resource-limit', (3,), True, (1,), (1,), (1,), True, (1,), (0,), True, True, (1,), (1,), 'exact-principal-ideal-and-integer-lattice', True, 'certificate-replay-available-through-context', False, 7, 5, [('rust-compact-relation-presentation-replay', 'complete'), ('sagejs-public-class-unit-certification', 'incomplete')], 'an incomplete class/unit computation has no proved class group']",
  );
});

test("arbitrary-ideal certificates fail closed under witness and authority mutation", async () => {
  const answer = await evaluate([
    "answer = adapt_rust_prepared_cubic_v2_presentation(K, prepared, result, certificate)",
    "context = answer.context",
    "prime = context.factor_base_ideal(0)",
    "query = {'schema': 'sagejs.rust-class-group/arbitrary-ideal-class-query-v1', 'sourceInputId': context.producer_input_id, 'preparedResultIdentity': context.prepared_result_identity, 'compactCertificateIdentity': context.certificate_identity, 'maximalOrderEvidence': 'rust-proved-maximal-order', 'factorBaseSize': 1, 'principalElementIntegralBasisCoordinates': ['2', '0', '0'], 'quotientFactorBaseExponents': [{'factorBaseIndexZeroBased': 0, 'exponent': '2'}], 'classCoordinates': ['1'], 'presentationZero': False}",
    "messages = []",
    "for mutate in ('element', 'exponent', 'coordinate', 'authority', 'zero'):",
    "    candidate = deepcopy(query)",
    "    if mutate == 'element': candidate['principalElementIntegralBasisCoordinates'][0] = '3'",
    "    if mutate == 'exponent': candidate['quotientFactorBaseExponents'][0]['exponent'] = '1'",
    "    if mutate == 'coordinate': candidate['classCoordinates'][0] = '2'",
    "    if mutate == 'authority': candidate['preparedResultIdentity'] = 'sha256:' + '3' * 64",
    "    if mutate == 'zero': candidate['presentationZero'] = True",
    "    try:",
    "        context.replay_arbitrary_ideal_class_certificate(prime, candidate)",
    "    except (ArithmeticError, ValueError) as error:",
    "        messages.append(str(error))",
    "relative = prime.basis_matrix() * K.maximal_order()._basis_inverse_matrix()",
    "public_query = {'schema': 'sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1', 'outcome': 'complete-conditional-grh-ideal-class', 'polynomialAscending': ['-3', '0', '0', '1'], 'completion': {'schema': 'sagejs.rust-class-group/public-cubic-e2e-receipt-v2', 'outcome': 'complete-conditional-grh', 'publicComplete': True, 'usesPariInput': False, 'usesPreparedFixture': False, 'usesFieldAnswersAsInput': False, 'completion': {'invariantFactors': ['3']}}, 'queriedIdealIntegralBasisRows': [[str(value._numerator) for value in row] for row in relative.rows()], 'certificate': {'maximalOrderEvidence': 'rust-proved-maximal-order', 'factorBaseSize': 1, 'principalElementIntegralBasisCoordinates': ['2', '0', '0'], 'quotientFactorBaseExponents': [{'factorBaseIndexZeroBased': 0, 'exponent': '2'}], 'classCoordinates': ['1'], 'presentationZero': False, 'cursorTrials': 3, 'primitiveCandidates': 1, 'smoothQuotientNorms': 1}}",
    "try:",
    "    replay_public_arbitrary_ideal_query_receipt(context, prime, result['polynomialAscending'], public_query)",
    "except ValueError as error:",
    "    messages.append(str(error))",
    "messages",
  ]);
  assert.equal(
    answer.repr,
    "['arbitrary-ideal principal equality failed exact replay', 'arbitrary-ideal principal equality failed exact replay', 'arbitrary-ideal class coordinates mismatch', 'arbitrary-ideal certificate authority mismatch', 'arbitrary-ideal principality state mismatch', 'public arbitrary-ideal query authority mismatch']",
  );
});

test("the adapter rejects identity, polynomial, and schema substitution", async () => {
  const answer = await evaluate([
    "messages = []",
    "bad_identity = deepcopy(result)",
    "bad_identity['inputId'] = 'sha256:' + '1' * 64",
    "bad_polynomial = deepcopy(result)",
    "bad_polynomial['polynomialAscending'][0] = '-3'",
    "bad_oracle = deepcopy(result)",
    "bad_oracle['usesOracleAsInput'] = True",
    "bad_extra = deepcopy(certificate)",
    "bad_extra['artifactSha256'] = 'sha256:' + '2' * 64",
    "for candidate_result, candidate_certificate in ((bad_identity, certificate), (bad_polynomial, certificate), (bad_oracle, certificate), (result, bad_extra)):",
    "    try:",
    "        adapt_rust_prepared_cubic_v2_presentation(K, prepared, candidate_result, candidate_certificate)",
    "    except ValueError as error:",
    "        messages.append(str(error))",
    "messages",
  ]);
  assert.equal(
    answer.repr,
    "['prepared result input identity mismatch', 'prepared result polynomial mismatch', 'unsupported qualification status', 'compact certificate has an unsupported schema']",
  );
});

test("producer booleans cannot bless counterfeit exact evidence", async () => {
  const answer = await evaluate([
    "messages = []",
    "bad_dependency = deepcopy(certificate)",
    "bad_dependency['relationDependencies'][0]['terms'][1]['coefficient'] = '-2'",
    "bad_order = deepcopy(certificate)",
    "bad_order['standardGeneratorLifts'][0]['orderRelationCombination'][0]['coefficient'] = '2'",
    "bad_map = deepcopy(certificate)",
    "bad_map['modularClassMap']['rows'][0]['residues'] = [0]",
    "bad_claim = deepcopy(certificate)",
    "bad_claim['verified']['everyDependencyReplaysToZero'] = False",
    "bad_exponent = deepcopy(result)",
    "bad_exponent['relationLatticeEvidence']['relationRecords'][0]['primeIdealFactors'][0]['exponent'] = -2",
    "for candidate_result, candidate_certificate in ((result, bad_dependency), (result, bad_order), (result, bad_map), (result, bad_claim), (bad_exponent, certificate)):",
    "    try:",
    "        adapt_rust_prepared_cubic_v2_presentation(K, prepared, candidate_result, candidate_certificate)",
    "    except ValueError as error:",
    "        messages.append(str(error))",
    "[len(messages), messages]",
  ]);
  assert.equal(
    answer.repr,
    "[5, ['Rust compact certificate failed Sage.js replay', 'standard-generator order combination does not replay exactly', 'Rust compact certificate failed Sage.js replay', 'producer verification claims are incomplete', 'relation coefficient is invalid']]",
  );
});

test("the adapter rejects counterfeit prime and principal-ideal evidence", async () => {
  const answer = await evaluate([
    "messages = []",
    "bad_relation = deepcopy(result)",
    "bad_relation['relationLatticeEvidence']['relationRecords'][0]['integralBasisCoordinates'] = ['1', '0', '0']",
    "bad_ramification = deepcopy(result)",
    "bad_ramification['relationLatticeEvidence']['factorBaseCatalog'][0]['ramification'] = 2",
    "bad_hnf = deepcopy(result)",
    "bad_hnf['relationLatticeEvidence']['factorBaseCatalog'][0]['hnf'][0] = 4",
    "for candidate in (bad_relation, bad_ramification, bad_hnf):",
    "    try:",
    "        adapt_rust_prepared_cubic_v2_presentation(K, prepared, candidate, certificate)",
    "    except (ArithmeticError, ValueError) as error:",
    "        messages.append(str(error))",
    "messages",
  ]);
  assert.equal(
    answer.repr,
    "['relation is not the claimed principal ideal', 'factor-base entry is not the claimed prime ideal', 'a prime ideal HNF has the wrong index']",
  );
});

test("resource and canonical-integer preflights reject hostile evidence", async () => {
  const answer = await evaluate([
    "messages = []",
    "square = deepcopy(certificate)",
    "square['relationShape'] = {'rows': 66, 'columns': 65}",
    "square_result = deepcopy(result)",
    "square_result['relations'] = {'rows': 66, 'columns': 65}",
    "too_many_minors = deepcopy(certificate)",
    "too_many_minors['latticeIndexEvidence']['dependencySaturation']['selectedMinors'] = [deepcopy(too_many_minors['latticeIndexEvidence']['dependencySaturation']['selectedMinors'][0]) for _ in range(257)]",
    "too_much_minor_work = deepcopy(certificate)",
    "too_much_minor_work['latticeIndexEvidence']['dependencySaturation']['selectedMinors'] = [deepcopy(too_much_minor_work['latticeIndexEvidence']['dependencySaturation']['selectedMinors'][0]) for _ in range(129)]",
    "oversized = deepcopy(result)",
    "oversized['relationLatticeEvidence']['factorBaseCatalog'][0]['hnf'][0] = 1 << 4096",
    "noncanonical_number = deepcopy(result)",
    "noncanonical_number['relationLatticeEvidence']['relationRecords'][0]['primeIdealFactors'][0]['exponent'] = 2.0",
    "nested_extra = deepcopy(certificate)",
    "nested_extra['modularClassMap']['rows'][0]['trusted'] = True",
    "short_map = deepcopy(certificate)",
    "short_map['modularClassMap']['rows'] = []",
    "oversized_decimal = deepcopy(result)",
    "oversized_decimal['relationLatticeEvidence']['relationRecords'][0]['integralBasisCoordinates'][0] = '1' * 1235",
    "cases = ((square_result, square), (result, too_many_minors), (result, too_much_minor_work), (oversized, certificate), (noncanonical_number, certificate), (result, nested_extra), (result, short_map), (oversized_decimal, certificate))",
    "for candidate_result, candidate_certificate in cases:",
    "    try:",
    "        adapt_rust_prepared_cubic_v2_presentation(K, prepared, candidate_result, candidate_certificate)",
    "    except ValueError as error:",
    "        messages.append(str(error))",
    "messages",
  ]);
  assert.equal(
    answer.repr,
    "['square determinant exceeds the verifier work limit', 'too many dependency-minor witnesses', 'dependency-minor replay exceeds the verifier work limit', 'factor-base coordinate exceeds the exact-integer bit limit', 'prepared result is not canonical JSON data', 'class-map row has an unsupported schema', 'class-map row count mismatch', 'principal coordinate is not a canonical decimal']",
  );
});
