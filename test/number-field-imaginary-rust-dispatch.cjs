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
  "import sagejs.runtime as runtime",
  "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
  "R.<x> = QQ[]",
  "K.<a> = NumberField(x^2 + 23)",
  "forms = [{'a': 1, 'b': 1, 'c': 6}, {'a': 2, 'b': -1, 'c': 3}, {'a': 2, 'b': 1, 'c': 3}]",
  "def ideal(form):",
  "    return {'basisColumns': [[form['a'], 0], [(-1 - form['b']) // 2, 1]], 'norm': form['a']}",
  "result = {'schema': rust_runtime.IMAGINARY_GROUP_SCHEMA, 'fieldId': 'public-coefficient-input',",
  "    'polynomialAscending': [6, -1, 1], 'discriminant': -23, 'classNumber': 3,",
  "    'invariantFactors': [3], 'generators': [{'form': forms[1], 'coordinates': [1],",
  "    'exactOrder': 3, 'representativeIdeal': ideal(forms[1])}],",
  "    'completeClassMap': [{'form': form, 'inverseForm': forms[0] if i == 0 else forms[3-i],",
  "    'coordinates': [i], 'representativeIdeal': ideal(form)} for i, form in enumerate(forms)],",
  "    'certificate': {'discriminant': -23, 'reducedForms': forms},",
  "    'proofStatus': 'unconditional-complete', 'runtimeUsesPariOrFixtureAnswers': False}",
  "class Backend:",
  "    def call(self, operation, request):",
  "        if operation == 'capability':",
  "            return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'available',",
  "                'artifactSha256': 'a' * 64, 'imaginaryQuadratic': {'proofMode': 'unconditional',",
  "                'maximumAbsoluteDiscriminant': 10000000,",
  "                'operations': ['imaginary-class-number', 'imaginary-class-group']}}",
  "        assert request['polynomialAscending'] == ['6', '-1', '1']",
  "        return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'complete',",
  "            'operation': operation, 'result': result if operation == 'imaginary-class-group'",
  "            else {'discriminant': -23, 'classNumber': 3, 'proofStatus': 'unconditional-complete'}}",
  "backend = Backend()",
  "setattr(runtime, 'class_group_backend', lambda: backend)",
];

test("explicit Rust quadratic class group retains exact form coordinates and ideals", async () => {
  const answer = await evaluate([
    ...fixture,
    "G = K.class_group(algorithm='rust')",
    "H = K.class_number(algorithm='rust')",
    "[(H, G.order(), tuple(G.invariants()), G.algorithm, G.proof_status),",
    " tuple(G.gen().coordinates()), tuple((G.gen()^2).coordinates()),",
    " G.gen().ideal().norm(), G(G.gen().ideal()).coordinates()]",
  ]);
  assert.equal(
    answer.repr,
    "[(3, 3, (3,), 'rust', 'exact-unconditional'), (1,), (2,), 2, (1,)]",
  );
});

test("automatic imaginary quadratic dispatch uses the unconditional Rust service", async () => {
  const answer = await evaluate([
    ...fixture,
    "G = K.class_group()",
    "[K.class_number(), G.order(), G.invariants(), G.algorithm,",
    " G.proof_status, G(G.gen().ideal()).coordinates()]",
  ]);
  assert.equal(answer.repr, "[3, 3, (3,), 'rust', 'exact-unconditional', (1,)]");
});

test("automatic imaginary quadratic class groups reuse the validated map", async () => {
  const answer = await evaluate([
    ...fixture,
    "class CountingBackend(Backend):",
    "    calls = 0",
    "    def call(self, operation, request):",
    "        if operation == 'imaginary-class-group':",
    "            self.calls += 1",
    "        return super().call(operation, request)",
    "counting = CountingBackend()",
    "setattr(runtime, 'class_group_backend', lambda: counting)",
    "first = K.class_group()",
    "second = K.class_group()",
    "[first is second, counting.calls, second.gen().coordinates()]",
  ]);
  assert.equal(answer.repr, "[True, 1, (1,)]");
});

test("automatic imaginary quadratic dispatch falls back only on a pre-publication decline", async () => {
  const answer = await evaluate([
    ...fixture,
    "class DecliningBackend(Backend):",
    "    def call(self, operation, request):",
    "        if operation == 'capability':",
    "            return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'available',",
    "                'artifactSha256': 'a' * 64}",
    "        raise AssertionError('declined backend must not compute')",
    "setattr(runtime, 'class_group_backend', lambda: DecliningBackend())",
    "G = K.class_group()",
    "[K.class_number(), G.order(), G.proof_status]",
  ]);
  assert.equal(answer.repr, "[3, 3, 'exact-unconditional']");
});

