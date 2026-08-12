"""Measure the current exact-polynomial byte transport and its replacement.

Run with:

    SAGEJS_FORBID_POLYNOMIAL_NAPI=1 ./bin/sagejs --python \
        bench/exact-polynomial-byte-regions.sage

`byte_region_copy_ms` is deliberately not a claim about the not-yet-written
polynomial parser.  On Node it isolates the generated host-to-owned-region
copy that the future resource-to-resource deserializer will borrow.  A Wasm
lowering has one host-boundary copy plus owned-region materialization and is
not measured here.  FLINT must still parse and initialize its coefficients,
but it will no longer build a stream-sized host `BigInt`, marshal that to
`fmpz`, and reconstruct the input bytes.  `current_deserialize_ms` includes
both avoidable transport reconstruction and unavoidable parse/import work;
it is not an estimate of the future parser's speedup.
"""

import time

import sagejs.runtime as runtime
from sagejs._baselib.polynomial import _exact_polynomial_payload
from sagejs.ffi.flint import (
    FlintByteRegion,
    fmpq_polynomial_deserialize,
    fmpz_polynomial_deserialize,
)


def median(samples):
    ordered = sorted(samples)
    return ordered[len(ordered) // 2]


def measure(operation, samples=5):
    operation()
    timings = []
    for _index in range(samples):
        started = time.perf_counter()
        operation()
        timings.append(1000 * (time.perf_counter() - started))
    return median(timings)


def benchmark_case(name, parent, values, parts, rational):
    coefficient_count = len(values)
    polynomial = parent(values)
    canonical_bytes = polynomial._packed_exact_polynomial()

    def pack_as_large_integer():
        _exact_polynomial_payload(parts, coefficient_count, rational)

    payload, byte_length = _exact_polynomial_payload(
        parts, coefficient_count, rational
    )

    def current_deserialize():
        resource = (
            fmpq_polynomial_deserialize(payload, byte_length)
            if rational
            else fmpz_polynomial_deserialize(payload, byte_length)
        )
        resource.close()

    def copy_to_byte_region():
        region = FlintByteRegion.from_bytes(canonical_bytes)
        region.close()

    def construct_public():
        parent(values)

    def serialize_public():
        polynomial._packed_exact_polynomial()

    result = {
        "case": name,
        "coefficients": coefficient_count,
        "canonical_bytes": len(canonical_bytes),
        "pack_bytes_as_bigint_ms": measure(pack_as_large_integer),
        "current_deserialize_ms": measure(current_deserialize),
        "byte_region_copy_ms": measure(copy_to_byte_region),
        "public_construct_ms": measure(construct_public),
        "existing_one_copy_egress_ms": measure(serialize_public),
    }
    print(result)


RZ = PolynomialRing(ZZ, "x")
dense_integer_values = [ZZ((index % 201) - 100) for index in range(100000)]
benchmark_case(
    "ZZ-dense-small-100000",
    RZ,
    dense_integer_values,
    dense_integer_values,
    False,
)

RQ = PolynomialRing(QQ, "y")
dense_rational_values = [
    QQ((index % 201) - 100) / (index % 17 + 1) for index in range(100000)
]
dense_rational_parts = []
for value in dense_rational_values:
    dense_rational_parts.append(value.numerator())
    dense_rational_parts.append(value.denominator())
benchmark_case(
    "QQ-dense-small-100000",
    RQ,
    dense_rational_values,
    dense_rational_parts,
    True,
)

skew_integer_values = [ZZ(0) for _index in range(999)] + [
    (ZZ(1) << 8000000) + 1
]
benchmark_case(
    "ZZ-skew-one-million-byte-coefficient",
    RZ,
    skew_integer_values,
    skew_integer_values,
    False,
)
