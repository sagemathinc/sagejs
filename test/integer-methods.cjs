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

async function repr(session, lines) {
  return (await evaluated(session, lines)).repr;
}

// Evaluate `expression` inside a `try`/`except <errorType>` block and return
// the repr of the caught error's message (or the repr of `'no error'` when
// nothing was raised).  This is the same pattern `test/combinat.cjs` uses to
// exercise documented exceptions from real Sage source.
async function errorMessage(session, errorType, expression) {
  return repr(session, [
    "def _check():",
    "    try:",
    "        " + expression,
    "    except " + errorType + " as error:",
    "        return str(error)",
    "    return 'no error'",
    "_check()",
  ]);
}

test("Integer.gcd and Integer.xgcd", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(12).gcd(18)"), "6");
    assert.equal(await repr(session, "(0).gcd(5)"), "5");
    assert.equal(await repr(session, "(0).gcd(0)"), "0");
    assert.equal(await repr(session, "(-12).gcd(18)"), "6");
    assert.equal(
      await errorMessage(session, "TypeError", "(12).gcd('x')"),
      "'gcd() is not defined for these arguments'",
    );
    assert.equal(await repr(session, "(6).xgcd(4)"), "(2, 1, -1)");
    assert.equal(await repr(session, "(0).xgcd(0)"), "(0, 1, 0)");
    assert.equal(await repr(session, "(-6).xgcd(4)"), "(2, -1, -1)");
    assert.equal(
      await errorMessage(session, "TypeError", "(6).xgcd('x')"),
      "'xgcd() arguments must be integers'",
    );

    // Regression: the global functions must still behave exactly as
    // before, and must still reach a non-integer object's own method
    // rather than recursing back into the integer implementation.
    assert.equal(await repr(session, "gcd(12, 18)"), "6");
    assert.equal(await repr(session, "gcd([12, 18, 30])"), "6");
    assert.equal(
      await repr(session, [
        "class Foo:",
        "    def gcd(self, other):",
        "        return 'custom-gcd'",
        "",
        "gcd(Foo(), 5)",
      ]),
      "'custom-gcd'",
    );
    assert.equal(
      await repr(session, [
        "class Bar:",
        "    def gcd(self, other):",
        "        return 'other-gcd'",
        "",
        "gcd(5, Bar())",
      ]),
      "'other-gcd'",
    );
  });
});

test("Integer.factor, Integer.divisors, and their global-function regressions", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(2026).factor()"), "2 * 1013");
    assert.equal(await repr(session, "list((-12).factor())"), "[(2, 2), (3, 1)]");
    // `factor(0)` is a pre-existing error path (FLINT rejects zero with a
    // native `RangeError`, not a Python exception class); confirm the
    // method reaches exactly the same error the global function already
    // raises.
    assert.equal(
      await errorMessage(session, "RangeError", "(0).factor()"),
      "'RangeError: cannot factor zero'",
    );
    assert.equal(await repr(session, "(12).divisors()"), "[1, 2, 3, 4, 6, 12]");
    assert.equal(await repr(session, "(-12).divisors()"), "[1, 2, 3, 4, 6, 12]");
    assert.equal(
      await errorMessage(session, "ValueError", "(0).divisors()"),
      "'divisors() is not defined for 0'",
    );

    // Regression: the global functions must still behave exactly as
    // before (same results, same errors), and non-integer objects must
    // still reach their own `factor`/`divisors` members.
    assert.equal(await repr(session, "factor(12)"), "2^2 * 3");
    assert.equal(await repr(session, "divisors(12)"), "[1, 2, 3, 4, 6, 12]");
    assert.equal(
      await errorMessage(session, "TypeError", "factor('x')"),
      "'factor() requires an integer'",
    );
    assert.equal(
      await repr(session, [
        "class Foo:",
        "    def factor(self):",
        "        return 'custom-factor'",
        "",
        "factor(Foo())",
      ]),
      "'custom-factor'",
    );
    assert.equal(
      await repr(session, [
        "class Foo:",
        "    def divisors(self):",
        "        return 'custom-divisors'",
        "",
        "divisors(Foo())",
      ]),
      "'custom-divisors'",
    );
  });
});

