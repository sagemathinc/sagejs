#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    join(root, "test/fixtures/number-field-maximal-order-corpus.json"),
    "utf8",
  ),
).cases.find((item) => item.id === "pari-round4-vector-429");
const timeoutMs = Number(process.env.SAGEJS_OM_AUTO_TIMEOUT_MS || 30_000);

function run(label, body, timeout = timeoutMs) {
  const started = process.hrtime.bigint();
  const result = spawnSync(
    process.execPath,
    [join(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      input: body,
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.status === 0) {
    return {
      label,
      censored: false,
      wall_ms: wallMs,
      result: JSON.parse(result.stdout.trim().split("\n").at(-1)),
    };
  }
  if (result.signal || result.error?.code === "ETIMEDOUT") {
    return { label, censored: true, lower_bound_ms: wallMs, timeout_ms: timeout };
  }
  throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
}

const setup = String.raw`
import json
import time
case = json.loads(r'''${JSON.stringify(fixture)}''')
coefficients = [int(value) for value in case["polynomial"]["coefficients"]]
equation_discriminant = int(case["equationDiscriminant"])
R = PolynomialRing(ZZ, "x")
K = NumberField(R(coefficients), "a")
`;

const auto = run(
  "production-auto-om-p7-local-hook",
  setup +
    String.raw`
from sagejs.number_fields.maximal_order_engine import _auto_om_local_order
started = time.perf_counter()
order, evidence = _auto_om_local_order(
    K, coefficients, 1, equation_discriminant, 7
)
elapsed_ms = 1000 * (time.perf_counter() - started)
print(json.dumps({
    "elapsed_ms": elapsed_ms,
    "selected": evidence.get("selected"),
    "algorithm": evidence.get("algorithm"),
    "region": evidence.get("measured_crossover_region"),
    "suppressed_alternatives": evidence.get("suppressed_alternatives"),
    "order_discriminant": str(order.discriminant()) if order is not None else None,
}))
`,
  Math.max(timeoutMs, 180_000),
);

const unavailable = run(
  "production-native-proof-unavailable",
  setup +
    String.raw`
from sagejs.number_fields.om_auto_selector import select_om_local_basis
started = time.perf_counter()
selection = select_om_local_basis(
    tuple(coefficients),
    7,
    local_discriminant_valuation=1008,
    factor_degrees=(1,),
    factor_multiplicities=(64,),
    native_capable=False,
)
print(json.dumps({
    "elapsed_ms": 1000 * (time.perf_counter() - started),
    "selected": selection.selected,
    "om_ran": selection.result is not None,
    "reason": selection.reason,
}))
`,
);

const report = {
  schema_version: 1,
  benchmark: "bench/number-field-om-auto-selector.cjs:v1",
  case_id: fixture.id,
  measurement_policy: {
    fresh_process: true,
    cached_public_call: false,
    full_public_enabled: process.env.SAGEJS_OM_AUTO_FULL_PUBLIC === "1",
    timeout_ms: timeoutMs,
  },
  measurements: [auto, unavailable],
};

if (process.env.SAGEJS_OM_AUTO_FULL_PUBLIC === "1") {
  report.measurements.push(
    run(
      "fresh-full-public-auto",
      setup +
        String.raw`
started = time.perf_counter()
order = K.maximal_order()
print(json.dumps({
    "elapsed_ms": 1000 * (time.perf_counter() - started),
    "order_discriminant": str(order.discriminant()),
    "expected_discriminant": str(case["fieldDiscriminant"]),
}))
`,
    ),
  );
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
