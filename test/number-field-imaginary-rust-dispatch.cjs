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

test("parsed numeric service arrays remain exact Python lists without copying", async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "wire = runtime.json.parse('{\"packed\":[1,-2,3],\"mixed\":[1,\"x\",null],\"nested\":[[4,5],[6,7]]}')",
    "convert = runtime.reflect.get(runtime.global_object, 'ρσ_plain_json_to_python')",
    "result = runtime.reflect.apply(convert, runtime.undefined, [wire])",
    "[isinstance(result['packed'], list), result['packed'] == [1, -2, 3],",
    " result['mixed'] == [1, 'x', None], result['nested'] == [[4, 5], [6, 7]]]",
  ]);
  assert.equal(answer.repr, "[True, True, True, True]");
});

test("compiled imaginary-map packing preserves signed-64-bit word boundaries", async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "from sagejs.kernels.matrix.imaginary_map import verify_packed_imaginary_map",
    "pack = getattr(verify_packed_imaginary_map, 'packExactInt64Buffer')",
    "numbers = runtime.json.parse('[-9007199254740991,-4294967297,-4294967296,-1,0,1,4294967296,4294967297,9007199254740991]')",
    "expected = [-9007199254740991,-4294967297,-4294967296,-1,0,1,4294967296,4294967297,9007199254740991]",
    "boundary = list(pack(numbers)) == expected",
    "bigints = list(pack([-(1 << 63), (1 << 63) - 1])) == [-(1 << 63), (1 << 63) - 1]",
    "rejections = []",
    "for bad in (True, '1', 1.5, 1 << 63, -(1 << 63) - 1):",
    "    try:",
    "        pack([bad])",
    "        rejections.append(False)",
    "    except TypeError:",
    "        rejections.append(True)",
    "[boundary, bigints, all(rejections)]",
  ]);
  assert.equal(answer.repr, "[True, True, True]");
});

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

test("fixture capability is checked afresh and a later decline is honored", async () => {
  const answer = await evaluate([
    ...fixture,
    "class ChangingBackend(Backend):",
    "    capability_calls = 0",
    "    def call(self, operation, request):",
    "        if operation == 'capability':",
    "            self.capability_calls += 1",
    "            if self.capability_calls > 1:",
    "                return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'error',",
    "                    'category': 'capability-declined'}",
    "        return super().call(operation, request)",
    "changing = ChangingBackend()",
    "setattr(runtime, 'class_group_backend', lambda: changing)",
    "first = rust_runtime._imaginary_backend()[1]['proofMode']",
    "try:",
    "    rust_runtime._imaginary_backend()",
    "    declined = False",
    "except rust_runtime.RustClassGroupCapabilityDecline:",
    "    declined = True",
    "[first, changing.capability_calls, declined]",
  ]);
  assert.equal(answer.repr, "['unconditional', 2, True]");
});

test("automatic imaginary dispatch falls back when the service omits an operation", async () => {
  const answer = await evaluate([
    ...fixture,
    "class PartialBackend(Backend):",
    "    def __init__(self, supported):",
    "        self.supported = supported",
    "    def call(self, operation, request):",
    "        answer = super().call(operation, request)",
    "        if operation == 'capability':",
    "            answer['imaginaryQuadratic']['operations'] = [self.supported]",
    "        return answer",
    "results = []",
    "for supported, missing in [('imaginary-class-number', 'imaginary-class-group'),",
    "                           ('imaginary-class-group', 'imaginary-class-number')]:",
    "    partial = PartialBackend(supported)",
    "    results.append(rust_runtime.rust_imaginary_result(K, operation=missing,",
    "        algorithm='auto', backend=partial) is None)",
    "    try:",
    "        rust_runtime.rust_imaginary_result(K, operation=missing,",
    "            algorithm='rust', backend=partial)",
    "        results.append(False)",
    "    except rust_runtime.RustClassGroupCapabilityDecline:",
    "        results.append(True)",
    "setattr(runtime, 'class_group_backend',",
    "    lambda: PartialBackend('imaginary-class-number'))",
    "fallback_group = NumberField(x^2 + 23, 'b').class_group()",
    "setattr(runtime, 'class_group_backend',",
    "    lambda: PartialBackend('imaginary-class-group'))",
    "fallback_number = NumberField(x^2 + 23, 'c').class_number()",
    "results.extend([fallback_group.order() == 3,",
    "    fallback_group.algorithm == 'quadratic-forms', fallback_number == 3])",
    "results",
  ]);
  assert.equal(answer.repr, "[True, True, True, True, True, True, True]");
});