test("Integer.prime_divisors, Integer.prime_factors, Integer.is_prime, Integer.is_prime_power", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(12).prime_divisors()"), "[2, 3]");
    assert.equal(await repr(session, "(12).prime_factors()"), "[2, 3]");
    assert.equal(await repr(session, "(1).prime_divisors()"), "[]");
    assert.equal(await repr(session, "(-12).prime_divisors()"), "[2, 3]");

    assert.equal(await repr(session, "(13).is_prime()"), "True");
    assert.equal(await repr(session, "(12).is_prime()"), "False");
    assert.equal(await repr(session, "(0).is_prime()"), "False");
    assert.equal(await repr(session, "(-13).is_prime()"), "False");

    assert.equal(await repr(session, "(8).is_prime_power()"), "True");
    assert.equal(await repr(session, "(12).is_prime_power()"), "False");
    // Sage.js currently returns True for 1; SageMath has returned False
    // since sage-6.6 (ticket #16878). Which convention to adopt is an open
    // question tracked in sagejs#56 -- this asserts today's behavior, not
    // an endorsement of it.
    assert.equal(await repr(session, "(1).is_prime_power()"), "True");
    assert.equal(await repr(session, "(0).is_prime_power()"), "False");
  });
});

test("Integer.next_prime and Integer.previous_prime", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(10).next_prime()"), "11");
    assert.equal(await repr(session, "(0).next_prime()"), "2");
    assert.equal(await repr(session, "(-5).next_prime()"), "2");
    assert.equal(await repr(session, "(10).previous_prime()"), "7");
    assert.equal(
      await errorMessage(session, "ValueError", "(2).previous_prime()"),
      "'no previous prime'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(-5).previous_prime()"),
      "'no previous prime'",
    );
  });
});

test("Integer.valuation", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(72).valuation(3)"), "2");
    assert.equal(await repr(session, "(-72).valuation(3)"), "2");
    assert.equal(
      await errorMessage(session, "ValueError", "(0).valuation(3)"),
      "'valuation of zero is infinite'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(8).valuation(1)"),
      "'valuation base must have absolute value at least 2'",
    );
  });
});

test("Integer.binomial and Integer.factorial", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(5).binomial(2)"), "10");
    assert.equal(await repr(session, "(5).binomial(0)"), "1");
    assert.equal(await repr(session, "(-5).binomial(2)"), "15");
    assert.equal(await repr(session, "(5).factorial()"), "120");
    assert.equal(await repr(session, "(0).factorial()"), "1");
    assert.equal(
      await errorMessage(session, "ValueError", "(-1).factorial()"),
      "'factorial() is not defined for negative integers'",
    );
  });
});

test("Integer.euler_phi, Integer.sigma, Integer.moebius", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(9).euler_phi()"), "6");
    assert.equal(await repr(session, "(0).euler_phi()"), "0");
    assert.equal(await repr(session, "(28).sigma()"), "56");
    assert.equal(await repr(session, "(28).sigma(0)"), "6");
    assert.equal(
      await errorMessage(session, "ValueError", "(0).sigma()"),
      "'sigma() is not defined for zero'",
    );
    assert.equal(await repr(session, "(30).moebius()"), "-1");
    assert.equal(await repr(session, "(12).moebius()"), "0");
    assert.equal(await repr(session, "(1).moebius()"), "1");
    assert.equal(await repr(session, "(0).moebius()"), "0");
  });
});

test("Integer.kronecker and Integer.jacobi", async () => {
  await withSage(async (session) => {
    assert.equal(
      await repr(session, "(5).kronecker(11)"),
      await repr(session, "kronecker(5, 11)"),
    );
    // Unlike `jacobi`, `kronecker` accepts an even second argument.
    assert.equal(
      await repr(session, "(5).kronecker(4)"),
      await repr(session, "kronecker(5, 4)"),
    );
    assert.equal(
      await repr(session, "(5).jacobi(21)"),
      await repr(session, "kronecker(5, 21)"),
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(5).jacobi(4)"),
      "'jacobi symbol not defined for even b'",
    );
    assert.equal(
      await errorMessage(session, "TypeError", "(5).jacobi('x')"),
      "'jacobi() requires an integer'",
    );
  });
});

