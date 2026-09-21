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
use crate::cubic_presentation::AuthenticatedCubicPresentationCandidate;
use crate::flint_normal_form::{
    FlintBfIndexEnclosure, FlintDyadicInterval, FlintNormalFormError, flint_bdf_factor_base_margin,
    flint_bf_index_enclosure, flint_compact_cubic_regulator,
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

const DEGREE: usize = 3;
const ROOTS_OF_UNITY_IN_CUBIC_FIELD: u64 = 2;
const MAXIMUM_COMPLETION_PRECISION_BITS: u32 = 16_384;
const MAXIMUM_DYADIC_SHIFT: u32 = 1_000_000;
const MAXIMUM_DEPENDENCY_REDUCTION_OPERATIONS: u64 = 1_000_000;

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
    dependency_lattice: Vec<Vec<Integer>>,
    fundamental_units: Vec<CompactCubicUnit>,
    selected_basis_index: Integer,
    common_denominator: Integer,
    regulator: FlintDyadicInterval,
}

impl CubicUnitLatticeEvidence {
    pub fn dependency_lattice(&self) -> &[Vec<Integer>] {
        &self.dependency_lattice
    }
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
        let annihilates = |coefficients: &[Integer]| {
            coefficients.len() == rows
                && (0..columns).all(|column| {
                    (0..rows).fold(Integer::from(0), |sum, row| {
                        sum + &coefficients[row] * collected.relations[row * columns + column]
                    }) == 0
                })
        };
        let unit_rank = usize::from(self.prepared.field().data().signature.0)
            + usize::from(self.prepared.field().data().signature.1)
            - 1;
        self.units
            .dependency_lattice
            .iter()
            .all(|row| annihilates(row))
            && self.units.fundamental_units.len() == unit_rank
            && self
                .units
                .fundamental_units
                .iter()
                .all(|unit| annihilates(&unit.relation_exponents))
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
    let entry_count = dependency_count
        .checked_mul(relation_count)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let transform_entries = dependency_count
        .checked_mul(dependency_count)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    // Charge the exact certificate replay before constructing the HNF.  The
    // workspace separately interrupts its reduction operations; this bound
    // covers H = U*D, both U/U^-1 products, and replaying every reduced
    // dependency against every original relation column.
    let dependency_count_u64 = u64::try_from(dependency_count)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let relation_count_u64 = u64::try_from(relation_count)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let relation_columns_u64 = u64::try_from(relation_columns)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let square = dependency_count_u64
        .checked_mul(dependency_count_u64)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let transform_replay = square
        .checked_mul(relation_count_u64)
        .and_then(|work| {
            square
                .checked_mul(dependency_count_u64)
                .and_then(|cube| cube.checked_mul(2))
                .and_then(|identities| work.checked_add(identities))
        })
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let relation_replay = dependency_count_u64
        .checked_mul(relation_count_u64)
        .and_then(|work| work.checked_mul(relation_columns_u64))
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    let certificate_work = transform_replay
        .checked_add(relation_replay)
        .ok_or(CubicConditionalCompletionError::MachineRepresentationLimit)?;
    if certificate_work > MAXIMUM_DEPENDENCY_REDUCTION_OPERATIONS {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "dependency basis reduction certificate",
        ));
    }
    let source = BigIntMatrix::try_new(
        dependency_count,
        relation_count,
        dependencies.iter().flatten().cloned().collect(),
    )
    .map_err(|_| CubicConditionalCompletionError::InvalidPresentationShape)?;
    let mut workspace = ExactNormalFormWorkspace::new(NormalFormLimits {
        max_entries: entry_count.max(transform_entries),
        max_operations: MAXIMUM_DEPENDENCY_REDUCTION_OPERATIONS,
    });
    let reduction = workspace.row_hnf(&source).map_err(|error| match error {
        NormalFormError::CapacityExceeded { .. }
        | NormalFormError::OperationLimitExceeded { .. } => {
            CubicConditionalCompletionError::ResourceLimit("dependency basis reduction")
        }
        _ => CubicConditionalCompletionError::KernelReplayMismatch,
    })?;
    // `verify` proves both H = U*D and that U and U^-1 are mutual inverses,
    // hence the reduced rows span exactly the authenticated saturated kernel.
    reduction
        .verify(&source)
        .map_err(|_| CubicConditionalCompletionError::KernelReplayMismatch)?;
    if reduction.rank() != dependency_count {
        return Err(CubicConditionalCompletionError::KernelRankMismatch {
            expected: dependency_count,
            actual: reduction.rank(),
        });
    }
    let reduced = reduction
        .hnf
        .values()
        .chunks_exact(relation_count)
        .map(<[Integer]>::to_vec)
        .collect::<Vec<_>>();
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

