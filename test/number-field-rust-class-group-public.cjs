// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

async function evaluate(lines) {
  const session = await createSage();
  try {
    return await session.evaluate([
      "from copy import deepcopy",
      "from sagejs.number_fields.class_group_matrix import SparseRelationRow",
      "from sagejs.number_fields.compact_relation_presentation import CompactRelationPresentation",
      "from sagejs.number_fields.rust_class_group_presentation import RustCompactPresentationReplay, _RustPublicationProofContext, adapt_rust_authenticated_service_class_group",
      "from sagejs.number_fields.class_group_maps import IdealClassGroup, PrincipalIdealWitness",
      "from sagejs.number_fields.class_group_proof import ConditionalGRHProofRecord, SaturationProofRecord",
      "from sagejs.number_fields.class_unit_groups import EXACT_RELATIONS_CONDITIONAL_GRH",
      "from sagejs.number_fields import ideal_arithmetic",
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^3-2)",
      "O = K.maximal_order()",
      "P = next(candidate for candidate, exponent in O.ideal(2).factor() if candidate == O.ideal(2, a))",
      "rows = [SparseRelationRow(1, [(0, 3)]), SparseRelationRow(1, [(0, 3)])]",
      "presentation = CompactRelationPresentation.from_small_surplus(1, rows, (3,), ((1,),), ((1,),), ((1, -1),), (0,), (1,), 3, 1, [((0,), 1)])",
      "captured = []",
      "def query(rows, resources):",
      "    captured.append((deepcopy(rows), resources))",
      "    return {'schema': 'sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1', 'outcome': 'complete-conditional-grh-ideal-class', 'polynomialAscending': [-2, 0, 0, 1], 'completion': {'schema': 'sagejs.rust-class-group/public-cubic-e2e-receipt-v2', 'outcome': 'complete-conditional-grh', 'publicComplete': True, 'usesPariInput': False, 'usesPreparedFixture': False, 'usesFieldAnswersAsInput': False, 'completion': {'invariantFactors': ['3']}}, 'queriedIdealIntegralBasisRows': deepcopy(rows), 'certificate': {'maximalOrderEvidence': 'rust-proved-maximal-order', 'factorBaseSize': 1, 'principalElementIntegralBasisCoordinates': ['2', '0', '0'], 'quotientFactorBaseExponents': [{'factorBaseIndexZeroBased': 0, 'exponent': '2'}], 'classCoordinates': ['1'], 'canonicalRepresentativeFactorBaseExponents': [{'indexZeroBased': 0, 'exponent': '1'}], 'principalWitnessRelationFactors': [{'relationIndexZeroBased': 0, 'exponent': '-1', 'principalElementIntegralBasisCoordinates': ['2', '0', '0']}], 'presentationZero': False, 'cursorTrials': 1, 'primitiveCandidates': 1, 'smoothQuotientNorms': 1}}",
      "context = RustCompactPresentationReplay(presentation, K, O, list(O.basis()), (P,), producer_input_id='sha256:'+'1'*64, prepared_result_identity='sha256:'+'2'*64, certificate_identity='sha256:'+'3'*64, relation_elements=(K(2), K(2)), query_callback=query, query_resources={'maximumTrials': 9}, polynomial_ascending=[-2, 0, 0, 1])",
      ...lines,
    ].join("\n"));
  } finally {
    await session.close();
  }
}

test("resident v1 queries return exact witnesses for fractional ideals", async () => {
  const answer = await evaluate([
    "I = ideal_arithmetic.scalar_translate(P, QQ(1, 2))",
    "coordinates, witness = context.public_ideal_log(I)",
    "quotient = ideal_arithmetic.ideal_quotient(I, context.representative_ideal(coordinates))",
    "[coordinates, witness.verify(O), witness.ideal == quotient, witness.generator.principal_ideal(O) == quotient, len(captured), captured[0][1]]",
  ]);
  assert.equal(answer.repr, "[(1,), True, True, True, 1, {'maximumTrials': 9}]");
});

test("v1 quotient witnesses fail closed under every algebraic binding mutation", async () => {
  const answer = await evaluate([
    "integral, denominator, encoded = context._integral_query_rows(P)",
    "good = query(encoded, None)",
    "mutations = []",
    "for path, value in ((('certificate', 'canonicalRepresentativeFactorBaseExponents', 0, 'exponent'), '2'), (('certificate', 'principalWitnessRelationFactors', 0, 'exponent'), '-2'), (('certificate', 'principalElementIntegralBasisCoordinates', 0), '1'), (('queriedIdealIntegralBasisRows', 0, 0), '99'), (('completion', 'completion', 'invariantFactors', 0), '9')):",
    "    bad = deepcopy(good)",
    "    target = bad",
    "    for key in path[:-1]: target = target[key]",
    "    target[path[-1]] = value",
    "    try:",
    "        context.replay_public_arbitrary_ideal_query(integral, encoded, bad)",
    "    except (ValueError, ArithmeticError) as error:",
    "        mutations.append(str(error))",
    "[len(mutations), mutations]",
  ]);
  assert.equal(answer.repr.includes("[5,"), true);
});