test("imaginary NumberField group dispatch reuses its exact quadratic backend", async () => {
  const answer = await evaluate([
    ...fixture,
    "L = NumberField(2*x^2 - 2*x + 12, 'b')",
    "G = L.class_group(algorithm='rust')",
    "order_not_forced = runtime.reflect.get(L, '_maximal_order_cache') is runtime.undefined",
    "backend_reused = L._quadratic_backend_cache is not runtime.undefined",
    "fast_discriminant = L.discriminant()",
    "order_still_not_forced = runtime.reflect.get(L, '_maximal_order_cache') is runtime.undefined",
    "[order_not_forced, backend_reused, G.order(), G.invariants(),",
    " G.gen().ideal().norm(), order_still_not_forced,",
    " fast_discriminant == L.maximal_order().discriminant()]",
  ]);
  assert.equal(answer.repr, "[True, True, 3, (3,), 2, True, True]");
});

test("fresh imaginary NumberField scalars avoid both general and quadratic field setup", async () => {
  const answer = await evaluate([
    ...fixture,
    "L = NumberField(2*x^2 - 2*x + 12, 'b')",
    "automatic = L.class_number()",
    "order_not_forced = runtime.reflect.get(L, '_maximal_order_cache') is runtime.undefined",
    "backend_not_constructed = runtime.reflect.get(L, '_quadratic_backend_cache') is runtime.undefined",
    "explicit = L.class_number(algorithm='rust')",
    "order_still_not_forced = runtime.reflect.get(L, '_maximal_order_cache') is runtime.undefined",
    "[automatic, explicit, order_not_forced, backend_not_constructed,",
    " order_still_not_forced, L.discriminant(),",
    " L.discriminant() == L.maximal_order().discriminant()]",
  ]);
  assert.equal(answer.repr, "[3, 3, True, True, True, -23, True]");
});

test("rational nonmonic scalar discriminant agrees with the independent order", async () => {
  const answer = await evaluate([
    ...fixture,
    "class Backend68(Backend):",
    "    def call(self, operation, request):",
    "        if operation == 'capability':",
    "            return super().call(operation, request)",
    "        assert operation == 'imaginary-class-number'",
    "        assert request['polynomialAscending'] == ['17', '0', '1']",
    "        return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'complete',",
    "            'operation': operation, 'result': {'discriminant': -68,",
    "            'classNumber': 4, 'proofStatus': 'unconditional-complete'}}",
    "backend = Backend68()",
    "L = NumberField(QQ(1,2)*x^2 + QQ(1,3)*x + 1, 'b')",
    "h = L.class_number(algorithm='rust')",
    "backend_not_constructed = runtime.reflect.get(L, '_quadratic_backend_cache') is runtime.undefined",
    "order_not_forced = runtime.reflect.get(L, '_maximal_order_cache') is runtime.undefined",
    "[h, L.discriminant(), backend_not_constructed, order_not_forced,",
    " L.discriminant() == L.maximal_order().discriminant()]",
  ]);
  assert.equal(answer.repr, "[4, -68, True, True, True]");
});

