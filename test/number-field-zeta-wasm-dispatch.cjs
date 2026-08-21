"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test("materializes packed factor records in ordinary Sage.js", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
import sagejs.runtime as runtime
import sagejs.number_fields.prime_ideals as prime_ideals
from sagejs.number_fields.maximal_order import integral_equation_polynomial

R.<x> = QQ[]
K.<a> = NumberField(x^3 - x - 1)
O = K.maximal_order()
polynomial = integral_equation_polynomial(K)
data = prime_ideals._native_factor_degree_data(polynomial, [2, 3, 5, 7, 11])
records = prime_ideals._materialize_factor_degree_records(data)
[
    records,
    list(O.splitting_records(2, 12)) == records,
    K.zeta_function().coefficients(16),
]
`);
    assert.equal(
      result.repr,
      "[[{'version': 1, 'prime': 2, 'factors': [{'e': 1, 'f': 3}]}, " +
        "{'version': 1, 'prime': 3, 'factors': [{'e': 1, 'f': 3}]}, " +
        "{'version': 1, 'prime': 5, 'factors': [{'e': 1, 'f': 1}, " +
        "{'e': 1, 'f': 2}]}, {'version': 1, 'prime': 7, 'factors': " +
        "[{'e': 1, 'f': 1}, {'e': 1, 'f': 2}]}, {'version': 1, " +
        "'prime': 11, 'factors': [{'e': 1, 'f': 1}, {'e': 1, 'f': 2}]}], " +
        "True, [1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0]]",
    );
  } finally {
    await session.close();
  }
});

test("uses the exact fallback beyond a host word-prime capability", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
import sagejs.runtime as runtime
import sagejs.number_fields.prime_ideals as prime_ideals
from sagejs.number_fields.maximal_order import integral_equation_polynomial

R.<x> = QQ[]
K.<a> = NumberField(x^3 - x - 1)
polynomial = integral_equation_polynomial(K)
real_backend = runtime.flint_backend()
real_function = runtime.reflect.get(real_backend, "nfFactorDegreesBatch")
calls = []

class LimitedBackend:
    nfFactorDegreesBatchMaxPrime = 7
    def nfFactorDegreesBatch(self, coefficients, primes):
        calls.append(len(primes))
        return runtime.reflect.apply(real_function, real_backend, [coefficients, primes])

limited = LimitedBackend()
accelerated = prime_ideals._native_factor_degree_records(
    polynomial, [2, 3, 5, 7], backend_override=limited
)
unsupported = prime_ideals._native_factor_degree_records(
    polynomial, [11], backend_override=limited
)
fallback = prime_ideals._dynamic_factor_degree_record(polynomial, 11)
[
    calls,
    accelerated[-1],
    unsupported is None,
    fallback,
]
`);
    assert.equal(
      result.repr,
      "[[4], {'version': 1, 'prime': 7, 'factors': [{'e': 1, 'f': 1}, " +
        "{'e': 1, 'f': 2}]}, True, {'version': 1, 'prime': 11, " +
        "'factors': [{'e': 1, 'f': 1}, {'e': 1, 'f': 2}]}]",
    );
  } finally {
    await session.close();
  }
});

test("rejects malformed packed factor data before publication", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
import sagejs.number_fields.prime_ideals as prime_ideals

bad = {
    "degree": 3,
    "primes": [5],
    "factorCounts": [2],
    "exponents": [1, 1, 0],
    "degrees": [1, 1, 0],
}
try:
    prime_ideals._materialize_factor_degree_records(bad)
    answer = "accepted"
except ArithmeticError as error:
    answer = str(error)
answer
`);
    assert.equal(
      result.repr,
      "'packed compact splitting data has the wrong local degree'",
    );
  } finally {
    await session.close();
  }
});