test("ordinary conditional class groups replay proof payloads and use the resident map", async () => {
  const answer = await evaluate([
    "analytic = {'bfIndex': 1, 'bdfStrictMargin': True, 'hypothesis': 'conditional-grh'}",
    "proof_context = _RustPublicationProofContext(presentation, 'sha256:'+'2'*64, '4'*64, 'BDF strict factor-base inequality', 2, 2, 'GRH for class characters AND GRH for zeta residue', analytic)",
    "saturation = SaturationProofRecord((), (), index_bound=1, complete=True, evidence=proof_context._saturation_evidence)",
    "record = ConditionalGRHProofRecord('BDF strict factor-base inequality', (2, 1), relation_count=2, assumption='GRH for class characters AND GRH for zeta residue', saturation=saturation, analytic_index_one=True)",
    "relation = PrincipalIdealWitness(P^3, K(2), source='test exact generator relation')",
    "C = IdealClassGroup(O, (3,), (P,), (relation,), context.public_ideal_log, proof_status=EXACT_RELATIONS_CONDITIONAL_GRH, algorithm='rust-public-cubic', factor_base_theorem='BDF strict factor-base inequality', factor_base_bound=(2, 1), presentation_evidence=presentation, proof_record=record, proof_context=proof_context, relation_count=2)",
    "I = ideal_arithmetic.scalar_translate(P, QQ(1, 2))",
    "payload = C.proof_payload()",
    "bad = deepcopy(payload); bad['conditional_evidence']['artifactSha256'] = '5'*64",
    "[type(C).__name__, C.invariants(), C(I).coordinates(), C.discrete_log(I).principal_witness.verify(O), C.verify(), C.verify_proof_payload(payload), C.verify_proof_payload(bad)]",
  ]);
  assert.equal(answer.repr, "['IdealClassGroup', (3,), (1,), True, True, True, False]");
});

test("missing resident query session never fabricates a public ideal map", async () => {
  const answer = await evaluate([
    "context._query_callback = None",
    "message = ''",
    "try:",
    "    context.public_ideal_log(O.ideal(3))",
    "except RuntimeError as error:",
    "    message = str(error)",
    "message",
  ]);
  assert.equal(answer.repr, "'the Rust publication has no resident ideal query session'");
});

test("compact authenticated summaries construct ordinary class groups", async () => {
  const answer = await evaluate([
    "from sagejs.number_fields.rust_class_group_preparation import prepare_cubic_for_rust, _prepared_basis_elements",
    "prepared_service = prepare_cubic_for_rust(K)",
    "service_basis = _prepared_basis_elements(K, prepared_service)",
    "service_matrix = matrix(QQ, [element.list() for element in service_basis])",
    "relative = P.basis_matrix() * service_matrix.inverse()",
    "generator_rows = [[str(int(value._numerator)) for value in row] for row in relative.rows()]",
    "summary = {'schema': 'sagejs.class-groups/compact-summary-v1', 'outcome': 'complete-conditional-grh', 'proofMode': 'conditional-grh', 'artifactSha256': 'a'*64, 'polynomialAscending': prepared_service['field']['coefficientsAscending'], 'discriminant': str(O.discriminant()), 'signature': [prepared_service['preparation']['signature']['realPlaces'], prepared_service['preparation']['signature']['complexPairs']], 'invariants': ['3'], 'classNumber': '3', 'generatorIdeals': [{'coordinateZeroBased': 0, 'invariantFactor': '3', 'integralBasisRows': generator_rows, 'constructionEvidence': {'method': 'authenticated-smith-lift-with-minimal-rational-principal-shifts', 'classCoordinates': ['1'], 'principalShifts': []}}], 'factorBaseBound': 17, 'relationCount': 2, 'proofWitnessesSha256': 'b'*64, 'fieldBindingSha256': 'c'*64, 'presentationBindingSha256': 'd'*64, 'authority': {'completionSchema': 'sagejs.rust-class-group/public-cubic-e2e-receipt-v2', 'completionOutcome': 'complete-conditional-grh', 'sealedEvidenceVerified': True, 'artifactAuthentication': 'host-must-bind-authenticated-artifact-sha256'}}",
    "summary['integralBasisNumerators'] = deepcopy(prepared_service['preparation']['basisNumeratorsRowMajor'])",
    "summary['basisDenominator'] = prepared_service['preparation']['basisDenominator']",
    "attestations = []",
    "def attest(payload):",
    "    attestations.append(deepcopy(payload))",
    "    return payload['artifactSha256'] == 'a'*64 and payload['proofWitnessesSha256'] == 'b'*64",
    "compact_queries = []",
    "def compact_query(rows, resources):",
    "    compact_queries.append((deepcopy(rows), resources))",
    "    answer = query(rows, resources)",
    "    answer['polynomialAscending'] = deepcopy(summary['polynomialAscending'])",
    "    return answer",
    "C = adapt_rust_authenticated_service_class_group(K, summary, attestation_callback=attest, query_callback=compact_query, query_resources={'maximumTrials': 7})",
    "I = ideal_arithmetic.scalar_translate(P, QQ(1, 2))",
    "log = C.discrete_log(I)",
    "payload = C.proof_payload()",
    "[type(C).__name__, C.invariants(), C.order(), log.coordinates, log.principal_witness.verify(O), C.verify(), C.verify_proof_payload(payload), len(compact_queries), compact_queries[0][1], sorted(set(item['purpose'] for item in attestations))]",
  ]);
  assert.equal(
    answer.repr,
    "['IdealClassGroup', (3,), 3, (1,), True, True, True, 1, {'maximumTrials': 7}, ['class-group-summary', 'conditional-class-group-proof', 'generator-order-witness', 'ideal-query']]",
  );
});

