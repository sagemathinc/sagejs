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

// Every check below runs one program per case rather than one Sage session
// per assertion, following test/combinat.cjs's own style: each program
// returns a Python list/tuple of booleans or values, and the test compares
// its printed `repr` against the expected printed value.

test("fibonacci matches Sage for every integer, including bignum", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "[fibonacci(n) for n in range(10)]")).repr,
      "[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]",
    );
    assert.equal(
      (await evaluated(session, "[fibonacci(-n) for n in range(1, 6)]")).repr,
      "[1, -1, 2, -3, 5]",
    );
    assert.equal((await evaluated(session, "fibonacci(0)")).repr, "0");
    assert.equal((await evaluated(session, "fibonacci(1)")).repr, "1");
    // Well past the double-precision range.
    assert.equal(
      (await evaluated(session, "fibonacci(200)")).repr,
      "280571172992510140037611932413038677189525",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call):",
          "    try:",
          "        call()",
          "    except TypeError:",
          "        return True",
          "    return False",
          "rejects(lambda: fibonacci(1.5))",
        ])
      ).repr,
      "True",
    );
  });
});

test("lucas_number1 and lucas_number2 match the classical sequences", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(session, "[lucas_number1(n, 1, -1) for n in range(8)]")
      ).repr,
      "[0, 1, 1, 2, 3, 5, 8, 13]",
    );
    assert.equal(
      (
        await evaluated(session, "[lucas_number2(n, 1, -1) for n in range(8)]")
      ).repr,
      "[2, 1, 3, 4, 7, 11, 18, 29]",
    );
    // Fibonacci and Lucas numbers are the two classical Lucas sequences.
    assert.equal(
      (
        await evaluated(session, [
          "[lucas_number1(n, 1, -1) == fibonacci(n)",
          " for n in range(20)] == [True] * 20",
        ])
      ).repr,
      "True",
    );
    // Pell numbers are U_n(2, -1).
    assert.equal(
      (await evaluated(session, "lucas_number1(10, 2, -1)")).repr,
      "2378",
    );
    // Bignum: well past 2^53.
    assert.equal(
      (await evaluated(session, "lucas_number1(100, 1, -1)")).repr,
      "354224848179261915075",
    );
    assert.equal(
      (await evaluated(session, "lucas_number2(100, 1, -1)")).repr,
      "792070839848372253127",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "checks = [",
          "    rejects(lambda: lucas_number1(-1, 1, -1), ValueError),",
          "    rejects(lambda: lucas_number2(-1, 1, -1), ValueError),",
          "    rejects(lambda: lucas_number1(1.5, 1, -1), TypeError),",
          "    rejects(lambda: lucas_number1(5, 1.5, -1), TypeError),",
          "]",
          "checks == [True] * len(checks)",
        ])
      ).repr,
      "True",
    );
  });
});

test("catalan_number matches Sage, including negative n and bignum", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "[catalan_number(n) for n in range(7)]")).repr,
      "[1, 1, 2, 5, 14, 42, 132]",
    );
    assert.equal((await evaluated(session, "catalan_number(-3)")).repr, "0");
    assert.equal((await evaluated(session, "catalan_number(0)")).repr, "1");
    assert.equal(
      (await evaluated(session, "catalan_number(60)")).repr,
      "1583850964596120042686772779038896",
    );
    // Cross-check against the closed form.
    assert.equal(
      (
        await evaluated(session, [
          "[catalan_number(n) == binomial(2 * n, n) // (n + 1)",
          " for n in range(30)] == [True] * 30",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "try:",
          "    catalan_number(1.5)",
          "except TypeError:",
          "    ok = True",
          "else:",
          "    ok = False",
          "ok",
        ])
      ).repr,
      "True",
    );
  });
});

test("bell_number matches Sage, including bignum and the Stirling identity", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "[bell_number(n) for n in range(8)]")).repr,
      "[1, 1, 2, 5, 15, 52, 203, 877]",
    );
    assert.equal(
      (await evaluated(session, "bell_number(50)")).repr,
      "185724268771078270438257767181908917499221852770",
    );
    assert.equal(
      (
        await evaluated(session, [
          "[bell_number(n) == sum(stirling_number2(n, k) for k in range(n + 1))",
          " for n in range(15)] == [True] * 15",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "[rejects(lambda: bell_number(-1), ValueError),",
          " rejects(lambda: bell_number(1.5), TypeError)]",
        ])
      ).repr,
      "[True, True]",
    );
  });
});