test("scalar-first dispatch retains the complete exact ideal-class map", async () => {
  const answer = await evaluate([
    ...fixture,
    "L = NumberField(2*x^2 - 2*x + 12, 'b')",
    "h = L.class_number()",
    "G = L.class_group()",
    "[h, G.order(), G.invariants(), G(G.gen().ideal()).coordinates(),",
    " L.discriminant(), L._quadratic_backend_cache is not runtime.undefined]",
  ]);
  assert.equal(answer.repr, "[3, 3, (3,), (1,), -23, True]");
});

test("scalar discriminants with square factors match certified maximal orders", async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "R.<x> = QQ[]",
    "matches = []",
    "for d in (-3, -4, -7, -8, -12, -18, -20, -28, -45, -75):",
    "    L = NumberField(x^2 - d, 'a')",
    "    request = L._imaginary_rust_discriminant_request_field('rust', {})",
    "    no_backend = runtime.reflect.get(L, '_quadratic_backend_cache') is runtime.undefined",
    "    no_order = runtime.reflect.get(L, '_maximal_order_cache') is runtime.undefined",
    "    matches.append(no_backend and no_order and",
    "        request.discriminant() == L.maximal_order().discriminant())",
    "[len(matches), all(matches)]",
  ]);
  assert.equal(answer.repr, "[10, True]");
});

test("cached quadratic discriminant agrees with the general certified order", async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "R.<x> = QQ[]",
    "K = NumberField(QQ(1, 2)*x^2 + QQ(1, 3)*x + 1, 'a')",
    "K._quadratic_backend()",
    "fast = K.discriminant()",
    "order_not_forced = runtime.reflect.get(K, '_maximal_order_cache') is runtime.undefined",
    "[fast, order_not_forced, fast == K.maximal_order().discriminant()]",
  ]);
  assert.equal(answer.repr, "[-68, True, True]");
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

test("explicit quadratic-forms bypasses Rust even after a Rust answer is cached", async () => {
  const answer = await evaluate([
    ...fixture,
    "class CountingBackend(Backend):",
    "    group_calls = 0",
    "    scalar_calls = 0",
    "    def call(self, operation, request):",
    "        if operation == 'imaginary-class-group':",
    "            self.group_calls += 1",
    "        if operation == 'imaginary-class-number':",
    "            self.scalar_calls += 1",
    "        return super().call(operation, request)",
    "counting = CountingBackend()",
    "setattr(runtime, 'class_group_backend', lambda: counting)",
    "K.class_group(algorithm='rust')",
    "K.class_number(algorithm='rust')",
    "Q = QuadraticField(-23)",
    "Q.class_group()",
    "Q.class_number(algorithm='rust')",
    "before = (counting.group_calls, counting.scalar_calls)",
    "G = K.class_group(algorithm='quadratic-forms')",
    "h = K.class_number(algorithm='quadratic-forms')",
    "direct = Q.class_group(algorithm='quadratic-forms')",
    "direct_h = Q.class_number(algorithm='quadratic-forms')",
    "[before == (counting.group_calls, counting.scalar_calls),",
    " G.algorithm, G.invariants(), G.gen().ideal().norm(), h,",
    " direct.algorithm, direct.invariants(), direct_h]",
  ]);
  assert.equal(
    answer.repr,
    "[True, 'quadratic-forms', (3,), 2, 3, 'quadratic-forms', (3,), 3]",
  );
});

