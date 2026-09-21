// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! GRH-conditional completion of an authenticated cubic presentation.
//!
//! This module is deliberately available only with the qualification FLINT/
//! Arb bridge.  The input presentation remains a candidate until this phase
//! reconstructs compact units from the exact left kernel, encloses their
//! regulator with directed Arb arithmetic, proves the Belabas--Diaz y Diaz--
//! Friedman factor-base inequality, and isolates class/unit index one with the
//! Belabas--Friedman residue bound.

use crate::analytic_completion::{
    BdfFactorBasePlan, BelabasFriedmanPlan, BelabasFriedmanPlanError,
    IncrementalCubicBelabasFriedmanPlan, build_cubic_bdf_factor_base_plan,
};
use crate::compact_cubic_presentation::{
    exact_integer_i64_row_annihilates, first_non_annihilating_i64_row,
    modular_basis_columns_in_order, saturation_minor_certificate,
};
use crate::cubic_presentation::AuthenticatedCubicPresentationCandidate;
use crate::flint_normal_form::{
    FlintBfIndexEnclosure, FlintDyadicInterval, FlintNormalFormError, flint_bdf_factor_base_margin,
    flint_bf_index_enclosure, flint_compact_cubic_regulator, flint_left_kernel,
};
use crate::hnf::{BigIntMatrix, ExactNormalFormWorkspace, NormalFormError, NormalFormLimits};
use crate::numerical_preparation::{NumericalPreparationError, PreparedCubicEmbedding};
use crate::polynomial_preparation::PreparedPublicCubic;
use crate::prepared_factor_base::{
    PreparedFactorBaseError, prepared_cubic_splitting_records_range,
};
use crate::unit_lattice::{
    UnitLatticeError, reconstruct_rank_one_unit_lattice, reconstruct_rank_two_unit_lattice,
};
use rug::{Float, Integer, Rational};
use std::borrow::Cow;

const DEGREE: usize = 3;
const ROOTS_OF_UNITY_IN_CUBIC_FIELD: u64 = 2;
const MAXIMUM_COMPLETION_PRECISION_BITS: u32 = 16_384;
const MAXIMUM_DYADIC_SHIFT: u32 = 1_000_000;
const MAXIMUM_DEPENDENCY_REDUCTION_OPERATIONS: u64 = 50_000_000;
const MAXIMUM_DEPENDENCY_REDUCTION_INPUT_BYTES: u64 = 128 * 1024 * 1024;

/// The proof contract requested by the caller.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CubicCompletionProofMode {
    /// Conditional on the two GRH hypotheses named in [`CubicAnalyticEvidence`].
    GrhConditional,
    /// Reserved for a future unconditional completion engine.
    Unconditional,
}

/// Explicit resources for cubic class/unit completion.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CubicConditionalCompletionOptions {
    pub proof_mode: CubicCompletionProofMode,
    pub logarithm_precision_bits: u32,
    pub replay_precision_bits: u32,
    pub analytic_precision_bits: u32,
    pub maximum_relations: usize,
    pub maximum_dependencies: usize,
    pub maximum_kernel_coefficient_bits: usize,
    /// Largest signed exponent admitted in a reconstructed compact unit.
    pub maximum_unit_exponent_bits: usize,
    pub maximum_reconstruction_denominator_bits: usize,
    pub maximum_analytic_threshold: u64,
}

impl Default for CubicConditionalCompletionOptions {
    fn default() -> Self {
        Self {
            proof_mode: CubicCompletionProofMode::GrhConditional,
            logarithm_precision_bits: 1_024,
            replay_precision_bits: 512,
            analytic_precision_bits: 256,
            maximum_relations: 10_000,
            maximum_dependencies: 1_000,
            maximum_kernel_coefficient_bits: 4_080,
            maximum_unit_exponent_bits: 8_192,
            maximum_reconstruction_denominator_bits: 4_096,
            maximum_analytic_threshold: 23_994,
        }
    }
}

/// Field-level analytic data shared by continuation and numerical-precision
/// retries for one authenticated factor base.
///
/// Construction performs the complete factor-base splitting prefix and
/// rigorous BDF margin enclosure once. Completion also retains the monotone
/// exact Belabas--Friedman splitting plans it has reached, so continuation and
/// precision retries do not re-authenticate the same prime prefixes. Exact
/// principal-generator prefixes and their precision-specific logarithms are
/// retained only after a coordinate-for-coordinate prefix check. The
/// candidate-dependent dependency lattice, units, regulator certificate, and
/// index enclosure are always recomputed.
/// Completion checks that the prepared field, factor-base bound, analytic
/// precision, and resource ceiling agree before using any retained evidence.
#[derive(Clone, Debug)]
pub struct CubicConditionalCompletionContext {
    prepared: PreparedPublicCubic,
    factor_base_bound: u64,
    analytic_precision_bits: u32,
    maximum_analytic_threshold: u64,
    bdf_plan: BdfFactorBasePlan,
    bdf_margin: FlintDyadicInterval,
    bf_splitting_bound: usize,
    bf_incremental_plan: IncrementalCubicBelabasFriedmanPlan,
    bf_plans: Vec<BelabasFriedmanPlan>,
    relation_log_prefixes: Vec<CachedRelationLogPrefix>,
}

/// Precision-specific logarithms for an exact prefix of principal generators.
///
/// This is retained computation, not authority. Before reuse, completion
/// compares every cached generator coordinate with the current authenticated
/// presentation. A shorter or different presentation resets the prefix.
#[derive(Clone, Debug)]
struct CachedRelationLogPrefix {
    precision_bits: u32,
    embedding: PreparedCubicEmbedding,
    generator_coordinates: Vec<Integer>,
    logarithms: Vec<[Float; DEGREE]>,
}

fn exact_generator_prefix_matches(
    cached_coordinates: &[Integer],
    cached_logarithm_count: usize,
    current_coordinates: &[Integer],
) -> bool {
    cached_coordinates.len().is_multiple_of(DEGREE)
        && cached_logarithm_count.saturating_mul(DEGREE) == cached_coordinates.len()
        && cached_coordinates.len() <= current_coordinates.len()
        && cached_coordinates == &current_coordinates[..cached_coordinates.len()]
}

/// Exact final BF enclosure retained only when analytic completion declines.
///
/// The interval is diagnostic evidence, not completion authority. In
/// particular, retaining it does not establish index one or permit callers to
/// construct a completed class group. Its `Debug` representation is redacted
/// so generic public error receipts do not publish analytic values.
#[derive(Clone, Eq, PartialEq)]
pub struct AnalyticIndexFailureDiagnostic {
    pub threshold: u64,
    pub enclosure: FlintBfIndexEnclosure,
    pub tail_bound_below_quarter: bool,
}

impl std::fmt::Debug for AnalyticIndexFailureDiagnostic {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("AnalyticIndexFailureDiagnostic(<redacted>)")
    }
}

