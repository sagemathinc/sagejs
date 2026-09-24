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
