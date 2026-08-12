"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("random core APIs match CPython semantics", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "import random",
      "original_random = random.random",
      "class Draws:",
      "    def __init__(self, values): self.values = iter(values)",
      "    def __call__(self): return next(self.values)",
      "random.random = Draws([0.0, 0.1, 0.29, 0.3, 0.99])",
      "print(random.choices('abc', weights=[1,2,7], k=5))",
      "random.random = Draws([0.0, 0.1, 0.29, 0.3, 0.99])",
      "print(random.choices('abc', cum_weights=[1,3,10], k=5))",
      "values = [1,2,3,4]",
      "random.random = Draws([0.0, 0.0, 0.0])",
      "print(random.shuffle(values) is None, values)",
      "random.random = Draws([0.0, 0.0, 0.0])",
      "print(random.sample('abcd', 3))",
      "random.random = Draws([0.5])",
      "print(random.randrange(2, 10, 2))",
      "random.random = original_random",
      "random.seed(0)",
      "large = random.randint(-(10**200), 10**200)",
      "print(isinstance(large, int), -(10**200) <= large <= 10**200)",
      "print(0 <= random.getrandbits(257) < 2**257)",
      "first = random.Random(17)",
      "second = random.Random(17)",
      "print(first.random() == second.random())",
      "first.seed(23)",
      "second.seed(23)",
      "print(first.getrandbits(65) == second.getrandbits(65))",
      "draw = first.randrange(2, 20, 3)",
      "print(2 <= draw < 20 and (draw - 2) % 3 == 0)",
      "compatible = random.Random(1234)",
      "print(compatible.random())",
      "compatible.seed(1234)",
      "print(compatible.randint(512, 1024), compatible.randint(2, 100))",
      "class IndexTwo:",
      "    def __index__(self): return 2",
      "random.random = Draws([0.0, 0.0])",
      "print(random.sample(['a','b'], IndexTwo()))",
      "random.random = Draws([0.0, 0.99, 0.49])",
      "print(random.sample(['a','b'], 3, counts=[2,2]))",
      "print(random.choices([], k=0))",
      "cases = [",
      "    ('ValueError', ValueError, lambda: random.choices([1,2], [1], k=1)),",
      "    ('TypeError', TypeError, lambda: random.choices([1], [1], cum_weights=[1])),",
      "    ('ValueError', ValueError, lambda: random.choices([1,2], [0,0])),",
      "    ('ValueError', ValueError, lambda: random.choices([1,2], [1,1e309])),",
      "    ('IndexError', IndexError, lambda: random.choices([], [], k=0)),",
      "    ('TypeError', TypeError, lambda: random.choices([1], k=1.5)),",
      "    ('TypeError', TypeError, lambda: random.shuffle((1,2))),",
      "    ('TypeError', TypeError, lambda: random.sample({1,2}, 1)),",
      "    ('ValueError', ValueError, lambda: random.sample([1], -1)),",
      "    ('TypeError', TypeError, lambda: random.sample([1], 1.5)),",
      "    ('ValueError', ValueError, lambda: random.sample([1,2], 1, counts=[1])),",
      "    ('TypeError', TypeError, lambda: random.randrange(5.5)),",
      "    ('ValueError', ValueError, lambda: random.randrange(1, 5, 0)),",
      "    ('ValueError', ValueError, lambda: random.randrange(0)),",
      "]",
      "for label, expected, operation in cases:",
      "    try:",
      "        operation()",
      "    except Exception as error:",
      "        print(label, isinstance(error, expected), str(error))",
    ].join("\n"),
  );

  assert.equal(
    result.stdout.trim(),
    [
      "['a', 'b', 'b', 'c', 'c']",
      "['a', 'b', 'b', 'c', 'c']",
      "True [2, 3, 4, 1]",
      "['a', 'b', 'c']",
      "6",
      "True True",
      "True",
      "True",
      "True",
      "True",
      "0.9664535356921388",
      "963 16",
      "['a', 'b']",
      "['a', 'b', 'a']",
      "[]",
      "ValueError True The number of weights does not match the population",
      "TypeError True Cannot specify both weights and cumulative weights",
      "ValueError True Total of weights must be greater than zero",
      "ValueError True Total of weights must be finite",
      "IndexError True list index out of range",
      "TypeError True 'float' object cannot be interpreted as an integer",
      "TypeError True 'tuple' object does not support item assignment",
      "TypeError True Population must be a sequence.  For dicts or sets, use sorted(d).",
      "ValueError True Sample larger than population or is negative",
      "TypeError True 'float' object cannot be interpreted as an integer",
      "ValueError True The number of counts does not match the population",
      "TypeError True 'float' object cannot be interpreted as an integer",
      "ValueError True zero step for randrange()",
      "ValueError True empty range for randrange()",
    ].join("\n"),
  );
});

