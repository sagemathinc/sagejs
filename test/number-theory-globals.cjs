// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

async function withSage(body) {
  const session = await createSage();
  try {
    await body(session);
  } finally {
    await session.close();
  }
}

function evaluated(session, lines) {
  return session.evaluate(Array.isArray(lines) ? lines.join("\n") : lines);
}

test("lcm matches gcd*lcm == |a*b| over a range, including bignums", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "lcm(6, 4)")).repr, "12");
    assert.equal((await evaluated(session, "lcm(0, 5)")).repr, "0");
    assert.equal((await evaluated(session, "lcm(-6, 4)")).repr, "12");
    assert.equal((await evaluated(session, "lcm([2, 3, 4])")).repr, "12");
    assert.equal((await evaluated(session, "lcm([])")).repr, "1");
    assert.equal(
      (
        await evaluated(session, [
          "all(lcm(a, b) * gcd(a, b) == abs(a * b)",
          "    for a in range(-20, 20) for b in range(-20, 20))",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (await evaluated(session, "lcm(2^100, 3^60) == 2^100 * 3^60")).repr,
      "True",
    );
    await assert.rejects(evaluated(session, "lcm('x', 'y')"), /TypeError/);
  });
});

// Regression for the same member-dispatch recursion hazard #46 fixed in
// ρσ_factor, ρσ_gcd, and ρσ_divisors: reaching a same-named `lcm` member
// without first checking that the value isn't itself an integer would let
// a bare `lcm(12, 18)` call, once `number`/`bigint` grow an `lcm` method,
// recurse into that method and straight back into this same function
// forever. `lcm` must still reach a genuinely non-integer object's own
// `lcm` method, and the global function's own behavior on integers must be
// unaffected.
test("lcm reaches a non-integer object's own lcm method, not member-dispatch recursion", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "lcm(12, 18)")).repr, "36");
    assert.equal(
      (
        await evaluated(session, [
          "class Foo:",
          "    def lcm(self, other):",
          "        return 'custom-lcm'",
          "",
          "lcm(Foo(), 5)",
        ])
      ).repr,
      "'custom-lcm'",
    );
    assert.equal(
      (
        await evaluated(session, [
          "class Bar:",
          "    def lcm(self, other):",
          "        return 'other-lcm'",
          "",
          "lcm(5, Bar())",
        ])
      ).repr,
      "'other-lcm'",
    );
  });
});

test("CRT and CRT_list agree with crt", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "CRT(2, 3, 3, 5)")).repr, "8");
    assert.equal(
      (await evaluated(session, "CRT_list([2, 3, 2], [3, 5, 7])")).repr,
      "23",
    );
    assert.equal(
      (
        await evaluated(session, "CRT(2, 3, 3, 5) == crt(2, 3, 3, 5)")
      ).repr,
      "True",
    );
    await assert.rejects(
      evaluated(session, "CRT_list([1, 1], [4, 6])"),
      /coprime/,
    );
  });
});

test("kronecker_symbol and jacobi_symbol agree on their shared domain", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "kronecker_symbol(5, 17)")).repr, "-1");
    assert.equal((await evaluated(session, "kronecker_symbol(3, -4)")).repr, "1");
    assert.equal((await evaluated(session, "jacobi_symbol(2, 15)")).repr, "1");
    assert.equal((await evaluated(session, "jacobi_symbol(5, 17)")).repr, "-1");
    assert.equal((await evaluated(session, "jacobi_symbol(1, 1)")).repr, "1");
    assert.equal(
      (
        await evaluated(session, [
          "all(jacobi_symbol(a, 17) == kronecker_symbol(a, 17)",
          "    for a in range(1, 17))",
        ])
      ).repr,
      "True",
    );
    await assert.rejects(
      evaluated(session, "jacobi_symbol(2, 4)"),
      /odd positive/,
    );
    await assert.rejects(
      evaluated(session, "jacobi_symbol(2, -3)"),
      /odd positive/,
    );
    await assert.rejects(
      evaluated(session, "kronecker_symbol('x', 3)"),
      /TypeError/,
    );
  });
});

