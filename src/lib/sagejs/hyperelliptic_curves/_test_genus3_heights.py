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
    result = split_mumford_canonical_height(
        move,
        [],
        archimedean,
        complete_prime_set=True,
        prec=100,
    )
    assert close(result.value, 2)
    assert not result.rigorous
    assert "<D,E>/k" in result.normalization

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
        rigorous=False,
        provenance={"fixture": "assembly"},
    )
    result = faltings_hriljac_pairing(
        [finite], archimedean, complete_prime_set=True, prec=100
    )
    assert close(result.neron_symbol, 2 * mp.log(3) - 1)
    assert close(result.canonical_pairing, 1 - 2 * mp.log(3))
    assert result.finite_exact and not result.rigorous
    assert result.to_dict()["normalization"].startswith("([D],[E])_NT")

    regulator = regulator_from_pairing_matrix(
        [[2, 1], [1, 3]],
        prec=100,
        provenance={"fixture": "positive definite exact decimals"},
    )
    assert close(regulator.regulator, 5)
    assert regulator.rank == 2


test_vertical_correction()
test_graph_loops_and_missing_regular_model()
test_rational_section_intersection()
test_automatic_irreducible_semistable_finite_pairing()
test_split_mumford_move()
test_theta_and_archimedean_bilinearity()
test_global_assembly_and_regulator()

print("genus-3 Faltings-Hriljac reference checks passed")
