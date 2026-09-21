// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const resources = {
  maximumTrialDivisor: 10000,
  maximumIrreducibilityPrime: 257,
  embeddingPrecisionBits: 192,
  maximumVisitedIdeals: 10000,
  maximumCandidates: 10000,
  maximumNormalFormEntries: 10000000,
  maximumNormalFormOperations: 50000000,
  maximumRelationExponent: 256,
  maximumVerificationMultiplyAdds: 100000000,
  maximumPrincipalFactorTerms: 10000000,
  maximumCompactGenerators: 16384,
  maximumCompactSurplusRows: 32,
  maximumCompactSaturationMinorTrials: 32768,
  maximumCompactDependencyEntries: 1000000,
  maximumCompactTargetCoefficientBits: 1000000,
  logarithmPrecisionBits: 1024,
  replayPrecisionBits: 512,
  analyticPrecisionBits: 256,
  maximumRelations: 10000,
  maximumDependencies: 1000,
  maximumKernelCoefficientBits: 4080,
  maximumUnitExponentBits: 8192,
  maximumReconstructionDenominatorBits: 4096,
  maximumAnalyticThreshold: 23994,
};

function request(polynomialAscending = ["-1", "-1", "0", "1"]) {
  return {
    schema: "sagejs.rust-class-group/public-cubic-e2e-request-v2",
    polynomialAscending,
    proofMode: "conditional-grh",
    resources,
  };
}

function completeReceipt() {
  return {
    schema: "sagejs.rust-class-group/public-cubic-e2e-receipt-v2",
    outcome: "complete-conditional-grh",
    publicComplete: true,
    requestedProof: "conditional-grh",
    usesPariInput: false,
    usesPreparedFixture: false,
    usesFieldAnswersAsInput: false,
    preparation: {
      discriminant: "-23",
      signature: [1, 1],
      equationOrderIndex: "1",
      discriminantPrimeFactors: ["23"],
      certificateVerified: true,
    },
    relations: {
      factorBaseSize: 4,
      relationCount: 8,
      completeRankAndSurplus: true,
      missingRank: 0,
    },
    candidate: {
      invariantFactors: [],
      classNumber: "1",
      authenticatedPrincipalRelations: 8,
      generatorOrderWitnesses: 0,
      authority: "authenticated-supplied-principal-relations-candidate-only",
    },
    completion: {
      proof: "conditional-grh",
      classNumber: "1",
      invariantFactors: [],
      unitRank: 1,
      bfThreshold: 4096,
      classUnitHypothesis: "GRH for the Dedekind-zeta residue bound",
      factorBaseHypothesis:
        "GRH for all unramified Hecke L-functions of class-group characters",
      sealedEvidenceVerified: true,
      arbitraryIdealClassMapRetained: true,
    },
    stageTimingsNanoseconds: {
      publicInputAndPreparation: 100,
      relationCollection: 200,
      candidateAuthentication: 300,
      unitAndAnalyticCompletion: 400,
      totalToSealedResult: 1100,
    },
  };
}

async function evaluateWithDocuments(lines, requestDocument, receiptDocument) {
  const session = await createSage();
  try {
    return await session.evaluate(
      [
        "import json",
        `request = json.loads(${JSON.stringify(JSON.stringify(requestDocument))})`,
        `receipt = json.loads(${JSON.stringify(JSON.stringify(receiptDocument))})`,
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3-x-1)",
        ...lines,
      ].join("\n"),
    );
  } finally {
    await session.close();
  }
}

test("Rust cubic qualification capability is explicit and never dispatches", async () => {
  const result = await evaluateWithDocuments(
    [
      "from sagejs.number_fields.rust_class_group_qualification import rust_public_cubic_qualification_capability",
      "supported = rust_public_cubic_qualification_capability(K, proof=False)",
      "unconditional = rust_public_cubic_qualification_capability(K, proof=True)",
      "[supported['supported'], supported['capabilities'], supported['artifactIdentityStatus'], unconditional['supported'], unconditional['proofMode']]",
    ],
    request(),
    completeReceipt(),
  );
  assert.equal(
    result.repr,
    "[True, {'receiptValidation': True, 'fieldConsistencyChecks': True, 'requestBinding': False, 'nativeExecution': False, 'wasmExecution': False, 'publicResultSupported': False, 'automaticDispatch': False}, 'not-present-in-receipt-v2', False, 'unsupported']",
  );
});

