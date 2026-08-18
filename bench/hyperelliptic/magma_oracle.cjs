#!/usr/bin/env node
"use strict";

// Generate and run a Magma program entirely through stdin.  No generated
// source file is needed, and only compact machine-readable sentinel lines are
// parsed from Magma's presentation output.

const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");

function polynomialExpression(coefficients, variable = "x") {
  const terms = [];
  coefficients.forEach((coefficient, degree) => {
    if (coefficient === 0) return;
    const monomial = degree === 0 ? "1" : degree === 1 ? variable : `${variable}^${degree}`;
    terms.push(`${coefficient}*${monomial}`);
  });
  return terms.length === 0 ? "0" : terms.join(" + ");
}

function magmaList(coefficients) {
  return `[${coefficients.join(",")}]`;
}

function emitCase(caseData) {
  const id = caseData.id;
  if (caseData.expect_bad) return `printf "BAD|${id}\\n";`;
  const p = caseData.prime;
  const g = caseData.genus;
  const f = polynomialExpression(caseData.f);
  const h = polynomialExpression(caseData.h);
  const extensionBlocks = [];
  for (let degree = 1; degree <= g; degree += 1) {
    extensionBlocks.push(`
      K${degree}<a${degree}> := GF(${p}^${degree});
      PK${degree}<t${degree}> := PolynomialRing(K${degree});
      f${degree} := PK${degree}![K${degree}!c : c in ${magmaList(caseData.f)}];
      h${degree} := PK${degree}![K${degree}!c : c in ${magmaList(caseData.h)}];
      C${degree} := HyperellipticCurve(f${degree}, h${degree});
      Append(~counts, #Points(C${degree}));`);
  }
  return `
    try
      P<x> := PolynomialRing(GF(${p}));
      f := ${f};
      h := ${h};
      C := HyperellipticCurve(f, h);
      lpoly := Coefficients(Numerator(ZetaFunction(C)));
      counts := [];
      ${extensionBlocks.join("\n")}
      J := Jacobian(C);
      jacorder := #J;
      printf "ROW|${id}|%o|%o|%o|", lpoly, counts, jacorder;
      try
        points := Points(J);
        for divisor in Divisors(jacorder) do
          multiplicity := #[ point : point in points | Order(point) eq divisor ];
          if multiplicity ne 0 then
            printf "%o:%o,", divisor, multiplicity;
          end if;
        end for;
      catch innerException;
        printf "NA";
      end try;
      printf "\\n";
    catch exception;
      printf "ERROR|${id}|%o\\n", exception;
    end try;`;
}

function parseList(text) {
  const normalized = text.replaceAll(/\s+/g, " ").trim();
  if (normalized === "[ ]") return [];
  return normalized
    .slice(1, -1)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseHistogram(text) {
  if (text.trim() === "NA") return null;
  const result = {};
  for (const pair of text.split(",").filter(Boolean)) {
    const [order, count] = pair.split(":");
    result[order] = count;
  }
  return result;
}

function main() {
  const casesPath = resolve(process.argv[2] ?? "bench/hyperelliptic/cases-v1.json");
  const magma = process.env.MAGMA ?? "/home/user/bin/magma";
  const cases = JSON.parse(readFileSync(casesPath, "utf8"));
  const source = [
    'major, minor, patch := GetVersion(); printf "VERSION|%o.%o.%o\\n", major, minor, patch;',
    "SetSeed(20260818);",
    ...cases.cases.map(emitCase),
    "quit;",
  ].join("\n");
  const execution = spawnSync(magma, ["-b"], {
    input: source,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (execution.error) throw execution.error;
  if (execution.status !== 0) {
    process.stderr.write(execution.stderr);
    throw new Error(`Magma exited with status ${execution.status}`);
  }
  const rows = new Map();
  let version = null;
  for (const line of execution.stdout.split(/\r?\n/)) {
    if (line.startsWith("VERSION|")) version = line.slice("VERSION|".length);
    if (line.startsWith("BAD|")) {
      const id = line.slice("BAD|".length);
      rows.set(id, { id, good: false, reason: "marked singular reduction" });
    }
    if (line.startsWith("ERROR|")) {
      const [, id, ...detail] = line.split("|");
      rows.set(id, { id, good: null, error: detail.join("|") });
    }
    if (line.startsWith("ROW|")) {
      const [, id, polynomial, counts, order, orderHistogram] = line.split("|");
      rows.set(id, {
        id,
        good: true,
        lpolynomial_coefficients_ascending: parseList(polynomial),
        extension_point_counts: parseList(counts),
        jacobian_order: order.trim(),
        element_order_histogram: parseHistogram(orderHistogram),
      });
    }
  }
  const missing = cases.cases.filter((entry) => !rows.has(entry.id)).map((entry) => entry.id);
  if (missing.length) {
    process.stderr.write(execution.stdout);
    throw new Error(`Magma emitted no row for: ${missing.join(", ")}`);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        oracle: { name: "magma", version, executable: magma },
        rows: cases.cases.map((entry) => rows.get(entry.id)),
      },
      null,
      2,
    )}\n`,
  );
}

main();
