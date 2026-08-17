"use strict";

const readline = require("node:readline");
const { resolve } = require("node:path");

const root = process.env.SAGEJS_ROOT || resolve(__dirname, "../../../..");
const { createSage } = require(resolve(root, "dist/tools/kernel.js"));

function sageSource(request) {
  const coefficients = request.coefficients.map((entry) => String(entry)).join(",");
  const boundary = JSON.stringify(request.boundary);
  const warmups = Math.max(0, Number(request.warmups) || 0);
  const samples = Math.max(1, Number(request.samples) || 1);
  return [
    "import json",
    "import time",
    "import sagejs.runtime as runtime",
    "R = PolynomialRing(QQ, 'x')",
    `f = R([${coefficients}])`,
    "irreducibility_started = time.perf_counter()",
    "irreducible = bool(f.is_irreducible())",
    "irreducibility_ms = (time.perf_counter() - irreducibility_started) * 1000",
    "def rational_text(value):",
    "    return str(value.numerator()) + '/' + str(value.denominator())",
    "def one_sample():",
    "    construction_started = time.perf_counter()",
    "    K = NumberField(f, 'a')",
    "    construction_ms = (time.perf_counter() - construction_started) * 1000",
    `    if ${boundary} == 'factor-discovery':`,
    "        discriminant_started = time.perf_counter()",
    "        polynomial_discriminant = f.discriminant()",
    "        discriminant_ms = (time.perf_counter() - discriminant_started) * 1000",
    "        factor_started = time.perf_counter()",
    "        factors = factor(abs(runtime.integer_bigint(QQ(polynomial_discriminant).numerator())))",
    "        factor_ms = (time.perf_counter() - factor_started) * 1000",
    "        return {'timing_ms': factor_ms, 'stages': {'field_construction': construction_ms, 'polynomial_discriminant': discriminant_ms, 'factor_discovery': factor_ms}, 'factorization': [[str(item[0]), int(item[1])] for item in factors]}",
    "    order_started = time.perf_counter()",
    `    boundary = ${boundary}`,
    "    local_primes_trace = 'trace-not-exposed'",
    "    if boundary == 'dynamic-public' or boundary == 'native-public':",
    "        from sagejs.number_fields.maximal_order import equation_order_is_p_maximal, maximal_overorder_native, p_maximal_overorder_dynamic",
    "        O = K.equation_order()",
    "        local_primes = [int(item[0]) for item in factor(abs(runtime.integer_bigint(QQ(O.discriminant()).numerator()))) if item[1] >= 2]",
    "        local_primes_trace = [str(local_prime) for local_prime in local_primes]",
    "        if boundary == 'native-public':",
    "            O = maximal_overorder_native(O, local_primes)",
    "        else:",
    "            for local_prime in local_primes:",
    "                if not equation_order_is_p_maximal(K, local_prime):",
    "                    O = p_maximal_overorder_dynamic(O, local_prime)",
    "        O._is_maximal = True",
    "    else:",
    "        O = K.maximal_order()",
    "    order_ms = (time.perf_counter() - order_started) * 1000",
    "    materialize_started = time.perf_counter()",
    "    basis = [[rational_text(entry) for entry in element.list()] for element in O.basis()]",
    "    field_discriminant = str(O.discriminant())",
    "    materialization_ms = (time.perf_counter() - materialize_started) * 1000",
    "    certification_started = time.perf_counter()",
    "    certified = bool(O.is_maximal())",
    "    certification_ms = (time.perf_counter() - certification_started) * 1000",
    "    return {'timing_ms': order_ms, 'stages': {'field_construction': construction_ms, 'maximal_order': order_ms, 'public_object_materialization': materialization_ms, 'certification': certification_ms, 'factor_discovery': 'included-in-maximal_order', 'local_primes': local_primes_trace, 'basis_merge': 'included-in-maximal_order'}, 'basis': basis, 'field_discriminant': field_discriminant, 'certified': certified}",
    "if not irreducible:",
    "    payload = {'status': 'unsupported', 'reason': 'defining polynomial is reducible', 'irreducible_verified': False}",
    "else:",
    `    for _ in range(${warmups}):`,
    "        one_sample()",
    `    raw_samples = [one_sample() for _ in range(${samples})]`,
    "    final = raw_samples[-1]",
    "    payload = {'status': 'ok', 'irreducible_verified': True, 'irreducibility_ms': irreducibility_ms, 'samples': raw_samples, 'basis': final.get('basis'), 'field_discriminant': final.get('field_discriminant'), 'certified': final.get('certified'), 'factorization': final.get('factorization')}",
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
