"use strict";

const readline = require("node:readline");
const { resolve } = require("node:path");

const root = process.env.SAGEJS_ROOT || resolve(__dirname, "../../../..");
const { createSage } = require(resolve(root, "dist/tools/kernel.js"));

function sageSource(request) {
  const coefficients = request.coefficients.map((entry) => String(entry)).join(",");
  const localPrimes = (request.local_primes || [])
    .map((entry) => JSON.stringify(String(entry)))
    .join(",");
  const boundary = JSON.stringify(request.boundary);
  const directEvidence = JSON.stringify(request.direct_evidence || null);
  const nativeKernelEligible = request.native_kernel_eligible === true ? "True" : "False";
  const warmups = Math.max(0, Number(request.warmups) || 0);
  const samples = Math.max(1, Number(request.samples) || 1);
  return [
    "import json",
    "import time",
    "import sagejs.runtime as runtime",
    "import sagejs.number_fields.maximal_order_engine as engine",
    "import sagejs.number_fields.composite_field_analysis as composite_analysis",
    "from sagejs.number_fields.order_resource import native_order_from_polynomial",
    `coefficients = [int(value) for value in [${coefficients}]]`,
    `local_primes = [int(value) for value in [${localPrimes}]]`,
    `boundary = ${boundary}`,
    `direct_evidence = json.loads(${JSON.stringify(directEvidence)})`,
    `native_kernel_eligible = ${nativeKernelEligible}`,
    "R = PolynomialRing(QQ, 'x')",
    "f = R(coefficients)",
    "irreducibility_started = time.perf_counter()",
    "irreducible = bool(f.is_irreducible())",
    "irreducibility_ms = (time.perf_counter() - irreducibility_started) * 1000",
    "def rational_text(value):",
    "    return str(value.numerator()) + '/' + str(value.denominator())",
    "def packed_basis_text(basis):",
    "    denominator = int(basis.denominator)",
    "    return [[str(int(value)) + '/' + str(denominator) for value in row] for row in basis.numerator]",
    "def packed_basis_parts(numerator, denominator):",
    "    denominator = int(denominator)",
    "    return [[str(int(value)) + '/' + str(denominator) for value in row] for row in numerator]",
    "def trace_evidence(order):",
    "    trace = order.maximal_order_trace()",
    "    if trace is None:",
    "        return {'schema': 'sagejs.number-fields/maximal-order-trace-v1', 'enabled': False, 'events': []}",
    "    return trace",
    "def scheduler_evidence(trace):",
    "    for event in trace.get('events', []):",
    "        if event.get('stage') == 'local-schedule':",
    "            details = event.get('details', {})",
    "            return {'schedule': details.get('schedule'), 'parallel_decision': details.get('parallel_decision'), 'resources': details.get('resources')} ",
    "    return None",
    "def used_algorithms(trace):",
    "    answer = []",
    "    for event in trace.get('events', []):",
    "        used = event.get('details', {}).get('used_algorithm')",
    "        if used is not None:",
    "            answer.append(str(used))",
    "    return answer",
    "def selection_evidence(order, algorithm, worker_capability=False):",
    "    certificate = order.maximality_certificate()",
    "    equation_discriminant = int(certificate['equation_discriminant'])",
    "    primes = []",
    "    for component in certificate['component_certificate']['components']:",
    "        if component['state'] == 'proven-prime' and int(component['exponent']) >= 2:",
    "            primes.append(int(component['base']))",
    "    return engine.inspect_maximal_order_selection(coefficients, equation_discriminant, primes, algorithm=algorithm, worker_capability=worker_capability)",
    "def forced_sequential_decision(original):",
    "    def decide(jobs, *args, **kwds):",
    "        result = dict(original(jobs, *args, **kwds))",
    "        result['selected'] = False",
    "        result['reason'] = 'evidence-forced-sequential-control'",
    "        return result",
    "    return decide",
    "def scheduler_order(field, parallel):",
    "    saved_native = engine.native_order_from_polynomial",
    "    saved_decision = engine.public_worker_decision",
    "    def unavailable(*args, **kwds):",
    "        raise RuntimeError('evidence scheduler boundary deliberately disables the native global shortcut')",
    "    engine.native_order_from_polynomial = unavailable",
    "    if not parallel:",
    "        engine.public_worker_decision = forced_sequential_decision(saved_decision)",
    "    try:",
    "        return field.maximal_order(trace=True)",
    "    finally:",
    "        engine.native_order_from_polynomial = saved_native",
    "        engine.public_worker_decision = saved_decision",
    "def native_sample():",
    "    if not native_kernel_eligible:",
    "        reason = direct_evidence.get('reason') if direct_evidence else None",
    "        return {'boundary_supported': False, 'unsupported_reason': reason or 'no exact direct polynomial-to-HNF strategy is available'}",
    "    strategy = direct_evidence.get('strategy') if direct_evidence else 'certified-prime-resource'",
    "    started = time.perf_counter()",
    "    if strategy == 'authenticated-composite-analysis':",
    "        result = composite_analysis.construct_composite_field_analysis(coefficients, 1)",
    "        elapsed = (time.perf_counter() - started) * 1000",
    "        if not result.certified:",
    "            return {'boundary_supported': False, 'unsupported_reason': 'authenticated composite analysis did not prove a complete direct order: ' + str(result.state) + ': ' + str(result.message)}",
    "        basis = result.basis_numerator",
    "        denominator = result.basis_denominator",
    "        certificate = {'schema': 'sagejs.number-fields/direct-polynomial-hnf-certificate-v1', 'strategy': strategy, 'proof_schema': result.proof_schema, 'authenticated': bool(result.certified), 'index': str(result.index), 'equation_discriminant': str(result.equation_discriminant), 'order_discriminant': str(result.order_discriminant), 'support': direct_evidence.get('support', {})}",
    "        return {'boundary_supported': True, 'timing_ms': elapsed, 'stages': {'direct_polynomial_to_hnf': elapsed, 'strategy': strategy}, 'basis': packed_basis_parts(basis, denominator), 'field_discriminant': str(result.order_discriminant), 'certified': bool(result.certified), 'direct_certificate': certificate, 'cache_identity': {'applicable': False, 'same_object': None, 'timed': False}, 'algorithm_selection': certificate, 'selected_algorithm': strategy, 'diagnostic_trace': None, 'scheduler': None}",
    "    if strategy != 'certified-prime-resource':",
    "        return {'boundary_supported': False, 'unsupported_reason': 'unknown direct polynomial-to-HNF strategy ' + str(strategy)}",
    "    result = native_order_from_polynomial(coefficients, local_primes)",
    "    elapsed = (time.perf_counter() - started) * 1000",
    "    if not result.complete:",
    "        return {'boundary_supported': False, 'unsupported_reason': 'native local resource was incomplete'}",
    "    certificate = {'schema': 'sagejs.number-fields/direct-polynomial-hnf-certificate-v1', 'strategy': strategy, 'proof_schema': 'sagejs.number-fields/native-order-result-v1', 'authenticated': bool(result.complete), 'status': int(result.status), 'supplied_primes': int(result.supplied_primes), 'resolved_primes': int(result.resolved_primes), 'index': str(result.index), 'equation_discriminant': str(result.equation_discriminant), 'order_discriminant': str(result.order_discriminant), 'local_primes': [str(value) for value in local_primes], 'support': direct_evidence.get('support', {})}",
    "    return {'boundary_supported': True, 'timing_ms': elapsed, 'stages': {'direct_polynomial_to_hnf': elapsed, 'strategy': strategy, 'local_primes': [str(value) for value in local_primes]}, 'basis': packed_basis_text(result.basis), 'field_discriminant': str(result.order_discriminant), 'certified': bool(result.complete), 'direct_certificate': certificate, 'cache_identity': {'applicable': False, 'same_object': None, 'timed': False}, 'algorithm_selection': certificate, 'selected_algorithm': strategy, 'diagnostic_trace': None, 'scheduler': None}",
    "def one_sample():",
    "    if boundary == 'native-kernel':",
    "        return native_sample()",
    "    construction_started = time.perf_counter()",
    "    K = NumberField(f, 'a')",
    "    construction_ms = (time.perf_counter() - construction_started) * 1000",
    "    if boundary == 'factor-discovery':",
    "        discriminant_started = time.perf_counter()",
    "        polynomial_discriminant = f.discriminant()",
    "        discriminant_ms = (time.perf_counter() - discriminant_started) * 1000",
    "        factor_started = time.perf_counter()",
    "        factors = factor(abs(runtime.integer_bigint(QQ(polynomial_discriminant).numerator())))",
    "        factor_ms = (time.perf_counter() - factor_started) * 1000",
    "        return {'timing_ms': factor_ms, 'stages': {'field_construction': construction_ms, 'polynomial_discriminant': discriminant_ms, 'factor_discovery': factor_ms}, 'factorization': [[str(item[0]), int(item[1])] for item in factors]}",
    "    algorithm = 'auto'",
    "    trace_enabled = boundary in ('traced-public-diagnostic', 'round2-local', 'round4-local', 'om-local', 'sequential-public', 'parallel-public')",
    "    if boundary == 'dynamic-public':",
    "        algorithm = 'round2'",
    "    elif boundary == 'native-public':",
    "        algorithm = 'native'",
    "    elif boundary == 'round2-local':",
    "        algorithm = 'round2'",
    "    elif boundary == 'round4-local':",
    "        algorithm = 'round4'",
    "    elif boundary == 'om-local':",
    "        algorithm = 'om-maxmin'",
    "    order_started = time.perf_counter()",
    "    if boundary == 'sequential-public':",
    "        O = scheduler_order(K, False)",
    "    elif boundary == 'parallel-public':",
    "        O = scheduler_order(K, True)",
    "    else:",
    "        O = K.maximal_order(algorithm=algorithm, trace=trace_enabled)",
    "    order_ms = (time.perf_counter() - order_started) * 1000",
    "    trace = trace_evidence(O)",
    "    trace_events = trace.get('events', [])",
    "    stage_map = {}",
    "    local_primes_trace = []",
    "    basis_merge = False",
    "    for event in trace_events:",
    "        stage_map[event['stage']] = str(event.get('duration_ns', 0)) + ' ns'",
    "        if 'prime' in event['details']:",
    "            local_primes_trace.append(str(event['details']['prime']))",
    "        if event['details'].get('merged_composite_lattice', False):",
    "            basis_merge = True",
    "    materialize_started = time.perf_counter()",
    "    basis = [[rational_text(entry) for entry in element.list()] for element in O.basis()]",
    "    field_discriminant = str(O.discriminant())",
    "    materialization_ms = (time.perf_counter() - materialize_started) * 1000",
    "    certification_started = time.perf_counter()",
    "    certified = bool(O.is_maximal())",
    "    certification_ms = (time.perf_counter() - certification_started) * 1000",
    "    cache_identity = {'applicable': boundary == 'warm-public', 'same_object': None, 'timed': False}",
    "    if boundary == 'warm-public':",
    "        cache_identity['same_object'] = K.maximal_order() is O",
    "    scheduler = scheduler_evidence(trace)",
    "    boundary_supported = True",
    "    unsupported_reason = None",
    "    actual_algorithms = used_algorithms(trace)",
    "    if boundary == 'parallel-public':",
    "        boundary_supported = bool(scheduler is not None and scheduler.get('parallel_decision', {}).get('selected'))",
    "        if not boundary_supported:",
    "            unsupported_reason = 'production crossover policy did not select the packaged worker graph'",
    "    if boundary == 'om-local' and actual_algorithms and not any(value == 'om-maxmin' for value in actual_algorithms):",
    "        boundary_supported = False",
    "        unsupported_reason = 'forced OM fell back to another local algorithm'",
    "    if boundary == 'round4-local' and actual_algorithms and not any('round4' in value for value in actual_algorithms):",
    "        boundary_supported = False",
    "        unsupported_reason = 'forced Round-4 fell back to another local algorithm'",
    "    selection = selection_evidence(O, algorithm, boundary == 'parallel-public')",
    "    selected_algorithm = algorithm",
    "    if algorithm == 'auto':",
    "        local_selected = [item.get('algorithm') for item in selection.get('local_decisions', [])]",
    "        selected_algorithm = 'om' if 'om-maxmin' in local_selected else selection.get('primary')",
    "    return {'boundary_supported': boundary_supported, 'unsupported_reason': unsupported_reason, 'timing_ms': order_ms, 'stages': {'field_construction': construction_ms, 'maximal_order': order_ms, 'public_object_materialization': materialization_ms, 'certification': certification_ms, 'factor_discovery': stage_map.get('discriminant-decomposition', 'unavailable'), 'local_primes': local_primes_trace, 'local_order_stages': stage_map, 'basis_merge': basis_merge}, 'basis': basis, 'field_discriminant': field_discriminant, 'certified': certified, 'cache_identity': cache_identity, 'algorithm_selection': selection, 'selected_algorithm': selected_algorithm, 'executed_algorithms': actual_algorithms, 'diagnostic_trace': trace if trace.get('enabled') else None, 'scheduler': scheduler}",
    "if not irreducible:",
    "    payload = {'status': 'unsupported', 'reason': 'defining polynomial is reducible', 'irreducible_verified': False}",
    "else:",
    `    for _ in range(${warmups}):`,
    "        one_sample()",
    `    raw_samples = [one_sample() for _ in range(${samples})]`,
    "    final = raw_samples[-1]",
    "    if not final.get('boundary_supported', True):",
    "        payload = {'status': 'unsupported', 'reason': final.get('unsupported_reason', 'boundary preconditions were not satisfied'), 'irreducible_verified': True}",
    "    else:",
    "        sample_timings = [{'timing_ms': item.get('timing_ms'), 'stages': item.get('stages')} for item in raw_samples]",
    "        payload = {'status': 'ok', 'irreducible_verified': True, 'irreducibility_ms': irreducibility_ms, 'samples': sample_timings, 'basis': final.get('basis'), 'field_discriminant': final.get('field_discriminant'), 'certified': final.get('certified'), 'factorization': final.get('factorization'), 'cache_identity': final.get('cache_identity'), 'algorithm_selection': final.get('algorithm_selection'), 'direct_certificate': final.get('direct_certificate'), 'selected_algorithm': final.get('selected_algorithm'), 'executed_algorithms': final.get('executed_algorithms'), 'diagnostic_trace': final.get('diagnostic_trace'), 'scheduler': final.get('scheduler')}",
    "print('@@NFMO_PAYLOAD@@' + json.dumps(payload, sort_keys=True))",
  ].join("\n");
}

async function main() {
  const session = await createSage();
  process.stdout.write("@@NFMO_READY@@sagejs persistent kernel\n");
  const input = readline.createInterface({ input: process.stdin });
  for await (const line of input) {
    let response;
    try {
      const request = JSON.parse(line);
      const evaluated = await session.evaluate(sageSource(request));
      const payloadLine = evaluated.stdout.split(/\r?\n/).find((entry) => entry.startsWith("@@NFMO_PAYLOAD@@"));
      if (!payloadLine) throw new Error(`Sage.js worker did not emit a payload: ${evaluated.stdout}`);
      response = JSON.parse(payloadLine.slice("@@NFMO_PAYLOAD@@".length));
    } catch (error) {
      const request = JSON.parse(line);
      response = {
        status: request.boundary === "native-public" ? "unsupported" : "error",
        reason: error?.message || String(error),
        stack: error?.stack,
      };
    }
    process.stdout.write(`@@NFMO_RESULT@@${JSON.stringify(response)}\n`);
  }
  await session.close();
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
