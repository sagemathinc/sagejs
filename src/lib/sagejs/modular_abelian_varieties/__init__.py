"""Exact modular abelian varieties built from integral modular symbols."""

from typing import Any

from .abelian_variety import (
    J0,
    AbelianVariety,
    AbelianVarietyHeckeOperator,
    AbelianVarietyHomology,
    AbelianVarietySerializationCertificate,
    IntegralHomologyLattice,
    ModularAbelianVariety,
    ModularAbelianVarietyMap,
)


def Hom(domain: Any, codomain: Any) -> Any:
    """Return the complete integral Hom group over QQ, computed lazily."""
    from .homspace import Hom as hom_space

    return hom_space(domain, codomain)


def End(variety: Any) -> Any:
    """Return the complete endomorphism order over QQ, computed lazily."""
    return Hom(variety, variety)


__all__ = [
    "Hom",
    "End",
    "AbelianVariety",
    "AbelianVarietyHeckeOperator",
    "AbelianVarietyHomology",
    "AbelianVarietySerializationCertificate",
    "IntegralHomologyLattice",
    "J0",
    "ModularAbelianVariety",
    "ModularAbelianVarietyMap",
]
