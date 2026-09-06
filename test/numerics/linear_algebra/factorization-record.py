"""One factor presentation retains independent detached result ownership."""

from sagejs.numerics.linear_algebra import cholesky, lu, qr
from sagejs.numerics.linear_algebra.factorizations import (
    CholeskyFactorization,
    LUFactorization,
    QRFactorization,
)

for operation, kind, field in (
    (lu, LUFactorization, "lower"),
    (qr, QRFactorization, "q"),
    (cholesky, CholeskyFactorization, "lower"),
):
    original = kind.to_dict
    calls = []

    def observe(self, **kwargs):
        record = original(self, **kwargs)
        calls.append(record)
        return record

    try:
        kind.to_dict = observe
        result = operation([[4.0, 1.0], [1.0, 3.0]], trace="none")
        assert result.success and result.validation.passed
        assert len(calls) == 1
        expected = original(result.factorization)
        assert result.value == expected
        assert result.to_dict()["domain_payload"]["factorization"] == expected
        # Neither the materialization source nor either public snapshot can
        # change retained evidence or the other public representation.
        calls[0][field]["entries"][0] = 999.0
        value = result.value
        value[field]["entries"][0] = 888.0
        exported = result.to_dict()
        exported["domain_payload"]["factorization"][field]["entries"][0] = 777.0
        assert result.value == expected
        assert result.to_dict()["domain_payload"]["factorization"] == expected
        assert original(result.factorization) == expected
    finally:
        kind.to_dict = original

print("factorization record passed")