test("hilbert_symbol matches the classical (-1,-1) ramification pattern", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "hilbert_symbol(-1, -1, 2)")).repr, "-1");
    assert.equal((await evaluated(session, "hilbert_symbol(-1, -1, -1)")).repr, "-1");
    assert.equal((await evaluated(session, "hilbert_symbol(-1, -1, 3)")).repr, "1");
    assert.equal((await evaluated(session, "hilbert_symbol(-1, -1, 5)")).repr, "1");
    assert.equal((await evaluated(session, "hilbert_symbol(1, 1, 5)")).repr, "1");
    // The product formula: the Hilbert symbol is 1 at every place except a
    // finite even-sized set, for any fixed nonzero a, b.
    assert.equal(
      (
        await evaluated(session, [
          "places = [-1, 2, 3, 5, 7, 11, 13]",
          "signs = [hilbert_symbol(-1, -3, p) for p in places]",
          "signs.count(-1) % 2",
        ])
      ).repr,
      "0",
    );
    await assert.rejects(
      evaluated(session, "hilbert_symbol(0, 1, 2)"),
      /nonzero/,
    );
    await assert.rejects(
      evaluated(session, "hilbert_symbol(1, 1, 4)"),
      /prime/,
    );
  });
});

test("multiplicative_order is the least k with power_mod(x,k,n) == 1", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "multiplicative_order(2, 7)")).repr, "3");
    assert.equal((await evaluated(session, "multiplicative_order(3, 7)")).repr, "6");
    assert.equal((await evaluated(session, "multiplicative_order(1, 1)")).repr, "1");
    assert.equal(
      (
        await evaluated(session, [
          "def brute(x, n):",
          "    k = 1",
          "    while power_mod(x, k, n) != 1:",
          "        k += 1",
          "    return k",
          "all(multiplicative_order(x, 101) == brute(x, 101)",
          "    for x in range(1, 101))",
        ])
      ).repr,
      "True",
    );
    await assert.rejects(
      evaluated(session, "multiplicative_order(2, 4)"),
      /only defined for units/,
    );
    await assert.rejects(
      evaluated(session, "multiplicative_order('x', 5)"),
      /TypeError/,
    );
  });
});

test("primitive_root satisfies the cyclic-group existence criterion", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "primitive_root(7)")).repr, "3");
    assert.equal((await evaluated(session, "primitive_root(1)")).repr, "0");
    assert.equal((await evaluated(session, "primitive_root(2)")).repr, "1");
    assert.equal((await evaluated(session, "primitive_root(4)")).repr, "3");
    assert.equal(
      (
        await evaluated(session, "multiplicative_order(primitive_root(7), 7)")
      ).repr,
      "6",
    );
    // 8 = 2^3 has no primitive root.
    await assert.rejects(
      evaluated(session, "primitive_root(8)"),
      /does not have a primitive root/,
    );
    await assert.rejects(
      evaluated(session, "primitive_root(15)"),
      /does not have a primitive root/,
    );
    await assert.rejects(
      evaluated(session, "primitive_root(0)"),
      /positive/,
    );
  });
});

test("number_of_divisors, radical, squarefree_part, and is_squarefree", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "number_of_divisors(28)")).repr, "6");
    assert.equal((await evaluated(session, "number_of_divisors(1)")).repr, "1");
    assert.equal((await evaluated(session, "number_of_divisors(-12)")).repr, "6");
    assert.equal(
      (
        await evaluated(session, "number_of_divisors(360360) == len(divisors(360360))")
      ).repr,
      "True",
    );
    await assert.rejects(evaluated(session, "number_of_divisors(0)"), /zero/);

    assert.equal((await evaluated(session, "radical(12)")).repr, "6");
    assert.equal((await evaluated(session, "radical(1)")).repr, "1");
    assert.equal((await evaluated(session, "radical(-18)")).repr, "6");
    await assert.rejects(
      evaluated(session, "radical(0)"),
      /Radical of 0/,
    );

    assert.equal((await evaluated(session, "squarefree_part(75)")).repr, "3");
    assert.equal((await evaluated(session, "squarefree_part(-8)")).repr, "-2");
    assert.equal((await evaluated(session, "squarefree_part(0)")).repr, "0");

    assert.equal((await evaluated(session, "is_squarefree(15)")).repr, "True");
    assert.equal((await evaluated(session, "is_squarefree(12)")).repr, "False");
    assert.equal((await evaluated(session, "is_squarefree(0)")).repr, "False");
    assert.equal((await evaluated(session, "is_squarefree(1)")).repr, "True");
    assert.equal((await evaluated(session, "is_squarefree(-1)")).repr, "True");

    await assert.rejects(evaluated(session, "radical('x')"), /TypeError/);
    await assert.rejects(evaluated(session, "is_squarefree(1.5)"), /TypeError/);
  });
});

