// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Readable end-to-end H1 relation collector.
//!
//! The public boundary is intentionally small: a monic cubic and its integral
//! basis enter, and an owned relation presentation leaves.  No PARI value or
//! oracle checkpoint is an input.  The implementation composes the exact
//! factor-base, lattice, smoothness, valuation, and cache components in the
//! same order as PARI 2.17.4's first `small_norm` pass.

use crate::collector_schedule::{ScheduleError, next_small_norm_ideal};
use crate::enumeration::{EnumerationError, EnumerationWorkspace};
use crate::factor_base::{FactorBase, prepared_cubic_factor_base};
use crate::numerical_preparation::{
    H1NumericalPreparation, NumericalPreparationError, PreparedCubicEmbedding, prepare_cubic_ideal,
    prepare_h1_ideal,
};
use crate::pari_random::PariRandom;
use crate::prepared::{EmbeddingPrecisionState, ValidatedPreparedCubic};
use crate::prepared_factor_base::{
    PreparedFactorBase, PreparedFactorBaseError, PreparedFactorBaseValuationCache,
    prepared_maximal_cubic_factor_base,
};
use crate::prepared_ideal::{CubicIdeal, PreparedIdealError, PreparedIdealWorkspace};
use crate::prime_valuation::{
    PrimeValuationError, PrimeValuationWorkspace, RationalPrimePower, refine_quotient_factorization,
};
use crate::relation_cache::{CacheError, RelationCache};
use crate::smooth_admission::{
    AdmissionError, CLASS_GROUP_FACTOR_LIMIT as FACTOR_LIMIT,
    CLASS_GROUP_PRIME_LIMIT as PRIME_LIMIT, CubicNormForm, FactorOutcome,
    class_group_factor_catalog, factor_integer_norm, factor_norm,
};
use rug::{Integer, integer::Order};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Instant;

const DEGREE: usize = 3;
const RELATION_TARGET: usize = 73;
pub(crate) const PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS: usize = 7;
const SUPPLEMENTARY_RELATIONS: usize = PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS;
const RELATIONS_PER_IDEAL: usize = 4;

