"""Sparse modular forms built from finite Hecke sets."""

from __future__ import annotations

from typing import Any

SparseHeckeOperator: Any
SparseWiedemannCertificate: Any
ClassicalModularPolynomial: Any
CuspidalHeckeOperator: Any
NormalizedAdjacencyOperator: Any
SupersingularIsogenyGraph: Any
SupersingularModule: Any
classical_modular_polynomial: Any
berlekamp_massey: Any
dimension_supersingular_module: Any
supersingular_j: Any
sparse_wiedemann_certificate: Any

__all__ = [
    "SparseHeckeOperator",
    "SparseWiedemannCertificate",
    "ClassicalModularPolynomial",
    "CuspidalHeckeOperator",
    "NormalizedAdjacencyOperator",
    "SupersingularIsogenyGraph",
    "SupersingularModule",
    "classical_modular_polynomial",
    "berlekamp_massey",
    "dimension_supersingular_module",
    "supersingular_j",
    "sparse_wiedemann_certificate",
]


def __getattr__(name: str) -> Any:
    if name == "SparseHeckeOperator":
        from .sparse_hecke import SparseHeckeOperator

        return SparseHeckeOperator
    if name in [
        "SparseWiedemannCertificate",
        "berlekamp_massey",
        "sparse_wiedemann_certificate",
    ]:
        from . import sparse_krylov

        return getattr(sparse_krylov, name)
    if name in ["ClassicalModularPolynomial", "classical_modular_polynomial"]:
        from . import modular_polynomial

        return getattr(modular_polynomial, name)
    if name in [
        "CuspidalHeckeOperator",
        "NormalizedAdjacencyOperator",
        "SupersingularIsogenyGraph",
        "SupersingularModule",
        "dimension_supersingular_module",
        "supersingular_j",
    ]:
        from . import supersingular

        return getattr(supersingular, name)
    raise AttributeError(name)