test("Integer.inverse_mod and Integer.powermod", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(3).inverse_mod(4000)"), "2667");
    assert.equal(
      await errorMessage(session, "ZeroDivisionError", "(2).inverse_mod(4)"),
      "'inverse does not exist'",
    );
    assert.equal(await repr(session, "(11).powermod(156, 1237)"), "153");
    assert.equal(await repr(session, "(3).powermod(-1, 7)"), "5");
    assert.equal(
      await errorMessage(session, "ValueError", "(2).powermod(3, 0)"),
      "'modulus must be positive'",
    );
  });
});

test("Integer.odd_part and Integer.prime_to_m_part", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(24).odd_part()"), "3");
    assert.equal(await repr(session, "(0).odd_part()"), "0");
    assert.equal(await repr(session, "(-24).odd_part()"), "-3");
    assert.equal(await repr(session, "(60).prime_to_m_part(6)"), "5");
    assert.equal(await repr(session, "(60).prime_to_m_part(7)"), "60");
  });
});

test("Integer.numerator, Integer.denominator, Integer.quo_rem, Integer.sign, Integer.divides", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(7).numerator()"), "7");
    assert.equal(await repr(session, "(-7).numerator()"), "-7");
    assert.equal(await repr(session, "(7).denominator()"), "1");
    assert.equal(await repr(session, "(0).denominator()"), "1");

    assert.equal(await repr(session, "(17).quo_rem(5)"), "(3, 2)");
    assert.equal(await repr(session, "(-17).quo_rem(5)"), "(-4, 3)");
    assert.equal(await repr(session, "(0).quo_rem(5)"), "(0, 0)");
    assert.equal(
      await errorMessage(session, "ZeroDivisionError", "(5).quo_rem(0)"),
      "'integer division or modulo by zero'",
    );

    assert.equal(await repr(session, "(-5).sign()"), "-1");
    assert.equal(await repr(session, "(0).sign()"), "0");
    assert.equal(await repr(session, "(5).sign()"), "1");

    assert.equal(await repr(session, "(3).divides(12)"), "True");
    assert.equal(await repr(session, "(5).divides(12)"), "False");
    assert.equal(await repr(session, "(0).divides(0)"), "True");
    assert.equal(await repr(session, "(0).divides(5)"), "False");
    assert.equal(await repr(session, "(-3).divides(12)"), "True");
    assert.equal(
      await errorMessage(session, "TypeError", "(3).divides('x')"),
      "'divides() requires an integer'",
    );
  });
});

test("Integer.isqrt", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(17).isqrt()"), "4");
    assert.equal(await repr(session, "(16).isqrt()"), "4");
    assert.equal(await repr(session, "(0).isqrt()"), "0");
    assert.equal(
      await errorMessage(session, "ValueError", "(-1).isqrt()"),
      "'isqrt() of a negative number is not defined'",
    );
    // Exact for a range of perfect and non-perfect squares, including
    // values well past double-precision exactness.
    assert.equal(
      await repr(session, [
        "big = 10**40 + 7",
        "root = big.isqrt()",
        "[root * root <= big, (root + 1) * (root + 1) > big]",
      ]),
      "[True, True]",
    );
  });
});

test("Integer.exact_log", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(100).exact_log(3)"), "4");
    assert.equal(await repr(session, "(8).exact_log(2)"), "3");
    assert.equal(await repr(session, "(1).exact_log(5)"), "0");
    assert.equal(
      await errorMessage(session, "ValueError", "(0).exact_log(2)"),
      "'exact_log() requires a positive number'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(-5).exact_log(2)"),
      "'exact_log() requires a positive number'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(8).exact_log(1)"),
      "'exact_log() requires the base to be at least 2'",
    );
    assert.equal(
      await repr(session, [
        "big = 3**200",
        "[big.exact_log(3), (big - 1).exact_log(3)]",
      ]),
      "[200, 199]",
    );
  });
});

