#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createSage } = require("../dist/tools/kernel.js");

const fixture = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "test",
      "fixtures",
      "number-field-round4-primary.json",
    ),
    "utf8",
  ),
);
const extended = process.argv.includes("--extended");
const records = extended ? fixture.cases : [fixture.cases[0]];

async function main() {
  const sourceRecords = records
    .map(
      (record) =>
        `('${record.id}', [${record.coefficients.join(",")}], ${record.prime}, ${record.local_output_discriminant})`,
    )
    .join(",");
  const session = await createSage();
  try {
    const evaluated = await session.evaluate(
      [
        "import time",
        "R.<x> = ZZ[]",
        "import sagejs.number_fields.round4 as round4",
        `records = [${sourceRecords}]`,
        "answer = []",
        "for name, coefficients, prime, expected_discriminant in records:",
        "    f = R(coefficients)",
        "    K = NumberField(f, 'a')",
        "    E = K.equation_order()",
        "    started = time.perf_counter()",
        "    plan = round4.round4_local_plan(f, prime)",
        "    plan_ms = 1000*(time.perf_counter()-started)",
        "    characteristic_metrics = {}",
        "    started = time.perf_counter()",
        "    power = round4.round4_primary_power_basis(E, prime, plan, False, characteristic_metrics)",
        "    kernel_ms = 1000*(time.perf_counter()-started)",
        "    phi = K._from_coefficients(power.generator_coefficients)",
        "    started = time.perf_counter()",
        "    direct_characteristic = round4._element_characteristic_polynomial(K, phi)",
        "    characteristic_polynomial_probe_ms = 1000*(time.perf_counter()-started)",
        "    modular_probe_metrics = {}",
        "    started = time.perf_counter()",
        "    modular_characteristic = round4._modular_characteristic_polynomial(K, phi, modular_probe_metrics)",
        "    modular_characteristic_polynomial_probe_ms = 1000*(time.perf_counter()-started)",
        "    assert modular_characteristic == direct_characteristic",
        "    K2 = NumberField(f, 'b')",
        "    started = time.perf_counter()",
        "    public = round4.modified_round4_local_order(K2.equation_order(), prime, strict=True)",
        "    public_ms = 1000*(time.perf_counter()-started)",
        "    assert public.order.discriminant() == expected_discriminant",
        "    answer.append({'id': name, 'plan_ms': plan_ms, 'power_basis_kernel_ms': kernel_ms, 'direct_characteristic_polynomial_probe_ms': characteristic_polynomial_probe_ms, 'modular_characteristic_polynomial_probe_ms': modular_characteristic_polynomial_probe_ms, 'modular_probe_metrics': modular_probe_metrics, 'public_strict_ms': public_ms, 'characteristic_polynomial_metrics': characteristic_metrics, 'local_index': str(power.local_index)})",
        "answer",
      ].join("\n"),
    );
    const report = {
      schema: 2,
      units: "milliseconds",
      mode: extended ? "extended" : "quick",
      provenance: {
        algorithm: "exact modular characteristic polynomial by CRT",
        coefficientBound:
          "Hadamard bounds summed over characteristic principal minors",
        earlyCertificate:
          "finite-field cyclic Krylov witness plus exact integer annihilation",
      },
      note: "The paired probes compare direct exact regular-representation characteristic polynomials with bounded CRT reconstruction. Search-local metrics report exact calls, cache hits, rational-coordinate input sizes, CRT primes, bound sizes, and completion certificates.",
      cases: JSON.parse(evaluated.repr.replaceAll("'", '"')),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
