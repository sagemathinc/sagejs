"""Focused regression tests for exact deficient-place certificates."""

from __future__ import annotations

from typing import Any, Mapping

import sagejs as sage
from sagejs.hyperelliptic_curves.deficiency import (
    DeficiencyResult,
    DeficiencyUnsupportedError,
    _real_root_certificate,
    _result_from_reduction,
    global_deficiency_diagnostic,
    is_deficient,
    local_deficiency,
)
from sagejs.hyperelliptic_curves.model import HyperellipticCurve


def _fixture() -> dict[str, Any]:
    # Kept in executable form because Sage.js's lightweight test runner does
    # not preload the optional JSON compatibility module.  The identical
    # checked oracle record lives in `testdata/deficiency.json`.
    return {
        "curves": [
            {
                "id": "poonen-stoll-proposition-26-t1",
                "f_coefficients_ascending": [-1, -1, 0, 0, 0, 0, -1],
                "h_coefficients_ascending": [0],
                "expectations": [
                    {"place": "infinity", "deficient": True},
                    {"place": 2, "deficient": False},
                    {"place": 3, "deficient": False},
                    {"place": 5, "deficient": False},
                ],
            },
            {
                "id": "poonen-stoll-proposition-26-t0",
                "f_coefficients_ascending": [0, -1, 0, 0, 0, 0, -1],
                "h_coefficients_ascending": [0],
                "expectations": [{"place": "infinity", "deficient": False}],
            },
            {
                "id": "poonen-stoll-proposition-27",
                "f_coefficients_ascending": [-3, 0, 99, 0, 99, 0, -3],
                "h_coefficients_ascending": [0],
                "expectations": [
                    {"place": "infinity", "deficient": False},
                    {"place": 2, "deficient": False},
                    {"place": 3, "deficient": True},
                    {"place": 5, "deficient": False},
                ],
            },
            {
                "id": "poonen-stoll-proposition-28",
                "f_coefficients_ascending": [-5920, 0, 32893, 0, 32893, 0, -5920],
                "h_coefficients_ascending": [0],
                "expectations": [
                    {"place": "infinity", "deficient": False},
                    {"place": 37, "deficient": False},
                ],
            },
            {
                "id": "odd-genus-hyperelliptic-fibre",
                "f_coefficients_ascending": [1, -1, 0, 0, 0, 0, 0, 1],
                "h_coefficients_ascending": [0],
                "expectations": [
                    {"place": "infinity", "deficient": False},
                    {"place": 2, "deficient": False},
                    {"place": 31, "deficient": False},
                ],
            },
        ]
    }


def _curve(data: Mapping[str, Any]) -> Any:
    ring = sage.PolynomialRing(sage.QQ, "x_deficiency")
    return HyperellipticCurve(
        ring(data["f_coefficients_ascending"]),
        ring(data["h_coefficients_ascending"]),
    )


