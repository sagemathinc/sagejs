// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const repository = join(__dirname, "..");
const fixturePath = join(__dirname, "data/hyperelliptic/local-data-v1.json");
const casesPath = join(repository, "bench/hyperelliptic/cases-v1.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function fixtureDigest(value) {
  const deterministic = { ...value };
  delete deterministic.generated_at_utc;
  delete deterministic.fixture_sha256;
  return sha256(stable(deterministic));
}

function binomial(n, k) {
  let result = 1n;
  for (let i = 1; i <= k; i += 1) result = (result * BigInt(n - k + i)) / BigInt(i);
  return result;
}

function decimalStrings(value) {
  if (Array.isArray(value)) {
    for (const item of value) decimalStrings(item);
    return;
  }
  assert.match(value, /^-?(?:0|[1-9][0-9]*)$/);
}

test("hyperelliptic fixture has deterministic source provenance", () => {
  assert.equal(fixture.schema, "sagejs.hyperelliptic-local-data.v1");
  assert.deepEqual(fixture.normalization, {
    equation: "y^2 + h(x)*y = f(x)",
    local_polynomial: "L_q(T) = det(1 - T*Frob_q)",
    coefficient_order: "ascending",
    integer_encoding: "decimal-string",
  });
  assert.equal(fixture.fixture_sha256, fixtureDigest(fixture));
  assert.equal(fixture.cases_sha256, sha256(readFileSync(casesPath)));
  assert.equal(new Set(fixture.sources.map((source) => source.id)).size, fixture.sources.length);
  for (const source of fixture.sources) {
    assert.match(source.executable_sha256, /^[0-9a-f]{64}$/);
    assert.match(source.harness_sha256, /^[0-9a-f]{64}$/);
    assert.equal(source.harness_sha256, sha256(readFileSync(join(repository, source.harness))));
  }
});

test("corpus covers the required models, reduction states, and p-ranks", () => {
  assert.equal(fixture.rows.length, 25);
  assert.equal(new Set(fixture.rows.map((row) => row.id)).size, fixture.rows.length);
  const tags = new Set(fixture.rows.flatMap((row) => row.tags));
  for (const tag of [
    "degree-5",
    "degree-6",
    "degree-7",
    "degree-8",
    "quadratic-twist",
    "nonzero-h",
    "characteristic-2",
    "supersingular",
    "ordinary",
    "bad-reduction",
  ]) {
    assert(tags.has(tag), `missing ${tag}`);
  }
  for (const genus of [2, 3]) {
    const ranks = new Set(
      fixture.rows
        .filter((row) => row.genus === genus && row.p_rank !== null)
        .map((row) => Number(row.p_rank)),
    );
    assert.deepEqual([...ranks].sort(), Array.from({ length: genus + 1 }, (_, index) => index));
  }
  assert(fixture.rows.some((row) => row.jacobian_invariants?.length === 1));
  assert(fixture.rows.some((row) => row.jacobian_invariants?.length === 2));
  assert(fixture.rows.some((row) => row.jacobian_invariants?.length > 2));
});

test("every good local polynomial satisfies exact arithmetic identities", () => {
  for (const row of fixture.rows) {
    decimalStrings(row.model.f_coefficients_ascending);
    decimalStrings(row.model.h_coefficients_ascending);
    decimalStrings(row.prime);
    decimalStrings(row.field_order);
    if (row.reduction.status === "bad") {
      assert.equal(row.reduction.reason, "singular-reduction");
      for (const key of [
        "lpolynomial_coefficients_ascending",
        "independent_coefficients",
        "extension_point_counts",
        "jacobian_order",
        "jacobian_invariants",
        "hasse_witt",
      ]) {
        assert.equal(row[key], null, `${row.id} ${key}`);
      }
      continue;
    }

    const q = BigInt(row.field_order);
    const genus = row.genus;
    const coefficients = row.lpolynomial_coefficients_ascending.map(BigInt);
    decimalStrings(row.lpolynomial_coefficients_ascending);
    decimalStrings(row.independent_coefficients);
    decimalStrings(row.extension_point_counts);
    decimalStrings(row.jacobian_order);
    decimalStrings(row.jacobian_invariants);
    assert.equal(coefficients.length, 2 * genus + 1, row.id);
    assert.equal(coefficients[0], 1n, row.id);
    assert.equal(coefficients[2 * genus], q ** BigInt(genus), row.id);
    assert.deepEqual(row.independent_coefficients, row.lpolynomial_coefficients_ascending.slice(1, genus + 1));
    for (let i = 0; i <= genus; i += 1) {
      assert.equal(coefficients[2 * genus - i], q ** BigInt(genus - i) * coefficients[i], row.id);
      const bound = binomial(2 * genus, i);
      assert(
        coefficients[i] ** 2n <= bound ** 2n * q ** BigInt(i),
        `${row.id} coefficient ${i} violates the Weil bound`,
      );
    }

    const powerSums = [0n];
    for (let k = 1; k <= genus; k += 1) {
      let sum = BigInt(k) * coefficients[k];
      for (let i = 1; i < k; i += 1) sum += coefficients[k - i] * powerSums[i];
      powerSums[k] = -sum;
      const expected = q ** BigInt(k) + 1n - powerSums[k];
      assert.equal(BigInt(row.extension_point_counts[k - 1]), expected, `${row.id} N_${k}`);
    }
    assert.equal(coefficients.reduce((sum, value) => sum + value, 0n), BigInt(row.jacobian_order), row.id);

    let invariantProduct = 1n;
    for (let i = 0; i < row.jacobian_invariants.length; i += 1) {
      const invariant = BigInt(row.jacobian_invariants[i]);
      invariantProduct *= invariant;
      if (i > 0) assert.equal(invariant % BigInt(row.jacobian_invariants[i - 1]), 0n, row.id);
    }
    assert.equal(invariantProduct, BigInt(row.jacobian_order), row.id);

    if (row.hasse_witt) {
      decimalStrings(row.hasse_witt.modulus);
      decimalStrings(row.hasse_witt.rows);
      decimalStrings(row.hasse_witt.characteristic_polynomial_mod_p);
      const modulus = BigInt(row.hasse_witt.modulus);
      assert.deepEqual(
        row.hasse_witt.characteristic_polynomial_mod_p,
        coefficients.slice(0, genus + 1).map((value) => String(((value % modulus) + modulus) % modulus)),
        row.id,
      );
    }
  }
});

test("quadratic twist pairs negate odd coefficients", () => {
  const rows = new Map(fixture.rows.map((row) => [row.id, row]));
  for (const row of fixture.rows.filter((entry) => entry.twist_pair)) {
    const twist = rows.get(row.twist_pair);
    assert(twist, row.id);
    const left = row.lpolynomial_coefficients_ascending.map(BigInt);
    const right = twist.lpolynomial_coefficients_ascending.map(BigInt);
    for (let degree = 0; degree < left.length; degree += 1) {
      assert.equal(right[degree], degree % 2 ? -left[degree] : left[degree], `${row.id} degree ${degree}`);
    }
  }
});