test("stirling_number1 is unsigned and stirling_number2 matches Sage", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(session, "[stirling_number1(5, k) for k in range(6)]")
      ).repr,
      "[0, 24, 50, 35, 10, 1]",
    );
    assert.equal(
      (
        await evaluated(session, "[stirling_number2(5, k) for k in range(6)]")
      ).repr,
      "[0, 1, 15, 25, 10, 1]",
    );
    assert.equal((await evaluated(session, "stirling_number1(0, 0)")).repr, "1");
    assert.equal((await evaluated(session, "stirling_number2(0, 0)")).repr, "1");
    // k > n and k < 0 both count zero completions.
    assert.equal((await evaluated(session, "stirling_number1(6, 8)")).repr, "0");
    assert.equal((await evaluated(session, "stirling_number2(6, 8)")).repr, "0");
    // Bignum, well past 2^53.
    assert.equal(
      (await evaluated(session, "stirling_number1(30, 15)")).repr,
      "8459574446076318147830625",
    );
    assert.equal(
      (await evaluated(session, "stirling_number2(30, 15)")).repr,
      "12879868072770626040000",
    );
    // "Unsigned" is the point: every value is nonnegative even where the
    // Wolfram Language's signed StirlingS1 would be negative.
    assert.equal(
      (
        await evaluated(session, [
          "all(stirling_number1(6, k) >= 0 for k in range(7))",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "checks = [",
          "    rejects(lambda: stirling_number1(-1, 0), ValueError),",
          "    rejects(lambda: stirling_number1(5, -1), ValueError),",
          "    rejects(lambda: stirling_number2(-1, 0), ValueError),",
          "    rejects(lambda: stirling_number2(5, -1), ValueError),",
          "    rejects(lambda: stirling_number1(5.5, 2), TypeError),",
          "    rejects(lambda: stirling_number2(5, 2.5), TypeError),",
          "]",
          "checks == [True] * len(checks)",
        ])
      ).repr,
      "True",
    );
  });
});

test("multinomial accepts both calling forms and matches the factorial ratio", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "multinomial(2, 3, 4)")).repr, "1260");
    assert.equal((await evaluated(session, "multinomial([2, 3, 4])")).repr, "1260");
    assert.equal((await evaluated(session, "multinomial(5, 0)")).repr, "1");
    assert.equal((await evaluated(session, "multinomial()")).repr, "1");
    assert.equal(
      (await evaluated(session, "multinomial(10, 10, 10)")).repr,
      "5550996791340",
    );
    // Bignum, well past 2^53.
    assert.equal(
      (await evaluated(session, "multinomial(20, 20, 20)")).repr,
      "577831214478475823831865900",
    );
    assert.equal(
      (
        await evaluated(session, [
          "multinomial(2, 3, 4) == factorial(9) // (factorial(2) * factorial(3) * factorial(4))",
        ])
      ).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "[rejects(lambda: multinomial(2, -1), ValueError),",
          " rejects(lambda: multinomial(2, 1.5), TypeError)]",
        ])
      ).repr,
      "[True, True]",
    );
  });
});

test("falling_factorial and rising_factorial match the factorial cases", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "falling_factorial(5, 3)")).repr, "60");
    assert.equal((await evaluated(session, "rising_factorial(5, 3)")).repr, "210");
    assert.equal((await evaluated(session, "falling_factorial(5, 0)")).repr, "1");
    assert.equal((await evaluated(session, "rising_factorial(5, 0)")).repr, "1");
    assert.equal(
      (await evaluated(session, "falling_factorial(10, 10) == factorial(10)")).repr,
      "True",
    );
    assert.equal(
      (await evaluated(session, "rising_factorial(1, 10) == factorial(10)")).repr,
      "True",
    );
    // Non-integer base is accepted; only the factor count must be an integer.
    assert.equal(
      (await evaluated(session, "falling_factorial(5/2, 2)")).repr,
      "15/4",
    );
    // Bignum, well past 2^53.
    assert.equal(
      (await evaluated(session, "falling_factorial(50, 20)")).repr,
      "114660755112113373922453094400000",
    );
    assert.equal(
      (await evaluated(session, "rising_factorial(50, 20)")).repr,
      "281320983816971283948847782297600000",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "checks = [",
          "    rejects(lambda: falling_factorial(5, -1), NotImplementedError),",
          "    rejects(lambda: rising_factorial(5, -1), NotImplementedError),",
          "    rejects(lambda: falling_factorial(5, 1.5), TypeError),",
          "    rejects(lambda: rising_factorial(5, 1.5), TypeError),",
          "]",
          "checks == [True] * len(checks)",
        ])
      ).repr,
      "True",
    );
  });
});

