"""Measure direct exact-polynomial byte-region ingress.

Run with:

    SAGEJS_FORBID_POLYNOMIAL_NAPI=1 ./bin/sagejs --python \
        bench/exact-polynomial-byte-regions.sage

`byte_region_copy_ms` isolates the generated host-to-owned-region copy.
`borrowed_parse_ms` reuses that region and measures FLINT parse/import into an
independent owned polynomial. `copy_and_parse_ms` records the complete ingress
boundary used by public construction. No measurement builds a stream-sized
host `BigInt` or marshals the canonical bytes through `fmpz`.
"""

import time

from sagejs.ffi.flint import (
    FlintByteRegion,
    fmpq_polynomial_from_byte_region,
    fmpz_polynomial_from_byte_region,
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


def benchmark_case(name, parent, values, rational):
    coefficient_count = len(values)
    polynomial = parent(values)
    canonical_bytes = polynomial._packed_exact_polynomial()

    region = FlintByteRegion.from_bytes(canonical_bytes)

    def parse_region():
        resource = (
            fmpq_polynomial_from_byte_region(region, 0, len(canonical_bytes))
            if rational
            else fmpz_polynomial_from_byte_region(region, 0, len(canonical_bytes))
        )
        resource.close()

    def copy_to_byte_region():
        copied = FlintByteRegion.from_bytes(canonical_bytes)
        copied.close()

    def copy_and_parse():
        copied = FlintByteRegion.from_bytes(canonical_bytes)
        try:
            resource = (
                fmpq_polynomial_from_byte_region(copied, 0, len(canonical_bytes))
                if rational
                else fmpz_polynomial_from_byte_region(
                    copied, 0, len(canonical_bytes)
                )
            )
            resource.close()
        finally:
            copied.close()

    def construct_public():
        parent(values)

    def serialize_public():
        polynomial._packed_exact_polynomial()

    result = {
        "case": name,
        "coefficients": coefficient_count,
        "canonical_bytes": len(canonical_bytes),
        "byte_region_copy_ms": measure(copy_to_byte_region),
        "borrowed_parse_ms": measure(parse_region),
        "copy_and_parse_ms": measure(copy_and_parse),
        "public_construct_ms": measure(construct_public),
        "existing_one_copy_egress_ms": measure(serialize_public),
    }
    region.close()
    print(result)


RZ = PolynomialRing(ZZ, "x")
dense_integer_values = [ZZ((index % 201) - 100) for index in range(100000)]
benchmark_case(
    "ZZ-dense-small-100000",
    RZ,
    dense_integer_values,
    False,
)

RQ = PolynomialRing(QQ, "y")
dense_rational_values = [
    QQ((index % 201) - 100) / (index % 17 + 1) for index in range(100000)
]
benchmark_case(
    "QQ-dense-small-100000",
    RQ,
    dense_rational_values,
    True,
)

skew_integer_values = [ZZ(0) for _index in range(999)] + [
    (ZZ(1) << 8000000) + 1
]
benchmark_case(
    "ZZ-skew-one-million-byte-coefficient",
    RZ,
    skew_integer_values,
    False,
)