test("compact service summaries and queries fail closed under mutation", async () => {
  const answer = await evaluate([
    "from sagejs.number_fields.rust_class_group_preparation import prepare_cubic_for_rust, _prepared_basis_elements",
    "prepared_service = prepare_cubic_for_rust(K)",
    "service_basis = _prepared_basis_elements(K, prepared_service)",
    "service_matrix = matrix(QQ, [element.list() for element in service_basis])",
    "relative = P.basis_matrix() * service_matrix.inverse()",
    "generator_rows = [[str(int(value._numerator)) for value in row] for row in relative.rows()]",
    "base = {'schema': 'sagejs.class-groups/compact-summary-v1', 'outcome': 'complete-conditional-grh', 'proofMode': 'conditional-grh', 'artifactSha256': 'a'*64, 'polynomialAscending': prepared_service['field']['coefficientsAscending'], 'discriminant': str(O.discriminant()), 'signature': [prepared_service['preparation']['signature']['realPlaces'], prepared_service['preparation']['signature']['complexPairs']], 'invariants': ['3'], 'classNumber': '3', 'generatorIdeals': [{'coordinateZeroBased': 0, 'invariantFactor': '3', 'integralBasisRows': generator_rows, 'constructionEvidence': {'method': 'authenticated-smith-lift-with-minimal-rational-principal-shifts', 'classCoordinates': ['1'], 'principalShifts': []}}], 'factorBaseBound': 17, 'relationCount': 2, 'proofWitnessesSha256': 'b'*64, 'fieldBindingSha256': 'c'*64, 'presentationBindingSha256': 'd'*64, 'authority': {'completionSchema': 'sagejs.rust-class-group/public-cubic-e2e-receipt-v2', 'completionOutcome': 'complete-conditional-grh', 'sealedEvidenceVerified': True, 'artifactAuthentication': 'host-must-bind-authenticated-artifact-sha256'}}",
    "base['integralBasisNumerators'] = deepcopy(prepared_service['preparation']['basisNumeratorsRowMajor'])",
    "base['basisDenominator'] = prepared_service['preparation']['basisDenominator']",
    "def reject(payload): return False",
    "messages = []",
    "try:",
    "    adapt_rust_authenticated_service_class_group(K, base, attestation_callback=reject, query_callback=lambda rows, resources: {})",
    "except ArithmeticError as error:",
    "    messages.append(str(error))",
    "bad = deepcopy(base); bad['generatorIdeals'][0]['integralBasisRows'][0][0] = '99'",
    "try:",
    "    adapt_rust_authenticated_service_class_group(K, bad, attestation_callback=lambda payload: True, query_callback=lambda rows, resources: {})",
    "except (ValueError, ArithmeticError) as error:",
    "    messages.append(str(error))",
    "def bad_query(rows, resources):",
    "    answer = query(rows, resources)",
    "    answer['schema'] = 'mutated-query-schema'",
    "    return answer",
    "C = adapt_rust_authenticated_service_class_group(K, base, attestation_callback=lambda payload: True, query_callback=bad_query)",
    "try:",
    "    C.discrete_log(ideal_arithmetic.scalar_translate(P, QQ(1, 2)))",
    "except (ValueError, ArithmeticError) as error:",
    "    messages.append(str(error))",
    "messages",
  ]);
  assert.equal(answer.repr.includes("resident service did not attest"), true);
  assert.equal(answer.repr.includes("canonical full ideal basis"), true);
  assert.equal(answer.repr.includes("not bound to this artifact"), true);
});