test("number_of_derangements matches the alternating factorial sum, including bignum", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(session, "[number_of_derangements(n) for n in range(7)]")
      ).repr,
      "[1, 0, 1, 2, 9, 44, 265]",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def alternating(n):",
          "    return sum((-1)**k * binomial(n, k) * factorial(n - k)",
          "               for k in range(n + 1))",
          "[number_of_derangements(n) == alternating(n)",
          " for n in range(12)] == [True] * 12",
        ])
      ).repr,
      "True",
    );
    // Bignum, well past 2^53.
    assert.equal(
      (await evaluated(session, "number_of_derangements(20)")).repr,
      "895014631192902121",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "[rejects(lambda: number_of_derangements(-1), ValueError),",
          " rejects(lambda: number_of_derangements(1.5), TypeError)]",
        ])
      ).repr,
      "[True, True]",
    );
  });
});

test("euler_number matches Sage's secant-number convention, including bignum", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "[euler_number(n) for n in range(9)]")).repr,
      "[1, 0, -1, 0, 5, 0, -61, 0, 1385]",
    );
    assert.equal((await evaluated(session, "euler_number(11)")).repr, "0");
    // Bignum, well past 2^53.
    assert.equal(
      (await evaluated(session, "euler_number(24)")).repr,
      "15514534163557086905",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "[rejects(lambda: euler_number(-1), ValueError),",
          " rejects(lambda: euler_number(1.5), TypeError)]",
        ])
      ).repr,
      "[True, True]",
    );
  });
});

test("harmonic_number is an exact Rational, ordinary and generalized", async () => {
  await withSage(async (session) => {
    assert.equal((await evaluated(session, "harmonic_number(5)")).repr, "137/60");
    assert.equal((await evaluated(session, "harmonic_number(0)")).repr, "0");
    assert.equal((await evaluated(session, "harmonic_number(1)")).repr, "1");
    assert.equal(
      (await evaluated(session, "harmonic_number(5, 2)")).repr,
      "5269/3600",
    );
    assert.equal(
      (await evaluated(session, "harmonic_number(5, 0) == 5")).repr,
      "True",
    );
    // Bignum denominator, well past 2^53.
    assert.equal(
      (await evaluated(session, "harmonic_number(60).denominator() > 2**53")).repr,
      "True",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "checks = [",
          "    rejects(lambda: harmonic_number(-1), ValueError),",
          "    rejects(lambda: harmonic_number(5, -1), NotImplementedError),",
          "    rejects(lambda: harmonic_number(1.5), TypeError),",
          "    rejects(lambda: harmonic_number(5, 1.5), TypeError),",
          "]",
          "checks == [True] * len(checks)",
        ])
      ).repr,
      "True",
    );
  });
});