test("quadratic-forms reports noncyclic invariant factors in divisibility order", async () => {
  const answer = await evaluate([
    "R.<x> = QQ[]",
    "results = []",
    "for d, expected in [(-231, (2, 6)), (-15015, (2, 2, 2, 12))]:",
    "    for K in (QuadraticField(d), NumberField(x^2 - d, 'a')):",
    "        G = K.class_group(algorithm='quadratic-forms')",
    "        factors = G.invariants()",
    "        orders = tuple(g.order() for g in G.gens())",
    "        results.append((factors, orders, factors == expected,",
    "            all(factors[i+1] % factors[i] == 0 for i in range(len(factors)-1))))",
    "results",
  ]);
  assert.equal(
    answer.repr,
    "[((2, 6), (2, 6), True, True), ((2, 6), (2, 6), True, True), " +
      "((2, 2, 2, 12), (2, 2, 2, 12), True, True), " +
      "((2, 2, 2, 12), (2, 2, 2, 12), True, True)]",
  );
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

test("automatic imaginary quadratic scalars reuse unconditional results", async () => {
  const answer = await evaluate([
    ...fixture,
    "class CountingBackend(Backend):",
    "    group_calls = 0",
    "    scalar_calls = 0",
    "    def call(self, operation, request):",
    "        if operation == 'imaginary-class-group':",
    "            self.group_calls += 1",
    "        if operation == 'imaginary-class-number':",
    "            self.scalar_calls += 1",
    "        return super().call(operation, request)",
    "counting = CountingBackend()",
    "setattr(runtime, 'class_group_backend', lambda: counting)",
    "first = K.class_number()",
    "second = K.class_number()",
    "group = K.class_group()",
    "third = K.class_number()",
    "fresh = K.class_number(algorithm='rust')",
    "Q = QuadraticField(-23)",
    "direct_first = Q.class_group()",
    "direct_second = Q.class_group()",
    "direct_scalar = Q.class_number()",
    "direct_fresh = Q.class_number(algorithm='rust')",
    "[(first, second, third, fresh, counting.scalar_calls, counting.group_calls),",
    " (direct_first is direct_second, direct_scalar, direct_fresh)]",
  ]);
  assert.equal(answer.repr, "[(3, 3, 3, 3, 3, 2), (True, 3, 3)]");
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
    "    group_calls = 0",
    "    def call(self, operation, request):",
    "        if operation == 'capability':",
    "            return super().call(operation, request)",
    "        if operation == 'imaginary-class-group':",
    "            self.group_calls += 1",
    "        return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'error',",
    "            'category': 'resource-exhausted', 'message': 'reduced-form cap'}",
    "backend = ExhaustedBackend()",
    "setattr(runtime, 'class_group_backend', lambda: backend)",
    "G = K.class_group()",
    "[G.order(), G.proof_status, backend.group_calls]",
  ]);
  assert.equal(answer.repr, "[3, 'exact-unconditional', 1]");
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

test("packed resident map validation retains exact forms, ideals, and rejection", async () => {
  const answer = await evaluate([
    ...fixture,
    "packed = dict(result)",
    "entries = packed.pop('completeClassMap')",
    "flat = []",
    "for entry in entries:",
    "    form, inverse, ideal_data = entry['form'], entry['inverseForm'], entry['representativeIdeal']",
    "    flat.extend([form['a'], form['b'], form['c'], inverse['a'], inverse['b'], inverse['c'],",
    "        ideal_data['norm'], *ideal_data['basisColumns'][0],",
    "        *ideal_data['basisColumns'][1], *entry['coordinates']])",
    "packed['completeClassMapPacked'] = flat",
    "packed['completeClassMapLength'] = len(entries)",
    "packed['certificate'] = dict(result['certificate'])",
    "packed['certificate']['reducedFormsPacked'] = [value for form in forms for value in (form['a'], form['b'], form['c'])]",
    "del packed['certificate']['reducedForms']",
    "forms1, coordinates1, generators1 = rust_runtime.validate_imaginary_group_result(result, -23)",
    "forms2, coordinates2, generators2 = rust_runtime.validate_imaginary_group_result(packed, -23)",
    "compact_forms, compact_coordinates, compact_generators = rust_runtime.validate_imaginary_group_result(packed, -23, compact=True)",
    "compact_exact = (len(compact_forms) == 3 and list(compact_forms) == forms1",
    "    and len(compact_coordinates) == 3 and compact_coordinates.get('2,-1,3') == coordinates1['2,-1,3']",
    "    and compact_coordinates.get('02,-1,3') is None and '2,-1,3' in compact_coordinates",
    "    and '2,0,3' not in compact_coordinates and compact_generators == generators1)",
    "try:",
    "    packed['completeClassMapPacked'][23] = 99",
    "except TypeError:",
    "    compact_immutable = True",
    "else:",
    "    compact_immutable = False",
    "packed['completeClassMapPacked'] = list(packed['completeClassMapPacked'])",
    "packed['completeClassMapPacked'][23] = 99",
    "compact_immutable = compact_immutable and compact_coordinates.get('2,-1,3') == coordinates1['2,-1,3']",
    "packed['completeClassMapPacked'][23] = 1",
    "packed['certificate']['reducedFormsPacked'][3] = True",
    "try:",
    "    rust_runtime.validate_imaginary_group_result(packed, -23)",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    rejects_certificate = True",
    "packed['certificate']['reducedFormsPacked'][3] = 2",
    "packed['completeClassMapPacked'][4] = 0",
    "try:",
    "    rust_runtime.validate_imaginary_group_result(packed, -23)",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    rejects_inverse = True",
    "packed['completeClassMapPacked'][4] = 1",
    "malformed_rows = []",
    "for malformed in (True, '1', float(1), 1 << 63):",
    "    packed['completeClassMapPacked'][4] = malformed",
    "    try:",
    "        rust_runtime.validate_imaginary_group_result(packed, -23)",
    "        malformed_rows.append(False)",
    "    except rust_runtime.RustClassGroupPublicationError:",
    "        malformed_rows.append(True)",
    "packed['completeClassMapPacked'][4] = 1",
    "result = packed",
    "group = K.class_group(algorithm='rust')",
    "lazy_forms = not hasattr(group._group, '_forms')",
    "all_forms = len(list(group)) == 3 and hasattr(group._group, '_forms')",
    "packed_before_access = 'reducedFormsPacked' in group._group._certificate",
    "certificate = group.certificate",
    "ordinary_certificate = len(certificate['reducedForms']) == 3 and certificate['reducedForms'][1]['a'] == 2 and 'reducedFormsPacked' not in certificate",
    "[forms1 == forms2, coordinates1 == coordinates2, generators1 == generators2, compact_exact, compact_immutable, lazy_forms, all_forms, rejects_certificate, rejects_inverse, all(malformed_rows), packed_before_access, ordinary_certificate]",
  ]);
  assert.equal(answer.repr, "[True, True, True, True, True, True, True, True, True, True, True, True]");
});

test("core resident map preserves exact ideals with native and Python verification", async () => {
  const answer = await evaluate([
    ...fixture,
    "core = dict(result)",
    "entries = core.pop('completeClassMap')",
    "core['completeClassMapCorePacked'] = [value for entry in entries",
    "    for value in (entry['form']['a'], entry['form']['b'], *entry['coordinates'])]",
    "core['completeClassMapLength'] = len(entries)",
    "core['certificate'] = {'discriminant': -23,",
    "    'reducedFormsPacked': [value for form in forms for value in (form['a'], form['b'], form['c'])]}",
    "ordinary_forms, ordinary_coordinates, generators = rust_runtime.validate_imaginary_group_result(result, -23)",
    "native_forms, native_coordinates, native_generators = rust_runtime.validate_imaginary_group_result(core, -23, compact=True)",
    "native_ok = list(native_forms) == ordinary_forms and len(native_coordinates) == 3",
    "native_ok = native_ok and native_coordinates.get('2,-1,3') == ordinary_coordinates['2,-1,3']",
    "native_ok = native_ok and native_coordinates.get('02,-1,3') is None and native_generators == generators",
    "original_verifier = rust_runtime.validate_packed_imaginary_map",
    "rust_runtime.validate_packed_imaginary_map = lambda *args: None",
    "try:",
    "    fallback_forms, fallback_coordinates, fallback_generators = rust_runtime.validate_imaginary_group_result(core, -23)",
    "finally:",
    "    rust_runtime.validate_packed_imaginary_map = original_verifier",
    "fallback_ok = fallback_forms == ordinary_forms and fallback_coordinates == ordinary_coordinates and fallback_generators == generators",
    "try:",
    "    core['completeClassMapCorePacked'][5] = 0",
    "except TypeError:",
    "    core_immutable = True",
    "else:",
    "    core_immutable = False",
    "core['completeClassMapCorePacked'] = list(core['completeClassMapCorePacked'])",
    "core['completeClassMapCorePacked'][5] = 0",
    "try:",
    "    rust_runtime.validate_imaginary_group_result(core, -23)",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    rejects_duplicate = True",
    "core['completeClassMapCorePacked'][5] = 1",
    "result = core",
    "group = K.class_group(algorithm='rust')",
    "ideal_ok = group(group.gen().ideal()).coordinates() == (1,) and group.order() == 3",
    "[native_ok, fallback_ok, core_immutable, rejects_duplicate, ideal_ok]",
  ]);
  assert.equal(answer.repr, "[True, True, True, True, True]");
});

test("derived core certificate retains exact maps and rejects forged rows", async () => {
  const answer = await evaluate([
    ...fixture,
    "core = dict(result)",
    "entries = core.pop('completeClassMap')",
    "core['completeClassMapCorePacked'] = [value for entry in entries",
    "    for value in (entry['form']['a'], entry['form']['b'], *entry['coordinates'])]",
    "core['completeClassMapLength'] = len(entries)",
    "core['certificate'] = {'discriminant': -23, 'reducedFormsFromCoreMap': True}",
    "ordinary_forms, ordinary_coordinates, generators = rust_runtime.validate_imaginary_group_result(result, -23)",
    "derived_forms, derived_coordinates, derived_generators = rust_runtime.validate_imaginary_group_result(core, -23, compact=True)",
    "same = list(derived_forms) == ordinary_forms and derived_coordinates.get('2,-1,3') == ordinary_coordinates['2,-1,3'] and derived_generators == generators",
    "core['certificate']['reducedFormsFromCoreMap'] = 1",
    "try:",
    "    rust_runtime.validate_imaginary_group_result(core, -23)",
    "    rejects_marker = False",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    rejects_marker = True",
    "core['certificate']['reducedFormsFromCoreMap'] = True",
    "core['completeClassMapCorePacked'] = list(core['completeClassMapCorePacked'])",
    "core['completeClassMapCorePacked'][4] = 0",
    "try:",
    "    rust_runtime.validate_imaginary_group_result(core, -23)",
    "    rejects_row = False",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    rejects_row = True",
    "core['completeClassMapCorePacked'][4] = -1",
    "result = core",
    "group = K.class_group(algorithm='rust')",
    "certificate = group.certificate",
    "public_certificate = len(certificate['reducedForms']) == 3 and certificate['reducedForms'][1] == {'a': 2, 'b': -1, 'c': 3} and 'reducedFormsFromCoreMap' not in certificate",
    "[same, rejects_marker, rejects_row, public_certificate, group(group.gen().ideal()).coordinates()]",
  ]);
  assert.equal(answer.repr, "[True, True, True, True, (1,)]");
});

test("advertised compact transport is requested without losing exact ideal maps", async () => {
  const answer = await evaluate([
    ...fixture,
    "core = dict(result)",
    "entries = core.pop('completeClassMap')",
    "core['completeClassMapCorePacked'] = [value for entry in entries",
    "    for value in (entry['form']['a'], entry['form']['b'], *entry['coordinates'])]",
    "core['completeClassMapLength'] = len(entries)",
    "core['certificate'] = {'discriminant': -23,",
    "    'reducedFormsPacked': [value for form in forms for value in (form['a'], form['b'], form['c'])]}",
    "class CompactBackend(Backend):",
    "    requested_transport = None",
    "    def call(self, operation, request):",
    "        if operation == 'capability':",
    "            answer = super().call(operation, request)",
    "            answer['imaginaryQuadratic']['transports'] = ['core-v2']",
    "            return answer",
    "        if operation == 'imaginary-class-group':",
    "            self.requested_transport = request.get('transport')",
    "            assert self.requested_transport == 'core-v2'",
    "            return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA, 'outcome': 'complete',",
    "                'operation': operation, 'result': core}",
    "        return super().call(operation, request)",
    "compact_backend = CompactBackend()",
    "setattr(runtime, 'class_group_backend', lambda: compact_backend)",
    "G = K.class_group(algorithm='rust')",
    "[compact_backend.requested_transport, G.order(), G(G.gen().ideal()).coordinates()]",
  ]);
  assert.equal(answer.repr, "['core-v2', 3, (1,)]");
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

test("the native host uses a verified small presentation and materializes certificates on demand", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 + 23)",
    "result = rust_runtime.rust_imaginary_result(K, operation='imaginary-class-group', algorithm='rust')",
    "certificate = result['certificate']",
    "G = K.class_group(algorithm='rust')",
    "[certificate.get('reducedFormsFromExactCount') is True,",
    " 'completeClassMapCorePacked' not in result,",
    " len(G.certificate['reducedForms']) == G.order(),",
    " G(G.gen().ideal()).coordinates()]",
  ]);
  assert.equal(answer.repr, "[True, True, True, (1,)]");
});

