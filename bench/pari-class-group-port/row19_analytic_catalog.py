"""Prepared-only analytic degree catalog for the row-19 terminal cut."""

from __future__ import annotations

import json
import sys

from .prepared_index_prime import (
    INDEX_PRIME_WORKSPACE,
    pari_prepared_index_prime_descriptors,
)
from .row19_prepared_prefix_probe import (
    DEGREE,
    INDEX_PRIMES,
    _degree_catalog,
    _integers,
    _validate,
)


def compute_row19_analytic_catalog(prepared: dict[str, object]) -> dict[str, object]:
    """Derive maximal-order residue-degree patterns from prepared data only."""
    _validate(prepared)
    matrix_m = _integers(prepared["admission_matrix_m"], 9, "embedding mantissas")
    matrix_p = _integers(prepared["admission_matrix_p"], 9, "embedding precisions")
    matrix_e = _integers(prepared["admission_matrix_e"], 9, "embedding exponents")
    table = _integers(prepared["basis_table"], 27, "basis table")
    descriptors: dict[int, list[int]] = {}
    for prime in INDEX_PRIMES:
        packed, ranks, state = [0] * 45, [0] * 3, [0] * 4
        count = pari_prepared_index_prime_descriptors(
            table,
            DEGREE,
            prime,
            1,
            matrix_m,
            matrix_p,
            matrix_e,
            [0] * INDEX_PRIME_WORKSPACE,
            packed,
            ranks,
            state,
        )
        if count != 1 or state != [0, 2, 1, 15]:
            raise ValueError("row-19 analytic index-prime descriptor changed")
        descriptors[prime] = packed[:15]
    primes = [int(value) for value in prepared["analytic_primes"]]
    catalog = _degree_catalog(
        _integers(prepared["prep_polynomial"], 4, "polynomial"),
        int(prepared["prep_index"]),
        primes,
        descriptors,
    )
    groups = catalog[7][2]
    return {
        "schema": "sagejs.pari-class-group/row19-analytic-catalog-v1",
        "primes": primes,
        "offsets": catalog[0],
        "counts": catalog[1],
        "degrees": catalog[2][:groups],
        "multiplicities": catalog[3][:groups],
        "state": catalog[7],
        "oracleDataConsumed": False,
    }


def main() -> None:
    prepared = json.load(sys.stdin)
    json.dump(
        compute_row19_analytic_catalog(prepared), sys.stdout, separators=(",", ":")
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
