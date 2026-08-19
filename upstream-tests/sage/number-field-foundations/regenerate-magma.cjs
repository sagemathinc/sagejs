#!/usr/bin/env node
"use strict";

// Persistent Magma differential oracle. This is intentionally not part of the
// offline test suite. It starts Magma once, sends every field through that one
// process, and either checks or refreshes the committed independent snapshot.

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..", "..", "..");
const corpusPath = join(root, "test", "fixtures", "number-field-foundations", "corpus.json");
const snapshotPath = join(
  root,
  "test",
  "fixtures",
  "number-field-foundations",
  "independent-oracles.json",
);
const magma = process.env.MAGMA || "/home/user/bin/magma";
const update = process.argv.includes("--update");

if (!existsSync(magma)) {
  console.error(`Magma is unavailable at ${magma}; the committed offline snapshot remains usable.`);
  process.exit(2);
}

const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const fields = corpus.fields.filter((field) => field.degree > 1);

function magmaPolynomial(field) {
  return field.polynomial.coefficients
    .map((coefficient, exponent) => `(${coefficient})*x^${exponent}`)
    .join(" + ");
}

const program = [
  "Qx<x> := PolynomialRing(Rationals());",
  "major, minor, patch := GetVersion();",
  'printf "VERSION|%o.%o.%o\\n", major, minor, patch;',
];
for (const field of fields) {
  program.push(
    `f := ${magmaPolynomial(field)};`,
    "K<a> := NumberField(f);",
    "O := MaximalOrder(K);",
    "r1, r2 := Signature(K);",
    `printf "FIELD|${field.id}|%o|%o|%o|%o|%o|%o\\n", Degree(K), r1, r2, Discriminant(O), ClassNumber(O), #TorsionUnitGroup(O);`,
  );
  for (const prime of [2, 3, 5]) {
    program.push(
      `decomposition := Factorization(${prime}*O);`,
      `printf "PRIME|${field.id}|${prime}";`,
      "for term in decomposition do",
      "  ideal := term[1]; exponent := term[2]; norm := Norm(ideal); quotient := norm; residueDegree := 0;",
      `  while quotient gt 1 do quotient div:= ${prime}; residueDegree +:= 1; end while;`,
      '  printf "|%o,%o,%o", exponent, residueDegree, norm;',
      "end for;",
      'printf "\\n";',
    );
  }
}
program.push("quit;", "");

const result = spawnSync(magma, ["-b"], {
  cwd: root,
  encoding: "utf8",
  input: program.join("\n"),
  maxBuffer: 64 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  throw new Error(`Magma exited with status ${result.status}`);
}

const records = new Map();
let magmaVersion;
for (const line of result.stdout.split(/\r?\n/)) {
  const parts = line.trim().split("|");
  if (parts[0] === "VERSION") {
    magmaVersion = parts[1];
  } else if (parts[0] === "FIELD") {
    records.set(parts[1], {
      id: parts[1],
      degree: Number(parts[2]),
      signature: [Number(parts[3]), Number(parts[4])],
      fieldDiscriminant: parts[5],
      classNumber: parts[6],
      rootsOfUnity: parts[7],
      primeDecompositions: [],
    });
  } else if (parts[0] === "PRIME") {
    const record = records.get(parts[1]);
    assert.ok(record, `missing FIELD record for ${parts[1]}`);
    const factors = parts.slice(3).map((encoded) => {
      const [e, f, norm] = encoded.split(",");
      return { e: Number(e), f: Number(f), norm };
    });
    factors.sort((left, right) => left.f - right.f || left.e - right.e || left.norm.localeCompare(right.norm));
    record.primeDecompositions.push({ p: parts[2], factors });
  }
}
if (!magmaVersion) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
}
assert.ok(magmaVersion, "Magma did not emit a version");
assert.equal(records.size, fields.length);

const snapshot = {
  schema: "sagejs.number-fields/independent-oracles-v1",
  source: {
    system: "Magma",
    version: magmaVersion,
    executableDefault: "/home/user/bin/magma",
    generator: "upstream-tests/sage/number-field-foundations/regenerate-magma.cjs",
    processModel: "one persistent process for the full corpus",
  },
  scope: "Exact invariants and prime decompositions at 2, 3, and 5; analytic values remain Sage/PARI sourced.",
  heckeOscar: {
    status: "not-provisioned",
    note: "The regeneration host was probed; Julia and hence Hecke/Oscar were not available. They are not runtime or test dependencies.",
  },
  fields: fields.map((field) => records.get(field.id)),
};

// Check the independent output against the richer Sage/PARI corpus before it
// is allowed to become a committed snapshot.
const corpusById = new Map(corpus.fields.map((field) => [field.id, field]));
for (const record of snapshot.fields) {
  const expected = corpusById.get(record.id);
  assert.equal(record.degree, expected.degree);
  assert.deepEqual(record.signature, expected.signature);
  assert.equal(record.fieldDiscriminant, expected.fieldDiscriminant);
  assert.equal(record.classNumber, expected.globalInvariants.classNumber);
  assert.equal(record.rootsOfUnity, expected.globalInvariants.rootsOfUnity);
  const decompositions = new Map(expected.primeDecompositions.map((row) => [row.p, row]));
  for (const decomposition of record.primeDecompositions) {
    const expectedFactors = decompositions.get(decomposition.p).factors
      .map(({ e, f, norm }) => ({ e, f, norm }))
      .sort((left, right) => left.f - right.f || left.e - right.e || left.norm.localeCompare(right.norm));
    assert.deepEqual(decomposition.factors, expectedFactors, `${record.id} at ${decomposition.p}`);
  }
}

const encoded = `${JSON.stringify(snapshot, null, 2)}\n`;
if (update) {
  writeFileSync(snapshotPath, encoded);
  console.log(`updated ${snapshotPath}`);
} else {
  assert.equal(readFileSync(snapshotPath, "utf8"), encoded);
  console.log(`Magma ${magmaVersion} agrees with ${snapshot.fields.length} committed fields`);
}