#[derive(Clone, Eq, PartialEq)]
pub enum CubicConditionalCompletionError {
    UnsupportedProofMode,
    InvalidOptions,
    PreparedAuthorityMismatch,
    /// Exact maximal-order splitting at equation-order index primes is not
    /// available to the BF/BDF phase yet.
    ResourceLimit(&'static str),
    InvalidPresentationShape,
    KernelRankMismatch {
        expected: usize,
        actual: usize,
    },
    KernelReplayMismatch,
    UnitRankMismatch {
        expected: usize,
        actual: usize,
    },
    UnitReplayMismatch,
    ReconstructionUnstable,
    MachineRepresentationLimit,
    RegulatorReplayOutsideEnclosure,
    AnalyticIndexNotIsolated {
        final_attempt: Option<AnalyticIndexFailureDiagnostic>,
    },
    FactorBaseNotCertified,
    Numerical(NumericalPreparationError),
    UnitLattice(UnitLatticeError),
    Splitting(PreparedFactorBaseError),
    AnalyticPlan(BelabasFriedmanPlanError),
    Flint(FlintNormalFormError),
}

impl std::fmt::Debug for CubicConditionalCompletionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedProofMode => formatter.write_str("UnsupportedProofMode"),
            Self::InvalidOptions => formatter.write_str("InvalidOptions"),
            Self::PreparedAuthorityMismatch => formatter.write_str("PreparedAuthorityMismatch"),
            Self::ResourceLimit(value) => {
                formatter.debug_tuple("ResourceLimit").field(value).finish()
            }
            Self::InvalidPresentationShape => formatter.write_str("InvalidPresentationShape"),
            Self::KernelRankMismatch { expected, actual } => formatter
                .debug_struct("KernelRankMismatch")
                .field("expected", expected)
                .field("actual", actual)
                .finish(),
            Self::KernelReplayMismatch => formatter.write_str("KernelReplayMismatch"),
            Self::UnitRankMismatch { expected, actual } => formatter
                .debug_struct("UnitRankMismatch")
                .field("expected", expected)
                .field("actual", actual)
                .finish(),
            Self::UnitReplayMismatch => formatter.write_str("UnitReplayMismatch"),
            Self::ReconstructionUnstable => formatter.write_str("ReconstructionUnstable"),
            Self::MachineRepresentationLimit => formatter.write_str("MachineRepresentationLimit"),
            Self::RegulatorReplayOutsideEnclosure => {
                formatter.write_str("RegulatorReplayOutsideEnclosure")
            }
            Self::AnalyticIndexNotIsolated { .. } => {
                formatter.write_str("AnalyticIndexNotIsolated")
            }
            Self::FactorBaseNotCertified => formatter.write_str("FactorBaseNotCertified"),
            Self::Numerical(error) => formatter.debug_tuple("Numerical").field(error).finish(),
            Self::UnitLattice(error) => formatter.debug_tuple("UnitLattice").field(error).finish(),
            Self::Splitting(error) => formatter.debug_tuple("Splitting").field(error).finish(),
            Self::AnalyticPlan(error) => {
                formatter.debug_tuple("AnalyticPlan").field(error).finish()
            }
            Self::Flint(error) => formatter.debug_tuple("Flint").field(error).finish(),
        }
    }
}

impl From<NumericalPreparationError> for CubicConditionalCompletionError {
    fn from(value: NumericalPreparationError) -> Self {
        Self::Numerical(value)
    }
}
impl From<UnitLatticeError> for CubicConditionalCompletionError {
    fn from(value: UnitLatticeError) -> Self {
        Self::UnitLattice(value)
    }
}
impl From<PreparedFactorBaseError> for CubicConditionalCompletionError {
    fn from(value: PreparedFactorBaseError) -> Self {
        Self::Splitting(value)
    }
}
impl From<BelabasFriedmanPlanError> for CubicConditionalCompletionError {
    fn from(value: BelabasFriedmanPlanError) -> Self {
        Self::AnalyticPlan(value)
    }
}
impl From<FlintNormalFormError> for CubicConditionalCompletionError {
    fn from(value: FlintNormalFormError) -> Self {
        Self::Flint(value)
    }
}

/// One compact unit as signed powers of authenticated principal-relation
/// generators.  Expansion is intentionally not part of the completion path.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompactCubicUnit {
    relation_exponents: Vec<Integer>,
}

impl CompactCubicUnit {
    pub fn relation_exponents(&self) -> &[Integer] {
        &self.relation_exponents
    }
}

/// Exact and numerical evidence for the reconstructed unit lattice.
#[derive(Clone, Debug)]
pub struct CubicUnitLatticeEvidence {
    fundamental_units: Vec<CompactCubicUnit>,
    selected_basis_index: Integer,
    common_denominator: Integer,
    regulator: FlintDyadicInterval,
}

impl CubicUnitLatticeEvidence {
    pub fn fundamental_units(&self) -> &[CompactCubicUnit] {
        &self.fundamental_units
    }
    pub fn selected_basis_index(&self) -> &Integer {
        &self.selected_basis_index
    }
    pub fn common_denominator(&self) -> &Integer {
        &self.common_denominator
    }
    pub fn regulator(&self) -> &FlintDyadicInterval {
        &self.regulator
    }
}

/// The directed analytic evidence which upgrades the candidate to conditional
/// completeness.
#[derive(Clone, Debug)]
pub struct CubicAnalyticEvidence {
    bf_threshold: u64,
    bf_plan: BelabasFriedmanPlan,
    bf_enclosure: FlintBfIndexEnclosure,
    bdf_plan: BdfFactorBasePlan,
    bdf_margin: FlintDyadicInterval,
}

/// One independently reconstructed logarithm/replay precision pair.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CubicCompletionPrecisionLevel {
    pub logarithm_precision_bits: u32,
    pub replay_precision_bits: u32,
}

/// Auditable evidence for bounded adaptive numerical reconstruction.
///
/// The requested values are hard ceilings. Every attempted level is recorded
/// in deterministic order and the accepted level is always the final entry.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CubicCompletionPrecisionEvidence {
    requested_logarithm_precision_bits: u32,
    requested_replay_precision_bits: u32,
    attempted_levels: Vec<CubicCompletionPrecisionLevel>,
}

impl CubicCompletionPrecisionEvidence {
    pub fn requested_logarithm_precision_bits(&self) -> u32 {
        self.requested_logarithm_precision_bits
    }
    pub fn requested_replay_precision_bits(&self) -> u32 {
        self.requested_replay_precision_bits
    }
    pub fn attempted_levels(&self) -> &[CubicCompletionPrecisionLevel] {
        &self.attempted_levels
    }
    pub fn accepted_level(&self) -> CubicCompletionPrecisionLevel {
        *self
            .attempted_levels
            .last()
            .expect("sealed completion records an accepted precision level")
    }
}

