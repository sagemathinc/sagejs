// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

async function evaluate(lines) {
  const sage = await createSage();
  try {
    return await sage.evaluate(lines.join("\n"));
  } finally {
    await sage.close();
  }
}

const fixture = [
  "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
  "import sagejs.runtime as runtime",
  "import sagejs.number_fields.rust_class_group_presentation as rust_presentation",
  "import sagejs.number_fields.class_unit_groups as class_units",
  "R.<x> = QQ[]",
  "HOST_SCHEMA = rust_runtime.HOST_RESPONSE_SCHEMA",
  "QUERY_SCHEMA = rust_runtime.IDEAL_QUERY_RECEIPT_SCHEMA",
  "SUMMARY_SCHEMA = rust_runtime.COMPACT_SUMMARY_SCHEMA",
  "ARTIFACT = 'a' * 64",
  "class FakeRegulator:",
  "    precision_bits = 512",
  "class FakeUnitGroup:",
  "    complete = True",
  "    reason = ''",
  "    unit_rank = 1",
  "    generators = ()",
  "    regulator_enclosure = FakeRegulator()",
  "class FakeGroup:",
  "    def __init__(self, status):",
  "        self.proof_status = status",
  "    def order(self):",
  "        return 3",
  "    def invariants(self):",
  "        return (3,)",
  "class FakeContext:",
  "    pass",
  "def fake_result(field, status):",
  "    return class_units.ClassUnitComputation(",
  "        field, proof_status=status, complete=True, reason='fixture',",
  "        algorithm='rust', stages=(), class_group=FakeGroup(status),",
  "        unit_group=FakeUnitGroup(), tentative_invariants=(3,),",
  "        context=FakeContext(), diagnostics={'fixture': True})",
  "def fake_adapter(field, publication, artifact, query_callback=None, query_resources=None):",
  "    assert publication['schema'] == 'sagejs.rust-class-group/public-cubic-publication-candidate-v2'",
  "    assert publication['proofMode'] == 'conditional-grh'",
  "    assert artifact == ARTIFACT",
  "    assert callable(query_callback)",
  "    assert query_resources['maximumValuation'] == 256",
  "    result = fake_result(field, class_units.EXACT_RELATIONS_CONDITIONAL_GRH)",
  "    result.context.query_callback = query_callback",
  "    return result",
  "rust_presentation.adapt_rust_public_cubic_publication_candidate = fake_adapter",
  "class Backend:",
  "    def __init__(self, failure=None):",
  "        self.failure = failure",
  "        self.calls = []",
  "    def call(self, operation, request):",
  "        self.calls.append((operation, request))",
  "        if self.failure is not None and operation == 'capability':",
  "            return {'schema': HOST_SCHEMA, 'outcome': self.failure[0], 'category': self.failure[1], 'message': self.failure[2]}",
  "        if operation == 'capability':",
  "            return {'schema': HOST_SCHEMA, 'outcome': 'available', 'artifactSha256': ARTIFACT}",
  "        if operation == 'open':",
  "            mathematical = request['request']",
  "            assert mathematical['schema'] == 'sagejs.rust-class-group/public-cubic-e2e-request-v2'",
  "            assert mathematical['proofMode'] == 'conditional-grh'",
  "            assert mathematical['polynomialAscending'] == ['-1', '-1', '0', '1']",
  "            return {'schema': HOST_SCHEMA, 'outcome': 'open', 'artifactSha256': ARTIFACT, 'generation': '7', 'handle': '4294967297', 'completion': {'schema': 'sagejs.rust-class-group/public-cubic-e2e-receipt-v2', 'outcome': 'complete-conditional-grh', 'publicComplete': True, 'requestedProof': 'conditional-grh'}}",
  "        if operation == 'publication':",
  "            return {'schema': HOST_SCHEMA, 'outcome': 'complete', 'artifactSha256': ARTIFACT, 'generation': request['generation'], 'handle': request['handle'], 'publication': {'schema': 'sagejs.rust-class-group/public-cubic-publication-candidate-v2', 'status': 'detached-replay-required-before-publication', 'proofMode': 'conditional-grh'}}",
  "        if operation == 'summary':",
  "            return {",
  "                'schema': SUMMARY_SCHEMA,",
  "                'outcome': 'complete-conditional-grh',",
  "                'proofMode': 'conditional-grh',",
  "                'polynomialAscending': ['-1', '-1', '0', '1'],",
  "                'discriminant': '-23',",
  "                'signature': [1, 1],",
  "                'integralBasisNumerators': ['1', '0', '0', '0', '1', '0', '0', '0', '1'],",
  "                'basisDenominator': '1',",
  "                'invariants': [],",
  "                'classNumber': '1',",
  "                'generatorIdeals': [],",
  "                'factorBaseBound': 100,",
  "                'relationCount': 0,",
  "                'proofWitnessesSha256': 'b' * 64,",
  "                'fieldBindingSha256': 'c' * 64,",
  "                'presentationBindingSha256': 'd' * 64,",
  "                'artifactSha256': ARTIFACT,",
  "                'authority': {",
  "                    'completionSchema': 'sagejs.rust-class-group/public-cubic-e2e-receipt-v2',",
  "                    'completionOutcome': 'complete-conditional-grh',",
  "                    'sealedEvidenceVerified': True,",
  "                    'artifactAuthentication': 'host-must-bind-authenticated-artifact-sha256',",
  "                },",
  "            }",
  "        if operation == 'query':",
  "            assert request['generation'] == '7'",
  "            assert request['resources']['maximumValuation'] == 256",
  "            return {'schema': QUERY_SCHEMA, 'outcome': 'complete-conditional-grh-ideal-class', 'queryMarker': request['idealIntegralBasisRows'][0][0]}",
  "        if operation == 'close':",
  "            return {'schema': HOST_SCHEMA, 'outcome': 'closed', 'generation': request['generation'], 'handle': request['handle']}",
  "        raise AssertionError('unexpected operation ' + operation)",
];

