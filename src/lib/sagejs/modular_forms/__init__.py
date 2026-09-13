"""Exact q-expansions and sparse modular forms built from Hecke data."""

from __future__ import annotations

from typing import Any

ExactModularForm: Any
CertifiedFormulaSubspace: Any
CertifiedEtaProduct: Any
CertifiedModularForm: Any
ClassicalModularFormElement: Any
ClassicalModularFormsDiamondOperator: Any
ClassicalModularFormsHeckeOperator: Any
Gamma1CharacterComponent: Any
Gamma1DescentCertificate: Any
EtaProductCertificate: Any
ExactNebentypus: Any
FormulaAmbientComparisonCertificate: Any
FormulaEigenpacket: Any
FormulaEigenpacketCertificate: Any
FormulaHeckeActionCertificate: Any
FormulaHeckeObstruction: Any
FormulaHeckeSubspace: Any
LevelOneBasisCertificate: Any
ModularSymbolsQExpansionCertificate: Any
OldformMetadata: Any
QExpansionAlgebraCertificate: Any
QExpansionAlgorithmReceipt: Any
NewOldDecompositionCertificate: Any
NewformCertificate: Any
ModularFormLSeriesInput: Any
NormalizedNewform: Any
OldModularFormsSubspace: Any
UnaryThetaSeriesCertificate: Any
CohenEisensteinSeriesCertificate: Any
HalfIntegralWeightBasisCertificate: Any
HalfIntegralWeightModularFormsSpace: Any
HalfIntegralWeightModularForms: Any
KohnenPlusBasisCertificate: Any
KohnenPlusSpace: Any
ShimuraLiftCertificate: Any
cohen_eisenstein_series_certificate: Any
cohen_eisenstein_series_qexp: Any
half_integral_formula_registry: Any
half_integral_weight_hecke_qexp: Any
half_integral_weight_modform_basis: Any
shimura_lift_qexp: Any
theta2_qexp: Any
theta2_qexp_certificate: Any
theta_qexp: Any
theta_qexp_certificate: Any
delta_form: Any
delta_qexp: Any
certified_modular_form: Any
character_eisenstein_series: Any
formula_generated_subspace: Any
eta_product: Any
eta_product_candidates: Any
eta_product_certificate: Any
level_one_basis_certificate: Any
q_expansion_algorithm_receipt: Any
victor_miller_basis: Any
SparseHeckeOperator: Any
SparseCharacteristicPolynomialCertificate: Any
SparseWiedemannCertificate: Any
AlgebraicHeckeQExpansion: Any
AlgebraicSupersingularEigenpacket: Any
BrandtLinearOperator: Any
BrandtModule: Any
BrandtModuleElement: Any
BrandtModule_class: Any
BrandtSubspace: Any
BrandtComponentGroup: Any
BrandtComponentGroupCertificate: Any
DegreeZeroBrandtLattice: Any
ClassicalModularPolynomial: Any
ComponentCuspidalHeckeOperator: Any
CuspidalHeckeOperator: Any
ExactHeckeSubspace: Any
ExactModularForm: Any
FiniteHeckeSet: Any
HilbertModularFormsQsqrt3: Any
HilbertModularFormsQsqrt5: Any
IcosianDegeneracyMap: Any
IcosianLocalSplitting: Any
IcosianModularForms: Any
IcosianOrbitSet: Any
MestreQExpansion: Any
LevelOneBasisCertificate: Any
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
dimension_brandt_module: Any
brandt_component_group: Any
berlekamp_massey: Any
dimension_supersingular_module: Any
j_invariant_unit_series: Any
supersingular_j: Any
sparse_wiedemann_certificate: Any
sparse_characteristic_polynomial_certificate: Any
algebraic_supersingular_eigenpacket: Any
delta_form: Any
delta_qexp: Any
finite_hecke_set: Any
level_one_basis_certificate: Any
sqrt3_hecke_prime: Any
sqrt3_prime_ideals: Any
sqrt5_hecke_prime: Any
sqrt5_prime_ideals: Any
victor_miller_basis: Any

