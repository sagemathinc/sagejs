"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

const root = join(__dirname, "..");

test("the public maximal-order path is lazy, certified, and cache-safe", async () => {
  const source = readFileSync(
    join(root, "src", "baselib", "number_fields.py"),
    "utf8",
  );
  const method = source.slice(
    source.indexOf("    def maximal_order("),
    source.indexOf("    ring_of_integers = maximal_order"),
  );
  assert.doesNotMatch(method, /sage\.factor/);

  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "K.<a> = NumberField(x^3 + x^2 - 2*x + 8)",
        "local = K.maximal_order([2])",
        "global_order = K.maximal_order()",
        "bad = dict(global_order.maximality_certificate())",
        "bad['order_discriminant'] = bad['order_discriminant'] + 1",
        "from sagejs.number_fields.maximal_order_certification import check_certificate",
        "from sagejs.number_fields.maximal_order_certification import check_discriminant_coprime_component_witness",
        "bad_check = check_certificate(bad)",
        "composite = [entry for entry in global_order.maximality_certificate()['component_certificate']['components'] if entry['state'] != 'proven-prime']",
        "coprime_checker_regression = True if len(composite) == 0 else check_discriminant_coprime_component_witness(global_order.discriminant(), composite[0], global_order.maximality_certificate()['local_witnesses'][0])",
        "assumption_error = False",
        "try:",
        "    K.maximal_order(2, assume_maximal=True)",
        "except ValueError:",
        "    assumption_error = True",
        "[local.is_maximal(), global_order.is_maximal(), global_order is K.ring_of_integers(), local is global_order, global_order.maximality_certificate()['certified'], bad_check['certified'], assumption_error, coprime_checker_regression]",
      ].join("\n"),
    );
    assert.equal(result.repr, "[False, True, True, False, True, False, True, True]");
  } finally {
    await session.close();
  }
});

test("T(8,2^32) avoids full factorization through the public API", async () => {
  const session = await createSage();
  try {
    const started = performance.now();
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "coefficients = [463168356949264781694283940034751631413079938662562256157830336031652518559742, -68719476736, -737869762948382064640, -2535301200456458802993406410752, -1361129467683753853853498429727072845824, 0, 0, 0, 1]",
        "K.<a> = NumberField(R(coefficients))",
        "O = K.maximal_order(trace=True)",
        "certificate = O.maximality_certificate()",
        "from sagejs.number_fields.maximal_order_certification import check_discriminant_coprime_component_witness",
        "component = [entry for entry in certificate['component_certificate']['components'] if entry['state'] != 'proven-prime'][0]",
        "witness = [entry for entry in certificate['local_witnesses'] if 'component_value' in entry][0]",
        "corrupt_witness = dict(witness)",
        "corrupt_proof = dict(witness['proof'])",
        "corrupt_proof['support'] = corrupt_proof['support'] * 7",
        "corrupt_witness['proof'] = corrupt_proof",
        "theorem_checks = [check_discriminant_coprime_component_witness(O.discriminant(), component, witness), check_discriminant_coprime_component_witness(O.discriminant(), component, corrupt_witness), check_discriminant_coprime_component_witness(component['base'], component, witness)]",
        "events = O.maximal_order_trace()['events']",
        "[O.discriminant(), O.is_maximal(), len(O.basis()), certificate['index'], [event['stage'] for event in events], events[2]['details']['merged_composite_lattice'], theorem_checks]",
      ].join("\n"),
    );
    const elapsed = performance.now() - started;
    assert.match(
      result.repr,
      /^\[-2147483648, True, 8, 3179557053031851899185109992371205233166102563054994659612778573877352351101815706666153685320008306418583370978265859646929314209130671444551656380504174391180190567870975750525148778143146969696718736142491176896345575184876739493887, /,
    );
    assert.match(result.repr, /'composite-local-order'/);
    assert.match(result.repr, /'native-local-orders'/);
    assert.match(result.repr, /'global-certification'/);
    assert.match(result.repr, /, True, \[True, False, False\]\]$/);
    assert.ok(elapsed < 20_000, `catastrophic public case took ${elapsed}ms`);
  } finally {
    await session.close();
  }
});

test("forced local algorithms remain differential and certified", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "R.<x> = QQ[]",
        "summaries = []",
        "for algorithm in ['round2', 'polygon', 'round4', 'native']:",
        "    K.<a> = NumberField(x^3 + x^2 - 2*x + 8)",
        "    O = K.maximal_order(algorithm=algorithm, trace=True)",
        "    summaries.append((algorithm, O.basis(), O.discriminant(), O.is_maximal(), O.maximal_order_trace()['events'][1]['stage']))",
        "K.<a> = NumberField(x^2 - 8)",
        "O = K.maximal_order(algorithm='om-maxmin', trace=True)",
        "summaries.append(('om-maxmin', O.basis(), O.discriminant(), O.is_maximal(), O.maximal_order_trace()['events'][1]['details']['used_algorithm']))",
        "summaries",
      ].join("\n"),
    );
    assert.match(result.repr, /\('round2'.*\[1, 1\/2\*a\^2 \+ 1\/2\*a, a\^2\], -503, True/);
    assert.match(result.repr, /\('polygon'.*'selected-local-order'/);
    assert.match(result.repr, /\('round4'.*'selected-local-order'/);
    assert.match(result.repr, /\('native'.*'native-local-orders'/);
    assert.match(result.repr, /\('om-maxmin', \[1, 1\/2\*a\], 8, True, 'om-maxmin'\)/);
  } finally {
    await session.close();
  }
});

test("the completeness fallback refines only its unresolved component", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.discriminant_components import decompose_discriminant, check_decomposition_certificate",
        "from sagejs.number_fields.maximal_order_contracts import MaximalOrderTrace",
        "from sagejs.number_fields.maximal_order_engine import _replace_composite_by_certified_primes",
        "decomposition = decompose_discriminant(None, 2 * 11 * 35^3, small_prime_bound=2, rho_steps=0)",
        "record = [component for component in decomposition['components'] if component['state'] == 'composite'][0]",
        "trace = MaximalOrderTrace(True)",
        "_replace_composite_by_certified_primes(decomposition, record, trace)",
        "[(component['base'], component['exponent'], component['state']) for component in decomposition['components']], check_decomposition_certificate(decomposition, require_proven=True), trace.to_dict()['events'][0]['stage']",
      ].join("\n"),
    );
    assert.equal(
      result.repr,
      "([(2, 1, 'proven-prime'), (11, 1, 'proven-prime'), (5, 3, 'proven-prime'), (7, 3, 'proven-prime')], True, 'component-factorization-fallback')",
    );
  } finally {
    await session.close();
  }
});

