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
    assert certificate.proof_method() == "full-degree-projection"
    assert certificate.verification_basis_rank() == 0
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
  "full-degree projections are exact while smaller replay candidates stay nonexact",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import SparseHeckeOperator
from sagejs.modular_forms.sparse_krylov import berlekamp_massey

assert berlekamp_massey([1,2,4,8,16,32], 1009) == (1007,1)
S = SupersingularModule(389)
T = S.T(2)
candidate = T.wiedemann_certificate(1009, proof="replay")
assert candidate.is_exact()
assert candidate.proof_method() == "full-degree-projection"
assert candidate.verification_basis_rank() == 0
assert candidate.polynomial() == T.matrix().change_ring(GF(1009)).minpoly()
coefficients = candidate.coefficients()
try:
    coefficients[0] = 0
except TypeError:
    pass
else:
    raise AssertionError("certificate coefficients were mutable")

identity = SparseHeckeOperator(
    ZZ, 3, 3, [0,1,2,3], [0,1,2], [1,1,1]
)
replay_only = identity.wiedemann_certificate(1009, proof="replay")
assert replay_only.degree() == 1
assert not replay_only.is_exact()
assert replay_only.proof_method() == "independent-replay"

for operation in [
    lambda: identity.wiedemann_certificate(1009, max_verification_work=1),
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

test(
  "full-degree sparse Wiedemann and CRT prove integer characteristic polynomials",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.modular_forms import SparseHeckeOperator

rows = []
for p in [37, 67, 389]:
    S = SupersingularModule(p)
    T = S.T(2)
    certificate = T.characteristic_polynomial_certificate()
    dense = T.matrix().charpoly()
    assert certificate.is_exact()
    assert certificate.verify(T)
    assert certificate.polynomial() == dense
    assert T.characteristic_polynomial() == dense
    assert certificate.degree() == S.dimension()
    assert certificate.modulus_product() > 2*certificate.coefficient_bound()
    data = certificate.structural_data()
    assert data["algorithm"] == "hybrid-wiedemann-trace-newton-crt"
    assert data["exact"]
    assert data["matrix_vector_products"] > 0
    assert len(data["prime_records"]) > 0
    rows.append((p, S.dimension(), len(data["prime_records"]), certificate.verify(T)))

# Repeated eigenvalues make the minimal polynomial smaller than the
# characteristic polynomial.  The universal sparse trace--Newton fallback
# must recover the multiplicities without dense materialization.
identity = SparseHeckeOperator(
    ZZ, 3, 3, [0,1,2,3], [0,1,2], [1,1,1], index=2
)
identity_certificate = identity.characteristic_polynomial_certificate(
    max_prime_trials=8
)
assert identity_certificate.polynomial() == PolynomialRing(ZZ,"x")([-1,3,-3,1])
assert identity_certificate.verify(identity)
assert all(
    record[3] == "trace-newton"
    for record in identity_certificate.structural_data()["prime_records"]
)

# A nonsemisimple repeated-spectrum example exercises traces rather than an
# accidental diagonal shortcut.
jordan = SparseHeckeOperator(
    ZZ,
    4,
    4,
    [0,2,4,6,7],
    [0,1,1,2,2,3,3],
    [2,1,2,1,2,1,2],
    index=2,
)
jordan_certificate = jordan.characteristic_polynomial_certificate(
    max_prime_trials=8
)
assert jordan_certificate.polynomial() == PolynomialRing(ZZ,"x")([16,-32,24,-8,1])
assert jordan_certificate.verify(jordan)

for operation in [
    lambda: identity.characteristic_polynomial_certificate(
        max_matrix_vector_products=1
    ),
    lambda: SupersingularModule(389).T(2).characteristic_polynomial_certificate(
        max_matrix_vector_products=1
    ),
    lambda: SupersingularModule(37).T(2).characteristic_polynomial(
        algorithm="dense"
    ),
]:
    try:
        operation()
    except (ArithmeticError, MemoryError, ValueError):
        pass
    else:
        raise AssertionError("an uncertified characteristic polynomial escaped")
rows
`);
      assert.match(
        result.repr,
        /^\[\(37, 3, [1-9][0-9]*, True\), \(67, 6, [1-9][0-9]*, True\), \(389, 33, [1-9][0-9]*, True\)\]$/,
      );
    } finally {
      await session.close();
    }
  },
);

test(
  "packed CSR Krylov kernels match direct exact arithmetic and reject shapes",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(`
from sagejs.kernels.matrix.sparse_prime_field import (
    word_prime_csr_polynomial_apply,
    word_prime_csr_power_traces,
    word_prime_csr_projected_sequence,
)
from sagejs.native import kernel_uint64_buffer, kernel_uint64_zeros

kernel = word_prime_csr_projected_sequence
offsets = kernel_uint64_buffer(kernel, [0,2,4])
columns = kernel_uint64_buffer(kernel, [0,1,0,1])
values = kernel_uint64_buffer(kernel, [1,2,3,4])
left = kernel_uint64_buffer(kernel, [5,6])
right = kernel_uint64_buffer(kernel, [7,8])
sequence = kernel_uint64_zeros(kernel, 4)
workspace = kernel_uint64_zeros(kernel, 4)
assert kernel(sequence, offsets, columns, values, left, right, workspace, 2, 4, 97)
assert list(sequence) == [83,45,3,8]

polynomial = kernel_uint64_buffer(kernel, [1,2,1])
image = kernel_uint64_zeros(kernel, 2)
assert word_prime_csr_polynomial_apply(
    image, offsets, columns, values, polynomial, right, workspace, 2, 97
)
assert list(image) == [85,7]

traces = kernel_uint64_zeros(kernel, 3)
assert word_prime_csr_power_traces(
    traces, offsets, columns, values, workspace, 2, 97
)
assert list(traces) == [2,5,29]

sentinel = kernel_uint64_buffer(kernel, [91,92,93,94])
assert not kernel(
    sentinel, offsets, columns, values, left, right, workspace, 2, 3, 97
)
assert list(sentinel) == [91,92,93,94]
(tuple(sequence), tuple(image), tuple(traces))
`);
      assert.equal(result.repr, "((83, 45, 3, 8), (85, 7), (2, 5, 29))");
    } finally {
      await session.close();
    }
  },
);