impl CubicAnalyticEvidence {
    pub const CLASS_UNIT_HYPOTHESIS: &'static str = "GRH for the Dedekind-zeta residue bound";
    pub const FACTOR_BASE_HYPOTHESIS: &'static str =
        "GRH for all unramified Hecke L-functions of class-group characters";
    pub fn bf_threshold(&self) -> u64 {
        self.bf_threshold
    }
    pub fn bf_plan(&self) -> &BelabasFriedmanPlan {
        &self.bf_plan
    }
    pub fn bf_enclosure(&self) -> &FlintBfIndexEnclosure {
        &self.bf_enclosure
    }
    pub fn bdf_plan(&self) -> &BdfFactorBasePlan {
        &self.bdf_plan
    }
    pub fn bdf_margin(&self) -> &FlintDyadicInterval {
        &self.bdf_margin
    }
}

/// A sealed result: construction is possible only after exact generation and
/// GRH-conditional index-one checks.  It is intentionally not named
/// unconditionally complete.
#[derive(Clone, Debug)]
pub struct GrhConditionalCompleteCubicClassGroup {
    prepared: PreparedPublicCubic,
    presentation: AuthenticatedCubicPresentationCandidate,
    units: CubicUnitLatticeEvidence,
    analytic: CubicAnalyticEvidence,
    precision: CubicCompletionPrecisionEvidence,
}

impl GrhConditionalCompleteCubicClassGroup {
    pub fn prepared(&self) -> &PreparedPublicCubic {
        &self.prepared
    }
    pub fn presentation(&self) -> &AuthenticatedCubicPresentationCandidate {
        &self.presentation
    }
    pub fn units(&self) -> &CubicUnitLatticeEvidence {
        &self.units
    }
    pub fn dependency_lattice(&self) -> &[Vec<Integer>] {
        self.presentation.dependency_lattice()
    }
    pub fn analytic(&self) -> &CubicAnalyticEvidence {
        &self.analytic
    }
    pub fn precision(&self) -> &CubicCompletionPrecisionEvidence {
        &self.precision
    }
    pub fn class_number(&self) -> &Integer {
        self.presentation.class_number_candidate()
    }
    pub fn invariant_factors(&self) -> &[Integer] {
        self.presentation.invariant_factors()
    }

    /// Check mutation-sensitive invariants of this sealed value.
    ///
    /// This is not an independent analytic replay: the private directed
    /// intervals retain the authority of the FLINT/Arb calls that constructed
    /// them. Exact relation/unit annihilation is replayed here.
    pub fn verify_sealed_evidence(&self) -> bool {
        if self.presentation.prepared() != &self.prepared {
            return false;
        }
        let collected = self.presentation.collected();
        let columns = collected.factor_base.exact_ideals.len();
        if columns == 0 || !collected.relations.len().is_multiple_of(columns) {
            return false;
        }
        let rows = collected.relations.len() / columns;
        let dependencies_annihilate = first_non_annihilating_i64_row(
            self.presentation.dependency_lattice(),
            &collected.relations,
            rows,
            columns,
        )
        .is_none();
        let units_annihilate = self.units.fundamental_units.iter().all(|unit| {
            first_non_annihilating_i64_row(
                std::slice::from_ref(&unit.relation_exponents),
                &collected.relations,
                rows,
                columns,
            )
            .is_none()
        });
        let unit_rank = usize::from(self.prepared.field().data().signature.0)
            + usize::from(self.prepared.field().data().signature.1)
            - 1;
        dependencies_annihilate
            && self.units.fundamental_units.len() == unit_rank
            && units_annihilate
            && interval_upper_lt(
                &self.analytic.bf_enclosure.tail_bound,
                Rational::from((1, 4)),
            )
            && interval_contains_unique_positive_one(&self.analytic.bf_enclosure.index)
            && interval_lower_gt_zero(&self.analytic.bdf_margin)
            && precision_evidence_is_valid(&self.precision)
    }
}

struct ReconstructedLattice {
    common_denominator: Integer,
    selected_basis_index: Integer,
    generator_combinations: Vec<Vec<Integer>>,
}

fn reconstruct(
    logarithms: &[[Float; 3]],
    bound: &Integer,
    signature: (u8, u8),
) -> Result<ReconstructedLattice, UnitLatticeError> {
    match signature {
        (1, 1) => {
            let value = reconstruct_rank_one_unit_lattice(logarithms, bound)?;
            Ok(ReconstructedLattice {
                common_denominator: value.common_denominator,
                selected_basis_index: value.selected_basis_index,
                generator_combinations: vec![value.generator_combination],
            })
        }
        (3, 0) => {
            let value = reconstruct_rank_two_unit_lattice(logarithms, bound)?;
            Ok(ReconstructedLattice {
                common_denominator: value.common_denominator,
                selected_basis_index: value.selected_basis_index,
                generator_combinations: value.generator_combinations.to_vec(),
            })
        }
        _ => Err(UnitLatticeError::WrongRank),
    }
}

