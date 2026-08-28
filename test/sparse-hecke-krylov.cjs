// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "sparse Wiedemann certificates match dense exact minimal polynomials",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
rows = []
for p in [37, 67, 389]:
    S = SupersingularModule(p)
    T = S.T(2)
    dense = T.matrix().change_ring(GF(1009)).minpoly()
    certificate = T.wiedemann_certificate(1009)
    assert certificate.is_exact()
    assert certificate.verification_basis_rank() == S.dimension()
    assert certificate.polynomial() == dense
    assert T.minimal_polynomial(1009) == dense
    data = certificate.structural_data()
    assert data["exact"]
    assert data["algorithm"] == "deterministic-projected-wiedemann"
    assert data["matrix_vector_products"] > 0
    rows.append((p, S.dimension(), certificate.degree(), list(dense)))
rows
`);
      assert.equal(
        result.repr,
        "[(37, 3, 3, [0, 1003, 1008, 1]), " +
          "(67, 6, 6, [1003, 1002, 27, 7, 998, 1008, 1]), " +
          "(389, 33, 33, [525, 384, 7, 50, 457, 922, 645, 84, 969, " +
          "941, 7, 865, 260, 440, 153, 339, 35, 303, 294, 697, 997, 525, " +
          "903, 67, 628, 58, 121, 109, 70, 210, 46, 957, 1008, 1])]",
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "projected candidates stay explicitly nonexact and resource limits fail closed",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms.sparse_krylov import berlekamp_massey

assert berlekamp_massey([1,2,4,8,16,32], 1009) == (1007,1)
S = SupersingularModule(389)
T = S.T(2)
candidate = T.wiedemann_certificate(1009, proof="replay")
assert not candidate.is_exact()
assert candidate.verification_basis_rank() == 0
assert candidate.polynomial() == T.matrix().change_ring(GF(1009)).minpoly()
coefficients = candidate.coefficients()
try:
    coefficients[0] = 0
except TypeError:
    pass
else:
    raise AssertionError("certificate coefficients were mutable")

for operation in [
    lambda: T.wiedemann_certificate(1009, max_verification_work=1),
    lambda: T.wiedemann_certificate(15),
    lambda: T.wiedemann_certificate(1009, proof="probable"),
    lambda: T.minimal_polynomial(1009, algorithm="dense"),
]:
    try:
        operation()
    except (ValueError, MemoryError):
        pass
    else:
        raise AssertionError("an invalid sparse Krylov request was accepted")

(candidate.degree(), candidate.structural_data()["matrix_vector_products"])
`);
      assert.match(result.repr, /^\(33, [1-9][0-9]*\)$/);
    } finally {
      await session.close();
    }
  },
);