def run() -> dict[str, int | bool]:
    # Independent exact topology checks include no-root definite polynomials,
    # simple roots, and repeated roots (the production curve is smooth, but
    # the Sturm helper itself remains total).
    assert _real_root_certificate([1, 0, 1])["distinct_real_roots"] == 0
    assert _real_root_certificate([-1, 0, 1])["distinct_real_roots"] == 2
    assert _real_root_certificate([0, 0, 1])["distinct_real_roots"] == 1

    fixture = _fixture()
    checks = 0
    curves: dict[str, Any] = {}
    for item in fixture["curves"]:
        curve = _curve(item)
        curves[item["id"]] = curve
        for expectation in item["expectations"]:
            result = local_deficiency(curve, expectation["place"])
            assert result.certified, (item["id"], expectation["place"], result)
            assert result.deficient is expectation["deficient"]
            assert result.witness is not None or result.obstruction is not None
            encoded = result.to_dict()
            assert encoded["deficient"] is expectation["deficient"]
            assert is_deficient(curve, expectation["place"]) is expectation["deficient"]
            checks += 1

    proposition27 = curves["poonen-stoll-proposition-27"]
    p3 = local_deficiency(proposition27, 3)
    assert p3.deficient is True
    assert "Lemma 16" in p3.theorem
    assert (
        p3.certificate["lemma16_decomposition"]["has_odd_degree_common_factor"] is False
    )

    # The bounded exact integral-x search handles the subtle 2-adic witness in
    # Proposition 27.  A genuinely inconclusive bad 2-adic model remains an
    # explicit unsupported result.
    p2_computed = local_deficiency(proposition27, 2)
    assert p2_computed.decision is False
    assert p2_computed.witness is not None
    assert p2_computed.witness["kind"] == "p_adic_point_from_integral_x"
    ring = sage.PolynomialRing(sage.QQ, "x_wild_deficiency")
    wild_unknown_curve = HyperellipticCurve(ring([3, 0, 0, 0, 0, 0, 8]))
    p2_unknown = local_deficiency(wild_unknown_curve, 2)
    assert p2_unknown.decision is None
    try:
        p2_unknown.require_decision()
        raise AssertionError("an unsupported local result returned a boolean")
    except DeficiencyUnsupportedError as error:
        assert error.result is p2_unknown

    # A cited external local certificate can be assembled without pretending
    # it was computed.  The output is the Poonen--Stoll conditional theorem,
    # not an integer or square-recognition guess.
    p2_supplied = DeficiencyResult(
        2,
        2,
        False,
        theorem="Poonen--Stoll Proposition 27, Remark 1",
        witness={
            "kind": "supplied_odd_degree_local_divisor",
            "reference": "Poonen--Stoll Proposition 27",
        },
        provenance="checked oracle fixture",
    )
    global_result = global_deficiency_diagnostic(
        proposition27,
        bad_primes=[2, 3],
        bad_primes_certificate="Poonen--Stoll Proposition 27",
        local_results=[p2_supplied, p3],
        canonical_principal_polarization=True,
    )
    assert global_result.complete
    assert global_result.deficient_places == (3,)
    assert global_result.cassels_tate_pairing_class == "odd"
    assert global_result.sha_order_shape == "twice_a_square_if_finite"

    no_polarization = global_deficiency_diagnostic(
        proposition27,
        bad_primes=[2, 3],
        bad_primes_certificate="Poonen--Stoll Proposition 27",
        local_results=[p2_supplied, p3],
        canonical_principal_polarization=False,
    )
    assert no_polarization.complete
    assert no_polarization.sha_order_shape is None
    assert no_polarization.cassels_tate_pairing_class is None

    class NonsplitNodalReduction:
        prime = 3
        curve_good_reduction = False
        reduction_type = "semistable_nodal_two_components"
        backend = "test-certificate"
        certificate = {"component_frobenius_sign": -1}

    nodal_unknown = _result_from_reduction(
        proposition27,
        3,
        NonsplitNodalReduction(),
        {"transform": "fixture"},
    )
    assert nodal_unknown is not None
    assert nodal_unknown.decision is None
    assert nodal_unknown.reason is not None
    assert "node thicknesses" in nodal_unknown.reason

    uncertified_bad_primes = global_deficiency_diagnostic(
        proposition27,
        bad_primes=[2, 3],
        local_results=[p2_supplied, p3],
        canonical_principal_polarization=True,
    )
    assert not uncertified_bad_primes.complete
    assert uncertified_bad_primes.sha_order_shape is None

    genus3 = curves["odd-genus-hyperelliptic-fibre"]
    genus3_global = global_deficiency_diagnostic(
        genus3,
        canonical_principal_polarization=True,
        sha_finite=True,
    )
    assert genus3_global.complete
    assert genus3_global.deficient_places == ()
    assert genus3_global.sha_order_shape == "square"

    finite_fields = __import__("sagejs._baselib.finite_fields", fromlist=["GF"])
    finite_ring = sage.PolynomialRing(finite_fields.GF(5), "x_finite_deficiency")
    finite_curve = HyperellipticCurve(finite_ring([1, 1, 0, 0, 0, 1]))
    try:
        local_deficiency(finite_curve, 5)
        raise AssertionError("a finite-field curve was treated as a curve over QQ")
    except TypeError:
        pass

    return {"fixture_checks": checks, "global_checks": 4, "ok": True}


if __name__ == "__main__":
    print(run())