fn reduce_dependency_basis_exact(
    dependencies: &[Vec<Integer>],
    relation_count: usize,
    relation_columns: usize,
    relations: &[i64],
) -> Result<Vec<Vec<Integer>>, CubicConditionalCompletionError> {
    let dependency_count = dependencies.len();
    // Charge the exact certificate before invoking FLINT. The retained proof
    // independently replays every kernel row, selects modular full-rank
    // projections, and evaluates at most 16 exact maximal minors. No dense
    // transform or inverse is constructed on this path.
    let dependency_count_u64 = u64::try_from(dependency_count)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let relation_count_u64 = u64::try_from(relation_count)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let relation_columns_u64 = u64::try_from(relation_columns)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let square = dependency_count_u64
        .checked_mul(dependency_count_u64)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let modular_basis_work = square
        .checked_mul(relation_count_u64)
        // Four preferred-prime attempts, at most nine distinct prime factors
        // of a u32 residual, and eleven deterministic fallback primes.
        .and_then(|work| work.checked_mul(24))
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let determinant_work = square
        .checked_mul(dependency_count_u64)
        .and_then(|work| work.checked_mul(16))
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let relation_replay = dependency_count_u64
        .checked_mul(relation_count_u64)
        .and_then(|work| work.checked_mul(relation_columns_u64))
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let certificate_work = modular_basis_work
        .checked_add(determinant_work)
        .and_then(|work| work.checked_add(relation_replay))
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    if certificate_work > MAXIMUM_DEPENDENCY_REDUCTION_OPERATIONS {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "dependency basis reduction certificate",
        ));
    }
    let input_bits = dependencies
        .iter()
        .flatten()
        .try_fold(0_u64, |total, value| {
            total.checked_add(u64::from(value.significant_bits()).max(1))
        })
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let input_bytes = input_bits
        .checked_add(7)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?
        / 8;
    if input_bytes > MAXIMUM_DEPENDENCY_REDUCTION_INPUT_BYTES {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "dependency basis reduction input bytes",
        ));
    }
    let produced = flint_left_kernel(relations, relation_count, relation_columns)
        .map_err(|_| CubicConditionalCompletionError::KernelReplayMismatch)?;
    if produced.rank != dependency_count || produced.relation_count != relation_count {
        return Err(CubicConditionalCompletionError::KernelRankMismatch {
            expected: dependency_count,
            actual: produced.rank,
        });
    }
    let reduced = produced
        .coefficients
        .chunks_exact(relation_count)
        .map(<[Integer]>::to_vec)
        .collect::<Vec<_>>();
    // FLINT is only the fast kernel producer. Independently prove that its
    // rows form the complete integral kernel: they have the exact rational
    // nullity, replay to zero against every relation column, and their maximal
    // minors have gcd one. The final condition makes the row lattice primitive
    // in Z^relation_count, hence it is the unique saturated lattice in this
    // rational kernel.
    if reduced.len() != dependency_count
        || reduced.iter().any(|dependency| {
            (0..relation_columns).any(|column| {
                (0..relation_count).fold(Integer::from(0), |sum, row| {
                    sum + &dependency[row] * relations[row * relation_columns + column]
                }) != 0
            })
        })
    {
        return Err(CubicConditionalCompletionError::KernelReplayMismatch);
    }
    let mut column_order = (0..relation_count).collect::<Vec<_>>();
    column_order.sort_by_key(|&column| {
        reduced
            .iter()
            .map(|row| row[column].significant_bits())
            .max()
            .unwrap_or(0)
    });
    let projection_columns = [65_521_u32, 65_519, 65_513, 65_499]
        .into_iter()
        .find_map(|prime| modular_basis_columns_in_order(&reduced, prime, &column_order))
        .ok_or(CubicConditionalCompletionError::KernelReplayMismatch)?;
    saturation_minor_certificate(&reduced, &projection_columns, 16)
        .map_err(|_| CubicConditionalCompletionError::KernelReplayMismatch)?;
    Ok(reduced)
}

fn reconstructed_unit_lattices_agree(
    left: &ReconstructedLattice,
    right: &ReconstructedLattice,
    dependency_count: usize,
) -> Result<bool, CubicConditionalCompletionError> {
    if left.selected_basis_index != right.selected_basis_index
        || left.generator_combinations.len() != right.generator_combinations.len()
        || left
            .generator_combinations
            .iter()
            .chain(&right.generator_combinations)
            .any(|combination| combination.len() != dependency_count)
    {
        return Ok(false);
    }
    let row_count = left.generator_combinations.len();
    let entry_count = row_count
        .checked_mul(dependency_count)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let max_entries = entry_count.max(
        row_count
            .checked_mul(row_count)
            .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?,
    );
    let limits = NormalFormLimits {
        max_entries,
        max_operations: MAXIMUM_DEPENDENCY_REDUCTION_OPERATIONS,
    };
    let canonical = |combinations: &[Vec<Integer>]| {
        let matrix = BigIntMatrix::try_new(
            row_count,
            dependency_count,
            combinations.iter().flatten().cloned().collect(),
        )
        .map_err(|_| CubicConditionalCompletionError::InvalidPresentationShape)?;
        let mut workspace = ExactNormalFormWorkspace::new(limits);
        let hnf = workspace.row_hnf(&matrix).map_err(|error| match error {
            NormalFormError::CapacityExceeded { .. }
            | NormalFormError::OperationLimitExceeded { .. } => {
                CubicConditionalCompletionError::ResourceLimit(
                    "reconstructed unit lattice comparison",
                )
            }
            _ => CubicConditionalCompletionError::KernelReplayMismatch,
        })?;
        if hnf.rank() != row_count {
            return Err(CubicConditionalCompletionError::UnitRankMismatch {
                expected: row_count,
                actual: hnf.rank(),
            });
        }
        Ok(hnf.hnf)
    };
    Ok(canonical(&left.generator_combinations)? == canonical(&right.generator_combinations)?)
}

fn reconstruct_dependency_basis(
    dependencies: &[Vec<Integer>],
    relation_logs: &[[Float; 3]],
    options: CubicConditionalCompletionOptions,
    signature: (u8, u8),
) -> Result<ReconstructedLattice, CubicConditionalCompletionError> {
    let maximum_coefficient_bits = dependencies
        .iter()
        .flatten()
        .map(Integer::significant_bits)
        .max()
        .unwrap_or(0) as usize;
    if maximum_coefficient_bits > options.maximum_kernel_coefficient_bits {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "kernel coefficient bits",
        ));
    }
    let dependency_logs = dependencies
        .iter()
        .map(|dependency| {
            let mut logs: [Float; 3] =
                std::array::from_fn(|_| Float::with_val(options.logarithm_precision_bits, 0));
            for (coefficient, relation) in dependency.iter().zip(relation_logs) {
                for index in 0..DEGREE {
                    let mut term = relation[index].clone();
                    term *= coefficient;
                    logs[index] += term;
                }
            }
            logs
        })
        .collect::<Vec<_>>();
    let denominator_bits = maximum_coefficient_bits.checked_add(16).ok_or(
        CubicConditionalCompletionError::ResourceLimit("denominator exponent"),
    )?;
    if denominator_bits > options.maximum_reconstruction_denominator_bits {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "reconstruction denominator bits",
        ));
    }
    let denominator_bound = Integer::from(1) << denominator_bits;
    let lattice = reconstruct(&dependency_logs, &denominator_bound, signature)?;
    let replay_logs = dependency_logs
        .iter()
        .map(|row| {
            std::array::from_fn(|index| Float::with_val(options.replay_precision_bits, &row[index]))
        })
        .collect::<Vec<_>>();
    let replay_lattice = reconstruct(&replay_logs, &denominator_bound, signature)?;
    if !reconstructed_unit_lattices_agree(&lattice, &replay_lattice, dependencies.len())? {
        return Err(CubicConditionalCompletionError::ReconstructionUnstable);
    }
    Ok(lattice)
}

fn dyadic_endpoint(mantissa: &Integer, exponent: i64) -> Option<Rational> {
    if exponent >= 0 {
        let shift = u32::try_from(exponent).ok()?;
        if shift > MAXIMUM_DYADIC_SHIFT {
            return None;
        }
        Some(Rational::from(mantissa << shift))
    } else {
        let shift = u32::try_from(exponent.checked_neg()?).ok()?;
        if shift > MAXIMUM_DYADIC_SHIFT {
            return None;
        }
        Some(Rational::from((
            mantissa.clone(),
            Integer::from(1) << shift,
        )))
    }
}

