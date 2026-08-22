"""Focused internal checks for the genus-3 Faltings--Hriljac reference layer."""

from typing import Any

import sagejs as sage
from mpmath import mp

from sagejs.hyperelliptic_curves.genus3_heights import (
    Genus3HeightCapabilityError,
    archimedean_green_pairing,
    faltings_hriljac_pairing,
    genus3_theta,
    move_split_mumford_divisor,
    normalize_abel_jacobi_coordinates,
    pairing_matrix_from_heights,
    rational_section_intersection,
    regular_model_from_local_reduction,
    regular_model_from_semistable_graph,
    regulator_from_pairing_matrix,
    smooth_identity_finite_pairing,
    split_mumford_canonical_height,
    split_mumford_archimedean_pairing,
    split_mumford_candidate_primes,
    split_mumford_points,
    supplied_archimedean_pairing,
)
from sagejs.hyperelliptic_curves.model import HyperellipticCurve

heights_module = __import__(
    "sagejs.hyperelliptic_curves.genus3_heights",
    fromlist=["SplitMumfordFinitePlan"],
)


def close(left: Any, right: Any, tolerance: str = "1e-13") -> bool:
    return abs(left - right) < mp.mpf(tolerance)


def test_vertical_correction():
    first = regular_model_from_semistable_graph(
        5,
        2,
        [(0, 1)],
        identity_component=0,
        graph_certified=True,
        provenance={"fixture": "one-node two-component fibre"},
    )
    second = regular_model_from_semistable_graph(
        5,
        2,
        [(0, 1)],
        identity_component=1,
        graph_certified=True,
        provenance={"fixture": "same fibre, other normalization"},
    )
    left = [1, -1]
    right = [1, -1]
    assert first.vertical_correction(left, right) == 1
    assert second.vertical_correction(left, right) == 1
    assert first.vertical_coefficients(left) == (0, -1)
    assert second.vertical_coefficients(left) == (1, 0)
    local = first.local_symbol(
        left,
        right,
        sage.QQ(3) / 2,
        horizontal_certificate={"fixture": "exact horizontal length"},
    )
    assert local.coefficient == sage.QQ(5) / 2
    assert local.to_dict()["vertical_correction"] == "1"
    assert not first.model_certified and not local.model_certified
    try:
        regular_model_from_semistable_graph(
            5,
            2,
            [(0, 1)],
            graph_certified=True,
            provenance={"fixture": "wrong sign"},
        ).__class__(
            5,
            [[1, -1], [-1, 1]],
            [1, 1],
            identity_component=0,
            model_certified=True,
            provenance={"fixture": "tampered positive Laplacian"},
        )
    except ValueError as error:
        assert "self-intersections" in str(error) or "nonnegative" in str(error)
    else:
        raise AssertionError("a positive component Laplacian was accepted")


def test_graph_loops_and_missing_regular_model():
    loop = regular_model_from_semistable_graph(
        7,
        1,
        [(0, 0)],
        graph_certified=True,
        provenance={"fixture": "integral nodal fibre"},
    )
    assert loop.vertical_correction([0], [0]) == 0

    class Reduction:
        prime = 7
        genus = 3
        curve_good_reduction = False
        semistable = True
        reduction_type = "semistable_split_cluster"
        certificate = {"cluster_picture": {"roots": [0, 1]}}

    try:
        regular_model_from_local_reduction(Reduction())
    except Genus3HeightCapabilityError as error:
        assert error.diagnostics["cluster_certificate_available"]
        assert "intersection matrix" in error.diagnostics["needs"][0]
    else:
        raise AssertionError("a cluster picture was mistaken for a regular model")


def test_rational_section_intersection():
    ring = sage.PolynomialRing(sage.QQ, "x_height_sections")
    x_value = ring.gen()
    curve = HyperellipticCurve(x_value**7 - 724 * x_value + 1)
    assert rational_section_intersection(curve, (0, 1), (3, 4), 3) == 1
    assert rational_section_intersection(curve, (0, 1), (3, 4), 5) == 0


