"""Independent SageMath oracle for the pinned q-expansion corpus."""

from __future__ import annotations

import json

from sage.all import CuspForms
from sage.all import DirichletGroup
from sage.all import Gamma0
from sage.all import ModularSymbols
from sage.all import Newforms
from sage.all import QQ
from sage.all import divisors
from sage.all import matrix
from sage.env import SAGE_VERSION


TRIVIAL_CASES = (
    ("level1-weight24", 1, 24, 12),
    ("level2-weight12", 2, 12, 12),
    ("level2-weight24-proper", 2, 24, 12),
    ("level6-weight12-composite", 6, 12, 20),
)


def coefficient_rows(forms, precision):
    return [list(form.padded_list(precision)) for form in forms]


def rational_echelon(rows, precision):
    if not rows:
        return matrix(QQ, 0, precision)
    return matrix(QQ, rows).row_space().basis_matrix()


def serialized_matrix(value):
    return [[str(entry) for entry in row] for row in value.rows()]


def ambient_matrix(level, weight, precision):
    symbols = ModularSymbols(level, weight, sign=1).cuspidal_submodule()
    basis = symbols.q_expansion_basis(precision)
    return rational_echelon(coefficient_rows(basis, precision), precision)


def formula_matrix(level, weight, precision):
    source = CuspForms(Gamma0(1), weight).q_expansion_basis(precision)
    rows = []
    for factor in divisors(level):
        for form in source:
            rows.append(
                [
                    form[index // factor] if index % factor == 0 else QQ(0)
                    for index in range(precision)
                ]
            )
    return rational_echelon(rows, precision)


def trivial_case(case_id, level, weight, precision):
    space = CuspForms(Gamma0(level), weight)
    ambient = ambient_matrix(level, weight, precision)
    formulas = formula_matrix(level, weight, precision)
    return {
        "id": case_id,
        "level": level,
        "weight": weight,
        "precision": precision,
        "sturm_bound": int(space.sturm_bound()),
        "ambient_dimension": int(ambient.nrows()),
        "formula_dimension": int(formulas.nrows()),
        "ambient_rref": serialized_matrix(ambient),
        "formula_rref": serialized_matrix(formulas),
    }


def character_case():
    character = DirichletGroup(7).gen() ** 3
    precision = 16
    space = ModularSymbols(character, 3, sign=1).cuspidal_submodule()
    basis = rational_echelon(
        coefficient_rows(space.q_expansion_basis(precision), precision),
        precision,
    )
    return {
        "id": "quadratic-character-mod7-weight3",
        "modulus": 7,
        "conrey_number": int(character.conrey_number()),
        "weight": 3,
        "precision": precision,
        "dimension": int(space.dimension()),
        "basis_rref": serialized_matrix(basis),
    }


def old_new_case():
    precision = 16
    full = ambient_matrix(22, 2, precision)
    source = ModularSymbols(11, 2, sign=1).cuspidal_submodule()
    rows = []
    for form in source.q_expansion_basis(precision):
        for factor in (1, 2):
            rows.append(
                [
                    form[index // factor] if index % factor == 0 else QQ(0)
                    for index in range(precision)
                ]
            )
    old = rational_echelon(rows, precision)
    target = ModularSymbols(22, 2, sign=1).cuspidal_submodule()
    return {
        "id": "level22-weight2-entirely-old",
        "level": 22,
        "weight": 2,
        "precision": precision,
        "ambient_rref": serialized_matrix(full),
        "old_rref": serialized_matrix(old),
        "new_dimension": int(target.new_submodule().dimension()),
    }


def coefficient_field_case():
    form = Newforms(Gamma0(23), 2, names="a")[0]
    primes = (2, 3, 5, 7, 11, 13)
    return {
        "id": "level23-weight2-quadratic-newform",
        "level": 23,
        "weight": 2,
        "field_degree": int(form.base_ring().degree()),
        "defining_polynomial": str(form.base_ring().defining_polynomial()),
        "coefficient_minpolys": {
            str(prime): str(form[prime].minpoly()) for prime in primes
        },
    }


def main():
    payload = {
        "schema": "sagejs.modular-qexp-differential-corpus.v1",
        "oracle": {"name": "SageMath", "version": SAGE_VERSION},
        "trivial_character": [trivial_case(*case) for case in TRIVIAL_CASES],
        "nontrivial_character": character_case(),
        "old_new": old_new_case(),
        "coefficient_field": coefficient_field_case(),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
