// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Production mathematical core for bounded cubic class and unit groups.
//!
//! This crate starts from public monic cubic coefficients, constructs and
//! authenticates a maximal order and relation presentation, and conditionally
//! completes the class and unit groups under GRH. It has no dependency on a
//! JavaScript, Python, Node, or WebAssembly host. Host adapters should retain
//! the sealed result and use the bounded arbitrary-ideal query API.

#[cfg(not(feature = "flint-normal-form"))]
compile_error!("sagejs-class-groups requires the flint-normal-form capability");

mod analytic_completion;
mod arbitrary_ideal_reduction;
mod class_group;
mod class_maps;
mod collector_schedule;
mod compact_cubic_presentation;
mod cubic_completion;
mod cubic_presentation;
mod enumeration;
mod factor_base;
mod flint_normal_form;
mod hnf;
mod ideal_arithmetic;
mod numerical_preparation;
mod pari_random;
mod polynomial_preparation;
mod prepared;
mod prepared_factor_base;
mod prepared_ideal;
// Temporary private dependency of the legacy Row-6 qualification helpers
// interleaved with arbitrary_ideal_reduction. It is not a production input.
mod prepared_input;
mod prime_valuation;
mod relation_cache;
mod smooth_admission;
mod unit_lattice;

pub use analytic_completion::{
    BdfFactorBasePlan, BelabasFriedmanPlan, BelabasFriedmanPlanError,
    IncrementalCubicBelabasFriedmanPlan, build_cubic_bdf_factor_base_plan,
    build_cubic_belabas_friedman_plan,
};
pub use arbitrary_ideal_reduction::{
    ARBITRARY_IDEAL_MAXIMUM_VALUATION, ArbitraryIdealClassMapCertificate,
    ArbitraryIdealClassQueryCertificate, ArbitraryIdealReductionCertificate,
    ArbitraryIdealReductionError, ArbitraryIdealReductionLimits, ArbitraryIdealReductionStatistics,
    AuthenticatedPresentationClassMap, MaximalCubicOrder, MaximalOrderEvidenceStatus,
    PrincipalRelationWitness, SignedClassHandoff, authenticate_presentation_class_map,
    map_arbitrary_cubic_ideal_class, query_arbitrary_cubic_ideal_class,
    reduce_arbitrary_cubic_ideal, replay_arbitrary_cubic_ideal_class_map,
    replay_arbitrary_cubic_ideal_class_query, replay_arbitrary_ideal_reduction,
};
pub use class_group::{
    ClassGroupError, CollectorCounters, CollectorTimings, PreparedCollectorLimits,
    PreparedContinuationLimits, PreparedCubicRelationCollector, PreparedCubicRelationPresentation,
    collect_prepared_cubic_relations, collect_prepared_cubic_relations_with_supplementary,
    modular_independent_relation_rows,
};
pub use class_maps::{
    ClassCoordinates, ClassMapError, PresentationClassMap, PresentationZeroState,
    PrincipalElementWitnessState, RelationCombinationWitness, RelationCoverage,
};
pub use compact_cubic_presentation::{
    CompactGeneratorOrderEvidence, CompactPresentationContinuationCache, CompactPresentationError,
    CompactPresentationLimits, CompactPresentationSolverData, CompactSaturationMinor,
    VerifiedCompactPresentation, authenticate_compact_presentation,
    authenticate_compact_presentation_with_cache,
};
pub use cubic_completion::{
    AnalyticIndexFailureDiagnostic, CompactCubicUnit, CubicAnalyticEvidence,
    CubicCompletionPrecisionEvidence, CubicCompletionPrecisionLevel, CubicCompletionProofMode,
    CubicConditionalCompletionContext, CubicConditionalCompletionError,
    CubicConditionalCompletionOptions, CubicUnitLatticeEvidence,
    GrhConditionalCompleteCubicClassGroup, complete_cubic_class_group_conditionally,
    complete_cubic_class_group_conditionally_with_context,
    prepare_cubic_conditional_completion_context,
};
pub use cubic_presentation::{
    AuthenticatedCubicPresentationCandidate, CubicCandidateGeneratorOrderEvidence,
    CubicPresentationCandidateError, CubicPresentationCandidateLimits,
    authenticate_compact_cubic_presentation_candidate,
    authenticate_compact_cubic_presentation_candidate_with_cache,
    authenticate_cubic_presentation_candidate,
};
pub use flint_normal_form::FlintDyadicInterval;
pub use hnf::{BigIntMatrix, NormalFormError, NormalFormLimits};
pub use numerical_preparation::{NumericalPreparationError, PreparedCubicEmbedding};
pub use polynomial_preparation::{
    CubicLocalMaximalityCertificate, CubicMaximalOrderCertificate, PreparedPublicCubic,
    PublicCubicPreparationError, PublicCubicPreparationLimits, RustPreparedMaximalCubic,
    SquarefreeDiscriminantCertificate, prepare_monic_cubic,
    prepare_squarefree_discriminant_monic_cubic,
};
pub use prepared::{
    EmbeddingPrecisionState, PreparedCubicData, PreparedCubicValidationError,
    PreparedNumberFieldData, PreparedNumberFieldValidationError, ValidatedPreparedCubic,
    ValidatedPreparedNumberField,
};
pub use prepared_factor_base::{
    CubicSplittingRecord, PreparedFactorBase, PreparedFactorBaseError,
    prepared_cubic_splitting_records, prepared_cubic_splitting_records_range,
    prepared_maximal_cubic_factor_base,
};
pub use prepared_ideal::{
    CubicIdeal, DegreeOnePrimeCharacter, PreparedIdealError, PreparedIdealWorkspace,
};
pub use unit_lattice::{
    ReconstructedRankOneUnitLattice, ReconstructedUnitLattice, UnitLatticeError,
    reconstruct_rank_one_unit_lattice, reconstruct_rank_two_unit_lattice,
};