test("q_binomial matches binomial at q=1 and is exact for integer and polynomial q", async () => {
  await withSage(async (session) => {
    assert.equal(
      (await evaluated(session, "q_binomial(4, 2, 1) == binomial(4, 2)")).repr,
      "True",
    );
    assert.equal((await evaluated(session, "q_binomial(4, 2, 2)")).repr, "35");
    assert.equal((await evaluated(session, "q_binomial(5, 0, 3)")).repr, "1");
    assert.equal((await evaluated(session, "q_binomial(5, 5, 3)")).repr, "1");
    assert.equal((await evaluated(session, "q_binomial(5, 7, 3)")).repr, "0");
    assert.equal((await evaluated(session, "q_binomial(5, -1, 3)")).repr, "0");
    assert.equal(
      (await evaluated(session, "gaussian_binomial(4, 2, 2)")).repr,
      "35",
    );
    // Bignum, well past 2^53.
    assert.equal(
      (await evaluated(session, "q_binomial(30, 10, 2)")).repr,
      "5558981749578215632348349252081046663788071236255186683399571",
    );
    // Polynomial-ring q: the q-Pascal recurrence is generic in `q`, so the
    // same code path returns the Gaussian polynomial and evaluates back to
    // the integer specializations above.
    assert.equal(
      (
        await evaluated(session, [
          "R = PolynomialRing(ZZ, 'q'); q = R.gen()",
          "poly = q_binomial(4, 2, q)",
          "[poly(1) == binomial(4, 2), poly(2) == 35, poly(3) == 130]",
        ])
      ).repr,
      "[True, True, True]",
    );
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call, error):",
          "    try:",
          "        call()",
          "    except error:",
          "        return True",
          "    return False",
          "checks = [",
          "    rejects(lambda: q_binomial(-1, 0, 2), ValueError),",
          "    rejects(lambda: q_binomial(1.5, 0, 2), TypeError),",
          "    rejects(lambda: q_binomial(5, 1.5, 2), TypeError),",
          "]",
          "checks == [True] * len(checks)",
        ])
      ).repr,
      "True",
    );
  });
});

// Review finding F7: every fixed-arity counting function added in this PR
// rejects an extra positional argument instead of silently ignoring it
// (the runtime otherwise drops it, which `catalan_number(5, 6) == 42`
// would confirm before this guard existed). `fibonacci`, `bell_number`,
// and `euler_number` already had this guard because their Sage names also
// name genuine Wolfram polynomial forms (`Fibonacci[n, x]`, `BellB[n, x]`,
// `EulerE[n, x]`); the rest get the same shape of guard here for
// consistency, even without a same-named Wolfram form to point at.
// `multinomial` is deliberately excluded: it is fully variadic, so every
// positional argument is significant data, not an extra one to reject.
test("fixed-arity counting functions reject an extra positional argument", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(session, [
          "def rejects(call):",
          "    try:",
          "        call()",
          "    except TypeError:",
          "        return True",
          "    return False",
          "checks = [",
          "    rejects(lambda: catalan_number(5, 6)),",
          "    rejects(lambda: stirling_number1(5, 3, 9)),",
          "    rejects(lambda: stirling_number2(5, 3, 9)),",
          "    rejects(lambda: falling_factorial(5, 2, 9)),",
          "    rejects(lambda: rising_factorial(5, 2, 9)),",
          "    rejects(lambda: number_of_derangements(5, 9)),",
          "    rejects(lambda: harmonic_number(5, 1, 9)),",
          "    rejects(lambda: q_binomial(4, 2, 1, 9)),",
          "    rejects(lambda: lucas_number1(5, 1, -1, 9)),",
          "    rejects(lambda: lucas_number2(5, 1, -1, 9)),",
          "]",
          "checks == [True] * len(checks)",
        ])
      ).repr,
      "True",
    );
    // Ordinary calls, at and below each function's real arity, still work.
    assert.equal((await evaluated(session, "catalan_number(5)")).repr, "42");
    assert.equal(
      (await evaluated(session, "stirling_number1(5, 3)")).repr,
      "35",
    );
    assert.equal((await evaluated(session, "harmonic_number(5, 2)")).repr, "5269/3600");
    assert.equal((await evaluated(session, "harmonic_number(5)")).repr, "137/60");
    // multinomial's variadic arity is unaffected: no argument count is
    // ever "extra" for it.
    assert.equal(
      (await evaluated(session, "multinomial(2, 3, 4, 5)")).repr,
      "2522520",
    );
  });
});

test("the counting functions are importable from the sage.combinat module path", async () => {
  await withSage(async (session) => {
    assert.equal(
      (
        await evaluated(session, [
          "from sage.combinat import fibonacci as fib, catalan_number as cn",
          "from sage.combinat import bell_number as bn, multinomial as mn",
          "from sage.combinat import q_binomial as qb, gaussian_binomial as gb",
          "[fib(10), cn(5), bn(6), mn(2, 3), qb(4, 2, 1), gb is qb]",
        ])
      ).repr,
      "[55, 42, 203, 10, 6, True]",
    );
  });
});