/// Complete a cubic candidate under the two explicitly recorded GRH
/// hypotheses. No fixture identifier, expected answer, relation transcript,
/// or external oracle enters this boundary.
pub fn complete_cubic_class_group_conditionally(
    prepared: PreparedPublicCubic,
    presentation: AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
) -> Result<GrhConditionalCompleteCubicClassGroup, CubicConditionalCompletionError> {
    if options.logarithm_precision_bits < 64
        || options.replay_precision_bits < 64
        || options.replay_precision_bits >= options.logarithm_precision_bits
        || options.logarithm_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
        || options.replay_precision_bits > MAXIMUM_COMPLETION_PRECISION_BITS
    {
        return Err(CubicConditionalCompletionError::InvalidOptions);
    }
    let levels = completion_precision_schedule(
        options.logarithm_precision_bits,
        options.replay_precision_bits,
    );
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
        match complete_cubic_class_group_at_precision(
            prepared.clone(),
            presentation.clone(),
            attempt_options,
            precision,
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

fn complete_cubic_class_group_at_precision(
    prepared: PreparedPublicCubic,
    presentation: AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
    precision: CubicCompletionPrecisionEvidence,
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
    let dependencies = presentation.dependency_lattice().to_vec();
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
    if dependencies.iter().any(|dependency| {
        (0..columns).any(|column| {
            (0..rows).fold(Integer::from(0), |sum, row| {
                sum + &dependency[row] * collected.relations[row * columns + column]
            }) != 0
        })
    }) {
        return Err(CubicConditionalCompletionError::KernelReplayMismatch);
    }

    let embedding =
        PreparedCubicEmbedding::from_validated(prepared.field(), options.logarithm_precision_bits)?;
    let relation_logs = collected
        .generators
        .chunks_exact(DEGREE)
        .map(|coordinates| {
            embedding.unit_lattice_logarithmic_embedding(&[
                coordinates[0].clone(),
                coordinates[1].clone(),
                coordinates[2].clone(),
            ])
        })
        .collect::<Result<Vec<_>, _>>()?;
    if relation_logs.len() != rows {
        return Err(CubicConditionalCompletionError::InvalidPresentationShape);
    }
    let original_reconstruction = reconstruct_dependency_basis(
        &dependencies,
        &relation_logs,
        options,
        prepared.field().data().signature,
    );
    let (working_dependencies, lattice) = match original_reconstruction {
        Ok(lattice) => (dependencies.clone(), lattice),
        Err(CubicConditionalCompletionError::ReconstructionUnstable) => {
            let reduced =
                reduce_dependency_basis_exact(&dependencies, rows, columns, &collected.relations)?;
            if reduced == dependencies {
                return Err(CubicConditionalCompletionError::ReconstructionUnstable);
            }
            let lattice = reconstruct_dependency_basis(
                &reduced,
                &relation_logs,
                options,
                prepared.field().data().signature,
            )?;
            (reduced, lattice)
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
        for (multiple, dependency) in combination.iter().zip(&working_dependencies) {
            for row in 0..rows {
                exponents[row] += multiple * &dependency[row];
            }
        }
        if (0..columns).any(|column| {
            (0..rows).fold(Integer::from(0), |sum, row| {
                sum + &exponents[row] * collected.relations[row * columns + column]
            }) != 0
        }) {
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
        for (coefficient, relation) in unit.relation_exponents.iter().zip(&relation_logs) {
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
    let mut splitting = Vec::new();
    let mut splitting_bound = 2_usize;
    let mut incremental_bf = IncrementalCubicBelabasFriedmanPlan::new();
    let mut accepted = None;
    let mut final_failed_attempt = None;
    for threshold in thresholds
        .into_iter()
        .filter(|value| *value >= initial && *value <= options.maximum_analytic_threshold)
    {
        let extension = prepared_cubic_splitting_records_range(
            prepared.field(),
            splitting_bound,
            threshold as usize,
        )?;
        splitting_bound = threshold as usize;
        let plan = incremental_bf.extend_to(threshold, &extension)?;
        splitting.extend(extension);
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
        final_failed_attempt = Some(AnalyticIndexFailureDiagnostic {
            threshold,
            enclosure,
            tail_bound_below_quarter,
        });
    }
    let Some((bf_threshold, bf_plan, bf_enclosure)) = accepted else {
        return Err(CubicConditionalCompletionError::AnalyticIndexNotIsolated {
            final_attempt: final_failed_attempt,
        });
    };
    let bdf_bound = u64::try_from(collected.factor_base.catalog.relation_bound)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?
        + 1;
    if bdf_bound > options.maximum_analytic_threshold {
        return Err(CubicConditionalCompletionError::ResourceLimit(
            "factor-base analytic bound",
        ));
    }
    let bdf_bound_usize = usize::try_from(bdf_bound)
        .map_err(|_| CubicConditionalCompletionError::MachineRepresentationLimit)?;
    if bdf_bound_usize > splitting_bound {
        splitting.extend(prepared_cubic_splitting_records_range(
            prepared.field(),
            splitting_bound,
            bdf_bound_usize,
        )?);
    }
    let bdf_plan = build_cubic_bdf_factor_base_plan(bdf_bound, &splitting)?;
    let bdf_margin = flint_bdf_factor_base_margin(
        &bdf_plan.terms,
        bdf_bound,
        &prepared.field().data().discriminant,
        3,
        u64::from(prepared.field().data().signature.0),
        options.analytic_precision_bits,
    )?;
    if !interval_lower_gt_zero(&bdf_margin) {
        return Err(CubicConditionalCompletionError::FactorBaseNotCertified);
    }

    let result = GrhConditionalCompleteCubicClassGroup {
        prepared,
        presentation,
        units: CubicUnitLatticeEvidence {
            dependency_lattice: dependencies,
            fundamental_units,
            selected_basis_index: lattice.selected_basis_index,
            common_denominator: lattice.common_denominator,
            regulator,
        },
        analytic: CubicAnalyticEvidence {
            bf_threshold,
            bf_plan,
            bf_enclosure,
            bdf_plan,
            bdf_margin,
        },
        precision,
    };
    if !result.verify_sealed_evidence() {
        return Err(CubicConditionalCompletionError::UnitReplayMismatch);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

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
