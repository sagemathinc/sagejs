// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Typed, host-independent entry points for the Rust class-group experiment.

use crate::bruteforce_collector::{
    BruteForceError, BruteForceResult, BruteForceStatistics,
    collect_primitive_box_with_supplementary,
};
use crate::class_group::{
    ClassGroupError, CollectorCounters, CollectorTimings, collect_h1_class_group,
};
use crate::factor_base::FactorBase;
use crate::gmp_smith::{GmpSmithError, exact_candidate_invariants_from_i128};
use crate::smith::{SmithError, WordSmithWorkspace, transpose_relation_records};
use rug::Integer;

/// What a result establishes without adding any unimplemented certification step.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum QualificationStatus {
    /// Full-rank relations plus surplus rows produce candidate invariants.
    PresentationCandidate,
    /// The port assumes the same completion conditions as the authenticated upstream run.
    UpstreamAssumedCandidate,
}

/// A monic cubic together with an integral basis, both in ascending/row-major order.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PreparedCubic {
    pub polynomial_ascending: [i64; 4],
    pub integral_basis_row_major: [i64; 9],
}

/// Search controls for the simple coefficient-box collector.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BruteForceOptions {
    pub maximum_radius: i64,
    pub supplementary_relations: usize,
}

impl Default for BruteForceOptions {
    fn default() -> Self {
        Self {
            maximum_radius: 32,
            supplementary_relations: 7,
        }
    }
}

/// Relation vectors are consecutive; each vector has `generator_count` entries.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RelationPresentation {
    pub generator_count: usize,
    pub relation_vectors: Vec<i64>,
}

