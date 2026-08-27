"""Sparse modular forms built from finite Hecke sets."""

from __future__ import annotations

from typing import Any

SparseHeckeOperator: Any
SupersingularIsogenyGraph: Any
SupersingularModule: Any
dimension_supersingular_module: Any
supersingular_j: Any

__all__ = [
    "SparseHeckeOperator",
    "SupersingularIsogenyGraph",
    "SupersingularModule",
    "dimension_supersingular_module",
    "supersingular_j",
]


def __getattr__(name: str) -> Any:
    if name == "SparseHeckeOperator":
        from .sparse_hecke import SparseHeckeOperator

        return SparseHeckeOperator
    if name in [
        "SupersingularIsogenyGraph",
        "SupersingularModule",
        "dimension_supersingular_module",
        "supersingular_j",
    ]:
        from . import supersingular

        return getattr(supersingular, name)
    raise AttributeError(name)