fn interval_lower_gt_zero(interval: &FlintDyadicInterval) -> bool {
    interval.lower > 0
}
fn interval_lower_gt(interval: &FlintDyadicInterval, bound: Rational) -> bool {
    dyadic_endpoint(&interval.lower, interval.binary_exponent).is_some_and(|value| value > bound)
}
fn interval_upper_lt(interval: &FlintDyadicInterval, bound: Rational) -> bool {
    dyadic_endpoint(&interval.upper, interval.binary_exponent).is_some_and(|value| value < bound)
}
fn interval_contains_unique_positive_one(interval: &FlintDyadicInterval) -> bool {
    let Some(lower) = dyadic_endpoint(&interval.lower, interval.binary_exponent) else {
        return false;
    };
    let Some(upper) = dyadic_endpoint(&interval.upper, interval.binary_exponent) else {
        return false;
    };
    lower > 0 && lower <= 1 && upper >= 1 && upper < 2
}

fn precision_evidence_is_valid(evidence: &CubicCompletionPrecisionEvidence) -> bool {
    if evidence.requested_logarithm_precision_bits < 64
        || evidence.requested_replay_precision_bits < 64
        || evidence.requested_replay_precision_bits >= evidence.requested_logarithm_precision_bits
        || evidence.requested_logarithm_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || evidence.requested_replay_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
    {
        return false;
    }
    let schedule = completion_precision_schedule(
        evidence.requested_logarithm_precision_bits,
        evidence.requested_replay_precision_bits,
    );
    !evidence.attempted_levels.is_empty()
        && evidence.attempted_levels.len() <= schedule.len()
        && evidence.attempted_levels == schedule[..evidence.attempted_levels.len()]
}

fn completion_precision_schedule(
    logarithm_ceiling: u32,
    replay_ceiling: u32,
) -> Vec<CubicCompletionPrecisionLevel> {
    let mut logarithm = logarithm_ceiling.min(4_096);
    let mut replay = replay_ceiling.min(2_048);
    let mut levels = Vec::new();
    loop {
        levels.push(CubicCompletionPrecisionLevel {
            logarithm_precision_bits: logarithm,
            replay_precision_bits: replay,
        });
        if logarithm == logarithm_ceiling && replay == replay_ceiling {
            break;
        }
        logarithm = logarithm.saturating_mul(2).min(logarithm_ceiling);
        replay = replay.saturating_mul(2).min(replay_ceiling);
    }
    levels
}

fn retryable_precision_error(error: &CubicConditionalCompletionError) -> bool {
    matches!(
        error,
        CubicConditionalCompletionError::ReconstructionUnstable
            | CubicConditionalCompletionError::RegulatorReplayOutsideEnclosure
    )
}

fn preflight_completion_presentation(
    prepared: &PreparedPublicCubic,
    presentation: &AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
) -> Result<(usize, usize, usize), CubicConditionalCompletionError> {
    if presentation.prepared() != prepared {
        return Err(CubicConditionalCompletionError::PreparedAuthorityMismatch);
    }
    if options.maximum_relations == 0
        || options.maximum_dependencies == 0
        || options.maximum_kernel_coefficient_bits == 0
        || options.maximum_unit_exponent_bits == 0
        || options.maximum_reconstruction_denominator_bits == 0
    {
        return Err(CubicConditionalCompletionError::InvalidOptions);
    }
    let collected = presentation.collected();
    let columns = collected.factor_base.exact_ideals.len();
    if columns == 0 || !collected.relations.len().is_multiple_of(columns) {
        return Err(CubicConditionalCompletionError::InvalidPresentationShape);
    }
    let rows = collected.relations.len() / columns;
    if rows > options.maximum_relations {
        return Err(CubicConditionalCompletionError::ResourceLimit("relations"));
    }
    let expected_dependencies = rows
        .checked_sub(columns)
        .ok_or(CubicConditionalCompletionError::InvalidPresentationShape)?;
    if expected_dependencies == 0 || expected_dependencies > options.maximum_dependencies {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "dependencies",
        ));
    }
    Ok((columns, rows, expected_dependencies))
}

/// Build the field-level completion evidence shared by every continuation and
/// precision attempt for one factor base.
pub fn prepare_cubic_conditional_completion_context(
    prepared: &PreparedPublicCubic,
    presentation: &AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
) -> Result<CubicConditionalCompletionContext, CubicConditionalCompletionError> {
    if options.proof_mode != CubicCompletionProofMode::GrhConditional {
        return Err(CubicConditionalCompletionError::UnsupportedProofMode);
    }
    if options.logarithm_precision_bits < 64
        || options.replay_precision_bits < 64
        || options.replay_precision_bits >= options.logarithm_precision_bits
        || options.analytic_precision_bits < 64
        || options.logarithm_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || options.replay_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || options.analytic_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || options.maximum_analytic_threshold < 72
    {
        return Err(CubicConditionalCompletionError::InvalidOptions);
    }
    // Reject malformed or over-budget presentation evidence before computing
    // any field-level analytic data for the reusable context.
    preflight_completion_presentation(prepared, presentation, options)?;
    let bdf_bound = u64::try_from(presentation.collected().factor_base.catalog.relation_bound)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?
        + 1;
    if bdf_bound > options.maximum_analytic_threshold {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "factor-base analytic bound",
        ));
    }
    let bdf_bound_usize = usize::try_from(bdf_bound)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let bdf_splitting =
        prepared_cubic_splitting_records_range(prepared.field(), 2, bdf_bound_usize)?;
    let bdf_plan = build_cubic_bdf_factor_base_plan(bdf_bound, &bdf_splitting)?;
    let bdf_margin = flint_bdf_factor_base_margin(
        &bdf_plan.terms,
        bdf_plan.bound,
        &prepared.field().data().discriminant,
        3,
        u64::from(prepared.field().data().signature.0),
        options.analytic_precision_bits,
    )?;
    if !interval_lower_gt_zero(&bdf_margin) {
        return Err(CubicConditionalCompletionError::FactorBaseNotCertified);
    }
    Ok(CubicConditionalCompletionContext {
        prepared: prepared.clone(),
        factor_base_bound: bdf_bound,
        analytic_precision_bits: options.analytic_precision_bits,
        maximum_analytic_threshold: options.maximum_analytic_threshold,
        bdf_plan,
        bdf_margin,
        bf_splitting_bound: 2,
        bf_incremental_plan: IncrementalCubicBelabasFriedmanPlan::new(),
        bf_plans: Vec::new(),
        relation_log_prefixes: Vec::new(),
    })
}

