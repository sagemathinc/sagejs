"use strict";

const readline = require("node:readline");
const { resolve } = require("node:path");

const root = process.env.SAGEJS_ROOT || resolve(__dirname, "../../..");
const { createSage } = require(resolve(root, "dist/tools/kernel.js"));

function source(request) {
  const payload = JSON.stringify(request);
  return [
    "import json",
    "import time",
    `request = json.loads(${JSON.stringify(payload)})`,
    "R = PolynomialRing(QQ, 'x')",
    "x = R.gen()",
    "polynomial = R([int(value) for value in request['coefficients']])",
    "operation = request['operation']",
    "bound = int(request.get('bound', 0))",
    "points = request.get('points', [])",
    "def normalized_splitting(rows):",
    "    return [[int(row['prime']), sorted([[int(factor['e']), int(factor['f'])] for factor in row['factors']])] for row in rows]",
    "def complex_text(value):",
    "    return [str(value.real()), str(value.imag())]",
    "def one_sample(sample_index):",
    "    K = NumberField(polynomial, 'a' + str(sample_index))",
    "    if operation == 'prime-stream':",
    "        O = K.maximal_order()",
    "        started = time.perf_counter()",
    "        answer = normalized_splitting(list(O.splitting_records(2, bound)))",
    "    elif operation == 'coefficients':",
    "        Z = K.zeta_function()",
    "        started = time.perf_counter()",
    "        answer = [int(value) for value in Z.coefficients(bound)]",
    "    elif operation == 'quadratic-zeta-batch':",
    "        Z = K.zeta_function(prec=int(request['precision_bits']))",
    "        values = [CC(value[0], value[1]) for value in points]",
    "        started = time.perf_counter()",
    "        answer = [complex_text(value) for value in Z.values(values, prec=int(request['precision_bits']))]",
    "    elif operation == 'general-zeta-scalar':",
    "        Z = K.zeta_function(prec=int(request['precision_bits']), max_imaginary_part=4)",
    "        value = [points[0][0], points[0][1]]",
    "        started = time.perf_counter()",
    "        answer = complex_text(Z(value))",
    "    elif operation == 'global-arithmetic':",
    "        started = time.perf_counter()",
    "        units = K.unit_group()",
    "        classes = K.class_group_result()",
    "        regulator = K.regulator(prec=int(request['precision_bits']))",
    "        answer = {'unit_rank': int(units.unit_rank), 'unit_complete': bool(units.complete), 'class_complete': bool(classes.complete), 'class_number': int(classes.order()) if classes.complete else None, 'regulator': str(regulator.value)}",
    "    else:",
    "        raise ValueError('unknown benchmark operation ' + str(operation))",
    "    elapsed = float((time.perf_counter() - started) * 1000.0)",
    "    return {'timing_ms': elapsed, 'result': answer}",
    "for warmup in range(int(request.get('warmups', 0))):",
    "    one_sample(-warmup-1)",
    "samples = [one_sample(index) for index in range(int(request.get('samples', 1)))]",
    "print('@@NFFP_PAYLOAD@@' + json.dumps({'status': 'ok', 'samples': samples}, sort_keys=True))",
  ].join("\n");
}

async function main() {
  const session = await createSage();
  process.stdout.write("@@NFFP_READY@@Sage.js persistent kernel\n");
  const input = readline.createInterface({ input: process.stdin });
  for await (const line of input) {
    let response;
    try {
      const evaluated = await session.evaluate(source(JSON.parse(line)));
      const marker = evaluated.stdout
        .split(/\r?\n/)
        .find((entry) => entry.startsWith("@@NFFP_PAYLOAD@@"));
      if (!marker) throw new Error(`missing Sage.js payload: ${evaluated.stdout}`);
      response = JSON.parse(marker.slice("@@NFFP_PAYLOAD@@".length));
    } catch (error) {
      response = { status: "error", reason: error?.message || String(error), stack: error?.stack };
    }
    process.stdout.write(`@@NFFP_RESULT@@${JSON.stringify(response)}\n`);
  }
  await session.close();
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