def test_automatic_irreducible_semistable_finite_pairing():
    ring = sage.PolynomialRing(sage.QQ, "x_height_semistable")
    x_value = ring.gen()
    curve = HyperellipticCurve(
        (x_value**2 - 1) ** 2 * (x_value**3 + x_value + 1) + 19 * x_value
    )
    reduction = curve.local_reduction(19)
    assert reduction.reduction_type == "semistable_nodal"
    pairing = smooth_identity_finite_pairing(
        curve,
        [(1, (0, 1))],
        [(1, (0, -1))],
        reduction,
        left_infinity_multiplicity=-1,
        right_infinity_multiplicity=-1,
    )
    assert pairing.coefficient == 0
    witness = pairing.certificate["identity_component_witness"]
    assert witness["certified_irreducible_nodal_fibre"]

    class ForgedReduction:
        prime = 19
        genus = 3
        certified = True
        curve_good_reduction = False
        semistable = True
        reduction_type = "semistable_split_cluster"

    try:
        smooth_identity_finite_pairing(
            curve,
            [(1, (0, 1))],
            [(1, (0, -1))],
            ForgedReduction(),
            left_infinity_multiplicity=-1,
            right_infinity_multiplicity=-1,
            identity_component_witness={
                "all_sections_on_identity_component": True,
                "model_certificate": {"asserted": True},
            },
        )
    except Genus3HeightCapabilityError as error:
        assert "typed LocalReductionData" in str(error)
    else:
        raise AssertionError("a forged reducible component witness was accepted")


