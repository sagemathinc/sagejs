"""Exact boundary tests for the qualification-only compact class view."""

from __future__ import annotations

from compact_class_group_view import (
    CompactClassViewError,
    CompactExactClassGroupView,
    MissingPrincipalRelationLiftError,
    NonPrincipalFactorRowError,
)


def raises(error: type[BaseException], callback: object) -> None:
    try:
        callback()  # type: ignore[operator]
    except error:
        return
    raise AssertionError("expected " + error.__name__)


# Z^2 / <(2,0),(0,2),(2,2)> = C2 x C2.  The final relation is redundant;
# (1,1,-1) is the corresponding exact relation dependency.
view = CompactExactClassGroupView(
    invariants=(2, 2),
    class_map_rows=((1, 0), (0, 1)),
    relation_rows=(((0, 2),), ((1, 2),), ((0, 2), (1, 2))),
    generator_lifts=(((0, 1),), ((1, 1),)),
    generator_order_combinations=(((0, 1),), ((1, 1),)),
    dependencies=(((0, 1), (1, 1), (2, -1)),),
)

assert view.invariants == (2, 2)
assert view.order() == 4
assert view.cardinality() == 4
assert view.factor_base_coordinates(0) == (1, 0)
assert view.factor_base_coordinates(1) == (0, 1)
assert view.coordinates((7, -3)) == (1, 1)
assert view.lift_coordinates((5, 6)) == (1, 0)
assert view.generator_order(0) == 2
assert view.generator_order(1) == 2
assert not view.is_principal((1, 0))
assert view.is_principal((4, -2))

order_witness = view.principal_witness((2, 0))
assert order_witness.relation_coefficients == ((0, 1),)
assert order_witness.verify(view.relation_rows)
assert order_witness.factored_generator(("alpha0", "alpha1", "alpha2")) == (
    ("alpha0", 1),
)

relation_witness = view.principal_witness((2, 2))
assert relation_witness.relation_coefficients == ((2, 1),)
assert relation_witness.verify(view.relation_rows)

inverse_relation_witness = view.principal_witness((-2, -2))
assert inverse_relation_witness.relation_coefficients == ((2, -1),)
assert inverse_relation_witness.verify(view.relation_rows)

explicit_witness = view.principal_witness(
    (4, -2), certified_relation_coefficients=((0, 2), (1, -1))
)
assert explicit_witness.verify(view.relation_rows)

raises(
    NonPrincipalFactorRowError,
    lambda: view.principal_witness((1, 0)),
)

# The map proves this row principal, but neither dependencies nor standard
# generator-order witnesses encode its preimage.  The boundary must not claim
# a generator until Rust returns a sparse c with c*R == target.
raises(
    MissingPrincipalRelationLiftError,
    lambda: view.principal_witness((4, -2)),
)
raises(
    CompactClassViewError,
    lambda: view.principal_witness((4, -2), certified_relation_coefficients=((0, 1),)),
)

# A replaying dependency cannot be substituted for a right inverse: it maps to
# zero, not to the requested principal factor-base row.
raises(
    CompactClassViewError,
    lambda: view.principal_witness(
        (4, -2), certified_relation_coefficients=((0, 1), (1, 1), (2, -1))
    ),
)

raises(
    CompactClassViewError,
    lambda: CompactExactClassGroupView(
        invariants=(2, 2),
        class_map_rows=((1, 0), (0, 1)),
        relation_rows=(((0, 2),), ((1, 1),)),
        generator_lifts=(((0, 1),), ((1, 1),)),
        generator_order_combinations=(((0, 1),), ((1, 1),)),
    ),
)

print("compact exact class-group view: pass")