test("a Rust internally complete receipt remains an incomplete Sage.js result", async () => {
  const result = await evaluateWithDocuments(
    [
      "from sagejs.number_fields.rust_class_group_qualification import adapt_rust_public_cubic_qualification_receipt",
      "answer = adapt_rust_public_cubic_qualification_receipt(K, request, receipt)",
      "errors = []",
      "for projection in (answer.class_number, answer.class_group, answer.unit_group):",
      "    try:",
      "        projection()",
      "    except ValueError as error:",
      "        errors.append(str(error))",
      "stage_states = [(stage.name, stage.state) for stage in answer.stages]",
      "receipt_identity = answer.diagnostics['receiptIdentity']",
      "[answer.complete, answer.proof_status, answer.algorithm, answer.tentative_invariants, answer.diagnostics['completionStatus'], answer.diagnostics['artifactIdentity'], answer.diagnostics['requestBindingStatus'], answer.diagnostics['automaticDispatch'], len(answer.diagnostics['remainingEvidenceGaps']), stage_states, receipt_identity.startswith('sha256:'), len(receipt_identity), errors]",
    ],
    request(),
    completeReceipt(),
  );
  assert.equal(
    result.repr,
    "[False, 'incomplete-resource-limit', 'rust-public-cubic-qualification-experimental', (), 'rust-internal-complete-conditional-grh/sagejs-incomplete', None, 'not-present-in-receipt-v2', False, 7, [('rust-public-cubic-qualification', 'complete'), ('sagejs-public-class-unit-adaptation', 'incomplete')], True, 71, ['an incomplete class/unit computation has no proved class group', 'an incomplete class/unit computation has no proved class group', 'the computation did not produce a unit subgroup']]",
  );
});

test("the receipt adapter rejects field, proof, and completion corruption", async () => {
  const result = await evaluateWithDocuments(
    [
      "from copy import deepcopy",
      "from sagejs.number_fields.rust_class_group_qualification import adapt_rust_public_cubic_qualification_receipt",
      "messages = []",
      "bad_request = deepcopy(request)",
      "bad_request['polynomialAscending'][0] = '-2'",
      "bad_proof = deepcopy(receipt)",
      "bad_proof['requestedProof'] = 'unconditional'",
      "bad_completion = deepcopy(receipt)",
      "bad_completion['completion']['classNumber'] = '2'",
      "bad_extra = deepcopy(receipt)",
      "bad_extra['trustedBySagejs'] = True",
      "for candidate_request, candidate_receipt in ((bad_request, receipt), (request, bad_proof), (request, bad_completion), (request, bad_extra)):",
      "    try:",
      "        adapt_rust_public_cubic_qualification_receipt(K, candidate_request, candidate_receipt)",
      "    except (ArithmeticError, ValueError) as error:",
      "        messages.append(str(error))",
      "messages",
    ],
    request(),
    completeReceipt(),
  );
  assert.equal(
    result.repr,
    "['the Rust qualification request is not bound to this number field', 'the Rust receipt changed the requested proof mode', 'the Rust receipt invariant product is inconsistent', \"receipt has the wrong fields (missing=[], unknown=['trustedBySagejs'])\"]",
  );
});

test("an exhausted relation search adapts only to an incomplete context", async () => {
  const receipt = completeReceipt();
  receipt.outcome = "incomplete";
  receipt.publicComplete = false;
  delete receipt.candidate;
  delete receipt.completion;
  receipt.firstUnavailableBoundary = "relation-collection";
  receipt.relations.completeRankAndSurplus = false;
  receipt.relations.missingRank = 2;
  receipt.stageTimingsNanoseconds.unitAndAnalyticCompletion = 0;

  const result = await evaluateWithDocuments(
    [
      "from sagejs.number_fields.rust_class_group_qualification import adapt_rust_public_cubic_qualification_receipt",
      "answer = adapt_rust_public_cubic_qualification_receipt(K, request, receipt)",
      "[answer.complete, answer.tentative_invariants, answer.diagnostics['completionStatus'], answer.diagnostics['producerFirstUnavailableBoundary'], answer.stages[0].state]",
    ],
    request(),
    receipt,
  );
  assert.equal(
    result.repr,
    "[False, (), 'rust-internal-incomplete/sagejs-incomplete', 'relation-collection', 'incomplete']",
  );
});
