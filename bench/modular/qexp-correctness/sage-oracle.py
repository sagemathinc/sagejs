"""Independent SageMath oracle for the pinned q-expansion corpus."""

from __future__ import annotations

import json

from sage.all import CuspForms
from sage.all import DirichletGroup
from sage.all import Gamma0
from sage.all import ModularSymbols
from sage.all import Newforms
from sage.all import PowerSeriesRing
from sage.all import QQ
from sage.all import ZZ
from sage.all import divisors
from sage.all import matrix
from sage.env import SAGE_VERSION
from sage.modular.etaproducts import qexp_eta


TRIVIAL_CASES = (
    ("level1-weight24", 1, 24, 12),
    ("level2-weight12", 2, 12, 12),
    ("level2-weight24-eta-complete", 2, 24, 12),
    ("level6-weight12-eta-complete", 6, 12, 20),
    ("level37-weight2-proper", 37, 2, 12),
)


# Fixed theorem-certified eta products which enlarge the level-one oldform
# family in the public formula registry.  SageMath supplies the independent
# Euler product below; Magma independently supplies the ambient cusp space.
ETA_PRODUCTS = {
    "level2-weight24-eta-complete": (((1, 24), (2, 24)),),
    "level6-weight12-eta-complete": (
        ((2, 12), (6, 12)),
        ((1, 1), (2, 7), (3, 5), (6, 11)),
        ((1, 2), (2, 2), (3, 10), (6, 10)),
        ((1, 5), (2, 11), (3, 1), (6, 7)),
        ((1, 10), (2, 10), (3, 2), (6, 2)),
    ),
}


OLD_NEW_CASES = (
    ("level37-weight2-prime", 37, 2, 12),
    ("level121-weight2-prime-square", 121, 2, 25),
    ("level33-weight2-two-prime", 33, 2, 16),
    ("level66-weight2-several-degeneracy-sources", 66, 2, 28),
    ("level22-weight2-bad-prime-separation", 22, 2, 16),
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


def eta_product_coefficients(exponents, precision):
    ring = PowerSeriesRing(ZZ, "q", default_prec=precision)
    q = ring.gen()
    eta_unit = qexp_eta(ring, precision)
    shift = sum(divisor * exponent for divisor, exponent in exponents) // 24
    value = q**shift
    for divisor, exponent in exponents:
        value *= eta_unit(q**divisor) ** exponent
    return list(value.add_bigoh(precision).padded_list(precision))


def formula_matrix(case_id, level, weight, precision):
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
    for exponents in ETA_PRODUCTS.get(case_id, ()):
        rows.append(eta_product_coefficients(exponents, precision))
    return rational_echelon(rows, precision)


def trivial_case(case_id, level, weight, precision):
    space = CuspForms(Gamma0(level), weight)
    ambient = ambient_matrix(level, weight, precision)
    formulas = formula_matrix(case_id, level, weight, precision)
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


def old_matrix(level, weight, precision):
    rows = []
    for prime, _exponent in ZZ(level).factor():
        source = ModularSymbols(level // prime, weight, sign=1).cuspidal_submodule()
        for form in source.q_expansion_basis(precision):
            for factor in (1, int(prime)):
                rows.append(
                    [
                        form[index // factor] if index % factor == 0 else QQ(0)
                        for index in range(precision)
                    ]
                )
    return rational_echelon(rows, precision)


def old_new_case(case_id, level, weight, precision):
    target = ModularSymbols(level, weight, sign=1).cuspidal_submodule()
    full = rational_echelon(
        coefficient_rows(target.q_expansion_basis(precision), precision),
        precision,
    )
    old = old_matrix(level, weight, precision)
    new = target.new_submodule()
    new_matrix = rational_echelon(
        coefficient_rows(new.q_expansion_basis(precision), precision),
        precision,
    )
    return {
        "id": case_id,
        "level": level,
        "weight": weight,
        "precision": precision,
        "sturm_bound": int(CuspForms(Gamma0(level), weight).sturm_bound()),
        "ambient_rref": serialized_matrix(full),
        "old_rref": serialized_matrix(old),
        "new_rref": serialized_matrix(new_matrix),
        "hecke_characteristic_polynomials": {
            str(index): str(target.hecke_matrix(index).charpoly()) for index in (2, 3)
        },
    }


def coefficient_field_case(case_id, level, name, precision):
    form = Newforms(Gamma0(level), 2, names=name)[0]
    symbols = ModularSymbols(level, 2, sign=1).cuspidal_submodule().new_submodule()
    basis = rational_echelon(
        coefficient_rows(symbols.q_expansion_basis(precision), precision),
        precision,
    )
    primes = (2, 3, 5, 7, 11, 13)
    return {
        "id": case_id,
        "level": level,
        "weight": 2,
        "precision": precision,
        "sturm_bound": int(CuspForms(Gamma0(level), 2).sturm_bound()),
        "field_degree": int(form.base_ring().degree()),
        "defining_polynomial": str(form.base_ring().defining_polynomial()),
        "basis_rref": serialized_matrix(basis),
        "coefficient_minpolys": {
            str(prime): str(form[prime].minpoly()) for prime in primes
        },
    }


def main():
    payload = {
        "schema": "sagejs.modular-qexp-differential-corpus.v2",
        "oracle": {"name": "SageMath", "version": SAGE_VERSION},
        "trivial_character": [trivial_case(*case) for case in TRIVIAL_CASES],
        "nontrivial_character": character_case(),
        "old_new": [old_new_case(*case) for case in OLD_NEW_CASES],
        "coefficient_field": coefficient_field_case(
            "level23-weight2-quadratic-newform", 23, "a", 12
        ),
        "higher_coefficient_field": coefficient_field_case(
            "level41-weight2-cubic-newform", 41, "b", 16
        ),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