def test_split_mumford_move():
    ring = sage.PolynomialRing(sage.QQ, "x_height_move")
    x_value = ring.gen()
    curve = HyperellipticCurve(x_value**7 - 63 * x_value**2 + 62 * x_value + 1)
    jacobian = curve.jacobian()
    u_value = x_value * (x_value - 1) * (x_value - 2)
    divisor = jacobian([u_value, ring(1)])
    points = split_mumford_points(divisor)
    assert tuple(point.xy()[0] for point in points) == (0, 1, 2)
    move = move_split_mumford_divisor(divisor, moving_x=4)
    assert move.degree == 3
    assert move.negative_class_multiple == 2
    assert move.height_scale == sage.QQ(1) / 2
    assert tuple(point.xy()[1] for point in move.moving_fibre) == (125, -125)
    assert sum(term[0] for term in move.right_affine_terms) == 0
    support = split_mumford_candidate_primes(move)
    assert support.complete and 2 in support.primes and 3 in support.primes

    archimedean = supplied_archimedean_pairing(
        4,
        prec=100,
        rigorous=False,
        provenance={"fixture": "normalization only"},
    )
    assert not archimedean.rigorous and not archimedean.refinement_stable
    try:
        split_mumford_canonical_height(
            move,
            [],
            archimedean,
            complete_prime_set=True,
            prec=100,
        )
    except Genus3HeightCapabilityError as error:
        assert not error.diagnostics["complete_prime_set"]
    else:
        raise AssertionError("a completeness boolean promoted an unchecked height")

    degree_two = move_split_mumford_divisor(
        jacobian([x_value * (x_value - 1), ring(1)]), moving_x=4
    )
    assert not degree_two.automatic_archimedean_supported
    try:
        split_mumford_archimedean_pairing(degree_two)
    except Genus3HeightCapabilityError as error:
        assert error.diagnostics["mumford_degree"] == 2
        assert "nonspecial" in error.diagnostics["needs"][0]
    else:
        raise AssertionError("a special theta representative was accepted")

    # Internal fixture tokens let this focused test isolate composability from
    # the local-reduction algorithms.  Production callers cannot create a
    # complete plan through the public constructors without replaying the
    # curve and divisor support.
    def certified_pairing(active_move: Any, prime: int = 3):
        curve_key = heights_module._curve_key(active_move.curve)
        divisor_key = heights_module._divisor_pair_key(
            active_move.left_affine_terms,
            active_move.right_affine_terms,
            -active_move.degree,
            0,
        )
        return heights_module.FinitePlacePairing(
            prime,
            horizontal_intersection=0,
            vertical_correction=0,
            left_components=(0,),
            right_components=(0,),
            model_certified=True,
            certificate={
                "fixture": "same-prime exact-binding attack",
                "divisor_pair_key": divisor_key,
            },
            _verification=heights_module._AutomaticFiniteVerification(
                curve_key,
                divisor_key,
                (prime, "internal fixture"),
            ),
        )

    def complete_plan(active_move: Any, pairings: Any):
        curve_key = heights_module._curve_key(active_move.curve)
        divisor_key = heights_module._divisor_pair_key(
            active_move.left_affine_terms,
            active_move.right_affine_terms,
            -active_move.degree,
            0,
        )
        pairings = tuple(pairings)
        support = heights_module.SplitMumfordCandidateSupport(
            tuple(pairing.prime for pairing in pairings),
            sources=(),
            factor_work_bits=0,
            max_factor_bits=512,
            _verification=heights_module._CandidateSupportVerification(
                curve_key, divisor_key
            ),
        )
        return heights_module.SplitMumfordFinitePlan(
            support,
            pairings,
            (),
            _verification=heights_module._FinitePlanVerification(
                curve_key,
                divisor_key,
                heights_module._move_key(active_move),
            ),
        )

    conjugate_move = move_split_mumford_divisor(
        jacobian([u_value, ring(-1)]), moving_x=4
    )
    finite = certified_pairing(move)
    conjugate_finite = certified_pairing(conjugate_move)
    plan = complete_plan(move, (finite,))
    conjugate_plan = complete_plan(conjugate_move, (conjugate_finite,))
    assert plan.complete and plan.belongs_to(move)
    assert not plan.belongs_to(conjugate_move)
    bound_archimedean = heights_module.ArchimedeanPairing(
        4,
        precision=100,
        refinement_stable=True,
        rigorous=False,
        algorithm="internal move-binding fixture",
        certificate={"fixture": "move binding"},
        _verification=heights_module._AutomaticArchimedeanVerification(
            100,
            "internal fixture",
            curve_key=heights_module._curve_key(move.curve),
            move_key=heights_module._move_key(move),
        ),
    )
    bound_result = split_mumford_canonical_height(
        move,
        (finite,),
        bound_archimedean,
        complete_prime_set=True,
        prec=100,
        finite_plan=plan,
    )
    assert bound_result.archimedean_move_verified
    assert bound_result.archimedean_refinement_stable
    try:
        faltings_hriljac_pairing(
            (conjugate_finite,),
            bound_archimedean,
            complete_prime_set=True,
            prec=100,
            finite_plan=plan,
        )
    except Genus3HeightCapabilityError as error:
        assert "exact pairings" in str(error)
        assert error.diagnostics["supplied_primes"] == (3,)
        assert error.diagnostics["planned_primes"] == (3,)
        assert error.diagnostics["same_prime_objects"] == ((3, False),)
    else:
        raise AssertionError("a same-prime pairing from another move was accepted")
    try:
        split_mumford_canonical_height(
            conjugate_move,
            (finite,),
            bound_archimedean,
            complete_prime_set=True,
            prec=100,
            finite_plan=plan,
        )
    except Genus3HeightCapabilityError as error:
        assert "finite plan" in str(error)
    else:
        raise AssertionError("a finite plan certified a different Mumford move")
    try:
        split_mumford_canonical_height(
            conjugate_move,
            (conjugate_finite,),
            bound_archimedean,
            complete_prime_set=True,
            prec=100,
            finite_plan=conjugate_plan,
        )
    except Genus3HeightCapabilityError as error:
        assert "archimedean pairing" in str(error)
    else:
        raise AssertionError("an automatic real symbol certified a different move")
    conditional_result = split_mumford_canonical_height(
        conjugate_move,
        (conjugate_finite,),
        archimedean,
        complete_prime_set=True,
        prec=100,
        finite_plan=conjugate_plan,
    )
    assert not conditional_result.archimedean_move_verified
    assert not conditional_result.archimedean_refinement_stable