test("nth_prime agrees with prime_range and is 1-indexed", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "nth_prime(1)")).repr, "2");
    assert.equal((await evaluated(session, "nth_prime(10)")).repr, "29");
    assert.equal((await evaluated(session, "nth_prime(100)")).repr, "541");
    assert.equal(
      (
        await evaluated(session, [
          "primes = prime_range(200)",
          "[nth_prime(k + 1) == primes[k] for k in range(len(primes))] == "
            + "[True] * len(primes)",
        ])
      ).repr,
      "True",
    );
    await assert.rejects(evaluated(session, "nth_prime(0)"), /positive/);
    await assert.rejects(evaluated(session, "nth_prime(-1)"), /positive/);
    await assert.rejects(evaluated(session, "nth_prime(1.5)"), /TypeError/);
  });
});

test("is_pseudoprime agrees with is_prime", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "is_pseudoprime(97)")).repr, "True");
    assert.equal((await evaluated(session, "is_pseudoprime(91)")).repr, "False");
    assert.equal((await evaluated(session, "is_pseudoprime(1)")).repr, "False");
    assert.equal((await evaluated(session, "is_pseudoprime(0)")).repr, "False");
    assert.equal((await evaluated(session, "is_pseudoprime(-7)")).repr, "False");
    assert.equal(
      (
        await evaluated(session, [
          "[is_pseudoprime(n) == is_prime(n) for n in range(2, 500)] == "
            + "[True] * 498",
        ])
      ).repr,
      "True",
    );
  });
});

test("next_prime_power and previous_prime_power bracket prime powers", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "next_prime_power(8)")).repr, "9");
    assert.equal((await evaluated(session, "next_prime_power(9)")).repr, "11");
    assert.equal((await evaluated(session, "next_prime_power(0)")).repr, "1");
    assert.equal((await evaluated(session, "previous_prime_power(9)")).repr, "8");
    // Sage.js's is_prime_power(1) currently returns True (matching Sage
    // before sage-6.6); which convention Sage.js should adopt is an open
    // question tracked in sagejs#56, and previous_prime_power(2)'s result
    // depends on it. This asserts today's behavior, not an endorsement.
    assert.equal((await evaluated(session, "previous_prime_power(2)")).repr, "1");
    // The argument is never returned, even when it is already a prime power.
    assert.equal(
      (await evaluated(session, "next_prime_power(9) > 9")).repr,
      "True",
    );
    assert.equal(
      (await evaluated(session, "previous_prime_power(9) < 9")).repr,
      "True",
    );
    await assert.rejects(
      evaluated(session, "previous_prime_power(1)"),
      /no prime power/,
    );
    await assert.rejects(
      evaluated(session, "previous_prime_power(-5)"),
      /no prime power/,
    );
  });
});

test("quadratic_residues enumerates the exact residue set", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "quadratic_residues(11)")).repr,
      "[0, 1, 3, 4, 5, 9]",
    );
    assert.equal((await evaluated(session, "quadratic_residues(1)")).repr, "[0]");
    assert.equal(
      (
        await evaluated(session, [
          "residues = set(quadratic_residues(23))",
          "all((k * k) % 23 in residues for k in range(23))",
        ])
      ).repr,
      "True",
    );
    await assert.rejects(
      evaluated(session, "quadratic_residues(0)"),
      /nonzero/,
    );
    // The documented 10^7 bound: above it, quadratic_residues raises
    // OverflowError instead of materializing a set that large. The bound
    // is checked before enumeration starts, so this stays fast.
    await assert.rejects(
      evaluated(session, "quadratic_residues(10^7 + 1)"),
      /OverflowError/,
    );
  });
});

test("two_squares sums to n and rejects impossible values", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "two_squares(50)")).repr, "(1, 7)");
    assert.equal((await evaluated(session, "two_squares(0)")).repr, "(0, 0)");
    assert.equal(
      (
        await evaluated(session, [
          "def feasible(n):",
          "    return n == 0 or all(",
          "        e % 2 == 0 for p, e in factor(n) if p % 4 == 3)",
          "def ok(n):",
          "    a, b = two_squares(n)",
          "    return a <= b and a * a + b * b == n",
          "all(ok(n) for n in range(60) if feasible(n))",
        ])
      ).repr,
      "True",
    );
    // Every prime factor congruent to 3 (mod 4) with an odd exponent rules
    // out a representation; 3 itself is the smallest example.
    await assert.rejects(evaluated(session, "two_squares(3)"), /not a sum of two squares/);
    await assert.rejects(evaluated(session, "two_squares(-1)"), /nonnegative/);
    // Two modest primes, each squared, keep every exponent even and
    // guarantee feasibility while pushing the product well past the
    // double-precision-safe integer range; factoring stays fast because
    // both prime factors are small, unlike a product of two large primes.
    assert.equal(
      (
        await evaluated(session, [
          "p = next_prime(1000000)",
          "q = next_prime(2000000)",
          "n = p^2 * q^2",
          "a, b = two_squares(n)",
          "n > 2^53 and a * a + b * b == n",
        ])
      ).repr,
      "True",
    );
    // A long run of factors of 2 exercises the Gaussian-integer
    // multiplication path past the double-precision-safe integer range
    // using only the prime 2, with no other prime to carry exactness.
    assert.equal(
      (
        await evaluated(session, [
          "n = 2^70",
          "a, b = two_squares(n)",
          "n > 2^53 and a * a + b * b == n",
        ])
      ).repr,
      "True",
    );
  });
});

