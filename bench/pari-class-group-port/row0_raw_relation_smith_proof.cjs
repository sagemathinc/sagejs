"use strict";

// Expand row 0's two retained HNF transformations into a dimension-compatible
// Smith proof for the actual 73-by-66 relation matrix.  All matrices published
// here are row-major; the native owners consumed below are PARI column-major.

const crypto = require("node:crypto");

const SCHEMA = "sagejs.pari-class-group/row0-raw-relation-smith-proof-v1";
const RELATIONS = 73;
const FACTORS = 66;
const ACTIVE_RELATIONS = 15;
const ACTIVE_FACTORS = 8;
const KERNEL = ACTIVE_RELATIONS - ACTIVE_FACTORS;

class Row0RawSmithFailure extends Error {}
function fail(message) { throw new Row0RawSmithFailure(message); }
function digest(values) {
  return crypto.createHash("sha256").update(values.join("\n")).digest("hex");
}
function integers(owner, length, name) {
  if (!Array.isArray(owner) || owner.length !== length)
    fail(`${name} has the wrong shape`);
  return owner.map((entry, index) => {
    if (typeof entry !== "string" && typeof entry !== "number" &&
        typeof entry !== "bigint") fail(`${name}[${index}] is not an integer`);
    let value;
    try { value = BigInt(entry); }
    catch (error) {
      throw new Row0RawSmithFailure(`${name}[${index}] is not an integer`, {
        cause: error,
      });
    }
    if (String(value) !== String(entry)) fail(`${name}[${index}] is not canonical`);
    return value;
  });
}
function columnMajor(values, rows, columns) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => values[column * rows + row]));
}
function identity(size) {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => row === column ? 1n : 0n));
}
function multiply(left, right) {
  const columns = right[0].length;
  const transposed = Array.from({ length: columns }, (_, column) =>
    right.map(row => row[column]));
  return left.map(row => transposed.map(column =>
    row.reduce((sum, value, index) => sum + value * column[index], 0n)));
}
function flatten(matrix) { return matrix.flat().map(String); }

