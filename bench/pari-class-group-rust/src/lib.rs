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

mod api;
mod bruteforce_collector;
mod class_group;
mod class_maps;
mod collector_schedule;
mod enumeration;
mod factor_base;
#[cfg(feature = "flint-normal-form")]
mod flint_normal_form;
mod gmp_smith;
mod hnf;
mod ideal_arithmetic;
mod numerical_preparation;
mod pari_random;
mod prepared;
mod prepared_factor_base;
mod prepared_ideal;
mod prime_valuation;
mod relation_cache;
mod smith;
mod smooth_admission;

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
pub use bruteforce_collector::{
    BruteForceStatistics, PreparedBruteForceResult,
    collect_validated_primitive_box_with_supplementary,
};
pub use class_group::{
    CollectorCounters, CollectorTimings, PreparedCollectorLimits,
    PreparedCubicRelationPresentation, collect_prepared_cubic_relations,
};
pub use class_maps::{
    ClassCoordinates, ClassMapError, PresentationClassMap, PresentationZeroState,
    PrincipalElementWitnessState, RelationCombinationWitness, RelationCoverage,
};
#[doc(hidden)]
pub use factor_base::prepared_cubic_factor_base;
pub use factor_base::{FactorBase, PrimeIdeal};
#[cfg(feature = "flint-normal-form")]
pub use flint_normal_form::{
    FlintNormalFormError, FlintSmithCandidate, FlintSmithClassMap, flint_hnf_basis,
    flint_lll_column_transform, flint_smith_candidate, flint_smith_class_map,
};
pub use gmp_smith::{
    ExactSmithCandidateInvariants, GmpSmithError, GmpSmithWorkspace,
    exact_candidate_invariants_from_i128,
};
pub use hnf::{
    BigIntMatrix, ExactArithmeticError, ExactNormalFormWorkspace, HnfDecomposition,
    NormalFormError, NormalFormLimits, SmithDecomposition, UpdateStrategy,
};
pub use prepared::{
    EmbeddingPrecisionState, PreparedCubicData, PreparedCubicValidationError,
    ValidatedPreparedCubic,
};
pub use prepared_factor_base::{
    PreparedFactorBase, PreparedFactorBaseError, prepared_maximal_cubic_factor_base,
};
pub use prepared_ideal::{
    CubicIdeal, DegreeOnePrimeCharacter, PreparedIdealError, PreparedIdealWorkspace,
};
pub use smith::{SmithError, WordSmithWorkspace, transpose_relation_records};
