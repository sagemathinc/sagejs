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
    build_cubic_bdf_factor_base_plan, build_cubic_belabas_friedman_plan,
};
use crate::cubic_presentation::AuthenticatedCubicPresentationCandidate;
use crate::flint_normal_form::{
    FlintBfIndexEnclosure, FlintDyadicInterval, FlintNormalFormError, flint_bdf_factor_base_margin,
    flint_bf_index_enclosure, flint_compact_cubic_regulator,
};
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CubicConditionalCompletionError {
    UnsupportedProofMode,
    InvalidOptions,
    PreparedAuthorityMismatch,
    /// Exact maximal-order splitting at equation-order index primes is not
    /// available to the BF/BDF phase yet.
    UnsupportedIndexPrimeCompletion,
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
    AnalyticIndexNotIsolated,
    FactorBaseNotCertified,
    Numerical(NumericalPreparationError),
    UnitLattice(UnitLatticeError),
    Splitting(PreparedFactorBaseError),
    AnalyticPlan(BelabasFriedmanPlanError),
    Flint(FlintNormalFormError),
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
    }
}

struct ReconstructedLattice {
    rational_coordinates: Vec<Vec<Rational>>,
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
                rational_coordinates: value
                    .rational_coordinates
                    .into_iter()
                    .map(|x| vec![x])
                    .collect(),
                common_denominator: value.common_denominator,
                selected_basis_index: value.selected_basis_index,
                generator_combinations: vec![value.generator_combination],
            })
        }
        (3, 0) => {
            let value = reconstruct_rank_two_unit_lattice(logarithms, bound)?;
            Ok(ReconstructedLattice {
                rational_coordinates: value
                    .rational_coordinates
                    .into_iter()
                    .map(|x| x.to_vec())
                    .collect(),
                common_denominator: value.common_denominator,
                selected_basis_index: value.selected_basis_index,
                generator_combinations: value.generator_combinations.to_vec(),
            })
        }
        _ => Err(UnitLatticeError::WrongRank),
    }
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

/// Complete a cubic candidate under the two explicitly recorded GRH
/// hypotheses. No fixture identifier, expected answer, relation transcript,
/// or external oracle enters this boundary.
pub fn complete_cubic_class_group_conditionally(
    prepared: PreparedPublicCubic,
    presentation: AuthenticatedCubicPresentationCandidate,
    options: CubicConditionalCompletionOptions,
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
    // The splitting-record route is exact for equation-order primes. At an
    // index prime, one F_p residue character does not distinguish total
    // ramification from residue degrees (1, 2), so BF/BDF use would be
    // unsound. Keep completion closed until maximal-order decomposition is
    // represented exactly there.
    if !prepared.field().data().index_primes.is_empty() {
        return Err(CubicConditionalCompletionError::UnsupportedIndexPrimeCompletion);
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
            embedding.logarithmic_embedding(&[
                coordinates[0].clone(),
                coordinates[1].clone(),
                coordinates[2].clone(),
            ])
        })
        .collect::<Result<Vec<_>, _>>()?;
    if relation_logs.len() != rows {
        return Err(CubicConditionalCompletionError::InvalidPresentationShape);
    }
    let dependency_logs = dependencies
        .iter()
        .map(|dependency| {
            let mut logs: [Float; 3] =
                std::array::from_fn(|_| Float::with_val(options.logarithm_precision_bits, 0));
            for (coefficient, relation) in dependency.iter().zip(&relation_logs) {
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
    let lattice = reconstruct(
        &dependency_logs,
        &denominator_bound,
        prepared.field().data().signature,
    )?;
    let replay_logs = dependency_logs
        .iter()
        .map(|row| {
            std::array::from_fn(|index| Float::with_val(options.replay_precision_bits, &row[index]))
        })
        .collect::<Vec<_>>();
    let replay_lattice = reconstruct(
        &replay_logs,
        &denominator_bound,
        prepared.field().data().signature,
    )?;
    if lattice.rational_coordinates != replay_lattice.rational_coordinates
        || lattice.common_denominator != replay_lattice.common_denominator
        || lattice.selected_basis_index != replay_lattice.selected_basis_index
    {
        return Err(CubicConditionalCompletionError::ReconstructionUnstable);
    }
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
        if combination.len() != dependencies.len() {
            return Err(CubicConditionalCompletionError::InvalidPresentationShape);
        }
        let mut exponents = vec![Integer::from(0); rows];
        for (multiple, dependency) in combination.iter().zip(&dependencies) {
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
    let initial = if prepared.field().data().discriminant.significant_bits() <= 16 {
        72
    } else {
        1_152
    };
    let mut splitting = Vec::new();
    let mut splitting_bound = 2_usize;
    let mut accepted = None;
    for threshold in thresholds
        .into_iter()
        .filter(|value| *value >= initial && *value <= options.maximum_analytic_threshold)
    {
        splitting.extend(prepared_cubic_splitting_records_range(
            prepared.field(),
            splitting_bound,
            threshold as usize,
        )?);
        splitting_bound = threshold as usize;
        let plan = build_cubic_belabas_friedman_plan(threshold, &splitting)?;
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
        if interval_upper_lt(&enclosure.tail_bound, Rational::from((1, 4)))
            && interval_contains_unique_positive_one(&enclosure.index)
        {
            accepted = Some((threshold, plan, enclosure));
            break;
        }
    }
    let Some((bf_threshold, bf_plan, bf_enclosure)) = accepted else {
        return Err(CubicConditionalCompletionError::AnalyticIndexNotIsolated);
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
    };
    if !result.verify_sealed_evidence() {
        return Err(CubicConditionalCompletionError::UnitReplayMismatch);
    }
    Ok(result)
}
