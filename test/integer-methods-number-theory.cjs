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

// Same pattern `test/integer-methods.cjs` and `test/combinat.cjs` use to
// exercise a documented exception from real Sage source: evaluate
// `expression` inside a `try`/`except <errorType>` block and return the repr
// of the caught error's message (or the repr of `'no error'` when nothing
// was raised).
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

test("Integer.lcm matches the lcm global, including bignums, and does not recurse", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(6).lcm(4)"), "12");
    assert.equal(await repr(session, "(0).lcm(5)"), "0");
    assert.equal(await repr(session, "(5).lcm(0)"), "0");
    assert.equal(await repr(session, "(-6).lcm(4)"), "12");
    assert.equal(await repr(session, "(1).lcm(1)"), "1");

    // Cross-check the method against the global over a range.
    assert.equal(
      await repr(session, [
        "all(n.lcm(m) == lcm(n, m)",
        "    for n in range(-20, 20) for m in range(-20, 20))",
      ]),
      "True",
    );

    // A bignum case, on both sides of the call.
    assert.equal(
      await repr(session, "(2**100).lcm(3**60) == lcm(2**100, 3**60)"),
      "True",
    );
    assert.equal(
      await repr(session, "(2**100).lcm(2**50)"),
      await repr(session, "2**100"),
    );

    assert.equal(
      await errorMessage(session, "TypeError", "(12).lcm('x')"),
      "'lcm() is not defined for these arguments'",
    );

    // Regression for the member-dispatch recursion hazard #46 fixed in
    // ρσ_gcd and #47 pre-emptively guarded `lcm` against: now that
    // `Integer.lcm` actually exists, a bare `lcm(12, 18)` call must still
    // compute directly (never dispatching to the new method and recursing
    // back into the global), and `lcm` must still reach a genuinely
    // non-integer object's own `lcm` method rather than looping forever.
    assert.equal(await repr(session, "lcm(12, 18)"), "36");
    assert.equal(
      await repr(session, [
        "class Foo:",
        "    def lcm(self, other):",
        "        return 'custom-lcm'",
        "",
        "lcm(Foo(), 5)",
      ]),
      "'custom-lcm'",
    );
    assert.equal(
      await repr(session, [
        "class Bar:",
        "    def lcm(self, other):",
        "        return 'other-lcm'",
        "",
        "lcm(5, Bar())",
      ]),
      "'other-lcm'",
    );
  });
});

test("Integer.radical matches the radical global, including bignums", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(12).radical()"), "6");
    assert.equal(await repr(session, "(1).radical()"), "1");
    assert.equal(await repr(session, "(-18).radical()"), "6");
    assert.equal(
      await errorMessage(session, "ArithmeticError", "(0).radical()"),
      "'Radical of 0 not defined.'",
    );

    assert.equal(
      await repr(session, [
        "all(n.radical() == radical(n) for n in range(1, 200))",
      ]),
      "True",
    );

    // Bignum case: 2**100 * 3**7 has radical 6.
    assert.equal(
      await repr(session, "(2**100 * 3**7).radical()"),
      await repr(session, "radical(2**100 * 3**7)"),
    );
    assert.equal(await repr(session, "(2**100 * 3**7).radical()"), "6");

    // Wrong-type case: `Integer.radical` has no extra argument, so the
    // wrong-type behavior is exercised on the `radical` global it wraps.
    assert.equal(
      await errorMessage(session, "TypeError", "radical('x')"),
      "'radical() requires an integer'",
    );
  });
});

test("Integer.is_pseudoprime matches the is_pseudoprime global and agrees with is_prime", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(97).is_pseudoprime()"), "True");
    assert.equal(await repr(session, "(91).is_pseudoprime()"), "False");
    assert.equal(await repr(session, "(1).is_pseudoprime()"), "False");
    assert.equal(await repr(session, "(0).is_pseudoprime()"), "False");
    assert.equal(await repr(session, "(-7).is_pseudoprime()"), "False");

    assert.equal(
      await repr(session, [
        "all(n.is_pseudoprime() == is_pseudoprime(n) for n in range(-5, 500))",
      ]),
      "True",
    );
    assert.equal(
      await repr(session, [
        "[n.is_pseudoprime() == n.is_prime() for n in range(2, 500)] == "
          + "[True] * 498",
      ]),
      "True",
    );

    // A bignum prime.
    assert.equal(
      await repr(session, "(2**127 - 1).is_pseudoprime()"),
      await repr(session, "is_pseudoprime(2**127 - 1)"),
    );
    assert.equal(await repr(session, "(2**127 - 1).is_pseudoprime()"), "True");

    // Wrong-type case (on the `is_pseudoprime` global this method wraps,
    // since the method itself takes no extra argument): a non-integer is
    // simply not pseudoprime, matching `is_prime`'s convention, rather
    // than raising.
    assert.equal(await repr(session, "is_pseudoprime('x')"), "False");
    assert.equal(await repr(session, "is_pseudoprime(1.5)"), "False");
  });
});

