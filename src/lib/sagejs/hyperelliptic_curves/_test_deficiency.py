"""Focused regression tests for exact deficient-place certificates."""

from __future__ import annotations

from typing import Any, Mapping

import sagejs as sage
from sagejs.hyperelliptic_curves.deficiency import (
    DeficiencyResult,
    DeficiencyUnsupportedError,
    ExhaustiveBadPrimesCertificate,
    GlobalDeficiencyDiagnostic,
    _real_root_certificate,
    global_deficiency_diagnostic,
    is_deficient,
    local_deficiency,
)
from sagejs.hyperelliptic_curves.model import HyperellipticCurve


def _fixture() -> dict[str, Any]:
    # The executable oracle is compared byte-semantically with the checked JSON
    # record below so neither copy can drift unnoticed.
    return {
        "schema": "sagejs.hyperelliptic-deficiency-oracles/v1",
        "references": [
            "Poonen--Stoll (1999), Proposition 26",
            "Poonen--Stoll (1999), Proposition 27 and Remark 1",
            "Poonen--Stoll (1999), Proposition 28",
        ],
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
        ],
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
    json_module = __import__("json")
    fixture_path = __file__.rsplit("/", 1)[0] + "/testdata/deficiency.json"
    with open(fixture_path, encoding="utf-8") as handle:
        disk_fixture = json_module.load(handle)
    assert disk_fixture == fixture
    drifted_fixture = json_module.loads(json_module.dumps(disk_fixture))
    drifted_fixture["curves"][0]["expectations"][0]["deficient"] = False
    assert drifted_fixture != fixture
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
            replayed = DeficiencyResult.from_dict(
                curve, json_module.loads(json_module.dumps(encoded))
            )
            assert replayed.to_dict() == encoded
            assert replayed.verify(curve)
            assert is_deficient(curve, expectation["place"]) is expectation["deficient"]
            checks += 1

    immutable = local_deficiency(curves["poonen-stoll-proposition-27"], 3)
    try:
        immutable.decision = False
        raise AssertionError("a local result accepted attribute mutation")
    except AttributeError:
        pass
    try:
        immutable.certificate["tampered"] = True
        raise AssertionError("a local certificate accepted mapping mutation")
    except TypeError:
        pass
    tampered = immutable.to_dict()
    tampered["theorem"] = "unsupported fake assertion"
    try:
        DeficiencyResult.from_dict(curves["poonen-stoll-proposition-27"], tampered)
        raise AssertionError("a tampered local theorem replayed")
    except ArithmeticError:
        pass

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

    # Supplied assertions remain visibly unverified and cannot be promoted by
    # global parity assembly, even when their curve fingerprint is copied from
    # a genuine record.
    p3_payload = p3.to_dict()
    fake_assertion = DeficiencyResult(
        3,
        2,
        False,
        theorem="unchecked external assertion",
        witness={"kind": "fake"},
        curve_model=p3_payload["curve_model"],
        curve_fingerprint=p3_payload["curve_fingerprint"],
        provenance="unverified fixture",
    )
    assert fake_assertion.assurance == "supplied_unverified"
    assert not fake_assertion.certified
    try:
        fake_assertion.require_decision()
        raise AssertionError("an unverified assertion returned a boolean")
    except DeficiencyUnsupportedError:
        pass
    try:
        global_deficiency_diagnostic(
            proposition27,
            bad_primes=[2, 3],
            local_results=[p2_computed, fake_assertion],
        )
        raise AssertionError("an unverified local assertion was promoted")
    except ArithmeticError:
        pass

    wrong_genus = DeficiencyResult(
        3,
        3,
        False,
        theorem="wrong-genus assertion",
        witness={"kind": "fake"},
        curve_model=p3_payload["curve_model"],
        curve_fingerprint=p3_payload["curve_fingerprint"],
    )
    try:
        global_deficiency_diagnostic(
            proposition27, bad_primes=[2, 3], local_results=[wrong_genus]
        )
        raise AssertionError("a wrong-genus local result was accepted")
    except ArithmeticError:
        pass

    class FakeGoodReduction:
        prime = 3
        genus = 2
        curve_good_reduction = True
        certified = True

    try:
        local_deficiency(proposition27, 3, reduction=FakeGoodReduction())
        raise AssertionError("a fake good-reduction assertion hid deficiency")
    except TypeError:
        pass

    # Merely having the right concrete class is insufficient: an attacker can
    # construct LocalReductionData directly.  Exact replay against the curve
    # rejects this forged good-reduction record before the direct Lemma 16
    # obstruction at 3 can be hidden.
    bad_reduction = __import__(
        "sagejs.hyperelliptic_curves.bad_reduction",
        fromlist=["LocalReductionData"],
    )
    forged_good = bad_reduction.LocalReductionData(
        3,
        2,
        [1, 0, 0],
        0,
        reduction_type="good",
        curve_good_reduction=True,
        jacobian_good_reduction=True,
        semistable=True,
        toric_rank=0,
        backend="forged-test-record",
        certificate={},
    )
    try:
        local_deficiency(proposition27, 3, reduction=forged_good)
        raise AssertionError("a forged concrete LocalReductionData was promoted")
    except ArithmeticError:
        pass

    cached_reduction = proposition27.local_reduction(3)
    assert (
        local_deficiency(proposition27, 3, reduction=cached_reduction).decision is True
    )
    cached_reduction.curve_good_reduction = True
    try:
        local_deficiency(proposition27, 3, reduction=cached_reduction)
        raise AssertionError("a poisoned LocalReductionData cache replayed itself")
    except ArithmeticError:
        pass
    finally:
        cached_reduction.curve_good_reduction = False

    false_certificate: Any = False
    try:
        global_deficiency_diagnostic(
            proposition27,
            bad_primes=[],
            bad_primes_certificate=false_certificate,
            canonical_principal_polarization=True,
        )
        raise AssertionError("False was accepted as an exhaustive certificate")
    except TypeError:
        pass

    uncertified_bad_primes = global_deficiency_diagnostic(
        proposition27,
        bad_primes=[2, 3],
        local_results=[p2_computed, p3],
        canonical_principal_polarization=True,
    )
    assert not uncertified_bad_primes.complete
    assert uncertified_bad_primes.sha_order_shape is None

    # A generalized model and its exact y-translate have identical completed
    # branch polynomial and local decisions, while their model fingerprints
    # remain distinct and prevent cross-model certificate reuse.
    f_value, h_value = proposition27.hyperelliptic_polynomials()
    model_ring = f_value.parent()
    shift = model_ring([1, 1])
    translated = HyperellipticCurve(
        f_value + h_value * shift - shift * shift, h_value - 2 * shift
    )
    translated_p3 = local_deficiency(translated, 3)
    assert translated_p3.decision is p3.decision
    assert (
        local_deficiency(translated, "infinity").decision
        is local_deficiency(proposition27, "infinity").decision
    )
    assert translated_p3.curve_fingerprint != p3.curve_fingerprint
    try:
        DeficiencyResult.from_dict(translated, p3.to_dict())
        raise AssertionError(
            "a certificate replayed on an isomorphic but different model"
        )
    except ArithmeticError:
        pass

    # This generalized h-model has certified global reduction, so it exercises
    # the typed exhaustive bad-primes record and global replay path.
    global_curve = HyperellipticCurve(model_ring([1, 1, 0, 0, 0, 1]), model_ring([1]))
    bad_certificate = ExhaustiveBadPrimesCertificate.compute(global_curve)
    assert bad_certificate.verify(global_curve)
    bad_roundtrip = ExhaustiveBadPrimesCertificate.from_dict(
        global_curve,
        json_module.loads(json_module.dumps(bad_certificate.to_dict())),
    )
    assert bad_roundtrip.to_dict() == bad_certificate.to_dict()
    global_result = global_deficiency_diagnostic(
        global_curve,
        bad_primes=bad_certificate.bad_primes,
        bad_primes_certificate=bad_certificate,
        canonical_principal_polarization=True,
    )
    assert global_result.complete
    assert global_result.sha_order_shape == "square_if_finite"
    assert global_result.verify(global_curve)
    try:
        global_result.complete = False
        raise AssertionError("a global result accepted attribute mutation")
    except AttributeError:
        pass
    global_replayed = GlobalDeficiencyDiagnostic.from_dict(
        global_curve, json_module.loads(json_module.dumps(global_result.to_dict()))
    )
    assert global_replayed.to_dict() == global_result.to_dict()

    # Calling the record constructor directly can serialize supplied claims,
    # but cannot manufacture a complete global theorem or pass verification.
    supplied_global = GlobalDeficiencyDiagnostic(
        2,
        global_result.local_results,
        bad_primes_complete=True,
        bad_primes_provenance="unchecked direct constructor",
        canonical_principal_polarization=True,
        sha_finite=True,
        curve_model=global_result.to_dict()["curve_model"],
        curve_fingerprint=global_result.curve_fingerprint,
        considered_bad_primes=bad_certificate.bad_primes,
        bad_primes_certificate=bad_certificate,
    )
    assert supplied_global.assurance == "supplied_unverified"
    assert not supplied_global.complete
    assert supplied_global.sha_order_shape is None
    try:
        supplied_global.verify(global_curve)
        raise AssertionError("a directly constructed global claim verified")
    except ArithmeticError:
        pass
    no_polarization = global_deficiency_diagnostic(
        global_curve,
        bad_primes=bad_certificate.bad_primes,
        bad_primes_certificate=bad_certificate,
        canonical_principal_polarization=False,
    )
    assert no_polarization.complete
    assert no_polarization.sha_order_shape is None
    assert no_polarization.cassels_tate_pairing_class is None

    bad_tamper = bad_certificate.to_dict()
    bad_tamper["bad_primes"] = []
    try:
        ExhaustiveBadPrimesCertificate.from_dict(global_curve, bad_tamper)
        raise AssertionError("a tampered exhaustive bad-primes record replayed")
    except ArithmeticError:
        pass
    try:
        bad_certificate.bad_primes = ()
        raise AssertionError("an exhaustive certificate accepted attribute mutation")
    except AttributeError:
        pass
    try:
        bad_certificate.upstream_global_reduction["bad_primes"] = []
        raise AssertionError("an exhaustive certificate accepted nested mutation")
    except TypeError:
        pass

    genus3 = curves["odd-genus-hyperelliptic-fibre"]
    genus3_global = global_deficiency_diagnostic(
        genus3,
        canonical_principal_polarization=True,
        sha_finite=True,
    )
    assert genus3_global.complete
    assert genus3_global.deficient_places == ()
    assert genus3_global.sha_order_shape == "square"
    assert genus3_global.verify(genus3)

    genus3_binding = local_deficiency(genus3, 2).to_dict()
    contradictory_genus3 = DeficiencyResult(
        2,
        3,
        True,
        theorem="unchecked odd-genus deficiency assertion",
        obstruction={"kind": "fake"},
        curve_model=genus3_binding["curve_model"],
        curve_fingerprint=genus3_binding["curve_fingerprint"],
    )
    try:
        global_deficiency_diagnostic(
            genus3,
            local_results=[contradictory_genus3],
            canonical_principal_polarization=True,
        )
        raise AssertionError("odd-genus assembly accepted a fake deficient result")
    except ArithmeticError:
        pass
    try:
        global_deficiency_diagnostic(
            genus3,
            local_results=[fake_assertion],
            canonical_principal_polarization=True,
        )
        raise AssertionError(
            "odd-genus assembly accepted a contradictory foreign result"
        )
    except ArithmeticError:
        pass

    finite_fields = __import__("sagejs._baselib.finite_fields", fromlist=["GF"])
    finite_ring = sage.PolynomialRing(finite_fields.GF(5), "x_finite_deficiency")
    finite_curve = HyperellipticCurve(finite_ring([1, 1, 0, 0, 0, 1]))
    try:
        local_deficiency(finite_curve, 5)
        raise AssertionError("a finite-field curve was treated as a curve over QQ")
    except TypeError:
        pass

    return {"fixture_checks": checks, "global_checks": 11, "ok": True}


if __name__ == "__main__":
    print(run())
