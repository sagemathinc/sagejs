"""Exact q-expansions and sparse modular forms built from Hecke data."""

from __future__ import annotations

from typing import Any

ExactModularForm: Any
LevelOneBasisCertificate: Any
ModularSymbolsQExpansionCertificate: Any
NewOldDecompositionCertificate: Any
NewformCertificate: Any
NormalizedNewform: Any
OldModularFormsSubspace: Any
UnaryThetaSeriesCertificate: Any
CohenEisensteinSeriesCertificate: Any
HalfIntegralWeightBasisCertificate: Any
HalfIntegralWeightModularFormsSpace: Any
HalfIntegralWeightModularForms: Any
cohen_eisenstein_series_certificate: Any
cohen_eisenstein_series_qexp: Any
half_integral_formula_registry: Any
half_integral_weight_hecke_qexp: Any
half_integral_weight_modform_basis: Any
theta2_qexp: Any
theta2_qexp_certificate: Any
theta_qexp: Any
theta_qexp_certificate: Any
delta_form: Any
delta_qexp: Any
level_one_basis_certificate: Any
victor_miller_basis: Any
SparseHeckeOperator: Any
SparseCharacteristicPolynomialCertificate: Any
SparseWiedemannCertificate: Any
AlgebraicHeckeQExpansion: Any
AlgebraicSupersingularEigenpacket: Any
ClassicalModularPolynomial: Any
ComponentCuspidalHeckeOperator: Any
CuspidalHeckeOperator: Any
ExactHeckeSubspace: Any
FiniteHeckeSet: Any
HilbertModularFormsQsqrt3: Any
HilbertModularFormsQsqrt5: Any
IcosianDegeneracyMap: Any
IcosianLocalSplitting: Any
IcosianModularForms: Any
IcosianOrbitSet: Any
MestreQExpansion: Any
NormalizedAdjacencyOperator: Any
SupersingularIsogenyGraph: Any
SupersingularEigenpacket: Any
SturmVerificationCertificate: Any
SupersingularModule: Any
SupersingularFiniteHeckeSet: Any
Qsqrt5HeckePrime: Any
Qsqrt5PrimeIdeal: Any
Qsqrt5PrimePowerLevel: Any
Qsqrt3PrimeIdeal: Any
Qsqrt3PrimePowerLevel: Any
QuaternionComponentDegeneracyMap: Any
QuaternionComponentDegeneracyTrace: Any
QuaternionComponentHeckeSet: Any
QuaternionHeckeCorrespondence: Any
QuaternionIdealComponent: Any
QuaternionOldNewDecomposition: Any
classical_modular_polynomial: Any
berlekamp_massey: Any
dimension_supersingular_module: Any
j_invariant_unit_series: Any
supersingular_j: Any
sparse_wiedemann_certificate: Any
sparse_characteristic_polynomial_certificate: Any
algebraic_supersingular_eigenpacket: Any
finite_hecke_set: Any
sqrt3_hecke_prime: Any
sqrt3_prime_ideals: Any
sqrt5_hecke_prime: Any
sqrt5_prime_ideals: Any

_QEXP_EXPORTS = [
    "ExactModularForm",
    "LevelOneBasisCertificate",
    "ModularSymbolsQExpansionCertificate",
    "NewOldDecompositionCertificate",
    "NewformCertificate",
    "NormalizedNewform",
    "OldModularFormsSubspace",
    "delta_form",
    "delta_qexp",
    "level_one_basis_certificate",
    "victor_miller_basis",
]

_HALF_INTEGRAL_EXPORTS = [
    "UnaryThetaSeriesCertificate",
    "CohenEisensteinSeriesCertificate",
    "HalfIntegralWeightBasisCertificate",
    "HalfIntegralWeightModularFormsSpace",
    "HalfIntegralWeightModularForms",
    "cohen_eisenstein_series_certificate",
    "cohen_eisenstein_series_qexp",
    "half_integral_formula_registry",
    "half_integral_weight_hecke_qexp",
    "half_integral_weight_modform_basis",
    "theta2_qexp",
    "theta2_qexp_certificate",
    "theta_qexp",
    "theta_qexp_certificate",
]