def test_theta_and_archimedean_bilinearity():
    tau = [
        [("0", "1"), ("0", "0"), ("0", "0")],
        [("0", "0"), ("0", "1.2"), ("0", "0")],
        [("0", "0"), ("0", "0"), ("0", "1.4")],
    ]
    z_value = [("0.17", "0.03"), ("-0.11", "0.02"), ("0.07", "-0.01")]
    first = genus3_theta(z_value, tau, prec=80, radius=4)
    translated = genus3_theta(
        [("1.17", "0.03"), z_value[1], z_value[2]], tau, prec=80, radius=4
    )
    assert first.refinement_stable and translated.refinement_stable
    assert close(abs(first.value), abs(translated.value), "1e-20")

    d_terms = [
        (1, [("0.13", "0.01"), ("0", "0.02"), ("-0.03", "0.01")]),
        (-1, [("-0.07", "0.02"), ("0.04", "-0.01"), ("0", "0.05")]),
    ]
    e1_sum = [("0.21", "0.02"), ("-0.08", "0.01"), ("0", "0.03")]
    e2_sum = [("-0.16", "0.01"), ("0.05", "0.02"), ("-0.02", "0.01")]
    pairing = archimedean_green_pairing(
        d_terms, e1_sum, e2_sum, tau, prec=80, theta_radius=4
    )
    doubled = archimedean_green_pairing(
        [(2 * multiplicity, point) for multiplicity, point in d_terms],
        e1_sum,
        e2_sum,
        tau,
        prec=80,
        theta_radius=4,
    )
    assert close(doubled.value, 2 * pairing.value, "1e-14")
    assert pairing.refinement_stable and not pairing.rigorous

    lattice_shifted = [
        (1, [("1.13", "0.01"), ("0", "0.02"), ("-0.03", "0.01")]),
        d_terms[1],
    ]
    shifted_pairing = archimedean_green_pairing(
        lattice_shifted,
        e1_sum,
        e2_sum,
        tau,
        prec=80,
        theta_radius=4,
    )
    assert close(shifted_pairing.value, pairing.value, "1e-14")


def test_abel_coordinate_basis_normalization():
    full_periods = [
        [("2", "0"), ("0", "0"), ("0", "0"), ("0", "2"), ("0", "0"), ("0", "0")],
        [("0", "0"), ("3", "0"), ("0", "0"), ("0", "0"), ("0", "3.6"), ("0", "0")],
        [("0", "0"), ("0", "0"), ("5", "0"), ("0", "0"), ("0", "0"), ("0", "7")],
    ]
    raw = [("0.34", "0.06"), ("-0.33", "0.06"), ("0.35", "-0.05")]
    expected = [("0.17", "0.03"), ("-0.11", "0.02"), ("0.07", "-0.01")]
    normalized = normalize_abel_jacobi_coordinates(raw, full_periods, prec=100)
    for actual, target in zip(normalized, expected):
        assert close(mp.mpf(actual[0]), mp.mpf(target[0]), "1e-25")
        assert close(mp.mpf(actual[1]), mp.mpf(target[1]), "1e-25")

    # Apply the same unimodular model-differential basis change to A, B, and
    # the raw integral.  A^-1*w, hence the theta coordinate, must not change.
    changed_periods = [
        [("2", "0"), ("3", "0"), ("0", "0"), ("0", "2"), ("0", "3.6"), ("0", "0")],
        [("0", "0"), ("3", "0"), ("5", "0"), ("0", "0"), ("0", "3.6"), ("0", "7")],
        full_periods[2],
    ]
    changed_raw = [("0.01", "0.12"), ("0.02", "0.01"), raw[2]]
    changed = normalize_abel_jacobi_coordinates(changed_raw, changed_periods, prec=100)
    for left, right in zip(normalized, changed):
        assert close(mp.mpf(left[0]), mp.mpf(right[0]), "1e-25")
        assert close(mp.mpf(left[1]), mp.mpf(right[1]), "1e-25")