test("the resident imaginary service checks capability without the generic JSON adapter", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "backend = runtime.class_group_backend()",
    "original_call = backend.call",
    "def reject_generic_capability(operation, request):",
    "    if operation == 'capability':",
    "        raise AssertionError('resident capability used the generic JSON adapter')",
    "    return original_call(operation, request)",
    "backend.call = reject_generic_capability",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 + 23)",
    "[K.class_number(algorithm='rust'), K.class_group(algorithm='rust').invariants()]",
  ]);
  assert.equal(answer.repr, "[3, (3,)]");
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

test("bounded higher-rank summaries defer but retain exact ideal-class maps", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "R.<x> = QQ[]",
    "answers = []",
    "for polynomial, expected in ((x^2 + 105, (2, 2, 2)), (x^2 - x + 3754, (2, 2, 2, 12))):",
    "    K = NumberField(polynomial, 'a')",
    "    G = K.class_group(algorithm='rust')",
    "    deferred = runtime.reflect.get(K, '_quadratic_backend_cache') is runtime.undefined",
    "    backend_group = G._group._realize()",
    "    I, J = [generator.ideal() for generator in G.gens()[:2]]",
    "    coordinates = G(I*J).coordinates()",
    "    answers.append((deferred, G.invariants() == expected,",
    "        len(backend_group._coordinate_map.cache) >= len(expected) + 1,",
    "        coordinates == (1, 1) + (0,) * (len(expected) - 2),",
    "        len(G.certificate['reducedForms']) == G.order(),",
    "        len(set(element.coordinates() for element in G)) == G.order()))",
    "answers",
  ]);
  assert.equal(answer.repr, "[(True, True, True, True, True, True), (True, True, True, True, True, True)]");
});

