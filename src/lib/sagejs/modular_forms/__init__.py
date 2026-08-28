"""Sparse modular forms built from finite Hecke sets."""

from __future__ import annotations

from typing import Any

SparseHeckeOperator: Any
SparseWiedemannCertificate: Any
ClassicalModularPolynomial: Any
CuspidalHeckeOperator: Any
HilbertModularFormsQsqrt5: Any
IcosianLocalSplitting: Any
IcosianModularForms: Any
IcosianOrbitSet: Any
MestreQExpansion: Any
NormalizedAdjacencyOperator: Any
SupersingularIsogenyGraph: Any
SupersingularEigenpacket: Any
SupersingularModule: Any
Qsqrt5HeckePrime: Any
Qsqrt5PrimeIdeal: Any
classical_modular_polynomial: Any
berlekamp_massey: Any
dimension_supersingular_module: Any
j_invariant_unit_series: Any
supersingular_j: Any
sparse_wiedemann_certificate: Any
sqrt5_hecke_prime: Any
sqrt5_prime_ideals: Any

__all__ = [
    "SparseHeckeOperator",
    "SparseWiedemannCertificate",
    "ClassicalModularPolynomial",
    "CuspidalHeckeOperator",
    "HilbertModularFormsQsqrt5",
    "IcosianLocalSplitting",
    "IcosianModularForms",
    "IcosianOrbitSet",
    "MestreQExpansion",
    "NormalizedAdjacencyOperator",
    "SupersingularIsogenyGraph",
    "SupersingularEigenpacket",
    "SupersingularModule",
    "Qsqrt5HeckePrime",
    "Qsqrt5PrimeIdeal",
    "classical_modular_polynomial",
    "berlekamp_massey",
    "dimension_supersingular_module",
    "j_invariant_unit_series",
    "supersingular_j",
    "sparse_wiedemann_certificate",
    "sqrt5_hecke_prime",
    "sqrt5_prime_ideals",
]


def __getattr__(name: Any, runtime_name: Any = None) -> Any:
    # The Sage.js runtime binds this hook as a module method; CPython calls it
    # as a plain function.  Normalize the two otherwise equivalent call forms.
    if isinstance(runtime_name, str):
        name = runtime_name
    if name in [
        "HilbertModularFormsQsqrt5",
        "IcosianLocalSplitting",
        "IcosianModularForms",
        "IcosianOrbitSet",
        "Qsqrt5HeckePrime",
        "Qsqrt5PrimeIdeal",
        "sqrt5_hecke_prime",
        "sqrt5_prime_ideals",
    ]:
        from . import hilbert_sqrt5

        return getattr(hilbert_sqrt5, name)
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