test("exact seeded interval sampling rejects without binary64 truncation", async (t) => {
  const session = await createSage({ mode: "python" });
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "import sagejs._baselib.builtins as sage_builtins",
      "class WordStream:",
      "    def __init__(self, values):",
      "        self.values = list(values)",
      "        self.index = 0",
      "    def __call__(self):",
      "        value = self.values[self.index]",
      "        self.index += 1",
      "        return value",
      "small = WordStream([7, 6, 5, 4])",
      "assert sage_builtins._sage_random_bigint_below(5, small) == 4",
      "assert small.index == 4",
      "wide = WordStream([1, 0, 20, 1, 0, 16])",
      "wide_bound = 2**64 + 17",
      "assert sage_builtins._sage_random_bigint_below(wide_bound, wide) == 2**64 + 16",
      "assert wide.index == 6",
      "unused = WordStream([])",
      "assert sage_builtins._sage_random_bigint_below(1, unused) == 0",
      "assert unused.index == 0",
      "for invalid in [WordStream([-1]), WordStream([2**32])]:",
      "    try:",
      "        sage_builtins._sage_random_bigint_below(2, invalid)",
      "    except ValueError:",
      "        pass",
      "    else:",
      "        raise AssertionError('invalid random word was accepted')",
      "try:",
      "    sage_builtins._sage_random_bigint_below(0)",
      "except ValueError:",
      "    pass",
      "else:",
      "    raise AssertionError('empty exact random interval was accepted')",
      "print('exact rejection sampling passed')",
    ].join("\n"),
  );

  assert.equal(result.stderr ?? "", "");
  assert.equal(result.stdout.trim(), "exact rejection sampling passed");
});

test("Sage random primes are seeded, uniform-candidate, and inclusive", async (t) => {
  const session = await createSage();
  t.after(() => session.close());

  const result = await session.evaluate(
    [
      "set_random_seed(2026)",
      "first_primes = [random_prime(1000) for _ in range(12)]",
      "set_random_seed(2026)",
      "second_primes = [random_prime(1000) for _ in range(12)]",
      "assert first_primes == second_primes",
      "assert first_primes == [61, 587, 491, 193, 191, 431, 521, 787, 311, 131, 17, 439]",
      "assert all(is_prime(value) and 2 <= value <= 1000 for value in first_primes)",
      "set_random_seed(2026)",
      "bits = [randint(0, 1) for _ in range(20)]",
      "assert bits == [1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0]",
      "assert any(bits[index] == bits[index + 1] for index in range(len(bits) - 1))",
      "lower = 10**40 + 10**20",
      "upper = lower + 10**25",
      "set_random_seed('wide exact interval')",
      "first_wide = [randint(lower, upper) for _ in range(8)]",
      "set_random_seed('wide exact interval')",
      "second_wide = [randint(lower, upper) for _ in range(8)]",
      "assert first_wide == second_wide",
      "assert all(lower <= value <= upper for value in first_wide)",
      "assert len(set(first_wide)) > 1",
      "assert randint(2**200, 2**200) == 2**200",
      "assert random_prime(2) == 2",
      "assert random_prime(3, lbound=3) == 3",
      "assert random_prime(17, lbound=14) == 17",
      "failures = []",
      "for operation in [",
      "    lambda: random_prime(1, lbound=-2),",
      "    lambda: random_prime(10, lbound=11),",
      "    lambda: random_prime(126, lbound=114),",
      "    lambda: randint(5, 4),",
      "]:",
      "    try:",
      "        operation()",
      "    except ValueError as error:",
      "        failures.append(str(error))",
      "    else:",
      "        raise AssertionError('invalid interval was accepted')",
      "assert failures == [",
      "    'n must be greater than or equal to 2',",
      "    'n must be at least lbound: 11',",
      "    'there are no primes between 114 and 126 (inclusive)',",
      "    'empty range for randint()',",
      "]",
      "print('public random prime semantics passed')",
    ].join("\n"),
  );

  assert.equal(result.stderr ?? "", "");
  assert.equal(result.stdout.trim(), "public random prime semantics passed");
});