test("three_squares sums to n and rejects 4^a(8b+7) exactly", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "three_squares(30)")).repr, "(1, 2, 5)");
    assert.equal((await evaluated(session, "three_squares(0)")).repr, "(0, 0, 0)");
    await assert.rejects(
      evaluated(session, "three_squares(7)"),
      /not a sum of three squares/,
    );
    await assert.rejects(
      evaluated(session, "three_squares(28)"),
      /not a sum of three squares/,
    );
    await assert.rejects(evaluated(session, "three_squares(-1)"), /nonnegative/);
    assert.equal(
      (
        await evaluated(session, [
          "def forbidden(n):",
          "    while n != 0 and n % 4 == 0:",
          "        n //= 4",
          "    return n % 8 == 7",
          "def ok(n):",
          "    a, b, c = three_squares(n)",
          "    return a <= b <= c and a * a + b * b + c * c == n",
          "all(ok(n) for n in range(60) if not forbidden(n))",
        ])
      ).repr,
      "True",
    );
    // A long run of factors of 4 pushes the shared scale factor past the
    // double-precision-safe integer range.
    assert.equal(
      (
        await evaluated(session, [
          "n = 4^40 * 3",
          "a, b, c = three_squares(n)",
          "n > 2^53 and a * a + b * b + c * c == n",
        ])
      ).repr,
      "True",
    );
  });
});

test("four_squares always succeeds for n >= 0", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "four_squares(7)")).repr, "(1, 1, 1, 2)");
    assert.equal((await evaluated(session, "four_squares(0)")).repr, "(0, 0, 0, 0)");
    await assert.rejects(evaluated(session, "four_squares(-1)"), /nonnegative/);
    assert.equal(
      (
        await evaluated(session, [
          "def ok(n):",
          "    a, b, c, d = four_squares(n)",
          "    return a <= b <= c <= d and a*a + b*b + c*c + d*d == n",
          "all(ok(n) for n in range(60))",
        ])
      ).repr,
      "True",
    );
    // Consecutive hard cases from Legendre's theorem (111 and 112 are both
    // forbidden for three squares) still succeed for four.
    assert.equal(
      (
        await evaluated(session, [
          "a, b, c, d = four_squares(112)",
          "a*a + b*b + c*c + d*d == 112",
        ])
      ).repr,
      "True",
    );
  });
});

test("continued_fraction covers integers, rationals, and lists", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "str(continued_fraction(415/93))")).repr,
      "'[4; 2, 6, 7]'",
    );
    assert.equal(
      (await evaluated(session, "continued_fraction(415/93).value()")).repr,
      "415/93",
    );
    assert.equal(
      (await evaluated(session, "continued_fraction(415/93).quotients()")).repr,
      "[4, 2, 6, 7]",
    );
    assert.equal(
      (await evaluated(session, "continued_fraction(415/93).convergents()")).repr,
      "[4, 9/2, 58/13, 415/93]",
    );
    assert.equal(
      (await evaluated(session, "str(continued_fraction(4))")).repr,
      "'[4]'",
    );
    assert.equal(
      (await evaluated(session, "continued_fraction([1, 2, 3]).value()")).repr,
      "10/7",
    );
    assert.equal(
      (
        await evaluated(session, "continued_fraction(-7/2).value() == -7/2")
      ).repr,
      "True",
    );
    // A rational with numerator and denominator well past the
    // double-precision-safe integer range still round-trips exactly
    // through value().
    assert.equal(
      (
        await evaluated(session, [
          "p = 62276253583512345678901 / 10000000000000000000003",
          "numerator(p) > 2^53 and continued_fraction(p).value() == p",
        ])
      ).repr,
      "True",
    );
    await assert.rejects(
      evaluated(session, "continued_fraction(1.5)"),
      /NotImplementedError/,
    );
    await assert.rejects(
      evaluated(session, "continued_fraction(pi)"),
      /NotImplementedError/,
    );
    await assert.rejects(
      evaluated(session, "continued_fraction([1, 0, 3])"),
      /positive/,
    );
    await assert.rejects(
      evaluated(session, "continued_fraction([])"),
      /at least one term/,
    );
  });
});
