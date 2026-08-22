import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(directory, "corpus.json"), "utf8"));
const transcript = fs.readFileSync(
  path.join(directory, "expected-pari-2.18.1-alpha.txt"),
  "utf8",
);

assert.equal(corpus.schema, "sagejs.hyperelliptic-bsd-oracles/v1");
assert.deepEqual(
  corpus.phase_coverage.map(({ phase }) => phase),
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
);
assert.equal(new Set(corpus.phase_coverage.map(({ phase }) => phase)).size, 9);

const decimalPattern = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?$/;

function decimal(value) {
  assert.match(value, decimalPattern);
  const match = value.match(/^([-+]?)(\d*)(?:\.(\d*))?(?:[Ee]([-+]?\d+))?$/);
  assert.ok(match);
  const sign = match[1] === "-" ? -1n : 1n;
  const integer = match[2] || "0";
  const fractional = match[3] || "";
  const exponent = Number(match[4] || 0) - fractional.length;
  let numerator = sign * BigInt(integer + fractional);
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  return [numerator, denominator];
}

function rational(value) {
  const parts = value.split("/");
  assert.ok(parts.length === 1 || parts.length === 2);
  const numerator = BigInt(parts[0]);
  const denominator = parts.length === 2 ? BigInt(parts[1]) : 1n;
  assert.notEqual(denominator, 0n);
  return [numerator, denominator];
}

function multiply([an, ad], [bn, bd]) {
  return [an * bn, ad * bd];
}

function divide([an, ad], [bn, bd]) {
  assert.notEqual(bn, 0n);
  return [an * bd, ad * bn];
}

function equalRational([an, ad], [bn, bd]) {
  return an * bd === bn * ad;
}

function closeRelative(actual, expected, decimalDigits) {
  const [an, ad] = actual;
  const [en, ed] = expected;
  const difference = an * ed - en * ad;
  const magnitude = en * ad;
  assert.notEqual(magnitude, 0n);
  return (
    (difference < 0n ? -difference : difference) * 10n ** BigInt(decimalDigits) <
    (magnitude < 0n ? -magnitude : magnitude)
  );
}

for (const row of corpus.pari_genus2) {
  assert.equal(new Set(row.bad_prime_reduction).size, row.bad_prime_reduction.length);
  assert.ok(transcript.includes(`BEGIN|${row.id}\n`));
  assert.ok(transcript.includes(`period|${row.real_period}\n`));
  assert.ok(transcript.includes(`root_number|${row.root_number}\n`));
  if (row.analytic_rank === 0) {
    let quotient = decimal(row.L1);
    const torsion = rational(row.torsion_reduction_gcd);
    quotient = multiply(quotient, multiply(torsion, torsion));
    quotient = divide(quotient, decimal(row.real_period));
    quotient = divide(quotient, rational(row.pari_tamagawa_test_helper));
    assert.ok(closeRelative(quotient, rational(row.bsd_quotient_candidate), 34), row.id);
    assert.ok(transcript.includes(`quotient|${row.bsd_quotient_candidate}\n`));
  } else {
    assert.equal(row.root_number, -1);
    assert.ok(row.missing_for_bsd_quotient.length > 0);
    assert.ok(transcript.includes(`L1_derivative|${row.L1_derivative}\n`));
  }
}

for (const row of corpus.pari_genus3_periods) {
  assert.ok(transcript.includes(`BEGIN|${row.id}\nperiod|${row.real_period}\n`));
}

const split = corpus.split_genus3_analytic;
assert.equal(split.conductor, "3993");
assert.equal(split.factor_conductors.map(BigInt).reduce((a, b) => a * b), 3993n);
assert.equal(split.factor_root_numbers.reduce((a, b) => a * b), split.root_number);
assert.ok(
  closeRelative(
    split.factor_L1.map(decimal).reduce(multiply),
    decimal(split.L1),
    35,
  ),
);
assert.ok(
  closeRelative(
    split.factor_L2.map(decimal).reduce(multiply),
    decimal(split.L2),
    35,
  ),
);
assert.equal(split.bsd_normalization_status, "analytic-only-isogeny-factorization");
assert.ok(split.missing_corrections.length >= 4);

const vectors = new Map(corpus.exact_contract_vectors.map((row) => [row.id, row]));
assert.equal(vectors.size, corpus.exact_contract_vectors.length);

for (const row of vectors.values()) {
  let quotient = divide(rational(row.leading_derivative), rational(row.factorial));
  quotient = divide(quotient, rational(row.real_period));
  quotient = divide(quotient, rational(row.regulator));
  quotient = divide(quotient, rational(row.tamagawa_product));
  if (row.kind === "generic") {
    quotient = multiply(quotient, rational(row.A_torsion_order));
    quotient = multiply(quotient, rational(row.Adual_torsion_order));
    assert.ok(equalRational(quotient, rational(row.expected_quotient)));
  } else {
    const torsion = rational(row.torsion_order);
    quotient = multiply(quotient, multiply(torsion, torsion));
    assert.ok(
      equalRational(quotient, rational(row.expected_sha_over_index_squared)),
    );
    const index = rational(row.subgroup_index);
    assert.ok(equalRational(
      multiply(quotient, multiply(index, index)),
      rational(row.expected_analytic_sha),
    ));
  }
}

const full = vectors.get("jacobian-rank-two-factorial");
const indexThree = vectors.get("jacobian-index-three-basis-change");
assert.equal(BigInt(indexThree.regulator), 9n * BigInt(full.regulator));
assert.equal(
  9n * BigInt(indexThree.expected_sha_over_index_squared),
  BigInt(full.expected_sha_over_index_squared),
);
assert.equal(indexThree.basis_change_determinant, "3");

const coverage = new Map(corpus.phase_coverage.map((row) => [row.phase, row.coverage]));
assert.equal(coverage.get(5), "uncovered");
assert.equal(coverage.get(6), "self-consistency-only");
assert.equal(coverage.get(7), "uncovered");
assert.equal(coverage.get(8), "partial-external");

console.log(
  `BSD oracle corpus OK: ${corpus.pari_genus2.length} genus-2 rows, ` +
    `${corpus.pari_genus3_periods.length} genus-3 periods, ` +
    `${corpus.exact_contract_vectors.length} exact contract vectors`,
);