__all__ = [
    "ExactModularForm",
    "LevelOneBasisCertificate",
    "ModularSymbolsQExpansionCertificate",
    "NewOldDecompositionCertificate",
    "NewformCertificate",
    "NormalizedNewform",
    "OldModularFormsSubspace",
    "delta_form",
    "delta_qexp",
    "level_one_basis_certificate",
    "victor_miller_basis",
    "UnaryThetaSeriesCertificate",
    "CohenEisensteinSeriesCertificate",
    "HalfIntegralWeightBasisCertificate",
    "HalfIntegralWeightModularFormsSpace",
    "HalfIntegralWeightModularForms",
    "cohen_eisenstein_series_certificate",
    "cohen_eisenstein_series_qexp",
    "half_integral_formula_registry",
    "half_integral_weight_hecke_qexp",
    "half_integral_weight_modform_basis",
    "theta2_qexp",
    "theta2_qexp_certificate",
    "theta_qexp",
    "theta_qexp_certificate",
    "SparseHeckeOperator",
    "SparseCharacteristicPolynomialCertificate",
    "SparseWiedemannCertificate",
    "AlgebraicHeckeQExpansion",
    "AlgebraicSupersingularEigenpacket",
    "ClassicalModularPolynomial",
    "ComponentCuspidalHeckeOperator",
    "CuspidalHeckeOperator",
    "ExactHeckeSubspace",
    "FiniteHeckeSet",
    "HilbertModularFormsQsqrt3",
    "HilbertModularFormsQsqrt5",
    "IcosianDegeneracyMap",
    "IcosianLocalSplitting",
    "IcosianModularForms",
    "IcosianOrbitSet",
    "MestreQExpansion",
    "NormalizedAdjacencyOperator",
    "SupersingularIsogenyGraph",
    "SupersingularEigenpacket",
    "SturmVerificationCertificate",
    "SupersingularModule",
    "SupersingularFiniteHeckeSet",
    "Qsqrt5HeckePrime",
    "Qsqrt5PrimeIdeal",
    "Qsqrt5PrimePowerLevel",
    "Qsqrt3PrimeIdeal",
    "Qsqrt3PrimePowerLevel",
    "QuaternionComponentDegeneracyMap",
    "QuaternionComponentDegeneracyTrace",
    "QuaternionComponentHeckeSet",
    "QuaternionHeckeCorrespondence",
    "QuaternionIdealComponent",
    "QuaternionOldNewDecomposition",
    "classical_modular_polynomial",
    "berlekamp_massey",
    "dimension_supersingular_module",
    "j_invariant_unit_series",
    "supersingular_j",
    "sparse_wiedemann_certificate",
    "sparse_characteristic_polynomial_certificate",
    "algebraic_supersingular_eigenpacket",
    "finite_hecke_set",
    "sqrt3_hecke_prime",
    "sqrt3_prime_ideals",
    "sqrt5_hecke_prime",
    "sqrt5_prime_ideals",
]


def __getattr__(name: Any, runtime_name: Any = None) -> Any:
    # The Sage.js runtime binds this hook as a module method; CPython calls it
    # as a plain function. Normalize the two otherwise equivalent call forms.
    if isinstance(runtime_name, str):
        name = runtime_name
    if name in [
        "NewOldDecompositionCertificate",
        "NewformCertificate",
        "NormalizedNewform",
        "OldModularFormsSubspace",
    ]:
        from . import newforms

        return getattr(newforms, name)
    if name in _QEXP_EXPORTS:
        from . import qexp

        return getattr(qexp, name)
    if name in _HALF_INTEGRAL_EXPORTS:
        from . import half_integral

        return getattr(half_integral, name)
    if name in ["FiniteHeckeSet", "SupersingularFiniteHeckeSet", "finite_hecke_set"]:
        from . import finite_hecke

        return getattr(finite_hecke, name)
    if name in [
        "ComponentCuspidalHeckeOperator",
        "ExactHeckeSubspace",
        "QuaternionComponentDegeneracyMap",
        "QuaternionComponentDegeneracyTrace",
        "QuaternionComponentHeckeSet",
        "QuaternionHeckeCorrespondence",
        "QuaternionIdealComponent",
        "QuaternionOldNewDecomposition",
    ]:
        from . import algebraic

        return getattr(algebraic, name)
    if name in [
        "HilbertModularFormsQsqrt3",
        "Qsqrt3PrimeIdeal",
        "Qsqrt3PrimePowerLevel",
        "sqrt3_hecke_prime",
        "sqrt3_prime_ideals",
    ]:
        from . import hilbert_sqrt3

        return getattr(hilbert_sqrt3, name)
    if name in [
        "HilbertModularFormsQsqrt5",
        "IcosianDegeneracyMap",
        "IcosianLocalSplitting",
        "IcosianModularForms",
        "IcosianOrbitSet",
        "Qsqrt5HeckePrime",
        "Qsqrt5PrimeIdeal",
        "Qsqrt5PrimePowerLevel",
        "sqrt5_hecke_prime",
        "sqrt5_prime_ideals",
    ]:
        from . import hilbert_sqrt5

        return getattr(hilbert_sqrt5, name)
    if name == "SparseHeckeOperator":
        from .sparse_hecke import SparseHeckeOperator

        return SparseHeckeOperator
    if name in [
        "SparseCharacteristicPolynomialCertificate",
        "SparseWiedemannCertificate",
        "berlekamp_massey",
        "sparse_characteristic_polynomial_certificate",
        "sparse_wiedemann_certificate",
    ]:
        from . import sparse_krylov

        return getattr(sparse_krylov, name)
    if name in [
        "AlgebraicHeckeQExpansion",
        "AlgebraicSupersingularEigenpacket",
        "MestreQExpansion",
        "SupersingularEigenpacket",
        "SturmVerificationCertificate",
        "algebraic_supersingular_eigenpacket",
    ]:
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
