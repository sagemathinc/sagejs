"""Sparse modular forms built from finite Hecke sets."""

from __future__ import annotations

from typing import Any

SparseHeckeOperator: Any
SparseWiedemannCertificate: Any
ClassicalModularPolynomial: Any
CuspidalHeckeOperator: Any
MestreQExpansion: Any
NormalizedAdjacencyOperator: Any
SupersingularIsogenyGraph: Any
SupersingularEigenpacket: Any
SupersingularModule: Any
classical_modular_polynomial: Any
berlekamp_massey: Any
dimension_supersingular_module: Any
j_invariant_unit_series: Any
supersingular_j: Any
sparse_wiedemann_certificate: Any

__all__ = [
    "SparseHeckeOperator",
    "SparseWiedemannCertificate",
    "ClassicalModularPolynomial",
    "CuspidalHeckeOperator",
    "MestreQExpansion",
    "NormalizedAdjacencyOperator",
    "SupersingularIsogenyGraph",
    "SupersingularEigenpacket",
    "SupersingularModule",
    "classical_modular_polynomial",
    "berlekamp_massey",
    "dimension_supersingular_module",
    "j_invariant_unit_series",
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
    if name in ["MestreQExpansion", "SupersingularEigenpacket"]:
        from . import mestre

        return getattr(mestre, name)
    if name in [
        "ClassicalModularPolynomial",
        "classical_modular_polynomial",
        "j_invariant_unit_series",
    ]:
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