function buildRow0RawRelationSmithProof(owners) {
  if (!owners || typeof owners !== "object" || Array.isArray(owners))
    fail("missing same-run row-0 owners");
  const relationFlat = integers(owners.relation_records,
    FACTORS * RELATIONS, "relation records");
  const cleanupFlat = integers(owners.hnf_transform,
    RELATIONS * RELATIONS, "cleanup transform");
  const activeFlat = integers(owners.hnf_matbnew,
    ACTIVE_FACTORS * ACTIVE_RELATIONS, "active relation");
  const activeTransformFlat = integers(owners.hnf_hnf_transform,
    ACTIVE_RELATIONS * ACTIVE_RELATIONS, "active HNF transform");
  const fullHFlat = integers(owners.hnf_full_h,
    ACTIVE_FACTORS * ACTIVE_RELATIONS, "full HNF");

  const a = columnMajor(relationFlat, FACTORS, RELATIONS);
  const cleanup = columnMajor(cleanupFlat, RELATIONS, RELATIONS);
  const active = columnMajor(activeFlat, ACTIVE_FACTORS, ACTIVE_RELATIONS);
  const activeTransform = columnMajor(activeTransformFlat,
    ACTIVE_RELATIONS, ACTIVE_RELATIONS);
  const fullH = columnMajor(fullHFlat, ACTIVE_FACTORS, ACTIVE_RELATIONS);
  if (JSON.stringify(flatten(multiply(active, activeTransform))) !==
      JSON.stringify(flatten(fullH))) fail("active HNF ancestry changed");

  // A*T has only eight hard factor rows in its first fifteen columns.  Match
  // them to the retained active matrix using the entire row vector, rather
  // than trusting a frozen row permutation or a terminal class answer.
  const cleaned = multiply(a, cleanup);
  const activeRows = [];
  for (let row = 0; row < ACTIVE_FACTORS; row += 1) {
    const wanted = active[row].map(String).join(",");
    const matches = [];
    for (let factor = 0; factor < FACTORS; factor += 1) {
      if (cleaned[factor].slice(0, ACTIVE_RELATIONS).map(String).join(",") ===
          wanted) matches.push(factor);
    }
    if (matches.length !== 1) fail("active row is not uniquely bound to raw factors");
    activeRows.push(matches[0]);
  }
  if (new Set(activeRows).size !== ACTIVE_FACTORS)
    fail("active factor rows are not distinct");
  const activeSet = new Set(activeRows);
  for (let factor = 0; factor < FACTORS; factor += 1) {
    if (!activeSet.has(factor) &&
        cleaned[factor].slice(0, ACTIVE_RELATIONS).some(value => value !== 0n))
      fail("cleanup left an unretained active factor row");
  }

  const block = identity(RELATIONS);
  for (let row = 0; row < ACTIVE_RELATIONS; row += 1) {
    for (let column = 0; column < ACTIVE_RELATIONS; column += 1)
      block[row][column] = activeTransform[row][column];
  }
  const transform = multiply(cleanup, block);
  const reduced = multiply(a, transform);
  if (reduced.some(row => row.slice(0, KERNEL).some(value => value !== 0n)))
    fail("retained HNF kernel columns are not zero");

  // Columns 7..14 are unit pivots on the eight hard factor rows.  Use them to
  // clear those rows from the 58 sparse-cleanup pivots.  These are elementary
  // unimodular column operations applied to both A*T and T.
  const hardFactors = [];
  for (let column = KERNEL; column < ACTIVE_RELATIONS; column += 1) {
    const nonzero = reduced.map((row, factor) => [factor, row[column]])
      .filter(([, value]) => value !== 0n);
    if (nonzero.length !== 1 || (nonzero[0][1] !== 1n && nonzero[0][1] !== -1n))
      fail("active HNF did not expose a unit factor pivot");
    const [factor, sign] = nonzero[0];
    if (factor !== activeRows[column - KERNEL])
      fail("active HNF pivot order changed");
    if (sign === -1n) {
      for (let row = 0; row < RELATIONS; row += 1) transform[row][column] *= -1n;
      for (let row = 0; row < FACTORS; row += 1) reduced[row][column] *= -1n;
    }
    hardFactors.push(factor);
  }
  for (let column = ACTIVE_RELATIONS; column < RELATIONS; column += 1) {
    for (let hard = 0; hard < ACTIVE_FACTORS; hard += 1) {
      const factor = hardFactors[hard];
      const quotient = reduced[factor][column];
      if (quotient === 0n) continue;
      const pivotColumn = KERNEL + hard;
      for (let row = 0; row < RELATIONS; row += 1)
        transform[row][column] -= quotient * transform[row][pivotColumn];
      for (let row = 0; row < FACTORS; row += 1)
        reduced[row][column] -= quotient * reduced[row][pivotColumn];
    }
    const nonzero = reduced.map((row, factor) => [factor, row[column]])
      .filter(([, value]) => value !== 0n);
    if (nonzero.length !== 1 || (nonzero[0][1] !== 1n && nonzero[0][1] !== -1n))
      fail("cleanup tail did not expose one unit factor pivot");
    if (nonzero[0][1] === -1n) {
      for (let row = 0; row < RELATIONS; row += 1) transform[row][column] *= -1n;
      for (let row = 0; row < FACTORS; row += 1) reduced[row][column] *= -1n;
    }
  }

  const factorOrder = [];
  for (let column = KERNEL; column < RELATIONS; column += 1) {
    const factors = [];
    for (let factor = 0; factor < FACTORS; factor += 1)
      if (reduced[factor][column] !== 0n) factors.push(factor);
    if (factors.length !== 1 || reduced[factors[0]][column] !== 1n)
      fail("normalized relation transform is not a unit pivot matrix");
    factorOrder.push(factors[0]);
  }
  if (factorOrder.length !== FACTORS ||
      factorOrder.slice().sort((left, right) => left - right)
        .some((value, index) => value !== index))
    fail("normalized factor pivots are not a permutation");

  // R=A^t.  Reorder T^t so its 66 nonzero rows precede its seven kernel rows;
  // the right permutation converts factorOrder to the standard basis.
  const rowOrder = [
    ...Array.from({ length: FACTORS }, (_, index) => KERNEL + index),
    ...Array.from({ length: KERNEL }, (_, index) => index),
  ];
  const left = rowOrder.map(column => transform.map(row => row[column]));
  const right = Array.from({ length: FACTORS }, (_, rawFactor) =>
    Array.from({ length: FACTORS }, (_, outputFactor) =>
      rawFactor === factorOrder[outputFactor] ? 1n : 0n));
  const diagonal = Array.from({ length: RELATIONS }, (_, row) =>
    Array.from({ length: FACTORS }, (_, column) =>
      row === column ? 1n : 0n));

  const material = Object.freeze({
    d: flatten(diagonal),
    u: flatten(left),
    v: flatten(right),
  });
  return Object.freeze({
    schema: SCHEMA,
    dimensions: Object.freeze({ d: [String(RELATIONS), String(FACTORS)],
      r: [String(RELATIONS), String(FACTORS)],
      u: [String(RELATIONS), String(RELATIONS)],
      v: [String(FACTORS), String(FACTORS)] }),
    source: Object.freeze({
      activeHnfTransformSha256: digest(activeTransformFlat.map(String)),
      cleanupTransformSha256: digest(cleanupFlat.map(String)),
      fullHnfSha256: digest(fullHFlat.map(String)),
      relationMatrixSha256: digest(relationFlat.map(String)),
    }),
    ancestry: Object.freeze({ activeFactorRows: activeRows.map(String),
      factorOrder: factorOrder.map(String), kernelColumns: String(KERNEL),
      layout: "raw owners column-major; proof matrices row-major" }),
    diagonalFactors: Array(FACTORS).fill("1"),
    classNumber: "1",
    invariantFactors: Object.freeze([]),
    identity: "U R V = D",
    material,
    materialSha256: Object.freeze({ d: digest(material.d),
      u: digest(material.u), v: digest(material.v) }),
    provenance: Object.freeze({ answerInputs: false,
      algorithm: "retained-cleanup-and-active-hnf-transform-expansion",
      input: "same-run-retained-raw-relation-and-hnf-ancestry" }),
    qualifiedTiming: false,
  });
}

module.exports = Object.freeze({ ACTIVE_FACTORS, ACTIVE_RELATIONS, FACTORS,
  KERNEL, RELATIONS, Row0RawSmithFailure, SCHEMA,
  buildRow0RawRelationSmithProof });