test("a verified imaginary summary defers quadratic backend until ideal access", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 + 23)",
    "G = K.class_group(algorithm='rust')",
    "summary = [G.order(), G.invariants(), G.proof_status, K.discriminant()]",
    "before = [runtime.reflect.get(K, '_quadratic_backend_cache') is runtime.undefined,",
    "    runtime.reflect.get(K, '_maximal_order_cache') is runtime.undefined]",
    "I = G.gen().ideal()",
    "after = runtime.reflect.get(K, '_quadratic_backend_cache') is not runtime.undefined",
    "[summary, before, after, I.norm(), G(I).coordinates()]",
  ]);
  assert.equal(answer.repr,
    "[[3, (3,), 'exact-unconditional', -23], [True, True], True, 2, (1,)]");
});

test("the native service keeps a large public group compact until its map is requested", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 - x + 3750000079)",
    "G = K.class_group(algorithm='rust')",
    "deferred = runtime.reflect.get(K, '_quadratic_backend_cache') is runtime.undefined",
    "backend_group = G._group._realize()",
    "before = len(backend_group._coordinate_map.cache)",
    "I, J = [generator.ideal() for generator in G.gens()]",
    "product = G(I*J).coordinates()",
    "after = len(backend_group._coordinate_map.cache)",
    "full = len(G.certificate['reducedForms'])",
    "[deferred, G.order(), G.invariants(), before, after, product, full,",
    " len(backend_group._coordinate_map)]",
  ]);
  assert.equal(answer.repr, "[True, 33768, (2, 16884), 3, 4, (1, 1), 33768, 33768]");
});

