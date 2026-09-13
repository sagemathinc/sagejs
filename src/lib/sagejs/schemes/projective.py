"""Projective closure without a Singular dependency."""

from __future__ import annotations

from typing import Any


def _scheme_api() -> Any:
    return __import__("sagejs._baselib.schemes", fromlist=["ProjectiveSpace"])


def _fresh_name(names: list[str], requested: str) -> str:
    if not isinstance(requested, str) or not requested:
        raise TypeError("the homogenizing coordinate name must be nonempty text")
    candidate = requested
    index = 0
    while candidate in names:
        index += 1
        candidate = requested + str(index)
    return candidate


def projective_closure(
    scheme: Any,
    name: str = "h",
    proof: Any = None,
) -> Any:
    """Return the closure from generator homogenization plus exact saturation."""
    ambient = scheme.ambient_space()
    source_ring = ambient.coordinate_ring()
    source_names = list(source_ring.variable_names())
    homogeneous_name = _fresh_name(source_names, name)
    target = _scheme_api().ProjectiveSpace(
        ambient.base_ring(),
        ambient.dimension(),
        names=source_names + [homogeneous_name],
    )
    target_ring = target.coordinate_ring()
    h = target_ring.gen(target_ring.ngens() - 1)
    equations = [
        equation.homogenize(h, target_ring)
        for equation in scheme.defining_ideal(proof).gens()
    ]
    ideal = target_ring.ideal(equations).saturation(target_ring.ideal(h), proof=proof)
    return target.subscheme(ideal)