pub(crate) fn update_integer_sha256(hasher: &mut Sha256, value: &Integer) {
    if let Some(value) = value.to_i64() {
        let mut encoded = [0_u8; 9];
        encoded[1..].copy_from_slice(&value.to_le_bytes());
        hasher.update(encoded);
        return;
    }
    let mut magnitude = vec![0_u8; value.significant_digits::<u8>()];
    value.write_digits(&mut magnitude, Order::Lsf);
    hasher.update([if value < &0 { 1 } else { 2 }]);
    hasher.update((magnitude.len() as u64).to_le_bytes());
    hasher.update(magnitude);
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CollectorTimings {
    pub factor_base_ns: u128,
    pub initial_cache_ns: u128,
    pub catalog_setup_ns: u128,
    pub numerical_preparation_ns: u128,
    pub lll_ns: u128,
    pub archimedean_preparation_ns: u128,
    pub enumeration_and_norm_ns: u128,
    pub rational_factorization_ns: u128,
    pub prime_valuation_and_cache_ns: u128,
    pub total_ns: u128,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CollectorCounters {
    pub visited_ideals: usize,
    pub cursor_trials: usize,
    pub primitive_nonscalar_candidates: usize,
    pub smooth_candidates: usize,
    pub appended_relations: usize,
    pub positive_cache_statuses: usize,
    pub random_ideals: usize,
    pub random_search_ideals: usize,
}

/// Complete output of the Rust relation-collection experiment.
#[derive(Clone, Debug)]
pub struct H1ClassGroupPresentation {
    pub factor_base: FactorBase,
    /// Consecutive rows, each of width `factor_base.ideals.len()`.
    pub relations: Vec<i64>,
    /// Consecutive integral-basis coordinates, three per relation.
    pub generators: Vec<i64>,
    pub first_nonzero_hints: Vec<usize>,
    pub metadata: Vec<i64>,
    pub subfactor_count: usize,
    pub search_permutation: Vec<usize>,
    pub counters: CollectorCounters,
    pub timings: CollectorTimings,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PreparedCollectorLimits {
    pub maximum_visited_ideals: usize,
    pub maximum_candidates: usize,
}

/// Cumulative resource ceilings for a resumable prepared-field collector.
///
/// Every ceiling applies to the lifetime of one collector, not to one call to
/// `advance_to_supplementary`.  Consequently, pausing and resuming cannot
/// silently reset a work budget.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PreparedContinuationLimits {
    pub maximum_visited_ideals: usize,
    pub maximum_candidates: usize,
    pub maximum_relations: usize,
    pub maximum_dependencies: usize,
}

impl Default for PreparedCollectorLimits {
    fn default() -> Self {
        Self {
            maximum_visited_ideals: usize::MAX,
            maximum_candidates: usize::MAX,
        }
    }
}

#[derive(Clone, Debug)]
pub struct PreparedCubicRelationPresentation {
    /// Exact factor base shared with the collector that produced this snapshot.
    ///
    /// This is crate-private so safe external code cannot mutate or substitute
    /// it after the collector has established the provenance below.  Detached
    /// inputs use the public replay boundary instead of this owned fast path.
    pub(crate) factor_base: Arc<PreparedFactorBase>,
    /// Collector-minted provenance for the exact field/base pair above.
    ///
    /// This is deliberately crate-private: untrusted callers cannot attach a
    /// seal to an arbitrary `PreparedFactorBase`, while the presentation
    /// authenticator can avoid regenerating a base that this collector just
    /// constructed and used for every relation.
    pub(crate) factor_base_authority: PreparedFactorBaseAuthority,
    /// Collector-only binding for the exact ordered principal-relation
    /// transcript carried by this presentation.
    pub(crate) principal_relations_authority: CollectedPrincipalRelationsAuthority,
    /// Immutable collector-owned relation transcript.  Keeping these vectors
    /// behind read-only accessors lets the private consumer propagate the
    /// collector's proof without hashing every entry a second time.
    pub(crate) relations: Vec<i64>,
    pub(crate) generators: Vec<Integer>,
    pub first_nonzero_hints: Vec<usize>,
    pub metadata: Vec<i64>,
    pub subfactor_count: usize,
    pub search_permutation: Vec<usize>,
    pub counters: CollectorCounters,
    pub timings: CollectorTimings,
    pub complete_rank_and_surplus: bool,
    pub missing_rank: usize,
    pub relation_capacity: usize,
    pub full_relation_capacity: usize,
}

impl PreparedCubicRelationPresentation {
    pub fn factor_base(&self) -> &PreparedFactorBase {
        &self.factor_base
    }

    pub fn relations(&self) -> &[i64] {
        &self.relations
    }

    pub fn generators(&self) -> &[Integer] {
        &self.generators
    }
}

/// Sealed proof that `collect_prepared_cubic_relations` obtained its immutable
/// factor base from `prepared_maximal_cubic_factor_base` for one canonical
/// field.
///
/// The fields and constructor are private to this module, so even other crate
/// modules can only consume an authority emitted by the collector.  The
/// protected factor base cannot be mutated by safe external code; matching
/// therefore needs to bind only the independently supplied field.
#[derive(Clone, Debug)]
pub(crate) struct PreparedFactorBaseAuthority {
    field_sha256: [u8; 32],
}

impl PreparedFactorBaseAuthority {
    fn mint(field: &ValidatedPreparedCubic) -> Self {
        Self {
            field_sha256: canonical_field_sha256(field),
        }
    }

    pub(crate) fn authenticates(&self, field: &ValidatedPreparedCubic) -> bool {
        self.field_sha256 == canonical_field_sha256(field)
    }
}

/// Sealed provenance for a collector-produced principal-relation transcript.
///
/// Its constructor is private to this module. The relation and generator
/// vectors are likewise protected from safe external mutation, so consumers
/// verify the independently supplied field identity without rescanning the
/// complete transcript. Supplied transcripts still take the detached exact
/// replay path.
#[derive(Clone, Debug)]
pub(crate) struct CollectedPrincipalRelationsAuthority {
    field_sha256: [u8; 32],
}

impl CollectedPrincipalRelationsAuthority {
    fn mint(field: &ValidatedPreparedCubic) -> Self {
        Self {
            field_sha256: canonical_field_sha256(field),
        }
    }

    pub(crate) fn authenticates(&self, field: &ValidatedPreparedCubic) -> bool {
        self.field_sha256 == canonical_field_sha256(field)
    }
}

pub(crate) fn factor_base_binding_sha256(factor_base: &PreparedFactorBase) -> [u8; 32] {
    fn usize_value(hasher: &mut Sha256, value: usize) {
        hasher.update((value as u64).to_le_bytes());
    }
    fn i64_value(hasher: &mut Sha256, value: i64) {
        hasher.update(value.to_le_bytes());
    }
    let catalog = &factor_base.catalog;
    let mut hasher = Sha256::new();
    hasher.update(b"sagejs.prepared-cubic-factor-base/v2\0");
    usize_value(&mut hasher, catalog.relation_bound);
    usize_value(&mut hasher, catalog.checking_bound);
    hasher.update(b"catalog-ideals\0");
    usize_value(&mut hasher, catalog.ideals.len());
    hasher.update(b"exact-ideals\0");
    usize_value(&mut hasher, factor_base.exact_ideals.len());
    for (descriptor, ideal) in catalog.ideals.iter().zip(&factor_base.exact_ideals) {
        i64_value(&mut hasher, descriptor.prime);
        usize_value(&mut hasher, descriptor.ramification);
        usize_value(&mut hasher, descriptor.residue_degree);
        for value in descriptor.generator {
            i64_value(&mut hasher, value);
        }
        for value in descriptor.tau {
            i64_value(&mut hasher, value);
        }
        for value in descriptor.hnf {
            i64_value(&mut hasher, value);
        }
        i64_value(&mut hasher, descriptor.norm);
        for row in ideal.basis_rows() {
            for value in row {
                update_integer_sha256(&mut hasher, value);
            }
        }
    }
    hasher.update(b"rational-primes\0");
    usize_value(&mut hasher, catalog.rational_primes.len());
    for &value in &catalog.rational_primes {
        i64_value(&mut hasher, value);
    }
    hasher.update(b"rational-offsets\0");
    usize_value(&mut hasher, catalog.rational_offsets.len());
    for &value in &catalog.rational_offsets {
        usize_value(&mut hasher, value);
    }
    hasher.update(b"rational-counts\0");
    usize_value(&mut hasher, catalog.rational_counts.len());
    for &value in &catalog.rational_counts {
        usize_value(&mut hasher, value);
    }
    hasher.update(b"complete-groups\0");
    usize_value(&mut hasher, catalog.complete_groups.len());
    hasher.update(
        catalog
            .complete_groups
            .iter()
            .map(|value| u8::from(*value))
            .collect::<Vec<_>>(),
    );
    hasher.finalize().into()
}

pub(crate) fn canonical_field_sha256(field: &ValidatedPreparedCubic) -> [u8; 32] {
    fn bytes(hasher: &mut Sha256, value: &[u8]) {
        hasher.update((value.len() as u64).to_le_bytes());
        hasher.update(value);
    }
    fn integer(hasher: &mut Sha256, value: &Integer) {
        bytes(hasher, value.to_string().as_bytes());
    }

    let data = field.data();
    let mut hasher = Sha256::new();
    hasher.update(b"sagejs.maximal-cubic-field-data/v1\0");
    for value in &data.polynomial_ascending {
        integer(&mut hasher, value);
    }
    hasher.update(data.irreducibility_prime.to_le_bytes());
    for value in &data.integral_basis_numerators {
        integer(&mut hasher, value);
    }
    integer(&mut hasher, &data.basis_denominator);
    for value in &data.multiplication_table {
        integer(&mut hasher, value);
    }
    integer(&mut hasher, &data.discriminant);
    hasher.update([data.signature.0, data.signature.1]);
    match &data.embedding_precision {
        EmbeddingPrecisionState::Pending { target_bits } => {
            hasher.update([0]);
            hasher.update(target_bits.to_le_bytes());
        }
        EmbeddingPrecisionState::Certified {
            target_bits,
            working_bits,
            certified_bits,
        } => {
            hasher.update([1]);
            hasher.update(target_bits.to_le_bytes());
            hasher.update(working_bits.to_le_bytes());
            hasher.update(certified_bits.to_le_bytes());
        }
    }
    hasher.update((data.index_primes.len() as u64).to_le_bytes());
    for value in &data.index_primes {
        integer(&mut hasher, value);
    }
    hasher.finalize().into()
}

fn prepared_relation_capacity(
    size: usize,
    initial_relations: usize,
    maximum_candidates: usize,
    supplementary_relations: usize,
) -> Result<(usize, usize), ClassGroupError> {
    let target = size
        .checked_add(supplementary_relations)
        .ok_or(ClassGroupError::CandidateOverflow)?;
    let full = target
        .checked_mul(10)
        .and_then(|value| value.checked_add(50))
        .ok_or(ClassGroupError::CandidateOverflow)?;
    Ok((
        full.min(initial_relations.saturating_add(maximum_candidates)),
        full,
    ))
}

fn ensure_generator_rows<T: Default>(
    generators: &mut Vec<T>,
    rows: usize,
) -> Result<(), ClassGroupError> {
    let length = rows
        .checked_mul(DEGREE)
        .ok_or(ClassGroupError::CandidateOverflow)?;
    if generators.len() < length {
        generators.resize_with(length, T::default);
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClassGroupError {
    InvalidRelationPresentation,
    UnsupportedPreparedField,
    Schedule(ScheduleError),
    Numerical(NumericalPreparationError),
    Enumeration(EnumerationError),
    Admission(AdmissionError),
    PrimeValuation(PrimeValuationError),
    Cache(CacheError),
    CandidateOverflow,
    ContinuationTargetDecreased,
    ContinuationBudgetExceeded,
    UnresolvedFactor(Integer),
    CollectorExhausted { relations: usize },
    PreparedFactorBase(PreparedFactorBaseError),
    PreparedIdeal(PreparedIdealError),
}

/// Select the exact rows that change the collector's modular rank.
///
/// This replays an already collected presentation through the same bounded
/// finite-field filter used during collection, with supplementary storage
/// disabled.  The returned square matrix is only an exact-HNF starting basis:
/// it need not generate the full integral relation lattice until the omitted
/// dependent rows have been incorporated.
#[doc(hidden)]
pub fn modular_independent_relation_rows(
    relations: &[i64],
    first_nonzero_hints: &[usize],
    columns: usize,
) -> Result<(Vec<i64>, Vec<usize>), ClassGroupError> {
    if columns == 0
        || relations.len() % columns != 0
        || first_nonzero_hints.len() != relations.len() / columns
    {
        return Err(ClassGroupError::InvalidRelationPresentation);
    }
    let mut cache = RelationCache::new(columns, columns, 0);
    let mut selected = Vec::with_capacity(columns * columns);
    let mut source_rows = Vec::with_capacity(columns);
    for (source_row, (relation, first_nonzero)) in relations
        .chunks_exact(columns)
        .zip(first_nonzero_hints.iter().copied())
        .enumerate()
    {
        let outcome = cache.add_relation(relation, first_nonzero, 0, 0, 0, false)?;
        if outcome.appended {
            debug_assert!(outcome.rank_marker > 0);
            selected.extend_from_slice(relation);
            source_rows.push(source_row);
            if cache.missing() == 0 {
                break;
            }
        }
    }
    if cache.missing() != 0 || source_rows.len() != columns {
        return Err(ClassGroupError::CollectorExhausted {
            relations: source_rows.len(),
        });
    }
    Ok((selected, source_rows))
}

impl From<ScheduleError> for ClassGroupError {
    fn from(error: ScheduleError) -> Self {
        Self::Schedule(error)
    }
}
impl From<NumericalPreparationError> for ClassGroupError {
    fn from(error: NumericalPreparationError) -> Self {
        Self::Numerical(error)
    }
}
impl From<EnumerationError> for ClassGroupError {
    fn from(error: EnumerationError) -> Self {
        Self::Enumeration(error)
    }
}
impl From<AdmissionError> for ClassGroupError {
    fn from(error: AdmissionError) -> Self {
        Self::Admission(error)
    }
}
impl From<PrimeValuationError> for ClassGroupError {
    fn from(error: PrimeValuationError) -> Self {
        Self::PrimeValuation(error)
    }
}
impl From<CacheError> for ClassGroupError {
    fn from(error: CacheError) -> Self {
        Self::Cache(error)
    }
}
impl From<PreparedFactorBaseError> for ClassGroupError {
    fn from(error: PreparedFactorBaseError) -> Self {
        Self::PreparedFactorBase(error)
    }
}
impl From<PreparedIdealError> for ClassGroupError {
    fn from(error: PreparedIdealError) -> Self {
        Self::PreparedIdeal(error)
    }
}

fn gcd_i64(mut left: i64, mut right: i64) -> i64 {
    left = left.abs();
    right = right.abs();
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}

fn candidate_element(
    coordinates: &[i64],
    ideal: &crate::ideal_arithmetic::Matrix3,
) -> Result<Option<[i64; DEGREE]>, ClassGroupError> {
    let content = coordinates[1..=DEGREE].iter().copied().fold(0, gcd_i64);
    if content != 1 {
        return Ok(None);
    }
    let mut element = [0_i64; DEGREE];
    for row in 0..DEGREE {
        let mut value = Integer::new();
        for column in 0..DEGREE {
            value += &ideal[(row, column)] * coordinates[column + 1];
        }
        element[row] = value.to_i64().ok_or(ClassGroupError::CandidateOverflow)?;
    }
    if element[1] == 0 && element[2] == 0 {
        return Ok(None);
    }
    Ok(Some(element))
}

fn exact_candidate_element(
    coordinates: &[i64],
    ideal: &crate::ideal_arithmetic::Matrix3,
) -> Option<[Integer; DEGREE]> {
    let content = coordinates[1..=DEGREE].iter().copied().fold(0, gcd_i64);
    if content != 1 {
        return None;
    }
    let element: [Integer; DEGREE] = std::array::from_fn(|row| {
        let mut value = Integer::new();
        for column in 0..DEGREE {
            value += &ideal[(row, column)] * coordinates[column + 1];
        }
        value
    });
    if element[1] == 0 && element[2] == 0 {
        None
    } else {
        Some(element)
    }
}

fn first_nonzero(relation: &[i64]) -> usize {
    relation
        .iter()
        .position(|value| *value != 0)
        .map_or(relation.len() + 1, |index| index + 1)
}

/// Compute H1's complete first-pass relation presentation from prepared-field
/// inputs only.
///
/// This is currently deliberately H1-specific at the archimedean boundary:
/// `prepare_h1_ideal` owns the authenticated dyadic embedding.  Requiring the
/// matching polynomial and basis here prevents that specialization from being
/// mistaken for a general cubic API.
pub fn collect_h1_class_group(
    polynomial: [i64; 4],
    basis: [i64; 9],
) -> Result<H1ClassGroupPresentation, ClassGroupError> {
    if polynomial != [20_034, -20_018, 0, 1] || basis != [1, 0, 0, 0, 1, 0, -13_345, 2, 1] {
        return Err(ClassGroupError::UnsupportedPreparedField);
    }
    let total_started = Instant::now();
    let mut timings = CollectorTimings::default();

    let started = Instant::now();
    let factor_base = prepared_cubic_factor_base(polynomial, basis);
    let (subfactor_count, search_permutation) = factor_base.subfactor_permutation(3);
    timings.factor_base_ns = started.elapsed().as_nanos();
    let size = factor_base.ideals.len();
    let capacity = 10 * (size + SUPPLEMENTARY_RELATIONS) + 50;

    let started = Instant::now();
    let initial_capacity = factor_base
        .complete_groups
        .iter()
        .filter(|complete| **complete)
        .count();
    let mut cache =
        RelationCache::try_new_growing(size, initial_capacity, capacity, SUPPLEMENTARY_RELATIONS)?;
    let ramification: Vec<i64> = factor_base
        .ideals
        .iter()
        .map(|ideal| ideal.ramification as i64)
        .collect();
    let mut relation = vec![0_i64; size];
    cache.initialize_complete_prime_groups(
        SUPPLEMENTARY_RELATIONS,
        &factor_base.rational_primes,
        &factor_base.rational_offsets,
        &factor_base.rational_counts,
        &factor_base.complete_groups,
        &ramification,
        &mut relation,
    )?;
    let mut generators = vec![0_i64; cache.resident_capacity() * DEGREE];
    cache.publish_initial_generators(DEGREE, &mut generators)?;
    let initial_relations = cache.len();
    timings.initial_cache_ns = started.elapsed().as_nanos();

    let started = Instant::now();
    let norm_form = CubicNormForm::from_prepared_basis(polynomial, basis)?;
    let factor_catalog = class_group_factor_catalog()?;
    let factor_primes = factor_catalog.primes();
    let prime_products = factor_catalog.cumulative_products();
    let factor_product = factor_base
        .rational_primes
        .iter()
        .fold(Integer::from(1), |product, prime| product * prime);
    timings.catalog_setup_ns = started.elapsed().as_nanos();

    let scheduled: Vec<i64> = search_permutation
        .iter()
        .map(|value| *value as i64)
        .collect();
    let residue_degrees: Vec<i64> = factor_base
        .ideals
        .iter()
        .map(|ideal| ideal.residue_degree as i64)
        .collect();
    let mut schedule = [0_i64; 4];
    let mut schedule_cursor = [0_i64; 5];
    let mut schedule_counters = [0_i64; 4];
    let mut schedule_progress = [0_i64; 4];
    let mut enumeration = EnumerationWorkspace::new(DEGREE);
    let mut valuation = PrimeValuationWorkspace::new();
    let mut counters = CollectorCounters::default();

    while cache.len() < RELATION_TARGET {
        // A completed ideal has terminal status zero, which is precisely the
        // resume precondition of the translated schedule.
        if schedule[1] != 0 {
            schedule_progress[2] = 1;
            schedule_progress[3] = 0;
        }
        let Some(packet_id) = next_small_norm_ideal(
            &scheduled,
            scheduled.len(),
            &ramification,
            &residue_degrees,
            DEGREE as i64,
            0,
            0,
            &mut schedule,
            &mut schedule_cursor,
            &mut schedule_counters,
            &mut schedule_progress,
        )?
        else {
            return Err(ClassGroupError::CollectorExhausted {
                relations: cache.len(),
            });
        };
        let packet_index = usize::try_from(packet_id - 1)
            .map_err(|_| ClassGroupError::UnsupportedPreparedField)?;
        let packet = &factor_base.ideals[packet_index];
        counters.visited_ideals += 1;

        let started = Instant::now();
        let prepared = prepare_h1_ideal(packet.hnf)?;
        timings.numerical_preparation_ns += started.elapsed().as_nanos();
        timings.lll_ns += prepared.lll_ns;
        timings.archimedean_preparation_ns += prepared.archimedean_ns;
        enumeration.reset(&prepared.q, &prepared.v)?;
        let trials_before = enumeration.trials();
        let mut factor_attempts = 0_usize;
        let mut positive_for_ideal = 0_usize;

        while positive_for_ideal < RELATIONS_PER_IDEAL && cache.len() < RELATION_TARGET {
            let started = Instant::now();
            let element = loop {
                if !enumeration.next(prepared.bound, prepared.skip_first)? {
                    break None;
                }
                if let Some(element) =
                    candidate_element(enumeration.coordinates(), &prepared.ideal)?
                {
                    factor_attempts += 1;
                    counters.primitive_nonscalar_candidates += 1;
                    if factor_attempts > 500 {
                        break None;
                    }
                    break Some(element);
                }
            };
            timings.enumeration_and_norm_ns += started.elapsed().as_nanos();
            let Some(element) = element else { break };

            let started = Instant::now();
            let quotient_norm = norm_form.quotient_norm(element, i128::from(packet.norm))?;
            timings.enumeration_and_norm_ns += started.elapsed().as_nanos();
            let started = Instant::now();
            let factors = match factor_norm(
                quotient_norm,
                &factor_product,
                factor_primes,
                prime_products,
                FACTOR_LIMIT,
                PRIME_LIMIT as u64,
            )? {
                FactorOutcome::Nonsmooth => {
                    timings.rational_factorization_ns += started.elapsed().as_nanos();
                    continue;
                }
                FactorOutcome::Unresolved(value) => {
                    return Err(ClassGroupError::UnresolvedFactor(value));
                }
                FactorOutcome::Factored(factors) => factors,
            };
            timings.rational_factorization_ns += started.elapsed().as_nanos();
            counters.smooth_candidates += 1;

            let rational: Vec<RationalPrimePower> = factors
                .iter()
                .map(|factor| RationalPrimePower {
                    prime: factor.prime as i64,
                    exponent: factor.exponent as usize,
                })
                .collect();
            let started = Instant::now();
            refine_quotient_factorization(
                &factor_base,
                element,
                &rational,
                Some((packet_index + 1, 1)),
                &mut relation,
                &mut valuation,
            )?;
            // `factorgen` describes (element)/packet.  `small_norm` then adds
            // the packet factor to obtain the principal-ideal relation.
            relation[packet_index] += 1;
            let hint = first_nonzero(&relation);
            let row = cache.len();
            let outcome = cache.add_relation(&relation, hint, (row + 1) as i64, 0, 0, false)?;
            if outcome.appended {
                ensure_generator_rows(&mut generators, cache.resident_capacity())?;
                generators[row * DEGREE..(row + 1) * DEGREE].copy_from_slice(&element);
                counters.appended_relations += 1;
            }
            if outcome.rank_marker > 0 {
                positive_for_ideal += 1;
                counters.positive_cache_statuses += 1;
            }
            timings.prime_valuation_and_cache_ns += started.elapsed().as_nanos();
        }
        counters.cursor_trials += enumeration.trials() - trials_before;
    }

    debug_assert_eq!(initial_relations, 12);
    timings.total_ns = total_started.elapsed().as_nanos();
    generators.truncate(cache.len() * DEGREE);
    Ok(H1ClassGroupPresentation {
        relations: cache.records().to_vec(),
        generators,
        first_nonzero_hints: cache.first_nonzero_hints().to_vec(),
        metadata: cache.metadata().to_vec(),
        factor_base,
        subfactor_count,
        search_permutation,
        counters,
        timings,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PreparedCollectionPhase {
    Scheduled,
    Random,
    Exhausted,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ActiveIdealOrigin {
    Scheduled,
    Random,
}

struct ActivePreparedIdeal {
    ideal: CubicIdeal,
    divisor_relation: Vec<i64>,
    prepared: H1NumericalPreparation,
    factor_attempts: usize,
    positive_relations: usize,
    maximum_positive_relations: usize,
    appended_any: bool,
    random_relation: bool,
    accounted_trials: usize,
    origin: ActiveIdealOrigin,
}

struct RandomIdealBatch {
    ideal: CubicIdeal,
    divisor_relation: Vec<i64>,
    search_indices: Vec<usize>,
    next_search_index: usize,
    appended_relations: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ActiveIdealProgress {
    Paused,
    Complete {
        origin: ActiveIdealOrigin,
        appended_any: bool,
    },
}

/// Stateful deterministic relation collector used to qualify bounded
/// continuation without replaying an already visited ideal.
///
/// The state owns the relation cache, schedule, active Fincke--Pohst cursor,
/// random stream, and random-batch cursor.  Increasing the requested surplus
/// therefore only appends work to the existing transcript.  Targets affect
/// when the collector pauses, never which next ideal or lattice point it
/// chooses. The fixed pre-rank `relsup` quota is deliberately independent of
/// every pause target. A target can stop collection only after modular rank is
/// full; from that point `RelationCache` admits every nonduplicate row without
/// consulting `relsup`, so continuation neither restores nor invents quota.
#[doc(hidden)]
pub struct PreparedCubicRelationCollector<'a> {
    field: &'a ValidatedPreparedCubic,
    limits: PreparedContinuationLimits,
    factor_base: Arc<PreparedFactorBase>,
    factor_base_valuation_cache: PreparedFactorBaseValuationCache,
    factor_base_authority: PreparedFactorBaseAuthority,
    subfactor_count: usize,
    search_permutation: Vec<usize>,
    ramification: Vec<i64>,
    residue_degrees: Vec<i64>,
    scheduled: Vec<i64>,
    factor_product: Integer,
    factor_primes: &'static [u64],
    prime_products: &'static [Integer],
    embedding: PreparedCubicEmbedding,
    cache: RelationCache,
    relation: Vec<i64>,
    generators: Vec<Integer>,
    enumeration: EnumerationWorkspace,
    ideal_workspace: PreparedIdealWorkspace,
    schedule: [i64; 4],
    schedule_cursor: [i64; 5],
    schedule_counters: [i64; 4],
    schedule_progress: [i64; 4],
    random: PariRandom,
    random_batch: Option<RandomIdealBatch>,
    active: Option<ActivePreparedIdeal>,
    phase: PreparedCollectionPhase,
    requested_supplementary: usize,
    counters: CollectorCounters,
    timings: CollectorTimings,
    relation_capacity: usize,
    full_relation_capacity: usize,
}

impl<'a> PreparedCubicRelationCollector<'a> {
    pub fn new(
        field: &'a ValidatedPreparedCubic,
        limits: PreparedContinuationLimits,
    ) -> Result<Self, ClassGroupError> {
        let total_started = Instant::now();
        let mut timings = CollectorTimings::default();

        let started = Instant::now();
        let factor_base = Arc::new(prepared_maximal_cubic_factor_base(field)?);
        let factor_base_valuation_cache = PreparedFactorBaseValuationCache::new(&factor_base);
        let factor_base_authority = PreparedFactorBaseAuthority::mint(field);
        let (subfactor_count, search_permutation) = factor_base.catalog.subfactor_permutation(3);
        timings.factor_base_ns = started.elapsed().as_nanos();
        let size = factor_base.catalog.ideals.len();
        let initial_relation_capacity = factor_base
            .catalog
            .complete_groups
            .iter()
            .filter(|complete| **complete)
            .count();
        let (candidate_bounded_capacity, full_relation_capacity) = prepared_relation_capacity(
            size,
            initial_relation_capacity,
            limits.maximum_candidates,
            limits.maximum_dependencies,
        )?;
        let relation_capacity = candidate_bounded_capacity.min(limits.maximum_relations);
        if relation_capacity < initial_relation_capacity {
            return Err(ClassGroupError::ContinuationBudgetExceeded);
        }

        let started = Instant::now();
        let initial_supplementary =
            PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS.min(limits.maximum_dependencies);
        let mut cache = RelationCache::try_new_growing(
            size,
            initial_relation_capacity.min(relation_capacity),
            relation_capacity,
            initial_supplementary,
        )?;
        let ramification = factor_base
            .catalog
            .ideals
            .iter()
            .map(|ideal| ideal.ramification as i64)
            .collect::<Vec<_>>();
        let mut relation = vec![0_i64; size];
        cache.initialize_complete_prime_groups(
            initial_supplementary,
            &factor_base.catalog.rational_primes,
            &factor_base.catalog.rational_offsets,
            &factor_base.catalog.rational_counts,
            &factor_base.catalog.complete_groups,
            &ramification,
            &mut relation,
        )?;
        let mut generators = vec![Integer::new(); cache.resident_capacity() * DEGREE];
        for (row, metadata) in cache.metadata().chunks_exact(3).enumerate() {
            generators[row * DEGREE] = Integer::from(metadata[0]);
        }
        timings.initial_cache_ns = started.elapsed().as_nanos();

        let started = Instant::now();
        let embedding = PreparedCubicEmbedding::from_validated(field, 320)?;
        let factor_catalog = class_group_factor_catalog()?;
        let factor_product = factor_base
            .catalog
            .rational_primes
            .iter()
            .fold(Integer::from(1), |product, prime| product * prime);
        timings.catalog_setup_ns = started.elapsed().as_nanos();
        timings.total_ns = total_started.elapsed().as_nanos();

        let scheduled = search_permutation
            .iter()
            .map(|value| *value as i64)
            .collect();
        let residue_degrees = factor_base
            .catalog
            .ideals
            .iter()
            .map(|ideal| ideal.residue_degree as i64)
            .collect();
        Ok(Self {
            field,
            limits,
            factor_base,
            factor_base_valuation_cache,
            factor_base_authority,
            subfactor_count,
            search_permutation,
            ramification,
            residue_degrees,
            scheduled,
            factor_product,
            factor_primes: factor_catalog.primes(),
            prime_products: factor_catalog.cumulative_products(),
            embedding,
            cache,
            relation,
            generators,
            enumeration: EnumerationWorkspace::new(DEGREE),
            ideal_workspace: PreparedIdealWorkspace::new(),
            schedule: [0; 4],
            schedule_cursor: [0; 5],
            schedule_counters: [0; 4],
            schedule_progress: [0; 4],
            random: PariRandom::from_seed(1).expect("the fixed qualification seed is positive"),
            random_batch: None,
            active: None,
            phase: PreparedCollectionPhase::Scheduled,
            requested_supplementary: 0,
            counters: CollectorCounters::default(),
            timings,
            relation_capacity,
            full_relation_capacity,
        })
    }

    fn start_active(
        &mut self,
        ideal: CubicIdeal,
        divisor_relation: Vec<i64>,
        maximum_positive_relations: usize,
        random_relation: bool,
        origin: ActiveIdealOrigin,
    ) -> Result<(), ClassGroupError> {
        let started = Instant::now();
        let prepared = prepare_cubic_ideal(&self.embedding, &ideal)?;
        self.timings.numerical_preparation_ns += started.elapsed().as_nanos();
        self.timings.lll_ns += prepared.lll_ns;
        self.timings.archimedean_preparation_ns += prepared.archimedean_ns;
        self.enumeration.reset(&prepared.q, &prepared.v)?;
        self.active = Some(ActivePreparedIdeal {
            ideal,
            divisor_relation,
            prepared,
            factor_attempts: 0,
            positive_relations: 0,
            maximum_positive_relations,
            appended_any: false,
            random_relation,
            accounted_trials: 0,
            origin,
        });
        Ok(())
    }

    fn account_enumeration_trials(&mut self, active: &mut ActivePreparedIdeal) {
        let trials = self.enumeration.trials();
        self.counters.cursor_trials += trials - active.accounted_trials;
        active.accounted_trials = trials;
    }

    fn advance_active(&mut self, target: usize) -> Result<ActiveIdealProgress, ClassGroupError> {
        let mut active = self.active.take().expect("active ideal exists");
        loop {
            if self.cache.missing() == 0 && self.cache.len() >= target {
                self.active = Some(active);
                return Ok(ActiveIdealProgress::Paused);
            }
            if active.positive_relations >= active.maximum_positive_relations
                || active.factor_attempts > 500
            {
                return Ok(ActiveIdealProgress::Complete {
                    origin: active.origin,
                    appended_any: active.appended_any,
                });
            }
            if self.counters.primitive_nonscalar_candidates >= self.limits.maximum_candidates {
                self.active = Some(active);
                return Ok(ActiveIdealProgress::Paused);
            }

            let started = Instant::now();
            let element = loop {
                if !self
                    .enumeration
                    .next(active.prepared.bound, active.prepared.skip_first)?
                {
                    break None;
                }
                if let Some(element) =
                    exact_candidate_element(self.enumeration.coordinates(), &active.prepared.ideal)
                {
                    active.factor_attempts += 1;
                    self.counters.primitive_nonscalar_candidates += 1;
                    if active.factor_attempts > 500 {
                        break None;
                    }
                    break Some(element);
                }
            };
            self.timings.enumeration_and_norm_ns += started.elapsed().as_nanos();
            self.account_enumeration_trials(&mut active);
            let Some(element) = element else {
                return Ok(ActiveIdealProgress::Complete {
                    origin: active.origin,
                    appended_any: active.appended_any,
                });
            };

            let norm = self.field.norm(&element);
            let ideal_norm = active.ideal.norm();
            if ideal_norm <= 0 {
                return Err(ClassGroupError::Admission(
                    AdmissionError::NonintegralNormQuotient,
                ));
            }
            let mut remainder = norm.clone();
            remainder %= &ideal_norm;
            if remainder != 0 {
                return Err(ClassGroupError::Admission(
                    AdmissionError::NonintegralNormQuotient,
                ));
            }
            let quotient_norm = norm / ideal_norm;
            let started = Instant::now();
            let factors = match factor_integer_norm(
                &quotient_norm,
                &self.factor_product,
                self.factor_primes,
                self.prime_products,
                FACTOR_LIMIT,
                PRIME_LIMIT as u64,
            )? {
                FactorOutcome::Nonsmooth => {
                    self.timings.rational_factorization_ns += started.elapsed().as_nanos();
                    continue;
                }
                FactorOutcome::Unresolved(value) => {
                    return Err(ClassGroupError::UnresolvedFactor(value));
                }
                FactorOutcome::Factored(factors) => factors,
            };
            self.timings.rational_factorization_ns += started.elapsed().as_nanos();
            self.counters.smooth_candidates += 1;
            let rational = factors
                .iter()
                .map(|factor| (factor.prime as i64, factor.exponent as usize))
                .collect::<Vec<_>>();

            let started = Instant::now();
            let refinement = self.factor_base.refine_quotient_factorization(
                &mut self.factor_base_valuation_cache,
                self.field,
                &element,
                &rational,
                &active.divisor_relation,
                &mut self.relation,
                &mut self.ideal_workspace,
            );
            if matches!(
                refinement,
                Err(PreparedFactorBaseError::NormValuationMismatch { .. })
            ) {
                self.timings.prime_valuation_and_cache_ns += started.elapsed().as_nanos();
                continue;
            }
            refinement?;
            let hint = first_nonzero(&self.relation);
            let row = self.cache.len();
            let outcome = self.cache.add_relation(
                &self.relation,
                hint,
                (row + 1) as i64,
                0,
                0,
                active.random_relation,
            )?;
            if outcome.appended {
                ensure_generator_rows(&mut self.generators, self.cache.resident_capacity())?;
                self.generators[row * DEGREE..(row + 1) * DEGREE].clone_from_slice(&element);
                self.counters.appended_relations += 1;
                active.appended_any = true;
            }
            if outcome.rank_marker > 0 {
                active.positive_relations += 1;
                self.counters.positive_cache_statuses += 1;
            }
            self.timings.prime_valuation_and_cache_ns += started.elapsed().as_nanos();
            if active.random_relation && active.appended_any {
                return Ok(ActiveIdealProgress::Complete {
                    origin: active.origin,
                    appended_any: true,
                });
            }
        }
    }

    fn start_next_scheduled(&mut self) -> Result<bool, ClassGroupError> {
        if self.schedule[1] != 0 {
            self.schedule_progress[2] = 1;
            self.schedule_progress[3] = 0;
        }
        let packet_id = next_small_norm_ideal(
            &self.scheduled,
            self.scheduled.len(),
            &self.ramification,
            &self.residue_degrees,
            DEGREE as i64,
            0,
            0,
            &mut self.schedule,
            &mut self.schedule_cursor,
            &mut self.schedule_counters,
            &mut self.schedule_progress,
        )?;
        let Some(packet_id) = packet_id else {
            return Ok(false);
        };
        let packet_index = usize::try_from(packet_id - 1)
            .map_err(|_| ClassGroupError::UnsupportedPreparedField)?;
        self.counters.visited_ideals += 1;
        let mut divisor_relation = vec![0_i64; self.ramification.len()];
        divisor_relation[packet_index] = 1;
        let maximum_positive_relations = if self.cache.missing() == 0 {
            RELATIONS_PER_IDEAL + PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS
        } else {
            RELATIONS_PER_IDEAL
        };
        self.start_active(
            self.factor_base.exact_ideals[packet_index].clone(),
            divisor_relation,
            maximum_positive_relations,
            false,
            ActiveIdealOrigin::Scheduled,
        )?;
        Ok(true)
    }

    fn start_random_batch(&mut self) -> Result<bool, ClassGroupError> {
        let maximum_random_ideals = 16 * self.subfactor_count;
        if self.counters.random_ideals >= maximum_random_ideals {
            return Ok(false);
        }
        let (ideal, divisor_relation) = loop {
            let mut product = CubicIdeal::unit();
            let mut divisor = vec![0_i64; self.ramification.len()];
            let mut nonzero = false;
            for &one_based in &self.search_permutation[..self.subfactor_count] {
                let exponent = self.random.next_four_bits();
                if exponent == 0 {
                    continue;
                }
                nonzero = true;
                divisor[one_based - 1] += i64::from(exponent);
                let power = self.ideal_workspace.pow(
                    self.field,
                    &self.factor_base.exact_ideals[one_based - 1],
                    exponent,
                )?;
                product = self
                    .ideal_workspace
                    .multiply(self.field, &product, &power)?;
            }
            if nonzero && !product.is_scalar() {
                break (product, divisor);
            }
        };
        self.counters.random_ideals += 1;
        let unresolved = self.cache.missing_pivot_indices();
        let search_indices = if unresolved.is_empty() {
            self.search_permutation
                .iter()
                .map(|one_based| one_based - 1)
                .collect()
        } else {
            unresolved
        };
        self.random_batch = Some(RandomIdealBatch {
            ideal,
            divisor_relation,
            search_indices,
            next_search_index: 0,
            appended_relations: 0,
        });
        Ok(true)
    }

    fn start_next_random_search(&mut self) -> Result<bool, ClassGroupError> {
        loop {
            let needs_batch = self.random_batch.as_ref().is_none_or(|batch| {
                batch.next_search_index >= batch.search_indices.len()
                    || batch.appended_relations >= 16
            });
            if needs_batch {
                self.random_batch = None;
                if !self.start_random_batch()? {
                    return Ok(false);
                }
            }
            let batch = self.random_batch.as_mut().expect("batch was created");
            let search_index = batch.search_indices[batch.next_search_index];
            batch.next_search_index += 1;
            let search_ideal = self.ideal_workspace.multiply(
                self.field,
                &batch.ideal,
                &self.factor_base.exact_ideals[search_index],
            )?;
            let mut divisor_relation = batch.divisor_relation.clone();
            divisor_relation[search_index] += 1;
            self.counters.visited_ideals += 1;
            self.counters.random_search_ideals += 1;
            self.start_active(
                search_ideal,
                divisor_relation,
                1,
                true,
                ActiveIdealOrigin::Random,
            )?;
            return Ok(true);
        }
    }

    pub fn advance_to_supplementary(
        &mut self,
        supplementary_relations: usize,
    ) -> Result<PreparedCubicRelationPresentation, ClassGroupError> {
        if supplementary_relations < self.requested_supplementary {
            return Err(ClassGroupError::ContinuationTargetDecreased);
        }
        let size = self.factor_base.catalog.ideals.len();
        let target = size
            .checked_add(supplementary_relations)
            .ok_or(ClassGroupError::CandidateOverflow)?;
        if supplementary_relations > self.limits.maximum_dependencies
            || target > self.limits.maximum_relations
            || target > self.relation_capacity
        {
            return Err(ClassGroupError::ContinuationBudgetExceeded);
        }
        self.requested_supplementary = supplementary_relations;
        let advance_started = Instant::now();
        while (self.cache.missing() != 0 || self.cache.len() < target)
            && self.counters.visited_ideals < self.limits.maximum_visited_ideals
            && self.counters.primitive_nonscalar_candidates < self.limits.maximum_candidates
            && self.phase != PreparedCollectionPhase::Exhausted
        {
            if self.active.is_some() {
                match self.advance_active(target)? {
                    ActiveIdealProgress::Paused => break,
                    ActiveIdealProgress::Complete {
                        origin: ActiveIdealOrigin::Random,
                        appended_any,
                    } => {
                        if appended_any {
                            self.random_batch
                                .as_mut()
                                .expect("random active ideal belongs to a batch")
                                .appended_relations += 1;
                        }
                    }
                    ActiveIdealProgress::Complete {
                        origin: ActiveIdealOrigin::Scheduled,
                        ..
                    } => {}
                }
                continue;
            }
            if self.counters.visited_ideals >= self.limits.maximum_visited_ideals {
                break;
            }
            match self.phase {
                PreparedCollectionPhase::Scheduled => {
                    if !self.start_next_scheduled()? {
                        self.phase = PreparedCollectionPhase::Random;
                    }
                }
                PreparedCollectionPhase::Random => {
                    if !self.start_next_random_search()? {
                        self.phase = PreparedCollectionPhase::Exhausted;
                    }
                }
                PreparedCollectionPhase::Exhausted => break,
            }
        }
        self.timings.total_ns += advance_started.elapsed().as_nanos();
        self.presentation(target)
    }

    fn presentation(
        &self,
        target: usize,
    ) -> Result<PreparedCubicRelationPresentation, ClassGroupError> {
        let generator_length = self
            .cache
            .len()
            .checked_mul(DEGREE)
            .ok_or(ClassGroupError::CandidateOverflow)?;
        let generators = self.generators[..generator_length].to_vec();
        let relations = self.cache.records().to_vec();
        let principal_relations_authority = CollectedPrincipalRelationsAuthority::mint(self.field);
        Ok(PreparedCubicRelationPresentation {
            relations,
            generators,
            first_nonzero_hints: self.cache.first_nonzero_hints().to_vec(),
            metadata: self.cache.metadata().to_vec(),
            factor_base: self.factor_base.clone(),
            factor_base_authority: self.factor_base_authority.clone(),
            principal_relations_authority,
            subfactor_count: self.subfactor_count,
            search_permutation: self.search_permutation.clone(),
            counters: self.counters.clone(),
            timings: self.timings.clone(),
            complete_rank_and_surplus: self.cache.missing() == 0 && self.cache.len() >= target,
            missing_rank: self.cache.missing(),
            relation_capacity: self.relation_capacity,
            full_relation_capacity: self.full_relation_capacity,
        })
    }
}

/// Run the first PARI-style small-norm pass over a validated maximal-order
/// cubic.  Resource limits return an honest partial presentation instead of
/// publishing a class-group candidate.
pub fn collect_prepared_cubic_relations(
    field: &ValidatedPreparedCubic,
    limits: PreparedCollectorLimits,
) -> Result<PreparedCubicRelationPresentation, ClassGroupError> {
    collect_prepared_cubic_relations_with_supplementary(
        field,
        limits,
        PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS,
    )
}

/// Collect a deterministic bounded presentation with an explicit relation
/// surplus target.
///
/// This convenience entry point creates a resumable collector and advances it
/// once. Callers that need several increasing targets should retain
/// `PreparedCubicRelationCollector` itself. No class-group or analytic answer
/// influences the relation schedule.
#[doc(hidden)]
pub fn collect_prepared_cubic_relations_with_supplementary(
    field: &ValidatedPreparedCubic,
    limits: PreparedCollectorLimits,
    supplementary_relations: usize,
) -> Result<PreparedCubicRelationPresentation, ClassGroupError> {
    let mut collector = PreparedCubicRelationCollector::new(
        field,
        PreparedContinuationLimits {
            maximum_visited_ideals: limits.maximum_visited_ideals,
            maximum_candidates: limits.maximum_candidates,
            maximum_relations: usize::MAX,
            maximum_dependencies: supplementary_relations,
        },
    )?;
    match collector.advance_to_supplementary(supplementary_relations) {
        Ok(presentation) => Ok(presentation),
        // The historical one-shot contract reports exhausted work budgets as
        // an honest incomplete presentation.  Explicit continuation callers
        // retain the stricter typed error so that a target can never appear to
        // have been accepted when its lifetime capacity was insufficient.
        Err(ClassGroupError::ContinuationBudgetExceeded) => {
            let target = collector
                .factor_base
                .catalog
                .ideals
                .len()
                .checked_add(supplementary_relations)
                .ok_or(ClassGroupError::CandidateOverflow)?;
            collector.presentation(target)
        }
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prepared::PreparedCubicData;

    fn small_cubic(linear: i64, discriminant: i64) -> ValidatedPreparedCubic {
        let higher_products = if linear == -1 {
            [-1, 1, 0, 0, -1, 1]
        } else {
            [-1, -1, 0, 0, -1, -1]
        };
        ValidatedPreparedCubic::validate(PreparedCubicData {
            polynomial_ascending: [1.into(), linear.into(), 0.into(), 1.into()],
            irreducibility_prime: 2,
            integral_basis_numerators: [
                1.into(),
                0.into(),
                0.into(),
                0.into(),
                1.into(),
                0.into(),
                0.into(),
                0.into(),
                1.into(),
            ],
            basis_denominator: 1.into(),
            multiplication_table: [
                1.into(),
                0.into(),
                0.into(),
                0.into(),
                1.into(),
                0.into(),
                0.into(),
                0.into(),
                1.into(),
                0.into(),
                1.into(),
                0.into(),
                0.into(),
                0.into(),
                1.into(),
                higher_products[0].into(),
                higher_products[1].into(),
                higher_products[2].into(),
                0.into(),
                0.into(),
                1.into(),
                higher_products[0].into(),
                higher_products[1].into(),
                higher_products[2].into(),
                higher_products[3].into(),
                higher_products[4].into(),
                higher_products[5].into(),
            ],
            discriminant: discriminant.into(),
            signature: (1, 1),
            embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 128 },
            index_primes: Vec::new(),
        })
        .unwrap()
    }

    #[test]
    fn bounded_prepared_capacity_preserves_the_unbounded_default() {
        assert_eq!(
            prepared_relation_capacity(1_130, 203, 64, PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS),
            Ok((267, 11_420))
        );
        assert_eq!(
            prepared_relation_capacity(
                1_130,
                203,
                usize::MAX,
                PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS,
            ),
            Ok((11_420, 11_420))
        );
        assert_eq!(
            prepared_relation_capacity(usize::MAX, 0, 0, PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS,),
            Err(ClassGroupError::CandidateOverflow)
        );
    }

    #[test]
    fn generator_storage_grows_without_changing_existing_rows() {
        let mut generators = vec![1_i64, 2, 3];
        ensure_generator_rows(&mut generators, 4).unwrap();
        assert_eq!(&generators[..3], [1, 2, 3]);
        assert_eq!(generators.len(), 12);
        assert!(generators[3..].iter().all(|value| *value == 0));
        ensure_generator_rows(&mut generators, 2).unwrap();
        assert_eq!(generators.len(), 12);
    }

    #[test]
    fn modular_row_selection_retains_only_rank_changes() {
        let (square, source_rows) =
            modular_independent_relation_rows(&[1, 0, 2, 0, 0, 1, 3, 4], &[1, 1, 2, 1], 2).unwrap();
        assert_eq!(square, [1, 0, 0, 1]);
        assert_eq!(source_rows, [0, 2]);
    }

    #[test]
    fn modular_row_selection_rejects_misaligned_presentations() {
        assert_eq!(
            modular_independent_relation_rows(&[1, 0, 0], &[1], 2),
            Err(ClassGroupError::InvalidRelationPresentation)
        );
    }

    #[test]
    fn collected_principal_relations_authority_rejects_field_substitution() {
        let first = small_cubic(-1, -23);
        let second = small_cubic(1, -31);
        let authority = CollectedPrincipalRelationsAuthority::mint(&first);

        assert!(authority.authenticates(&first));
        assert!(!authority.authenticates(&second));
    }

    #[test]
    fn collector_snapshots_share_only_the_immutable_factor_base() {
        let field = small_cubic(-1, -23);
        let collector = PreparedCubicRelationCollector::new(
            &field,
            PreparedContinuationLimits {
                maximum_visited_ideals: 100,
                maximum_candidates: 100,
                maximum_relations: 100,
                maximum_dependencies: 20,
            },
        )
        .unwrap();
        let first = collector.presentation(0).unwrap();
        let second = collector.presentation(0).unwrap();

        assert!(Arc::ptr_eq(&collector.factor_base, &first.factor_base));
        assert!(Arc::ptr_eq(&first.factor_base, &second.factor_base));
        assert_eq!(
            first.factor_base.exact_ideals,
            second.factor_base.exact_ideals
        );
    }
}