test("compact Rust class-group dispatch authenticates and caches the real adapter", async () => {
  const result = await evaluate([
    ...fixture,
    "backend = Backend()",
    "setattr(runtime, 'class_group_backend', lambda: backend)",
    "K.<a> = NumberField(x^3 - x - 1)",
    "G = K.class_group(proof=False, algorithm='rust')",
    "again = K.class_group(proof=False, algorithm='rust')",
    "answer = [G.order(), G.invariants(), G.proof_status, G.algorithm, G.verify(), G is again, [name for name, request in backend.calls]]",
    "answer",
  ]);
  assert.equal(
    result.repr,
    "[1, (), 'exact-relations-conditional-grh', 'rust-authenticated-service-cubic', True, True, ['capability', 'open', 'summary']]",
  );
});

test("compact class groups and class-unit projections retain separate coarse caches", async () => {
  const result = await evaluate([
    ...fixture,
    "backend = Backend()",
    "setattr(runtime, 'class_group_backend', lambda: backend)",
    "K.<a> = NumberField(x^3 - x - 1)",
    "C = K.class_group(proof=False, algorithm='rust')",
    "h = K.class_number(proof=False, algorithm='rust')",
    "U = K.unit_group(proof=False, algorithm='rust')",
    "context = K.class_unit_group(proof=False, algorithm='rust')",
    "marker = context.context.query_callback([['11', '0', '0'], ['0', '1', '0'], ['0', '0', '1']], None)['queryMarker']",
    "answer = [C.invariants(), h, U.unit_rank, context.proof_status, marker, [name for name, request in backend.calls], context is K.class_unit_group(proof=False, algorithm='rust')]",
    "answer",
  ]);
  assert.equal(
    result.repr,
    "[(), 3, 1, 'exact-relations-conditional-grh', '11', ['capability', 'open', 'summary', 'capability', 'open', 'publication', 'query'], True]",
  );
});

test("default proof runs the authenticated unconditional suffix without relabeling", async () => {
  const result = await evaluate([
    ...fixture,
    "backend = Backend()",
    "setattr(runtime, 'class_group_backend', lambda: backend)",
    "upgrade_calls = []",
    "def upgrade(field, source, algorithm, limits, seed):",
    "    upgrade_calls.append((source.proof_status, algorithm, seed))",
    "    return fake_result(field, class_units.EXACT_UNCONDITIONAL)",
    "class_units._upgrade_cached_conditional_result = upgrade",
    "K.<a> = NumberField(x^3 - x - 1)",
    "conditional = K.class_unit_group(proof=False, algorithm='rust')",
    "unconditional = K.class_unit_group(algorithm='rust')",
    "answer = [conditional.proof_status, unconditional.proof_status, upgrade_calls, [name for name, request in backend.calls], conditional is K.class_unit_group(proof=False, algorithm='rust'), unconditional is K.class_unit_group(proof=True, algorithm='rust')]",
    "answer",
  ]);
  assert.equal(
    result.repr,
    "['exact-relations-conditional-grh', 'exact-unconditional', [('exact-relations-conditional-grh', 'auto', 0)], ['capability', 'open', 'publication'], True, True]",
  );
});