_QEXP_EXPORTS = [
    "ExactModularForm",
    "LevelOneBasisCertificate",
    "ModularSymbolsQExpansionCertificate",
    "NewOldDecompositionCertificate",
    "NewformCertificate",
    "ModularFormLSeriesInput",
    "NormalizedNewform",
    "OldModularFormsSubspace",
    "delta_form",
    "delta_qexp",
    "level_one_basis_certificate",
    "victor_miller_basis",
]

_QEXP_ALGEBRA_EXPORTS = [
    "CertifiedFormulaSubspace",
    "CertifiedModularForm",
    "ExactNebentypus",
    "FormulaAmbientComparisonCertificate",
    "FormulaEigenpacket",
    "FormulaEigenpacketCertificate",
    "FormulaHeckeActionCertificate",
    "FormulaHeckeObstruction",
    "FormulaHeckeSubspace",
    "OldformMetadata",
    "QExpansionAlgebraCertificate",
    "QExpansionAlgorithmReceipt",
    "certified_modular_form",
    "character_eisenstein_series",
    "formula_generated_subspace",
    "q_expansion_algorithm_receipt",
]

_ETA_PRODUCT_EXPORTS = [
    "CertifiedEtaProduct",
    "EtaProductCertificate",
    "eta_product",
    "eta_product_candidates",
    "eta_product_certificate",
]

_HALF_INTEGRAL_EXPORTS = [
    "UnaryThetaSeriesCertificate",
    "CohenEisensteinSeriesCertificate",
    "HalfIntegralWeightBasisCertificate",
    "HalfIntegralWeightModularFormsSpace",
    "HalfIntegralWeightModularForms",
    "KohnenPlusBasisCertificate",
    "KohnenPlusSpace",
    "ShimuraLiftCertificate",
    "cohen_eisenstein_series_certificate",
    "cohen_eisenstein_series_qexp",
    "half_integral_formula_registry",
    "half_integral_weight_hecke_qexp",
    "half_integral_weight_modform_basis",
    "shimura_lift_qexp",
    "theta2_qexp",
    "theta2_qexp_certificate",
    "theta_qexp",
    "theta_qexp_certificate",
]

_OBJECT_LAYER_EXPORTS = [
    "ClassicalModularFormElement",
    "ClassicalModularFormsDiamondOperator",
    "ClassicalModularFormsHeckeOperator",
]

_GAMMA1_EXPORTS = [
    "Gamma1CharacterComponent",
    "Gamma1DescentCertificate",
]