test("midrange cyclic summaries retain exact on-demand ideal-class coordinates", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "import sagejs.runtime as runtime",
    "R.<x> = QQ[]",
    "results = []",
    "for constant, expected in ((2499998, 1715), (2043354, 4378)):",
    "    K = NumberField(x^2 - x + constant, 'a')",
    "    G = K.class_group(algorithm='rust')",
    "    deferred = runtime.reflect.get(K, '_quadratic_backend_cache') is runtime.undefined",
    "    I = G.gen().ideal()",
    "    square = G(I*I).coordinates()",
    "    complete = len(G.certificate['reducedForms'])",
    "    results.append((deferred, G.order(), G.invariants(), square, complete == expected))",
    "results",
  ]);
  assert.equal(answer.repr,
    "[(True, 1715, (1715,), (2,), True), (True, 4378, (4378,), (2,), True)]");
});

test("a midrange noncyclic field retains the eager exact-map fallback", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 - x + 25000067)",
    "G = K.class_group(algorithm='rust')",
    "I, J = [generator.ideal() for generator in G.gens()]",
    "[G.order(), G.invariants(), G(I*J).coordinates(),",
    " len(G.certificate['reducedForms'])]",
  ]);
  assert.equal(answer.repr, "[1413, (3, 471), (1, 1), 1413]");
});

