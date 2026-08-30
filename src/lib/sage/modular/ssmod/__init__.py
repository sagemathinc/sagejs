"""Sage-compatible supersingular-module namespace."""

from .ssmod import (
    SupersingularModule,
    dimension_supersingular_module,
    supersingular_j,
)

__all__ = [
    "SupersingularModule",
    "dimension_supersingular_module",
    "supersingular_j",
]