impl RelationPresentation {
    pub fn relation_count(&self) -> usize {
        assert!(self.generator_count > 0, "presentation has no generators");
        assert_eq!(
            self.relation_vectors.len() % self.generator_count,
            0,
            "relation storage is not a whole number of vectors"
        );
        self.relation_vectors.len() / self.generator_count
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClassGroupCandidateInvariants {
    pub invariant_factors: Vec<Integer>,
    pub class_number: Integer,
    pub arithmetic: SmithArithmeticPath,
}

/// Arithmetic implementation that produced the exact Smith invariants.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SmithArithmeticPath {
    FixedI128,
    GmpRetry,
}

/// Candidate invariants and their underlying coefficient-box presentation.
#[derive(Clone, Debug)]
pub struct PreparedCubicClassGroupCandidate {
    pub status: QualificationStatus,
    pub field: PreparedCubic,
    pub factor_base: FactorBase,
    pub presentation: RelationPresentation,
    pub relation_elements: Vec<[i64; 3]>,
    pub statistics: BruteForceStatistics,
    pub invariants: ClassGroupCandidateInvariants,
}

/// Typed coefficient-box presentation candidate before Smith reduction.
#[derive(Clone, Debug)]
pub struct PreparedCubicPresentationCandidate {
    pub status: QualificationStatus,
    pub field: PreparedCubic,
    pub factor_base: FactorBase,
    pub presentation: RelationPresentation,
    pub relation_elements: Vec<[i64; 3]>,
    pub statistics: BruteForceStatistics,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SolveError {
    NonMonicCubic,
    InvalidMaximumRadius,
    Collection(BruteForceError),
    FaithfulH1(ClassGroupError),
    Smith(SmithError),
    GmpSmith(GmpSmithError),
    RankDeficient { rank: usize, expected: usize },
}

impl From<BruteForceError> for SolveError {
    fn from(value: BruteForceError) -> Self {
        Self::Collection(value)
    }
}

impl From<SmithError> for SolveError {
    fn from(value: SmithError) -> Self {
        Self::Smith(value)
    }
}

impl From<GmpSmithError> for SolveError {
    fn from(value: GmpSmithError) -> Self {
        Self::GmpSmith(value)
    }
}

fn candidate_invariants_from_row_major_checkpoint(
    matrix: &[i128],
    rows: usize,
    columns: usize,
) -> Result<ClassGroupCandidateInvariants, SolveError> {
    let mut smith = WordSmithWorkspace::new(rows, columns);
    let word_result = smith
        .reset_from(matrix)
        .and_then(|()| smith.smith_diagonal());
    let diagonal = match word_result {
        Ok(diagonal) => diagonal,
        Err(SmithError::ArithmeticOverflow) => {
            // The fixed-width workspace may have been modified before the
            // overflow.  Restart GMP exclusively from the untouched `matrix`
            // checkpoint owned by this function.
            let exact = exact_candidate_invariants_from_i128(matrix, rows, columns, rows)?;
            return Ok(ClassGroupCandidateInvariants {
                invariant_factors: exact.invariant_factors,
                class_number: exact.class_number,
                arithmetic: SmithArithmeticPath::GmpRetry,
            });
        }
        Err(error) => return Err(SolveError::Smith(error)),
    };
    let rank = diagonal.iter().filter(|value| **value != 0).count();
    if rank != rows {
        return Err(SolveError::RankDeficient {
            rank,
            expected: rows,
        });
    }
    let invariant_factors = diagonal
        .into_iter()
        .filter(|value| *value > 1)
        .map(Integer::from)
        .collect::<Vec<_>>();
    let class_number = invariant_factors
        .iter()
        .fold(Integer::from(1), |product, value| product * value);
    Ok(ClassGroupCandidateInvariants {
        invariant_factors,
        class_number,
        arithmetic: SmithArithmeticPath::FixedI128,
    })
}

/// Reduce a full-rank relation presentation to candidate invariants.
pub fn class_group_candidate_invariants(
    presentation: &RelationPresentation,
) -> Result<ClassGroupCandidateInvariants, SolveError> {
    let columns = presentation.relation_count();
    let matrix = transpose_relation_records(
        &presentation.relation_vectors,
        presentation.generator_count,
        columns,
    );
    candidate_invariants_from_row_major_checkpoint(&matrix, presentation.generator_count, columns)
}

fn validate(field: PreparedCubic, options: BruteForceOptions) -> Result<(), SolveError> {
    if field.polynomial_ascending[3] != 1 {
        return Err(SolveError::NonMonicCubic);
    }
    if options.maximum_radius <= 0 {
        return Err(SolveError::InvalidMaximumRadius);
    }
    Ok(())
}

/// Collect a full-rank coefficient-box presentation candidate for a prepared cubic.
pub fn collect_prepared_cubic_presentation_candidate(
    field: PreparedCubic,
    options: BruteForceOptions,
) -> Result<PreparedCubicPresentationCandidate, SolveError> {
    validate(field, options)?;
    let answer: BruteForceResult = collect_primitive_box_with_supplementary(
        field.polynomial_ascending,
        field.integral_basis_row_major,
        options.maximum_radius,
        options.supplementary_relations,
    )?;
    Ok(PreparedCubicPresentationCandidate {
        status: QualificationStatus::PresentationCandidate,
        field,
        presentation: RelationPresentation {
            generator_count: answer.factor_base.ideals.len(),
            relation_vectors: answer.cache.records().to_vec(),
        },
        factor_base: answer.factor_base,
        relation_elements: answer.elements,
        statistics: answer.statistics,
    })
}

/// Compute candidate invariants using the simple prepared-cubic experiment.
pub fn compute_prepared_cubic_class_group_candidate(
    field: PreparedCubic,
    options: BruteForceOptions,
) -> Result<PreparedCubicClassGroupCandidate, SolveError> {
    let answer = collect_prepared_cubic_presentation_candidate(field, options)?;
    let invariants = class_group_candidate_invariants(&answer.presentation)?;
    Ok(PreparedCubicClassGroupCandidate {
        status: answer.status,
        field,
        factor_base: answer.factor_base,
        presentation: answer.presentation,
        relation_elements: answer.relation_elements,
        statistics: answer.statistics,
        invariants,
    })
}

/// Capability token for the only field authenticated by the faithful collector.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct UpstreamAssumedH1(());

impl UpstreamAssumedH1 {
    pub const POLYNOMIAL_ASCENDING: [i64; 4] = [20_034, -20_018, 0, 1];
    pub const INTEGRAL_BASIS_ROW_MAJOR: [i64; 9] = [1, 0, 0, 0, 1, 0, -13_345, 2, 1];

    pub const fn new() -> Self {
        Self(())
    }