test("Integer.next_prime_power and Integer.previous_prime_power match their globals", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(8).next_prime_power()"), "9");
    assert.equal(await repr(session, "(9).next_prime_power()"), "11");
    assert.equal(await repr(session, "(0).next_prime_power()"), "1");
    assert.equal(await repr(session, "(9).next_prime_power() > 9"), "True");

    assert.equal(await repr(session, "(9).previous_prime_power()"), "8");
    assert.equal(await repr(session, "(9).previous_prime_power() < 9"), "True");
    assert.equal(
      await errorMessage(session, "ValueError", "(1).previous_prime_power()"),
      "'no prime power less than 1'",
    );
    assert.equal(
      await errorMessage(session, "ValueError", "(-5).previous_prime_power()"),
      "'no prime power less than -5'",
    );
    // Sage.js's is_prime_power(1) currently returns True (matching Sage
    // before sage-6.6); which convention Sage.js should adopt is an open
    // question tracked in sagejs#56, and previous_prime_power(2)'s result
    // depends on it, for both the method and the global it wraps. This
    // asserts today's behavior, not an endorsement of it.
    assert.equal(await repr(session, "(2).previous_prime_power()"), "1");

    assert.equal(
      await repr(session, [
        "all(n.next_prime_power() == next_prime_power(n) and "
          + "n.previous_prime_power() == previous_prime_power(n)",
        "    for n in range(3, 200))",
      ]),
      "True",
    );

    // Bignum: the search starts from a large power of two.
    assert.equal(
      await repr(session, "(2**64).next_prime_power()"),
      await repr(session, "next_prime_power(2**64)"),
    );

    // Wrong-type case (on the globals these methods wrap, since neither
    // method takes an extra argument).
    assert.equal(
      await errorMessage(session, "TypeError", "next_prime_power('x')"),
      "'next_prime_power() requires an integer'",
    );
    assert.equal(
      await errorMessage(session, "TypeError", "previous_prime_power('x')"),
      "'previous_prime_power() requires an integer'",
    );
  });
});

test("Integer.crt matches the CRT global for coprime moduli, and rejects non-coprime ones", async () => {
  await withSage(async (session) => {
    assert.equal(await repr(session, "(17).crt(5, 23, 11)"), "247");
    assert.equal(await repr(session, "(247) % 23"), "17");
    assert.equal(await repr(session, "(247) % 11"), "5");

    assert.equal(
      await repr(session, "(17).crt(5, 23, 11) == CRT(17, 5, 23, 11)"),
      "True",
    );
    assert.equal(
      await repr(session, "(17).crt(5, 23, 11) == crt(17, 5, 23, 11)"),
      "True",
    );

    // Documented non-coprime exception, matching the CRT/CRT_list globals
    // this method shares an implementation with (unlike SageMath's own
    // `Integer.crt`, which solves some non-coprime systems too -- see the
    // method's docstring and its dedicated `sage_compatibility` note).
    assert.equal(
      await errorMessage(session, "ValueError", "(6).crt(0, 10, 10)"),
      "'CRT moduli must be coprime'",
    );

    assert.equal(
      await errorMessage(session, "TypeError", "(17).crt('x', 23, 11)"),
      "'expected an exact integer'",
    );

    // Cross-check over a range of coprime modulus pairs.
    assert.equal(
      await repr(session, [
        "all((a % 3 == a.crt(a, 3, 5) % 3) and (a % 5 == a.crt(a, 3, 5) % 5)",
        "    for a in range(15))",
      ]),
      "True",
    );

    // Bignum moduli.
    assert.equal(
      await repr(session, [
        "big = 2**61 - 1",
        "self_value = 10**30 + 3",
        "x = self_value.crt(1, big, 97)",
        "[x % big == self_value % big, x % 97 == 1]",
      ]),
      "[True, True]",
    );
  });
});

test("Integer.multiplicative_order returns ZZ's unit order, not the modular order", async () => {
  await withSage(async (session) => {
    // Sage's `Integer.multiplicative_order()` is the order of the integer
    // as a unit of the ring ZZ, not the modular order: 1 for 1, 2 for -1,
    // and +Infinity for every other integer, including 0.
    assert.equal(await repr(session, "(1).multiplicative_order()"), "1");
    assert.equal(await repr(session, "(-1).multiplicative_order()"), "2");
    assert.equal(await repr(session, "(2).multiplicative_order()"), "+Infinity");
    assert.equal(await repr(session, "(0).multiplicative_order()"), "+Infinity");
    assert.equal(await repr(session, "(-2).multiplicative_order()"), "+Infinity");

    // Boundary/negative/bignum coverage: only exactly 1 and -1 are finite.
    assert.equal(
      await repr(session, [
        "[n.multiplicative_order() for n in [-3, -2, -1, 0, 1, 2, 3]]",
      ]),
      "[+Infinity, +Infinity, 2, +Infinity, 1, +Infinity, +Infinity]",
    );
    assert.equal(
      await repr(session, "(10**40 + 1).multiplicative_order()"),
      "+Infinity",
    );

    // Must not be confused with the two-argument `multiplicative_order(x,
    // n)` global, which computes the unrelated *modular* order of x in
    // (ZZ/nZZ)^*: the method takes no modulus and the two disagree freely.
    assert.equal(await repr(session, "multiplicative_order(2, 7)"), "3");
    assert.equal(await repr(session, "(2).multiplicative_order()"), "+Infinity");
  });
});

test("number and bigint literals share the same new Integer methods", async () => {
  await withSage(async (session) => {
    assert.equal(
      await repr(session, "(10**30 + 3).lcm(6)"),
      await repr(session, "lcm(10**30 + 3, 6)"),
    );
    assert.equal(
      await repr(session, "(2**80).is_pseudoprime()"),
      await repr(session, "is_pseudoprime(2**80)"),
    );
    assert.equal(
      await repr(session, "(2**80 + 1).multiplicative_order()"),
      "+Infinity",
    );
  });
});
