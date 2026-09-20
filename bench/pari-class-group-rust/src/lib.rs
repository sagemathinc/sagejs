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
mod collector_schedule;
mod enumeration;
mod factor_base;
mod ideal_arithmetic;
mod numerical_preparation;
mod prime_valuation;
mod relation_cache;
mod smith;
mod smooth_admission;

pub use api::{
    BruteForceOptions, ClassGroupCandidateInvariants, PreparedCubic,
    PreparedCubicClassGroupCandidate, PreparedCubicPresentationCandidate, QualificationStatus,
    RelationPresentation, SolveError, UpstreamAssumedH1, UpstreamAssumedH1ClassGroupCandidate,
    UpstreamAssumedH1PresentationCandidate, class_group_candidate_invariants,
    collect_prepared_cubic_presentation_candidate,
    collect_upstream_assumed_h1_presentation_candidate,
    compute_prepared_cubic_class_group_candidate,
    compute_upstream_assumed_h1_class_group_candidate,
};
pub use bruteforce_collector::BruteForceStatistics;
pub use class_group::{CollectorCounters, CollectorTimings};
#[doc(hidden)]
pub use factor_base::prepared_cubic_factor_base;
pub use factor_base::{FactorBase, PrimeIdeal};
pub use smith::{SmithError, WordSmithWorkspace, transpose_relation_records};
