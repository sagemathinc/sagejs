"""Sage-compatible quaternionic modular-form namespace."""

from .brandt import (
    BrandtLinearOperator,
    BrandtModule,
    BrandtModuleElement,
    BrandtModule_class,
    BrandtSubspace,
    dimension_brandt_module,
)

__all__ = [
    "BrandtLinearOperator",
    "BrandtModule",
    "BrandtModuleElement",
    "BrandtModule_class",
    "BrandtSubspace",
    "dimension_brandt_module",
]