test("Integer.nth_root", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(8).nth_root(3)"), "2");
    assert.equal(await repr(session, "(-8).nth_root(3)"), "-2");
    assert.equal(await repr(session, "(0).nth_root(5)"), "0");
    assert.equal(await repr(session, "(10).nth_root(3, truncate_mode=True)"), "(2, False)");
    assert.equal(await repr(session, "(8).nth_root(3, truncate_mode=True)"), "(2, True)");
    assert.equal(
      await errorMessage(session, "ValueError", "(10).nth_root(3)"),
      "'10 is not a perfect 3rd power'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(-4).nth_root(2)"),
      "'cannot take an even root of a negative number'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(4).nth_root(0)"),
      "'nth_root() degree must be positive'",
    );
    assert.equal(
      await errorMessage(session, "TypeError", "(4).nth_root('x')"),
      "'nth_root() requires an integer degree'",
    );
  });
});

test("Integer.squarefree_part and Integer.is_squarefree", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(12).squarefree_part()"), "3");
    assert.equal(await repr(session, "(-12).squarefree_part()"), "-3");
    assert.equal(await repr(session, "(0).squarefree_part()"), "0");
    assert.equal(await repr(session, "(1).squarefree_part()"), "1");

    assert.equal(await repr(session, "(10).is_squarefree()"), "True");
    assert.equal(await repr(session, "(12).is_squarefree()"), "False");
    assert.equal(await repr(session, "(1).is_squarefree()"), "True");
    assert.equal(await repr(session, "(0).is_squarefree()"), "False");
    assert.equal(await repr(session, "(-10).is_squarefree()"), "True");
  });
});

test("Integer.trailing_zero_bits", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(12).trailing_zero_bits()"), "2");
    assert.equal(await repr(session, "(7).trailing_zero_bits()"), "0");
    assert.equal(await repr(session, "(0).trailing_zero_bits()"), "0");
    assert.equal(await repr(session, "(-12).trailing_zero_bits()"), "2");
  });
});

test("Integer.str, Integer.binary, Integer.hex, Integer.oct", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(255).str(16)"), "'ff'");
    assert.equal(await repr(session, "(-255).str(16)"), "'-ff'");
    assert.equal(await repr(session, "(12).str()"), "'12'");
    assert.equal(await repr(session, "(0).str(2)"), "'0'");
    assert.equal(
      await errorMessage(session, "ValueError", "(12).str(1)"),
      "'str() base must be between 2 and 36'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(12).str(37)"),
      "'str() base must be between 2 and 36'",
    );

    assert.equal(await repr(session, "(10).binary()"), "'1010'");
    assert.equal(await repr(session, "(0).binary()"), "'0'");
    assert.equal(await repr(session, "(-10).binary()"), "'-1010'");

    assert.equal(await repr(session, "(12).hex()"), "'c'");
    assert.equal(await repr(session, "(255).hex()"), "'ff'");
    assert.equal(await repr(session, "(0).hex()"), "'0'");

    assert.equal(await repr(session, "(8).oct()"), "'10'");
    assert.equal(await repr(session, "(0).oct()"), "'0'");
  });
});

test("number and bigint literals share the same Integer methods", async () => {
  await withSage(async (session) => {
    // A BigInt-sized integer must support the exact same method surface
    // as a JavaScript-safe `number` integer.
    assert.equal(
      await repr(session, "(10**30 + 3).is_prime()"),
      await repr(session, "is_prime(10**30 + 3)"),
    );
    assert.equal(await repr(session, "(2**100).divisors()[:3]"), "[1, 2, 4]");
    assert.equal(await repr(session, "(2**100).factor()"), "2^100");
    assert.equal(await repr(session, "(2**100).gcd(2**50)"), "1125899906842624");
  });
});
