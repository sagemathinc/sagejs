"""Compatibility exports for SageMath's supersingular-module import path."""

from sagejs.modular_forms.supersingular import (
    SupersingularModule,
    dimension_supersingular_module,
    supersingular_j,
)

__all__ = [
    "SupersingularModule",
    "dimension_supersingular_module",
    "supersingular_j",
]