fn ensure_cached_relation_logs(
    prepared: &PreparedPublicCubic,
    collected: &crate::class_group::PreparedCubicRelationPresentation,
    precision_bits: u32,
    context: &mut CubicConditionalCompletionContext,
) -> Result<usize, CubicConditionalCompletionError> {
    if !collected.generators.len().is_multiple_of(DEGREE) {
        return Err(CubicConditionalCompletionError::InvalidPresentationShape);
    }
    let cache_index = if let Some(index) = context
        .relation_log_prefixes
        .iter()
        .position(|cache| cache.precision_bits == precision_bits)
    {
        index
    } else {
        context.relation_log_prefixes.push(CachedRelationLogPrefix {
            precision_bits,
            embedding: PreparedCubicEmbedding::from_validated(prepared.field(), precision_bits)?,
            generator_coordinates: Vec::new(),
            logarithms: Vec::new(),
        });
        context.relation_log_prefixes.len() - 1
    };
    let cache = &mut context.relation_log_prefixes[cache_index];
    if !exact_generator_prefix_matches(
        &cache.generator_coordinates,
        cache.logarithms.len(),
        &collected.generators,
    ) {
        cache.generator_coordinates.clear();
        cache.logarithms.clear();
    }
    let first_new_entry = cache.generator_coordinates.len();
    for coordinates in collected.generators[first_new_entry..].chunks_exact(DEGREE) {
        cache
            .logarithms
            .push(cache.embedding.unit_lattice_logarithmic_embedding(&[
                coordinates[0].clone(),
                coordinates[1].clone(),
                coordinates[2].clone(),
            ])?);
    }
    cache
        .generator_coordinates
        .extend_from_slice(&collected.generators[first_new_entry..]);
    Ok(cache_index)
}

/// Complete a cubic candidate using previously authenticated field-level
/// analytic data. The context is rejected if any part of its authority or
/// analytic resource contract differs from this attempt.
pub fn complete_cubic_class_group_conditionally_with_context(
    prepared: PreparedPublicCubic,
    presentation: AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
    context: &mut CubicConditionalCompletionContext,
) -> Result<GrhConditionalCompleteCubicClassGroup, CubicConditionalCompletionError> {
    let factor_base_bound =
        u64::try_from(presentation.collected().factor_base.catalog.relation_bound)
            .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?
            + 1;
    if context.prepared != prepared
        || presentation.prepared() != &prepared
        || context.factor_base_bound != factor_base_bound
    {
        return Err(CubicConditionalCompletionError::PreparedAuthorityMismatch);
    }
    if context.analytic_precision_bits != options.analytic_precision_bits
        || context.maximum_analytic_threshold != options.maximum_analytic_threshold
    {
        return Err(CubicConditionalCompletionError::InvalidOptions);
    }
    let levels = completion_precision_schedule(
        options.logarithm_precision_bits,
        options.replay_precision_bits,
    );
    let mut prepared_owner = Some(prepared);
    let mut presentation_owner = Some(presentation);
    let mut attempted_levels = Vec::with_capacity(levels.len());
    for (index, level) in levels.iter().copied().enumerate() {
        attempted_levels.push(level);
        let mut attempt_options = options;
        attempt_options.logarithm_precision_bits = level.logarithm_precision_bits;
        attempt_options.replay_precision_bits = level.replay_precision_bits;
        let precision = CubicCompletionPrecisionEvidence {
            requested_logarithm_precision_bits: options.logarithm_precision_bits,
            requested_replay_precision_bits: options.replay_precision_bits,
            attempted_levels: attempted_levels.clone(),
        };
        let final_level = index + 1 == levels.len();
        let attempt_prepared = if final_level {
            prepared_owner
                .take()
                .expect("the final precision level is attempted once")
        } else {
            prepared_owner
                .as_ref()
                .expect("an earlier precision level retains the owner")
                .clone()
        };
        let attempt_presentation = if final_level {
            presentation_owner
                .take()
                .expect("the final precision level is attempted once")
        } else {
            presentation_owner
                .as_ref()
                .expect("an earlier precision level retains the owner")
                .clone()
        };
        match complete_cubic_class_group_at_precision(
            attempt_prepared,
            attempt_presentation,
            attempt_options,
            precision,
            context,
        ) {
            Ok(completed) => {
                debug_assert!(completed.verify_sealed_evidence());
                return Ok(completed);
            }
            Err(error) if retryable_precision_error(&error) && index + 1 < levels.len() => {}
            Err(error) => return Err(error),
        }
    }
    unreachable!("a nonempty precision schedule always returns from its final level")
}

/// Complete a cubic candidate under the two explicitly recorded GRH
/// hypotheses. No fixture identifier, expected answer, relation transcript,
/// or external oracle enters this boundary.
pub fn complete_cubic_class_group_conditionally(
    prepared: PreparedPublicCubic,
    presentation: AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
) -> Result<GrhConditionalCompleteCubicClassGroup, CubicConditionalCompletionError> {
    let mut context =
        prepare_cubic_conditional_completion_context(&prepared, &presentation, options)?;
    complete_cubic_class_group_conditionally_with_context(
        prepared,
        presentation,
        options,
        &mut context,
    )
}