test("the Hecke degree-90 overlapping split selects the proper support side", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      [
        "from sagejs.number_fields.buchmann_lenstra import BuchmannLenstraResult, check_buchmann_lenstra_result",
        "from sagejs.number_fields.discriminant_components import check_decomposition_certificate, integer_gcd",
        "from sagejs.number_fields.maximal_order_contracts import ComponentSplit, DiscriminantComponent, MaximalOrderTrace",
        "from sagejs.number_fields.maximal_order_engine import _replace_component_by_certified_split",
        "support = int('28375108932411734495304601228067800245485592196890940187801716657219585656835089965133181588155080740947480506001981898084965705935131049805539942397526104316057755540125253448659497227913616528607006608275968017109416161011102945573223152501463260399044323436928847993151317153557005283972664233104841283074493334400552621639617588639868929384162815109857840642830414871514198525036790939585431490942393')",
        "left = int('10574465728767666555228536610641579811842533373963078463092262523462026040042726254549120147514658199529426158463949464155201520009842525774780188874149286777313136600004715522309334162609360622222282655325156778051636049346734541335743924317847378865178529253771239871620448069997665347291200935358619761960650592447513629973610553570641046577095968492445794897827916136335811143203166081487146713')",
        "right = 2683361",
        "component_value = support^10",
        "record = {'value': component_value, 'state': 'composite', 'base': support, 'exponent': 10, 'evidence': {'base': 2, 'kind': 'miller-rabin-witness'}}",
        "decomposition = {'version': 1, 'original': component_value, 'components': [dict(record)], 'events': [], 'certified': False}",
        "component = DiscriminantComponent(support, 'composite')",
        "split = ComponentSplit(support, left, right, {'coefficient': left})",
        "split_result = BuchmannLenstraResult('split', component, split=split, evidence={'stage': 'composite-dedekind', 'zero_divisor': True})",
        "trace = MaximalOrderTrace(True)",
        "children = _replace_component_by_certified_split(decomposition, record, split_result, trace)",
        "event = trace.to_dict()['events'][0]",
        "exact_partition = len(children) == 2 and children[0]['value'] * children[1]['value'] == component_value and integer_gcd(children[0]['value'], children[1]['value']) == 1",
        "right_branch = [child for child in children if child['base'] == right]",
        "source_rejected = False",
        "try:",
        "    bad_source = BuchmannLenstraResult('split', component, split=ComponentSplit(6, 2, 3))",
        "    _replace_component_by_certified_split({'version': 1, 'original': component_value, 'components': [dict(record)], 'events': [], 'certified': False}, record, bad_source, MaximalOrderTrace(False))",
        "except ArithmeticError:",
        "    source_rejected = True",
        "invalid_decomposition_rejected = False",
        "try:",
        "    bad_decomposition = {'version': 1, 'original': component_value + 1, 'components': [dict(record)], 'events': [], 'certified': False}",
        "    _replace_component_by_certified_split(bad_decomposition, record, split_result, MaximalOrderTrace(False))",
        "except ValueError:",
        "    invalid_decomposition_rejected = True",
        "inseparable_rejected = False",
        "try:",
        "    power_record = {'value': 49^2, 'state': 'composite', 'base': 49, 'exponent': 2, 'evidence': {'kind': 'factor', 'factor': 7}}",
        "    power_decomposition = {'version': 1, 'original': 49^2, 'components': [dict(power_record)], 'events': [], 'certified': False}",
        "    power_result = BuchmannLenstraResult('split', DiscriminantComponent(49, 'composite'), split=ComponentSplit(49, 7, 7))",
        "    _replace_component_by_certified_split(power_decomposition, power_record, power_result, MaximalOrderTrace(False))",
        "except ArithmeticError:",
        "    inseparable_rejected = True",
        "[left % right == 0, exact_partition, check_decomposition_certificate(decomposition, require_proven=False), len(right_branch) == 1 and right_branch[0]['exponent'] == 30, event['details']['selected_factor_side'], source_rejected, invalid_decomposition_rejected, inseparable_rejected]",
      ].join("\n"),
    );
    assert.equal(result.repr, "[True, True, True, True, 'right', True, True, True]");
  } finally {
    await session.close();
  }
});