    pub const fn prepared_cubic(self) -> PreparedCubic {
        PreparedCubic {
            polynomial_ascending: Self::POLYNOMIAL_ASCENDING,
            integral_basis_row_major: Self::INTEGRAL_BASIS_ROW_MAJOR,
        }
    }
}

/// Output of the faithful H1 relation collector and Smith reduction.
#[derive(Clone, Debug)]
pub struct UpstreamAssumedH1ClassGroupCandidate {
    pub status: QualificationStatus,
    pub presentation: RelationPresentation,
    pub relation_elements: Vec<i64>,
    pub first_nonzero_hints: Vec<usize>,
    pub metadata: Vec<i64>,
    pub factor_base: FactorBase,
    pub invariants: ClassGroupCandidateInvariants,
    pub subfactor_count: usize,
    pub search_permutation: Vec<usize>,
    pub counters: CollectorCounters,
    pub timings: CollectorTimings,
}

/// Typed output of faithful H1 relation collection before Smith reduction.
#[derive(Clone, Debug)]
pub struct UpstreamAssumedH1PresentationCandidate {
    pub status: QualificationStatus,
    pub presentation: RelationPresentation,
    pub relation_elements: Vec<i64>,
    pub first_nonzero_hints: Vec<usize>,
    pub metadata: Vec<i64>,
    pub factor_base: FactorBase,
    pub subfactor_count: usize,
    pub search_permutation: Vec<usize>,
    pub counters: CollectorCounters,
    pub timings: CollectorTimings,
}

/// Run the faithful H1 collector under the authenticated upstream completion assumptions.
pub fn collect_upstream_assumed_h1_presentation_candidate(
    _field: UpstreamAssumedH1,
) -> Result<UpstreamAssumedH1PresentationCandidate, SolveError> {
    let answer = collect_h1_class_group(
        UpstreamAssumedH1::POLYNOMIAL_ASCENDING,
        UpstreamAssumedH1::INTEGRAL_BASIS_ROW_MAJOR,
    )
    .map_err(SolveError::FaithfulH1)?;
    Ok(UpstreamAssumedH1PresentationCandidate {
        status: QualificationStatus::UpstreamAssumedCandidate,
        presentation: RelationPresentation {
            generator_count: answer.factor_base.ideals.len(),
            relation_vectors: answer.relations,
        },
        relation_elements: answer.generators,
        first_nonzero_hints: answer.first_nonzero_hints,
        metadata: answer.metadata,
        factor_base: answer.factor_base,
        subfactor_count: answer.subfactor_count,
        search_permutation: answer.search_permutation,
        counters: answer.counters,
        timings: answer.timings,
    })
}

/// Compute H1 candidate invariants under the authenticated upstream assumptions.
pub fn compute_upstream_assumed_h1_class_group_candidate(
    field: UpstreamAssumedH1,
) -> Result<UpstreamAssumedH1ClassGroupCandidate, SolveError> {
    let answer = collect_upstream_assumed_h1_presentation_candidate(field)?;
    let invariants = class_group_candidate_invariants(&answer.presentation)?;
    Ok(UpstreamAssumedH1ClassGroupCandidate {
        status: answer.status,
        presentation: answer.presentation,
        relation_elements: answer.relation_elements,
        first_nonzero_hints: answer.first_nonzero_hints,
        metadata: answer.metadata,
        factor_base: answer.factor_base,
        invariants,
        subfactor_count: answer.subfactor_count,
        search_permutation: answer.search_permutation,
        counters: answer.counters,
        timings: answer.timings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_prepared_cubic_api_recovers_class_number_two() {
        let answer = compute_prepared_cubic_class_group_candidate(
            PreparedCubic {
                polynomial_ascending: [-29, -30, -8, 1],
                integral_basis_row_major: [1, 0, 0, -3, 1, 0, -17, -9, 1],
            },
            BruteForceOptions {
                maximum_radius: 5,
                supplementary_relations: 20,
            },
        )
        .unwrap();
        assert_eq!(answer.status, QualificationStatus::PresentationCandidate);
        assert_eq!(answer.invariants.invariant_factors, [2]);
        assert_eq!(answer.invariants.class_number, 2);
        assert_eq!(answer.invariants.arithmetic, SmithArithmeticPath::FixedI128);
        assert_eq!(answer.presentation.generator_count, 7);
        assert_eq!(answer.presentation.relation_count(), 27);
    }

    #[test]
    fn h1_capability_is_fixed_and_returns_an_upstream_assumed_candidate() {
        let answer =
            compute_upstream_assumed_h1_class_group_candidate(UpstreamAssumedH1::new()).unwrap();
        assert_eq!(answer.status, QualificationStatus::UpstreamAssumedCandidate);
        assert_eq!(answer.invariants.class_number, 1);
        assert!(answer.invariants.invariant_factors.is_empty());
        assert_eq!(answer.invariants.arithmetic, SmithArithmeticPath::FixedI128);
        assert_eq!(answer.presentation.generator_count, 66);
        assert_eq!(answer.presentation.relation_count(), 73);
    }

    #[test]
    fn fixed_width_overflow_restarts_exactly_from_the_original_checkpoint() {
        let answer = candidate_invariants_from_row_major_checkpoint(&[i128::MIN], 1, 1).unwrap();
        let expected: Integer = Integer::from(1) << 127;
        assert_eq!(answer.invariant_factors, [expected.clone()]);
        assert_eq!(answer.class_number, expected);
        assert_eq!(answer.arithmetic, SmithArithmeticPath::GmpRetry);
    }

    #[test]
    fn rejects_inputs_outside_the_typed_boundary() {
        let field = PreparedCubic {
            polynomial_ascending: [1, 0, 0, 2],
            integral_basis_row_major: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        };
        assert_eq!(
            compute_prepared_cubic_class_group_candidate(field, BruteForceOptions::default())
                .err()
                .unwrap(),
            SolveError::NonMonicCubic
        );
    }

    #[test]
    fn smith_failures_are_preserved_for_a_future_fallback() {
        assert_eq!(
            SolveError::from(SmithError::ArithmeticOverflow),
            SolveError::Smith(SmithError::ArithmeticOverflow)
        );
        assert_eq!(
            SolveError::from(SmithError::ReductionStalled),
            SolveError::Smith(SmithError::ReductionStalled)
        );
    }
}