fn complete_cubic_class_group_at_precision(
    prepared: PreparedPublicCubic,
    presentation: AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
    precision: CubicCompletionPrecisionEvidence,
    context: &mut CubicConditionalCompletionContext,
) -> Result<GrhConditionalCompleteCubicClassGroup, CubicConditionalCompletionError> {
    if options.proof_mode != CubicCompletionProofMode::GrhConditional {
        return Err(CubicConditionalCompletionError::UnsupportedProofMode);
    }
    if options.logarithm_precision_bits < 64
        || options.replay_precision_bits < 64
        || options.replay_precision_bits >= options.logarithm_precision_bits
        || options.analytic_precision_bits < 64
        || options.logarithm_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || options.replay_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || options.analytic_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || options.maximum_analytic_threshold < 72
        || options.maximum_relations == 0
        || options.maximum_dependencies == 0
        || options.maximum_kernel_coefficient_bits == 0
        || options.maximum_unit_exponent_bits == 0
        || options.maximum_reconstruction_denominator_bits == 0
    {
        return Err(CubicConditionalCompletionError::InvalidOptions);
    }
    if presentation.prepared() != &prepared {
        return Err(CubicConditionalCompletionError::PreparedAuthorityMismatch);
    }
    let collected = presentation.collected();
    let (columns, rows, expected_dependencies) =
        preflight_completion_presentation(&prepared, &presentation, options)?;
    let mut dependencies: Cow<'_, [Vec<Integer>]> =
        Cow::Borrowed(presentation.dependency_lattice());
    if dependencies.len() != expected_dependencies {
        return Err(CubicConditionalCompletionError::KernelRankMismatch {
            expected: expected_dependencies,
            actual: dependencies.len(),
        });
    }
    if dependencies
        .iter()
        .any(|dependency| dependency.len() != rows)
    {
        return Err(CubicConditionalCompletionError::InvalidPresentationShape);
    }
    let mut maximum_coefficient_bits = dependencies
        .iter()
        .flatten()
        .map(Integer::significant_bits)
        .max()
        .unwrap_or(0) as usize;
    // A valid kernel basis can contain enormous incidental coefficients even
    // when the same saturated lattice has a small canonical basis. Reduce it
    // exactly before rejecting on the public coefficient ceiling. FLINT
    // produces a fresh integral left kernel from the original relation
    // matrix; Rust then replays it and proves saturation independently.
    if maximum_coefficient_bits > options.maximum_kernel_coefficient_bits {
        dependencies = Cow::Owned(reduce_dependency_basis_exact(
            dependencies.as_ref(),
            rows,
            columns,
            &collected.relations,
        )?);
        maximum_coefficient_bits = dependencies
            .iter()
            .flatten()
            .map(Integer::significant_bits)
            .max()
            .unwrap_or(0) as usize;
        if maximum_coefficient_bits > options.maximum_kernel_coefficient_bits {
            return Err(CubicConditionalCompletionError::ResourceLimit(
                "kernel coefficient bits",
            ));
        }
    }
    if first_non_annihilating_i64_row(dependencies.as_ref(), &collected.relations, rows, columns)
        .is_some()
    {
        return Err(CubicConditionalCompletionError::KernelReplayMismatch);
    }

    let relation_log_cache_index = ensure_cached_relation_logs(
        &prepared,
        collected,
        options.logarithm_precision_bits,
        context,
    )?;
    let relation_logs = &context.relation_log_prefixes[relation_log_cache_index].logarithms;
    if relation_logs.len() != rows {
        return Err(CubicConditionalCompletionError::InvalidPresentationShape);
    }
    let original_reconstruction = reconstruct_dependency_basis(
        dependencies.as_ref(),
        &relation_logs,
        options,
        prepared.field().data().signature,
    );
    let (working_dependencies, lattice) = match original_reconstruction {
        Ok(lattice) => (Cow::Borrowed(dependencies.as_ref()), lattice),
        Err(CubicConditionalCompletionError::ReconstructionUnstable) => {
            let reduced = reduce_dependency_basis_exact(
                dependencies.as_ref(),
                rows,
                columns,
                &collected.relations,
            )?;
            if reduced.as_slice() == dependencies.as_ref() {
                return Err(CubicConditionalCompletionError::ReconstructionUnstable);
            }
            let lattice = reconstruct_dependency_basis(
                &reduced,
                &relation_logs,
                options,
                prepared.field().data().signature,
            )?;
            (Cow::Owned(reduced), lattice)
        }
        Err(error) => return Err(error),
    };
    let unit_rank = usize::from(prepared.field().data().signature.0)
        + usize::from(prepared.field().data().signature.1)
        - 1;
    if lattice.generator_combinations.len() != unit_rank {
        return Err(CubicConditionalCompletionError::UnitRankMismatch {
            expected: unit_rank,
            actual: lattice.generator_combinations.len(),
        });
    }
    let mut fundamental_units = Vec::with_capacity(unit_rank);
    let mut flattened_exponents = Vec::with_capacity(unit_rank * rows);
    for combination in &lattice.generator_combinations {
        if combination.len() != working_dependencies.len() {
            return Err(CubicConditionalCompletionError::InvalidPresentationShape);
        }
        let mut exponents = vec![Integer::from(0); rows];
        for (multiple, dependency) in combination.iter().zip(working_dependencies.iter()) {
            for row in 0..rows {
                exponents[row] += multiple * &dependency[row];
            }
        }
        if !exact_integer_i64_row_annihilates(&exponents, &collected.relations, rows, columns) {
            return Err(CubicConditionalCompletionError::UnitReplayMismatch);
        }
        if exponents
            .iter()
            .any(|value| value.significant_bits() as usize > options.maximum_unit_exponent_bits)
        {
            return Err(CubicConditionalCompletionError::ResourceLimit(
                "unit exponent bits",
            ));
        }
        flattened_exponents.extend(exponents.iter().cloned());
        fundamental_units.push(CompactCubicUnit {
            relation_exponents: exponents,
        });
    }

    let polynomial =
        std::array::from_fn(|index| prepared.field().data().polynomial_ascending[index].to_i64());
    let basis = std::array::from_fn(|index| {
        prepared.field().data().integral_basis_numerators[index].to_i64()
    });
    if polynomial.iter().any(Option::is_none) || basis.iter().any(Option::is_none) {
        return Err(CubicConditionalCompletionError::MachineRepresentationLimit);
    }
    let polynomial = polynomial.map(Option::unwrap);
    let basis = basis.map(Option::unwrap);
    let Some(denominator) = prepared.field().data().basis_denominator.to_u64() else {
        return Err(CubicConditionalCompletionError::MachineRepresentationLimit);
    };
    let regulator = flint_compact_cubic_regulator(
        polynomial,
        basis,
        denominator,
        prepared.field().data().signature,
        &collected.generators,
        &flattened_exponents,
        options.logarithm_precision_bits,
    )?;

    // Independent MPFR replay from the same exact compact exponents.
    let mut fundamental_logs = Vec::with_capacity(unit_rank);
    for unit in &fundamental_units {
        let mut logs: [Float; 3] =
            std::array::from_fn(|_| Float::with_val(options.logarithm_precision_bits, 0));
        for (coefficient, relation) in unit.relation_exponents.iter().zip(relation_logs) {
            for index in 0..DEGREE {
                let mut term = relation[index].clone();
                term *= coefficient;
                logs[index] += term;
            }
        }
        fundamental_logs.push(logs);
    }
    let mut replayed_regulator = fundamental_logs[0][0].clone();
    if unit_rank == 2 {
        replayed_regulator *= &fundamental_logs[1][1];
        let mut cross = fundamental_logs[0][1].clone();
        cross *= &fundamental_logs[1][0];
        replayed_regulator -= cross;
    }
    replayed_regulator.abs_mut();
    let Some(replayed_rational) = replayed_regulator.to_rational() else {
        return Err(CubicConditionalCompletionError::RegulatorReplayOutsideEnclosure);
    };
    let regulator_lower = dyadic_endpoint(&regulator.lower, regulator.binary_exponent)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let regulator_upper = dyadic_endpoint(&regulator.upper, regulator.binary_exponent)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    if replayed_rational < regulator_lower || replayed_rational > regulator_upper {
        return Err(CubicConditionalCompletionError::RegulatorReplayOutsideEnclosure);
    }

    let class_number = presentation
        .class_number_candidate()
        .to_u64()
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let thresholds = [
        72_u64, 144, 288, 576, 1_152, 2_304, 4_608, 9_216, 18_432, 23_994,
    ];
    // The first four cutoffs never isolate the index on the frozen open cubic
    // panel (including the two smallest discriminants), while each attempt
    // repeats a complete exact splitting prefix and Arb enclosure. Starting
    // at 1,152 changes no accepted certificate in that panel and remains
    // mathematically fail-closed: a larger cutoff supplies strictly more
    // authenticated Euler data, and callers with a smaller explicit budget
    // still receive `AnalyticIndexNotIsolated`.
    let initial = 1_152;
    let mut accepted = None;
    let mut final_failed_attempt = None;
    for threshold in thresholds
        .into_iter()
        .filter(|value| *value >= initial && *value <= options.maximum_analytic_threshold)
    {
        let plan = if let Some(plan) = context
            .bf_plans
            .iter()
            .find(|plan| plan.threshold == threshold)
        {
            plan.clone()
        } else {
            let extension = prepared_cubic_splitting_records_range(
                prepared.field(),
                context.bf_splitting_bound,
                threshold as usize,
            )?;
            let plan = context
                .bf_incremental_plan
                .extend_to(threshold, &extension)?;
            context.bf_splitting_bound = threshold as usize;
            context.bf_plans.push(plan.clone());
            plan
        };
        let enclosure = flint_bf_index_enclosure(
            &plan.terms,
            threshold,
            &prepared.field().data().discriminant,
            class_number,
            ROOTS_OF_UNITY_IN_CUBIC_FIELD,
            (
                u64::from(prepared.field().data().signature.0),
                u64::from(prepared.field().data().signature.1),
            ),
            &regulator,
            options.analytic_precision_bits,
        )?;
        let tail_bound_below_quarter =
            interval_upper_lt(&enclosure.tail_bound, Rational::from((1, 4)));
        let index_isolated = interval_contains_unique_positive_one(&enclosure.index);
        if tail_bound_below_quarter && index_isolated {
            accepted = Some((threshold, plan, enclosure));
            break;
        }
        let diagnostic = AnalyticIndexFailureDiagnostic {
            threshold,
            enclosure,
            tail_bound_below_quarter,
        };
        // Once the rigorous residue tail is below the theorem's quarter
        // threshold and the complete index enclosure lies strictly above one,
        // this candidate cannot become complete by evaluating more Euler
        // terms.  Return immediately so the caller can collect more exact
        // relations.  This is a rejection-only shortcut: publication still
        // requires the unchanged unique-positive-one test above.
        if tail_bound_below_quarter
            && interval_lower_gt(&diagnostic.enclosure.index, Rational::from(1))
        {
            return Err(CubicConditionalCompletionError::AnalyticIndexNotIsolated {
                final_attempt: Some(diagnostic),
            });
        }
        final_failed_attempt = Some(diagnostic);
    }
    let Some((bf_threshold, bf_plan, bf_enclosure)) = accepted else {
        return Err(CubicConditionalCompletionError::AnalyticIndexNotIsolated {
            final_attempt: final_failed_attempt,
        });
    };
    drop(working_dependencies);
    drop(dependencies);
    // Every expensive exact invariant replayed by `verify_sealed_evidence`
    // has already been established on this construction path:
    //
    // * the complete dependency lattice was checked above;
    // * every reconstructed fundamental unit was checked above;
    // * `accepted` is populated only by the unchanged tail/index tests; and
    // * the reusable context was constructed only after a positive BDF margin.
    //
    // Do not immediately scan the same relation matrix a second time.  The
    // result owns all of this private, immutable evidence, so no caller can
    // mutate it between those checks and construction.  Retain the cheap
    // precision check here because it is not otherwise part of an expensive
    // replay, and retain `verify_sealed_evidence` as the public independent
    // replay boundary for stored or transported results.
    if !precision_evidence_is_valid(&precision) {
        return Err(CubicConditionalCompletionError::InvalidOptions);
    }
    let result = GrhConditionalCompleteCubicClassGroup {
        prepared,
        presentation,
        units: CubicUnitLatticeEvidence {
            fundamental_units,
            selected_basis_index: lattice.selected_basis_index,
            common_denominator: lattice.common_denominator,
            regulator,
        },
        analytic: CubicAnalyticEvidence {
            bf_threshold,
            bf_plan,
            bf_enclosure,
            bdf_plan: context.bdf_plan.clone(),
            bdf_margin: context.bdf_margin.clone(),
        },
        precision,
    };
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relation_log_cache_reuses_only_an_exact_complete_generator_prefix() {
        let cached = [1, 2, 3, 4, 5, 6].map(Integer::from);
        let extension = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(Integer::from);
        assert!(exact_generator_prefix_matches(&cached, 2, &extension));
        assert!(!exact_generator_prefix_matches(&cached, 1, &extension));
        assert!(!exact_generator_prefix_matches(&cached, 2, &extension[..3]));
        let mut changed = extension;
        changed[4] = Integer::from(50);
        assert!(!exact_generator_prefix_matches(&cached, 2, &changed));
    }

    #[test]
    fn precision_schedule_is_bounded_deterministic_and_ends_at_the_ceiling() {
        assert_eq!(
            completion_precision_schedule(8_192, 4_096),
            [
                CubicCompletionPrecisionLevel {
                    logarithm_precision_bits: 4_096,
                    replay_precision_bits: 2_048,
                },
                CubicCompletionPrecisionLevel {
                    logarithm_precision_bits: 8_192,
                    replay_precision_bits: 4_096,
                },
            ]
        );
        assert_eq!(
            completion_precision_schedule(4_096, 2_048),
            [CubicCompletionPrecisionLevel {
                logarithm_precision_bits: 4_096,
                replay_precision_bits: 2_048,
            }]
        );
        let uneven = completion_precision_schedule(10_000, 3_000);
        assert_eq!(
            uneven.last(),
            Some(&CubicCompletionPrecisionLevel {
                logarithm_precision_bits: 10_000,
                replay_precision_bits: 3_000,
            })
        );
        assert!(uneven.iter().all(|level| {
            level.logarithm_precision_bits <= 10_000 && level.replay_precision_bits <= 3_000
        }));
    }

    #[test]
    fn precision_evidence_rejects_a_level_above_the_requested_ceiling() {
        let evidence = CubicCompletionPrecisionEvidence {
            requested_logarithm_precision_bits: 4_096,
            requested_replay_precision_bits: 2_048,
            attempted_levels: vec![CubicCompletionPrecisionLevel {
                logarithm_precision_bits: 8_192,
                replay_precision_bits: 4_096,
            }],
        };
        assert!(!precision_evidence_is_valid(&evidence));
    }

    #[test]
    fn precision_evidence_rejects_a_noncanonical_schedule_prefix() {
        let evidence = CubicCompletionPrecisionEvidence {
            requested_logarithm_precision_bits: 8_192,
            requested_replay_precision_bits: 4_096,
            attempted_levels: vec![CubicCompletionPrecisionLevel {
                logarithm_precision_bits: 8_192,
                replay_precision_bits: 4_096,
            }],
        };
        assert!(!precision_evidence_is_valid(&evidence));
    }
}
