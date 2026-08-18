#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { existsSync, readFileSync, realpathSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join, relative, resolve } = require("node:path");

const repository = resolve(__dirname, "../..");
const casesPath = join(__dirname, "cases-v1.json");
const fixturePath = join(repository, "test/data/hyperelliptic/local-data-v1.json");

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(realpathSync(path)));
}

function resolveExecutable(command) {
  if (command.includes("/") || command.includes("\\")) return resolve(command);
  const lookup = spawnSync("which", [command], { encoding: "utf8" });
  if (lookup.status !== 0) throw new Error(`cannot resolve executable ${command}`);
  return lookup.stdout.trim();
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fixtureDigest(fixture) {
  const deterministic = { ...fixture };
  delete deterministic.generated_at_utc;
  delete deterministic.fixture_sha256;
  return sha256Bytes(stable(deterministic));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} exited with status ${result.status}`);
  }
  // Some Sage installations print optional-library diagnostics before JSON.
  const start = result.stdout.indexOf("{");
  if (start < 0) throw new Error(`${command} produced no JSON object`);
  return JSON.parse(result.stdout.slice(start));
}

function indexRows(output) {
  return new Map(output.rows.map((row) => [row.id, row]));
}

function assertEqual(actual, expected, description) {
  if (stable(actual) !== stable(expected)) {
    throw new Error(`${description}: ${stable(actual)} != ${stable(expected)}`);
  }
}

function divisors(value) {
  const result = [];
  for (let candidate = 1n; candidate * candidate <= value; candidate += 1n) {
    if (value % candidate !== 0n) continue;
    result.push(candidate);
    if (candidate * candidate !== value) result.push(value / candidate);
  }
  return result.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function invariantHistogram(invariants) {
  const values = invariants.map(BigInt);
  const exponent = values.at(-1) ?? 1n;
  const exact = new Map();
  for (const divisor of divisors(exponent)) {
    const killed = values.reduce((product, invariant) => {
      let a = divisor;
      let b = invariant;
      while (b !== 0n) [a, b] = [b, a % b];
      return product * a;
    }, 1n);
    const proper = [...exact.entries()]
      .filter(([other]) => divisor % other === 0n)
      .reduce((sum, [, count]) => sum + count, 0n);
    exact.set(divisor, killed - proper);
  }
  return Object.fromEntries(
    [...exact.entries()].filter(([, count]) => count !== 0n).map(([order, count]) => [String(order), String(count)]),
  );
}

function provenance(id, output, executable, harness) {
  return {
    id,
    backend: output.oracle.name,
    version: output.oracle.version,
    executable_sha256: sha256File(executable),
    harness: relative(repository, harness),
    harness_sha256: sha256File(harness),
  };
}

function main() {
  const write = process.argv.includes("--write");
  const sage = process.env.SAGE ?? "/home/user/sagelite/sage";
  const magma = process.env.MAGMA ?? "/home/user/bin/magma";
  const python = process.env.PYTHON ?? process.execPath.replace(/\/node(?:\.exe)?$/, "/python3");
  const pythonCommand = resolveExecutable(existsSync(python) ? python : "python3");
  const cases = JSON.parse(readFileSync(casesPath, "utf8"));
  const exhaustiveHarness = join(__dirname, "exhaustive_oracle.py");
  const sageHarness = join(__dirname, "sage_oracle.py");
  const pariHarness = join(__dirname, "pari_oracle.py");
  const magmaHarness = join(__dirname, "magma_oracle.cjs");

  const exhaustive = run(pythonCommand, [exhaustiveHarness, casesPath]);
  const sageOutput = run(sage, [sageHarness, casesPath]);
  const pari = run(sage, [pariHarness, casesPath]);
  const magmaOutput = run(process.execPath, [magmaHarness, casesPath]);
  const exhaustiveRows = indexRows(exhaustive);
  const sageRows = indexRows(sageOutput);
  const pariRows = indexRows(pari);
  const magmaRows = indexRows(magmaOutput);

  const rows = cases.cases.map((caseData) => {
    const expectedGood = !caseData.expect_bad;
    const reference = exhaustiveRows.get(caseData.id);
    const sageRow = sageRows.get(caseData.id);
    const pariRow = pariRows.get(caseData.id);
    const magmaRow = magmaRows.get(caseData.id);
    assertEqual(reference.good, expectedGood, `${caseData.id} exhaustive reduction`);
    assertEqual(sageRow.good, expectedGood, `${caseData.id} Sage reduction`);
    assertEqual(magmaRow.good, expectedGood, `${caseData.id} Magma reduction`);
    if (!expectedGood) {
      return {
        id: caseData.id,
        genus: caseData.genus,
        model: {
          equation: "y^2 + h(x)*y = f(x)",
          base_ring: "QQ",
          f_coefficients_ascending: caseData.f.map(String),
          h_coefficients_ascending: caseData.h.map(String),
        },
        prime: String(caseData.prime),
        field_order: String(caseData.prime),
        reduction: { status: "bad", reason: "singular-reduction" },
        lpolynomial_coefficients_ascending: null,
        independent_coefficients: null,
        extension_point_counts: null,
        jacobian_order: null,
        jacobian_invariants: null,
        hasse_witt: null,
        p_rank: null,
        tags: caseData.tags,
        sources: ["exhaustive-python-v1", "sage-10.9", "magma-2.18"],
        verification: { reduction_agreement: true },
      };
    }

    for (const [name, row] of [
      ["Sage", sageRow],
      ["Magma", magmaRow],
    ]) {
      assertEqual(
        row.lpolynomial_coefficients_ascending,
        reference.lpolynomial_coefficients_ascending,
        `${caseData.id} ${name} L-polynomial`,
      );
      assertEqual(row.extension_point_counts, reference.extension_point_counts, `${caseData.id} ${name} counts`);
      assertEqual(row.jacobian_order, reference.jacobian_order, `${caseData.id} ${name} Jacobian order`);
    }
    if (pariRow.status === "ok") {
      assertEqual(
        pariRow.lpolynomial_coefficients_ascending,
        reference.lpolynomial_coefficients_ascending,
        `${caseData.id} PARI L-polynomial`,
      );
    }
    assertEqual(sageRow.hasse_witt, reference.hasse_witt, `${caseData.id} Hasse-Witt matrix`);
    assertEqual(sageRow.p_rank, reference.p_rank, `${caseData.id} p-rank`);
    if (sageRow.jacobian_invariants && magmaRow.element_order_histogram) {
      assertEqual(
        invariantHistogram(sageRow.jacobian_invariants),
        magmaRow.element_order_histogram,
        `${caseData.id} Jacobian invariant factors`,
      );
    }
    const sources = ["exhaustive-python-v1", "sage-10.9", "magma-2.18"];
    if (pariRow.status === "ok") sources.push("pari-2.17");
    return {
      id: caseData.id,
      genus: caseData.genus,
      model: {
        equation: "y^2 + h(x)*y = f(x)",
        base_ring: "QQ",
        f_coefficients_ascending: caseData.f.map(String),
        h_coefficients_ascending: caseData.h.map(String),
      },
      prime: String(caseData.prime),
      field_order: String(caseData.prime),
      reduction: { status: "good", reason: null },
      lpolynomial_coefficients_ascending: reference.lpolynomial_coefficients_ascending,
      independent_coefficients: reference.lpolynomial_coefficients_ascending.slice(1, caseData.genus + 1),
      extension_point_counts: reference.extension_point_counts,
      jacobian_order: reference.jacobian_order,
      jacobian_invariants: sageRow.jacobian_invariants,
      hasse_witt: reference.hasse_witt,
      p_rank: reference.p_rank,
      tags: [...new Set([...caseData.tags, ...sageRow.derived_tags])].sort(),
      ...(caseData.twist_pair ? { twist_pair: caseData.twist_pair } : {}),
      sources,
      verification: {
        exhaustive_point_counts: true,
        sage_lpolynomial: true,
        magma_lpolynomial_and_counts: true,
        pari_lpolynomial: pariRow.status === "ok",
        magma_group_order_histogram: magmaRow.element_order_histogram !== null,
      },
    };
  });

  const fixture = {
    schema: "sagejs.hyperelliptic-local-data.v1",
    normalization: {
      equation: "y^2 + h(x)*y = f(x)",
      local_polynomial: "L_q(T) = det(1 - T*Frob_q)",
      coefficient_order: "ascending",
      integer_encoding: "decimal-string",
    },
    generated_at_utc: new Date().toISOString(),
    cases_sha256: sha256File(casesPath),
    sources: [
      provenance("exhaustive-python-v1", exhaustive, pythonCommand, exhaustiveHarness),
      provenance("sage-10.9", sageOutput, sage, sageHarness),
      provenance("pari-2.17", pari, sage, pariHarness),
      provenance("magma-2.18", magmaOutput, magma, magmaHarness),
    ],
    rows,
  };
  fixture.fixture_sha256 = fixtureDigest(fixture);
  const serialized = `${JSON.stringify(fixture, null, 2)}\n`;
  if (write) {
    writeFileSync(fixturePath, serialized);
    process.stderr.write(`wrote ${relative(repository, fixturePath)} (${rows.length} rows)\n`);
  } else {
    process.stdout.write(serialized);
  }
}

main();