def test_real_period_abel_theta_integration():
    periods = __import__(
        "sagejs.hyperelliptic_curves.periods",
        fromlist=["abel_jacobi", "real_period"],
    )
    ring = sage.PolynomialRing(sage.QQ, "x_height_period_integration")
    x_value = ring.gen()
    f_value = (
        x_value + x_value**2 - 2 * x_value**4 - x_value**5 + x_value**6 + x_value**7
    )
    curve = HyperellipticCurve(f_value, 1 + x_value**2)
    period_result = periods.real_period(curve, prec=64)
    raw_result = periods.abel_jacobi(
        curve,
        curve((0, 0)),
        period_result=period_result,
        basepoint="infinity",
        prec=64,
    )
    normalized = normalize_abel_jacobi_coordinates(
        raw_result.vector_pairs(),
        period_result.period_matrix_pairs(),
        prec=64,
    )
    theta = genus3_theta(
        normalized,
        period_result.siegel_matrix_pairs(),
        prec=64,
        radius=6,
    )
    assert raw_result.verify()["verified"]
    assert theta.refinement_stable
    assert normalized != raw_result.vector_pairs()


def test_global_assembly_and_regulator():
    model = regular_model_from_semistable_graph(
        3,
        2,
        [(0, 1)],
        graph_certified=True,
        provenance={"fixture": "assembly"},
    )
    finite = model.local_symbol(
        [1, -1],
        [1, -1],
        1,
        horizontal_certificate={"fixture": "one"},
    )
    archimedean = supplied_archimedean_pairing(
        -1,
        prec=100,
        rigorous=True,
        provenance={"fixture": "assembly"},
    )
    assert archimedean.rigorous_claimed and not archimedean.rigorous
    try:
        supplied_archimedean_pairing(
            "inf",
            prec=100,
            rigorous=True,
            provenance={"fixture": "nonfinite tamper"},
        )
    except ValueError as error:
        assert "finite" in str(error)
    else:
        raise AssertionError("a nonfinite archimedean value was accepted")
    result = faltings_hriljac_pairing(
        [finite], archimedean, complete_prime_set=True, prec=100
    )
    assert close(result.neron_symbol, 2 * mp.log(3) - 1)
    assert close(result.canonical_pairing, 1 - 2 * mp.log(3))
    assert result.finite_exact and not result.rigorous
    assert not result.complete_prime_set and result.complete_prime_set_claimed
    assert not result.finite_models_certified
    assert result.to_dict()["normalization"].startswith("([D],[E])_NT")
    try:
        faltings_hriljac_pairing(
            [finite], archimedean, complete_prime_set=True, prec=101
        )
    except Genus3HeightCapabilityError as error:
        assert error.diagnostics["archimedean_precision_bits"] == 100
    else:
        raise AssertionError("an under-precision archimedean value was accepted")

    regulator = regulator_from_pairing_matrix(
        [[2, 1], [1, 3]],
        prec=100,
        provenance={"fixture": "positive definite exact decimals"},
    )
    assert close(regulator.regulator, 5)
    assert regulator.rank == 2

    class FormalPoint:
        def __init__(self, left: int, right: int) -> None:
            self.left = left
            self.right = right

        def __add__(self, other: Any):
            return FormalPoint(self.left + other.left, self.right + other.right)

    class HeightResult:
        def __init__(self, value: int) -> None:
            self.value = value

        def to_dict(self):
            return {"fixture": "result-object", "value": str(self.value)}

    def height(point: FormalPoint):
        return HeightResult(
            2 * point.left * point.left
            + 2 * point.left * point.right
            + 3 * point.right * point.right
        )

    public_adapter = pairing_matrix_from_heights(
        [FormalPoint(1, 0), FormalPoint(0, 1)], height, prec=100
    )
    assert close(public_adapter.regulator, 5)
    assert public_adapter.input_completeness == "not_verified_complete"
    assert (
        public_adapter.provenance["height_evaluations"][0]["provenance"]["fixture"]
        == "result-object"
    )


test_vertical_correction()
test_graph_loops_and_missing_regular_model()
test_rational_section_intersection()
test_automatic_irreducible_semistable_finite_pairing()
test_split_mumford_move()
test_theta_and_archimedean_bilinearity()
test_abel_coordinate_basis_normalization()
test_real_period_abel_theta_integration()
test_global_assembly_and_regulator()

print("genus-3 Faltings-Hriljac reference checks passed")