test("a forged on-demand Rust coordinate fails independent form composition", {
  skip: !process.env.SAGEJS_CLASS_GROUP_SERVICE,
}, async () => {
  const answer = await evaluate([
    "from sagejs.number_fields import rust_class_group_runtime as rust_runtime",
    "R.<x> = QQ[]",
    "K.<a> = NumberField(x^2 + 23)",
    "G = K.class_group(algorithm='rust')",
    "coordinate_map = G._group._coordinate_map",
    "coordinate_map.cache.pop('2,1,3', None)",
    "class ForgedBackend:",
    "    def call(self, operation, request):",
    "        form = {'a': 2, 'b': 1, 'c': 3}",
    "        return {'schema': rust_runtime.HOST_RESPONSE_SCHEMA,",
    "            'outcome': 'complete', 'operation': operation,",
    "            'presentation': coordinate_map.presentation, 'form': form,",
    "            'coordinates': [0], 'representativeIdeal':",
    "            {'norm': 2, 'basisColumns': [[2, 0],",
    "             [(int(coordinate_map.polynomial[1])-1)//2, 1]]}}",
    "coordinate_map.backend = ForgedBackend()",
    "coordinate_map.use_resident_host = False",
    "try:",
    "    coordinate_map.get('2,1,3')",
    "    rejected = False",
    "except rust_runtime.RustClassGroupPublicationError:",
    "    rejected = True",
    "rejected",
  ]);
  assert.equal(answer.repr, "True");
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
