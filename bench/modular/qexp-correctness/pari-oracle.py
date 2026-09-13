"""Independent PARI/GP oracle for the pinned exact q-expansion corpus."""

from __future__ import annotations

import json

from cypari2 import Pari
from sage.all import QQ
from sage.all import matrix


TRIVIAL_CASES = (
    ("level1-weight24", 1, 24, 12),
    ("level2-weight12", 2, 12, 12),
    ("level2-weight24-eta-complete", 2, 24, 12),
    ("level6-weight12-eta-complete", 6, 12, 20),
    ("level37-weight2-proper", 37, 2, 12),
)


OLD_NEW_CASES = (
    ("level37-weight2-prime", 37, 2, 12),
    ("level121-weight2-prime-square", 121, 2, 25),
    ("level33-weight2-two-prime", 33, 2, 16),
    ("level66-weight2-several-degeneracy-sources", 66, 2, 28),
    ("level22-weight2-bad-prime-separation", 22, 2, 16),
)


pari = Pari()


def rational_echelon(rows, precision):
    if not rows:
        return matrix(QQ, 0, precision)
    return matrix(QQ, rows).row_space().basis_matrix()


def serialized_matrix(value):
    return [[str(entry) for entry in row] for row in value.rows()]


def basis_matrix(level, weight, space_flag, precision):
    space = pari.mfinit([level, weight], space_flag)
    rows = []
    for form in pari.mfbasis(space):
        coefficients = pari.mfcoefs(form, precision - 1)
        rows.append([QQ(str(value)) for value in coefficients])
    return rational_echelon(rows, precision)


def hecke_polynomials(level, weight, space_flag, indices=(2, 3)):
    space = pari.mfinit([level, weight], space_flag)
    return {
        str(index): str(pari.mfheckemat(space, index).charpoly()) for index in indices
    }


def trivial_case(case_id, level, weight, precision):
    value = basis_matrix(level, weight, 1, precision)
    return {
        "id": case_id,
        "ambient_rref": serialized_matrix(value),
    }


def old_new_case(case_id, level, weight, precision):
    return {
        "id": case_id,
        "ambient_rref": serialized_matrix(basis_matrix(level, weight, 1, precision)),
        "old_rref": serialized_matrix(basis_matrix(level, weight, 2, precision)),
        "new_rref": serialized_matrix(basis_matrix(level, weight, 0, precision)),
        "hecke_characteristic_polynomials": hecke_polynomials(level, weight, 1),
    }


def main():
    payload = {
        "schema": "sagejs.modular-qexp-pari-corpus.v1",
        "oracle": {
            "name": "PARI/GP",
            "version": ".".join(str(value) for value in pari.version()),
        },
        "trivial_character": [trivial_case(*case) for case in TRIVIAL_CASES],
        "old_new": [old_new_case(*case) for case in OLD_NEW_CASES],
        "coefficient_field_hecke": {
            "level23-weight2-quadratic-newform": hecke_polynomials(
                23, 2, 0, (2, 3, 5, 7, 11, 13)
            ),
            "level41-weight2-cubic-newform": hecke_polynomials(
                41, 2, 0, (2, 3, 5, 7, 11, 13)
            ),
        },
        "coefficient_field_basis": {
            "level23-weight2-quadratic-newform": serialized_matrix(
                basis_matrix(23, 2, 0, 12)
            ),
            "level41-weight2-cubic-newform": serialized_matrix(
                basis_matrix(41, 2, 0, 16)
            ),
        },
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