__all__ = [
    "CertifiedFormulaSubspace",
    "CertifiedEtaProduct",
    "CertifiedModularForm",
    "ClassicalModularFormElement",
    "ClassicalModularFormsDiamondOperator",
    "ClassicalModularFormsHeckeOperator",
    "Gamma1CharacterComponent",
    "Gamma1DescentCertificate",
    "EtaProductCertificate",
    "ExactNebentypus",
    "FormulaAmbientComparisonCertificate",
    "FormulaEigenpacket",
    "FormulaEigenpacketCertificate",
    "FormulaHeckeActionCertificate",
    "FormulaHeckeObstruction",
    "FormulaHeckeSubspace",
    "ExactModularForm",
    "LevelOneBasisCertificate",
    "ModularSymbolsQExpansionCertificate",
    "NewOldDecompositionCertificate",
    "NewformCertificate",
    "ModularFormLSeriesInput",
    "NormalizedNewform",
    "OldModularFormsSubspace",
    "OldformMetadata",
    "QExpansionAlgebraCertificate",
    "QExpansionAlgorithmReceipt",
    "certified_modular_form",
    "character_eisenstein_series",
    "delta_form",
    "delta_qexp",
    "level_one_basis_certificate",
    "formula_generated_subspace",
    "eta_product",
    "eta_product_candidates",
    "eta_product_certificate",
    "q_expansion_algorithm_receipt",
    "victor_miller_basis",
    "UnaryThetaSeriesCertificate",
    "CohenEisensteinSeriesCertificate",
    "HalfIntegralWeightBasisCertificate",
    "HalfIntegralWeightModularFormsSpace",
    "HalfIntegralWeightModularForms",
    "KohnenPlusBasisCertificate",
    "KohnenPlusSpace",
    "ShimuraLiftCertificate",
    "cohen_eisenstein_series_certificate",
    "cohen_eisenstein_series_qexp",
    "half_integral_formula_registry",
    "half_integral_weight_hecke_qexp",
    "half_integral_weight_modform_basis",
    "shimura_lift_qexp",
    "theta2_qexp",
    "theta2_qexp_certificate",
    "theta_qexp",
    "theta_qexp_certificate",
    "SparseHeckeOperator",
    "SparseCharacteristicPolynomialCertificate",
    "SparseWiedemannCertificate",
    "AlgebraicHeckeQExpansion",
    "AlgebraicSupersingularEigenpacket",
    "BrandtLinearOperator",
    "BrandtModule",
    "BrandtModuleElement",
    "BrandtModule_class",
    "BrandtSubspace",
    "BrandtComponentGroup",
    "BrandtComponentGroupCertificate",
    "DegreeZeroBrandtLattice",
    "ClassicalModularPolynomial",
    "ComponentCuspidalHeckeOperator",
    "CuspidalHeckeOperator",
    "ExactHeckeSubspace",
    "ExactModularForm",
    "FiniteHeckeSet",
    "HilbertModularFormsQsqrt3",
    "HilbertModularFormsQsqrt5",
    "IcosianDegeneracyMap",
    "IcosianLocalSplitting",
    "IcosianModularForms",
    "IcosianOrbitSet",
    "MestreQExpansion",
    "LevelOneBasisCertificate",
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
    "dimension_brandt_module",
    "brandt_component_group",
    "berlekamp_massey",
    "dimension_supersingular_module",
    "j_invariant_unit_series",
    "supersingular_j",
    "sparse_wiedemann_certificate",
    "sparse_characteristic_polynomial_certificate",
    "algebraic_supersingular_eigenpacket",
    "delta_form",
    "delta_qexp",
    "finite_hecke_set",
    "level_one_basis_certificate",
    "sqrt3_hecke_prime",
    "sqrt3_prime_ideals",
    "sqrt5_hecke_prime",
    "sqrt5_prime_ideals",
    "victor_miller_basis",
]


def __getattr__(name: Any, runtime_name: Any = None) -> Any:
    # The Sage.js runtime binds this hook as a module method; CPython calls it
    # as a plain function. Normalize the two otherwise equivalent call forms.
    if isinstance(runtime_name, str):
        name = runtime_name
    if name in [
        "NewOldDecompositionCertificate",
        "NewformCertificate",
        "ModularFormLSeriesInput",
        "NormalizedNewform",
        "OldModularFormsSubspace",
    ]:
        from . import newforms

        return getattr(newforms, name)
    if name in _QEXP_EXPORTS:
        from . import qexp

        return getattr(qexp, name)
    if name in _QEXP_ALGEBRA_EXPORTS:
        from . import qexp_algebra

        return getattr(qexp_algebra, name)
    if name in _ETA_PRODUCT_EXPORTS:
        from . import eta_products

        return getattr(eta_products, name)
    if name in _HALF_INTEGRAL_EXPORTS:
        from . import half_integral

        return getattr(half_integral, name)
    if name in _OBJECT_LAYER_EXPORTS:
        from . import object_layer

        return getattr(object_layer, name)
    if name in _GAMMA1_EXPORTS:
        from . import gamma1

        return getattr(gamma1, name)
    if name in ["FiniteHeckeSet", "SupersingularFiniteHeckeSet", "finite_hecke_set"]:
        from . import finite_hecke

        return getattr(finite_hecke, name)
    if name in [
        "BrandtLinearOperator",
        "BrandtModule",
        "BrandtModuleElement",
        "BrandtModule_class",
        "BrandtSubspace",
        "dimension_brandt_module",
    ]:
        from . import brandt

        return getattr(brandt, name)
    if name in [
        "BrandtComponentGroup",
        "BrandtComponentGroupCertificate",
        "DegreeZeroBrandtLattice",
        "brandt_component_group",
    ]:
        from . import component_groups

        return getattr(component_groups, name)
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
        "ExactModularForm",
        "LevelOneBasisCertificate",
        "delta_form",
        "delta_qexp",
        "level_one_basis_certificate",
        "victor_miller_basis",
    ]:
        from . import qexp

        return getattr(qexp, name)
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
