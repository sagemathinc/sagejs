// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Experimental Rust class-group core.
//!
//! This library has no dependency on a Sage.js host, JSON, files, processes,
//! or a particular executable.  The two supported boundaries are deliberately
//! explicit:
//!
//! - [`PreparedCubic`] drives the general coefficient-box experiment.
//! - [`UpstreamAssumedH1`] drives the faithful, currently H1-specific port.
//!
//! The second boundary cannot be constructed for an arbitrary field.  Its
//! numerical preparation is authenticated only for the fixed H1 fixture.

mod analytic_completion;
mod api;
mod arbitrary_ideal_reduction;
mod bruteforce_collector;
mod class_group;
mod class_maps;
mod collector_schedule;
#[cfg(feature = "flint-normal-form")]
mod compact_cubic_presentation;
#[cfg(feature = "flint-normal-form")]
mod cubic_completion;
mod cubic_presentation;
mod enumeration;
mod factor_base;
#[cfg(feature = "flint-normal-form")]
mod flint_normal_form;
mod gmp_smith;
mod hnf;
mod ideal_arithmetic;
mod numerical_preparation;
mod pari_random;
mod polynomial_preparation;
mod prepared;
mod prepared_factor_base;
mod prepared_ideal;
mod prepared_input;
mod prime_valuation;
mod relation_cache;
mod smith;
mod smooth_admission;
mod unit_lattice;

pub use analytic_completion::{
    BdfFactorBasePlan, BelabasFriedmanPlan, BelabasFriedmanPlanError,
    IncrementalCubicBelabasFriedmanPlan, build_cubic_bdf_factor_base_plan,
    build_cubic_belabas_friedman_plan,
};
pub use api::{
    BruteForceOptions, ClassGroupCandidateInvariants, PreparedCubic,
    PreparedCubicClassGroupCandidate, PreparedCubicPresentationCandidate, QualificationStatus,
    RelationPresentation, SmithArithmeticPath, SolveError, UpstreamAssumedH1,
    UpstreamAssumedH1ClassGroupCandidate, UpstreamAssumedH1PresentationCandidate,
    class_group_candidate_invariants, collect_prepared_cubic_presentation_candidate,
    collect_upstream_assumed_h1_presentation_candidate,
    compute_prepared_cubic_class_group_candidate,
    compute_upstream_assumed_h1_class_group_candidate,
};
pub use arbitrary_ideal_reduction::{
    ARBITRARY_IDEAL_MAXIMUM_VALUATION, ArbitraryIdealClassMapCertificate,
    ArbitraryIdealReductionCertificate, ArbitraryIdealReductionError,
    ArbitraryIdealReductionLimits, ArbitraryIdealReductionStatistics,
    AuthenticatedPresentationClassMap, MaximalCubicOrder, MaximalOrderEvidenceStatus,
    PrincipalRelationWitness, SignedClassHandoff, UpstreamAssumedRow6QualificationOrder,
    authenticate_presentation_class_map, authenticate_upstream_assumed_row6_presentation_class_map,
    map_arbitrary_cubic_ideal_class, map_upstream_assumed_arbitrary_cubic_ideal_class,
    reduce_arbitrary_cubic_ideal, reduce_upstream_assumed_arbitrary_cubic_ideal,
    replay_arbitrary_cubic_ideal_class_map, replay_arbitrary_ideal_reduction,
    replay_upstream_assumed_arbitrary_cubic_ideal_class_map,
    replay_upstream_assumed_arbitrary_ideal_reduction,
};
pub use bruteforce_collector::{
    BruteForceStatistics, PreparedBruteForceResult,
    collect_validated_primitive_box_with_supplementary,
};
pub use class_group::{
    ClassGroupError, CollectorCounters, CollectorTimings, PreparedCollectorLimits,
    PreparedContinuationLimits, PreparedCubicRelationCollector, PreparedCubicRelationPresentation,
    collect_prepared_cubic_relations, modular_independent_relation_rows,
};
pub use class_maps::{
    ClassCoordinates, ClassMapError, PresentationClassMap, PresentationZeroState,
    PrincipalElementWitnessState, RelationCombinationWitness, RelationCoverage,
};
#[cfg(feature = "flint-normal-form")]
pub use compact_cubic_presentation::{
    CompactGeneratorOrderEvidence, CompactPresentationError, CompactPresentationLimits,
    CompactPresentationSolverData, CompactSaturationMinor, VerifiedCompactPresentation,
    authenticate_compact_presentation,
};
#[cfg(feature = "flint-normal-form")]
pub use cubic_completion::{
    AnalyticIndexFailureDiagnostic, CompactCubicUnit, CubicAnalyticEvidence,
    CubicCompletionPrecisionEvidence, CubicCompletionPrecisionLevel, CubicCompletionProofMode,
    CubicConditionalCompletionError, CubicConditionalCompletionOptions, CubicUnitLatticeEvidence,
    GrhConditionalCompleteCubicClassGroup, complete_cubic_class_group_conditionally,
};
#[cfg(feature = "flint-normal-form")]
pub use cubic_presentation::authenticate_compact_cubic_presentation_candidate;
pub use cubic_presentation::{
    AuthenticatedCubicPresentationCandidate, CubicCandidateGeneratorOrderEvidence,
    CubicPresentationCandidateError, CubicPresentationCandidateLimits,
    authenticate_cubic_presentation_candidate,
};
#[doc(hidden)]
pub use factor_base::prepared_cubic_factor_base;
pub use factor_base::{FactorBase, PrimeIdeal};
#[cfg(feature = "flint-normal-form")]
pub use flint_normal_form::{
    FlintBfIndexEnclosure, FlintDyadicInterval, FlintHnfProfile, FlintIncrementalHnf,
    FlintLeftKernel, FlintNormalFormError, FlintRelationWitnesses, FlintSmallSurplusClassOrder,
    FlintSmallSurplusOrdering, FlintSmallSurplusWorkspace, FlintSmithCandidate, FlintSmithClassMap,
    flint_bdf_factor_base_margin, flint_bf_index_enclosure, flint_compact_cubic_regulator,
    flint_hnf_basis, flint_hnf_profile, flint_incremental_hnf, flint_left_kernel,
    flint_lll_column_transform, flint_relation_witnesses, flint_small_surplus_class_order,
    flint_small_surplus_class_order_with_workspace,
    flint_small_surplus_class_order_with_workspace_natural_order,
    flint_small_surplus_class_order_with_workspace_static_minimum_degree,
    flint_small_surplus_relation_witnesses, flint_small_surplus_smith_class_map,
    flint_smith_candidate, flint_smith_class_map, flint_staged_relation_witnesses,
};
pub use gmp_smith::{
    ExactSmithCandidateInvariants, GmpSmithError, GmpSmithWorkspace,
    exact_candidate_invariants_from_i128,
};
pub use hnf::{
    BigIntMatrix, ExactArithmeticError, ExactNormalFormWorkspace, HnfDecomposition,
    NormalFormError, NormalFormLimits, SmithDecomposition, UpdateStrategy,
};
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
pub use prepared_input::{
    NeutralPreparedCubicInput, PreparedCubicInputError, parse_neutral_prepared_cubic_json,
};
pub use smith::{SmithError, WordSmithWorkspace, transpose_relation_records};
pub use unit_lattice::{
    ReconstructedRankOneUnitLattice, ReconstructedUnitLattice, UnitLatticeError,
    reconstruct_rank_one_unit_lattice, reconstruct_rank_two_unit_lattice,
};
