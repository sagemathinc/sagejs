#!/usr/bin/env node

// Exact audit implementation of the genus-3 coefficient-completion stage.
// This is deliberately standalone BigInt JavaScript: it is a specification,
// fixture checker, and benchmark, not the eventual Sage.js public API.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixturePath = new URL(
  "../../test/data/hyperelliptic-rforest/genus3-oracle.json",
  import.meta.url,
);

function abs(value) {
  return value < 0n ? -value : value;
}

function mod(value, modulus) {
  const result = value % modulus;
  return result < 0n ? result + modulus : result;
}

function isqrt(value) {
  assert(value >= 0n);
  if (value < 2n) return value;
  let x = 1n << BigInt((value.toString(2).length + 1) >> 1);
  for (;;) {
    const next = (x + value / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
}

// Sign of a + b*sqrt(p), computed without floating-point arithmetic.
function signQuadratic(a, b, p) {
  if (b === 0n) return a < 0n ? -1 : a > 0n ? 1 : 0;
  if (a === 0n) return b < 0n ? -1 : 1;
  if ((a < 0n) === (b < 0n)) return a < 0n ? -1 : 1;
  const comparison = abs(a) ** 2n - b ** 2n * p;
  if (comparison === 0n) return 0;
  if (a > 0n) return comparison > 0n ? 1 : -1;
  return comparison > 0n ? -1 : 1;
}

function nonnegativeQuadratic(a, b, p) {
  return signQuadratic(a, b, p) >= 0;
}

// L(T) is p-Weil iff the real Weil polynomial
//   h(X) = X^3+c1*X^2+(c2-3p)*X+(c3-2p*c1)
// has all roots in [-2*sqrt(p), 2*sqrt(p)].  For a real-rooted cubic,
// all roots are nonnegative iff its three elementary symmetric functions
// are nonnegative.  Apply this to h(X-2sqrt(p)) and h(2sqrt(p)-X).
export function isGenus3Weil(p, c1, c2, c3) {
  const A = c1;
  const B = c2 - 3n * p;
  const C = c3 - 2n * p * c1;
  const discriminant =
    A * A * B * B -
    4n * B * B * B -
    4n * A * A * A * C -
    27n * C * C +
    18n * A * B * C;
  if (discriminant < 0n) return false;

  // Elementary symmetric functions after shifting each root by +2*sqrt(p).
  if (!nonnegativeQuadratic(-A, 6n, p)) return false;
  if (!nonnegativeQuadratic(B + 12n * p, -4n * A, p)) return false;
  if (
    !nonnegativeQuadratic(-C - 4n * p * A, 2n * (B + 4n * p), p)
  )
    return false;

  // The same functions for 2*sqrt(p) minus each root.
  if (!nonnegativeQuadratic(A, 6n, p)) return false;
  if (!nonnegativeQuadratic(B + 12n * p, 4n * A, p)) return false;
  return nonnegativeQuadratic(
    C + 4n * p * A,
    2n * (B + 4n * p),
    p,
  );
}

function valuesInResidueInterval(residue, modulus, low, high) {
  const values = [];
  for (
    let value = low + mod(residue - low, modulus);
    value <= high;
    value += modulus
  )
    values.push(value);
  return values;
}

export function enumerateGenus3Candidates(p, residues) {
  const [r1, r2, r3] = residues.map((value) => mod(value, p));
  const c1Bound = isqrt(36n * p);
  const c2Bound = 15n * p;
  const c3Bound = isqrt(400n * p * p * p);
  const c1Values = valuesInResidueInterval(r1, p, -c1Bound, c1Bound);
  const c2Values = valuesInResidueInterval(r2, p, -c2Bound, c2Bound);
  const c3Values = valuesInResidueInterval(r3, p, -c3Bound, c3Bound);
  const candidates = [];
  for (const c1 of c1Values) {
    for (const c2 of c2Values) {
      for (const c3 of c3Values) {
        if (!isGenus3Weil(p, c1, c2, c3)) continue;
        const order =
          p ** 3n +
          1n +
          (p * p + 1n) * c1 +
          (p + 1n) * c2 +
          c3;
        const twistOrder =
          p ** 3n +
          1n -
          (p * p + 1n) * c1 +
          (p + 1n) * c2 -
          c3;
        candidates.push({ c1, c2, c3, order, twistOrder });
      }
    }
  }
  return {
    candidates,
    rectangularCount: c1Values.length * c2Values.length * c3Values.length,
  };
}

function sameFirstHalf(candidate, values) {
  return [candidate.c1, candidate.c2, candidate.c3].every(
    (value, index) => value === BigInt(values[index]),
  );
}

function main() {
  const corpus = JSON.parse(readFileSync(fixturePath, "utf8"));
  const summaries = [];
  const started = process.hrtime.bigint();
  for (const record of corpus.records) {
    const p = BigInt(record.p);
    const result = enumerateGenus3Candidates(
      p,
      record.residues_mod_p.map(BigInt),
    );
    const trueCandidates = result.candidates.filter((candidate) =>
      sameFirstHalf(candidate, record.lpolynomial_first_half),
    );
    assert.equal(trueCandidates.length, 1, `${record.curve} at ${record.p}`);
    if (record.sage_weil_candidate_count !== undefined)
      assert.equal(
        result.candidates.length,
        record.sage_weil_candidate_count,
        `Sage Weil enumeration for ${record.curve} at ${record.p}`,
      );
    const truth = trueCandidates[0];
    const orderMatches = result.candidates.filter(
      (candidate) => candidate.order === truth.order,
    ).length;
    const orderAndTwistMatches = result.candidates.filter(
      (candidate) =>
        candidate.order === truth.order && candidate.twistOrder === truth.twistOrder,
    ).length;
    assert.equal(orderAndTwistMatches, 1);
    summaries.push({
      curve: record.curve,
      p: record.p,
      rectangle: result.rectangularCount,
      weil: result.candidates.length,
      exactOrderMatches: orderMatches,
      exactOrderAndTwistMatches: orderAndTwistMatches,
      order: truth.order.toString(),
      twistOrder: truth.twistOrder.toString(),
    });
  }
  const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
  console.log(JSON.stringify({ elapsedSeconds: elapsed, summaries }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) main();
