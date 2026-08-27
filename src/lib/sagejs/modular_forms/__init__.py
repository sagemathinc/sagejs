"""Sparse modular forms built from finite Hecke sets."""

from __future__ import annotations

from typing import Any

SparseHeckeOperator: Any
ClassicalModularPolynomial: Any
SupersingularIsogenyGraph: Any
SupersingularModule: Any
classical_modular_polynomial: Any
dimension_supersingular_module: Any
supersingular_j: Any

__all__ = [
    "SparseHeckeOperator",
    "ClassicalModularPolynomial",
    "SupersingularIsogenyGraph",
    "SupersingularModule",
    "classical_modular_polynomial",
    "dimension_supersingular_module",
    "supersingular_j",
]


def __getattr__(name: str) -> Any:
    if name == "SparseHeckeOperator":
        from .sparse_hecke import SparseHeckeOperator

        return SparseHeckeOperator
    if name in ["ClassicalModularPolynomial", "classical_modular_polynomial"]:
        from . import modular_polynomial

        return getattr(modular_polynomial, name)
    if name in [
        "SupersingularIsogenyGraph",
        "SupersingularModule",
        "dimension_supersingular_module",
        "supersingular_j",
    ]:
        from . import supersingular

        return getattr(supersingular, name)
    raise AttributeError(name)