test("a missing unconditional suffix and corrupt successes fail closed", async () => {
  const result = await evaluate([
    ...fixture,
    "backend = Backend()",
    "setattr(runtime, 'class_group_backend', lambda: backend)",
    "class_units._upgrade_cached_conditional_result = lambda field, source, algorithm, limits, seed: None",
    "K.<a> = NumberField(x^3 - x - 1)",
    "messages = []",
    "try:",
    "    K.class_group(algorithm='rust')",
    "except Exception as error:",
    "    messages.append((type(error).__name__, str(error)))",
  "class CorruptBackend(Backend):",
  "    def call(self, operation, request):",
  "        answer = super().call(operation, request)",
  "        if operation == 'summary':",
  "            answer['artifactSha256'] = 'b' * 64",
    "        return answer",
    "corrupt = CorruptBackend()",
    "setattr(runtime, 'class_group_backend', lambda: corrupt)",
    "L.<b> = NumberField(x^3 - x - 1)",
    "try:",
    "    L.class_group(proof=False, algorithm='auto')",
    "except Exception as error:",
    "    messages.append((type(error).__name__, str(error)))",
  "class LateDeclineBackend(Backend):",
  "    def call(self, operation, request):",
  "        if operation == 'summary':",
  "            self.calls.append((operation, request))",
    "            return {'schema': HOST_SCHEMA, 'outcome': 'error', 'category': 'capability-declined', 'message': 'too late to fall back'}",
    "        return super().call(operation, request)",
    "late = LateDeclineBackend()",
    "setattr(runtime, 'class_group_backend', lambda: late)",
    "M.<c> = NumberField(x^3 - x - 1)",
    "try:",
    "    M.class_group(proof=False, algorithm='auto')",
    "except Exception as error:",
    "    messages.append((type(error).__name__, str(error)))",
    "[messages, [name for name, request in corrupt.calls], [name for name, request in late.calls]]",
  ]);
  assert.match(result.repr, /RustClassGroupPublicationError/);
  assert.match(result.repr, /unconditional Minkowski suffix/);
  assert.match(result.repr, /changed resident identity/);
  assert.match(result.repr, /declined after publishing a resident result/);
  assert.match(result.repr, /'close'/);
});

test("auto falls back only on a typed pre-publication capability decline", async () => {
  const result = await evaluate([
    ...fixture,
    "declined = Backend(('error', 'capability-declined', 'not installed for target'))",
    "setattr(runtime, 'class_group_backend', lambda: declined)",
    "K.<a> = NumberField(x^3 - x - 1)",
    "auto = rust_runtime.rust_class_unit_context(K, proof=False, algorithm='auto')",
    "forced = ''",
    "try:",
    "    rust_runtime.rust_class_unit_context(K, proof=False, algorithm='rust')",
    "except Exception as error:",
    "    forced = type(error).__name__",
    "failed = Backend(('error', 'resource-exhausted', 'explicit resource exhausted'))",
    "setattr(runtime, 'class_group_backend', lambda: failed)",
    "operational = ''",
    "try:",
    "    rust_runtime.rust_class_unit_context(K, proof=False, algorithm='auto')",
    "except Exception as error:",
    "    operational = type(error).__name__ + ':' + error.category",
    "[auto, forced, operational]",
  ]);
  assert.equal(
    result.repr,
    "[None, 'RustClassGroupCapabilityDecline', 'RustClassGroupServiceError:resource-exhausted']",
  );
});

test("unsupported execution controls are never ignored", async () => {
  const result = await evaluate([
    ...fixture,
    "backend = Backend()",
    "setattr(runtime, 'class_group_backend', lambda: backend)",
    "K.<a> = NumberField(x^3 - x - 1)",
    "auto = rust_runtime.rust_class_unit_context(K, proof=False, algorithm='auto', options={'max_relations': 1})",
    "forced = ''",
    "try:",
    "    K.class_group(proof=False, algorithm='rust', max_relations=1)",
    "except Exception as error:",
    "    forced = type(error).__name__",
    "[auto, forced, backend.calls]",
  ]);
  assert.equal(result.repr, "[None, 'RustClassGroupCapabilityDecline', []]");
});

test(
  "the production service publishes a detached dense result through the ordinary Sage API",
  {
    skip: process.env.SAGEJS_CLASS_GROUP_SERVICE
      ? false
      : "production class-group service is absent",
  },
  async () => {
    const result = await evaluate([
      "R.<x> = QQ[]",
      "K.<a> = NumberField(x^3 - x - 1)",
      "G = K.class_group(proof=False, algorithm='rust')",
      "[G.order(), G.invariants(), G.proof_status]",
    ]);
    assert.equal(result.repr, "[1, (), 'exact-relations-conditional-grh']");
  },
);