test("automatic imaginary quadratic dispatch honors the service resource cap", async () => {
  const answer = await evaluate([
    ...fixture,
    "class ExhaustedBackend(Backend):",
    "    def call(self, operation, request):",
    "        if operation == 'capability':",
    "            return super().call(operation, request)",
    "        return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'error',",
    "            'category': 'resource-exhausted', 'message': 'reduced-form cap'}",
    "setattr(runtime, 'class_group_backend', lambda: ExhaustedBackend())",
    "G = K.class_group()",
    "[G.order(), G.proof_status]",
  ]);
  assert.equal(answer.repr, "[3, 'exact-unconditional']");
});

test("automatic imaginary quadratic dispatch does not hide a forged published map", async () => {
  const answer = await evaluate([
    ...fixture,
    "result['completeClassMap'][1]['coordinates'] = [0]",
    "try:",
    "    K.class_group()",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    answer = True",
    "answer",
  ]);
  assert.equal(answer.repr, "True");
});

test("Rust quadratic dispatch rejects a forged map without falling back", async () => {
  const answer = await evaluate([
    ...fixture,
    "result['completeClassMap'][1]['coordinates'] = [0]",
    "try:",
    "    K.class_group(algorithm='rust')",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    answer = True",
    "answer",
  ]);
  assert.equal(answer.repr, "True");
});

test("Rust quadratic dispatch rejects a forged generator ideal", async () => {
  const answer = await evaluate([
    ...fixture,
    "result['generators'][0]['representativeIdeal']['norm'] = 1",
    "try:",
    "    K.class_group(algorithm='rust')",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    answer = True",
    "answer",
  ]);
  assert.equal(answer.repr, "True");
});

test("quadratic map validation rejects extra certificate, inverse, and ideal data", async () => {
  const answer = await evaluate([
    ...fixture,
    "def rejects_map():",
    "    try:",
    "        rust_runtime.validate_imaginary_group_result(result, -23)",
    "    except rust_runtime.RustClassGroupPublicationError:",
    "        return True",
    "    return False",
    "original_certificate = result['certificate']['reducedForms'][1]",
    "result['certificate']['reducedForms'][1] = dict(original_certificate, extra=1)",
    "bad_certificate = rejects_map()",
    "result['certificate']['reducedForms'][1] = original_certificate",
    "original_inverse = result['completeClassMap'][1]['inverseForm']",
    "result['completeClassMap'][1]['inverseForm'] = dict(original_inverse, extra=1)",
    "bad_inverse = rejects_map()",
    "result['completeClassMap'][1]['inverseForm'] = original_inverse",
    "result['completeClassMap'][1]['representativeIdeal']['basisColumns'][1][0] += 1",
    "bad_ideal = rejects_map()",
    "[bad_certificate, bad_inverse, bad_ideal]",
  ]);
  assert.equal(answer.repr, "[True, True, True]");
});

test("QuadraticField and its maximal order expose the explicit Rust route", async () => {
  const answer = await evaluate([
    ...fixture,
    "Q = QuadraticField(-23)",
    "O = Q.ring_of_integers()",
    "[(Q.class_number(algorithm='rust'), Q.class_group(algorithm='rust').invariants()),",
    " (O.class_number(algorithm='rust'), O.class_group(algorithm='rust').gen().coordinates())]",
  ]);
  assert.equal(answer.repr, "[(3, (3,)), (3, (1,))]");
});

test("the native service maps public ideals to unconditional coordinates", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 + 23)",
    "G = K.class_group(algorithm='rust')",
    "[G.order(), G.invariants(), G.gen().coordinates(),",
    " G(G.gen().ideal()).coordinates(), K.class_number(algorithm='rust')]",
  ]);
  assert.equal(answer.repr, "[3, (3,), (1,), (1,), 3]");
});

test("the native service publishes a noncyclic group with exact ideal-class coordinates", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 + 21)",
    "G = K.class_group(algorithm='rust')",
    "generators = G.gens()",
    "[G.order(), G.invariants(), G.proof_status,",
    " tuple(sorted(G(generator.ideal()).coordinates() for generator in generators)),",
    " G(generators[0].ideal() * generators[1].ideal()).coordinates(),",
    " len(set(element.coordinates() for element in G))]",
  ]);
  assert.equal(
    answer.repr,
    "[4, (2, 2), 'exact-unconditional', ((0, 1), (1, 0)), (1, 1), 4]",
  );
});

test("the native host advertises the product bound above the old ten-million cap", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 - x + 3750000079)",
    "[K.discriminant(), K.class_number(algorithm='rust'), K.class_number()]",
  ]);
  assert.equal(answer.repr, "[-15000000315, 33768, 33768]");
});
