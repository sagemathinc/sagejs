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
    NumericalPreparationError, PreparedCubicEmbedding, prepare_cubic_ideal, prepare_h1_ideal,
};
use crate::pari_random::PariRandom;
use crate::prepared::{EmbeddingPrecisionState, ValidatedPreparedCubic};
use crate::prepared_factor_base::{
    PreparedFactorBase, PreparedFactorBaseError, prepared_maximal_cubic_factor_base,
};
use crate::prepared_ideal::{CubicIdeal, PreparedIdealError, PreparedIdealWorkspace};
use crate::prime_valuation::{
    PrimeValuationError, PrimeValuationWorkspace, RationalPrimePower, refine_quotient_factorization,
};
use crate::relation_cache::{CacheError, RelationCache};
use crate::smooth_admission::{
    AdmissionError, CubicNormForm, FactorOutcome, cumulative_prime_products, factor_integer_norm,
    factor_norm, primes_through,
};
use rug::Integer;
use sha2::{Digest, Sha256};
use std::time::Instant;

const DEGREE: usize = 3;
const RELATION_TARGET: usize = 73;
pub(crate) const PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS: usize = 7;
const SUPPLEMENTARY_RELATIONS: usize = PREPARED_CUBIC_SUPPLEMENTARY_RELATIONS;
const RELATIONS_PER_IDEAL: usize = 4;
const FACTOR_LIMIT: u64 = 1_048_576;
const PRIME_LIMIT: usize = 65_537;

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
    pub factor_base: PreparedFactorBase,
    /// Collector-minted provenance for the exact field/base pair above.
    ///
    /// This is deliberately crate-private: untrusted callers cannot attach a
    /// seal to an arbitrary `PreparedFactorBase`, while the presentation
    /// authenticator can avoid regenerating a base that this collector just
    /// constructed and used for every relation.
    pub(crate) factor_base_authority: PreparedFactorBaseAuthority,
    pub relations: Vec<i64>,
    pub generators: Vec<Integer>,
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

/// Sealed proof that `collect_prepared_cubic_relations` obtained a factor base
/// from `prepared_maximal_cubic_factor_base` for one canonical field.
///
/// The fields and constructor are private to this module, so even other crate
/// modules can only consume an authority emitted by the collector.  Matching
/// hashes the live values again, detecting mutation, substitution, and reuse
/// with another field before the trusted fast path is entered.
#[derive(Clone, Debug)]
pub(crate) struct PreparedFactorBaseAuthority {
    field_sha256: [u8; 32],
    factor_base_sha256: [u8; 32],
}

impl PreparedFactorBaseAuthority {
    fn mint(field: &ValidatedPreparedCubic, factor_base: &PreparedFactorBase) -> Self {
        Self {
            field_sha256: canonical_field_sha256(field),
            factor_base_sha256: factor_base_binding_sha256(factor_base),
        }
    }

    pub(crate) fn authenticates(
        &self,
        field: &ValidatedPreparedCubic,
        factor_base: &PreparedFactorBase,
    ) -> bool {
        self.field_sha256 == canonical_field_sha256(field)
            && self.factor_base_sha256 == factor_base_binding_sha256(factor_base)
    }
}

pub(crate) fn factor_base_binding_sha256(factor_base: &PreparedFactorBase) -> [u8; 32] {
    fn usize_value(hasher: &mut Sha256, value: usize) {
        hasher.update((value as u64).to_le_bytes());
    }
    fn i64_value(hasher: &mut Sha256, value: i64) {
        hasher.update(value.to_le_bytes());
    }
    fn integer(hasher: &mut Sha256, value: &Integer) {
        let bytes = value.to_string();
        usize_value(hasher, bytes.len());
        hasher.update(bytes.as_bytes());
    }

    let catalog = &factor_base.catalog;
    let mut hasher = Sha256::new();
    hasher.update(b"sagejs.prepared-cubic-factor-base/v1\0");
    usize_value(&mut hasher, catalog.relation_bound);
    usize_value(&mut hasher, catalog.checking_bound);
    usize_value(&mut hasher, catalog.ideals.len());
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
                integer(&mut hasher, value);
            }
        }
    }
    usize_value(&mut hasher, catalog.rational_primes.len());
    for &value in &catalog.rational_primes {
        i64_value(&mut hasher, value);
    }
    for &value in &catalog.rational_offsets {
        usize_value(&mut hasher, value);
    }
    for &value in &catalog.rational_counts {
        usize_value(&mut hasher, value);
    }
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
) -> Result<(usize, usize), ClassGroupError> {
    let target = size
        .checked_add(SUPPLEMENTARY_RELATIONS)
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
    let mut cache = RelationCache::new(size, capacity, SUPPLEMENTARY_RELATIONS);
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
    let mut generators = vec![0_i64; capacity * DEGREE];
    cache.publish_initial_generators(DEGREE, &mut generators)?;
    let initial_relations = cache.len();
    timings.initial_cache_ns = started.elapsed().as_nanos();

    let started = Instant::now();
    let norm_form = CubicNormForm::from_prepared_basis(polynomial, basis)?;
    let factor_primes = primes_through(PRIME_LIMIT);
    let prime_products = cumulative_prime_products(&factor_primes, FACTOR_LIMIT)?;
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
                &factor_primes,
                &prime_products,
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

#[allow(clippy::too_many_arguments)]
fn collect_prepared_ideal_relations(
    field: &ValidatedPreparedCubic,
    factor_base: &PreparedFactorBase,
    ideal: &CubicIdeal,
    divisor_relation: &[i64],
    embedding: &PreparedCubicEmbedding,
    factor_product: &Integer,
    factor_primes: &[u64],
    prime_products: &[Integer],
    cache: &mut RelationCache,
    relation: &mut [i64],
    generators: &mut [Integer],
    enumeration: &mut EnumerationWorkspace,
    ideal_workspace: &mut PreparedIdealWorkspace,
    counters: &mut CollectorCounters,
    timings: &mut CollectorTimings,
    maximum_candidates: usize,
    maximum_factor_attempts: usize,
    maximum_positive_relations: usize,
    random_relation: bool,
) -> Result<bool, ClassGroupError> {
    let started = Instant::now();
    let prepared = prepare_cubic_ideal(embedding, ideal)?;
    timings.numerical_preparation_ns += started.elapsed().as_nanos();
    timings.lll_ns += prepared.lll_ns;
    timings.archimedean_preparation_ns += prepared.archimedean_ns;
    enumeration.reset(&prepared.q, &prepared.v)?;
    let trials_before = enumeration.trials();
    let mut factor_attempts = 0_usize;
    let mut positive_for_ideal = 0_usize;
    let mut appended_any = false;

    while positive_for_ideal < maximum_positive_relations
        && (cache.missing() != 0 || cache.remaining_supplementary() != 0)
        && counters.primitive_nonscalar_candidates < maximum_candidates
    {
        let started = Instant::now();
        let element = loop {
            if !enumeration.next(prepared.bound, prepared.skip_first)? {
                break None;
            }
            if let Some(element) =
                exact_candidate_element(enumeration.coordinates(), &prepared.ideal)
            {
                factor_attempts += 1;
                counters.primitive_nonscalar_candidates += 1;
                if factor_attempts > maximum_factor_attempts {
                    break None;
                }
                break Some(element);
            }
        };
        timings.enumeration_and_norm_ns += started.elapsed().as_nanos();
        let Some(element) = element else { break };

        let norm = field.norm(&element);
        let ideal_norm = ideal.norm();
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
            factor_product,
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
        let rational = factors
            .iter()
            .map(|factor| (factor.prime as i64, factor.exponent as usize))
            .collect::<Vec<_>>();

        let started = Instant::now();
        let refinement = factor_base.refine_quotient_factorization(
            field,
            &element,
            &rational,
            divisor_relation,
            relation,
            ideal_workspace,
        );
        if matches!(
            refinement,
            Err(PreparedFactorBaseError::NormValuationMismatch { .. })
        ) {
            timings.prime_valuation_and_cache_ns += started.elapsed().as_nanos();
            continue;
        }
        refinement?;
        let hint = first_nonzero(relation);
        let row = cache.len();
        let outcome =
            cache.add_relation(relation, hint, (row + 1) as i64, 0, 0, random_relation)?;
        if outcome.appended {
            generators[row * DEGREE..(row + 1) * DEGREE].clone_from_slice(&element);
            counters.appended_relations += 1;
            appended_any = true;
        }
        if outcome.rank_marker > 0 {
            positive_for_ideal += 1;
            counters.positive_cache_statuses += 1;
        }
        timings.prime_valuation_and_cache_ns += started.elapsed().as_nanos();
        if random_relation && appended_any {
            break;
        }
    }
    counters.cursor_trials += enumeration.trials() - trials_before;
    Ok(appended_any)
}

/// Run the first PARI-style small-norm pass over a validated maximal-order
/// cubic.  Resource limits return an honest partial presentation instead of
/// publishing a class-group candidate.
pub fn collect_prepared_cubic_relations(
    field: &ValidatedPreparedCubic,
    limits: PreparedCollectorLimits,
) -> Result<PreparedCubicRelationPresentation, ClassGroupError> {
    let total_started = Instant::now();
    let mut timings = CollectorTimings::default();

    let started = Instant::now();
    let factor_base = prepared_maximal_cubic_factor_base(field)?;
    let factor_base_authority = PreparedFactorBaseAuthority::mint(field, &factor_base);
    let (subfactor_count, search_permutation) = factor_base.catalog.subfactor_permutation(3);
    timings.factor_base_ns = started.elapsed().as_nanos();
    let size = factor_base.catalog.ideals.len();
    let target = size
        .checked_add(SUPPLEMENTARY_RELATIONS)
        .ok_or(ClassGroupError::CandidateOverflow)?;
    // Every complete rational-prime group seeds at most one resident row and
    // every subsequently appended row consumes one counted candidate.  A
    // bounded prefix therefore does not need the full PARI working capacity.
    // The default unbounded collector still selects `full_relation_capacity`.
    let initial_relation_capacity = factor_base
        .catalog
        .complete_groups
        .iter()
        .filter(|complete| **complete)
        .count();
    let (capacity, full_relation_capacity) =
        prepared_relation_capacity(size, initial_relation_capacity, limits.maximum_candidates)?;

    let started = Instant::now();
    let mut cache = RelationCache::try_new(size, capacity, SUPPLEMENTARY_RELATIONS)?;
    let ramification: Vec<i64> = factor_base
        .catalog
        .ideals
        .iter()
        .map(|ideal| ideal.ramification as i64)
        .collect();
    let mut relation = vec![0_i64; size];
    let mut divisor_relation = vec![0_i64; size];
    cache.initialize_complete_prime_groups(
        SUPPLEMENTARY_RELATIONS,
        &factor_base.catalog.rational_primes,
        &factor_base.catalog.rational_offsets,
        &factor_base.catalog.rational_counts,
        &factor_base.catalog.complete_groups,
        &ramification,
        &mut relation,
    )?;
    let mut generators = vec![Integer::new(); capacity * DEGREE];
    for (row, metadata) in cache.metadata().chunks_exact(3).enumerate() {
        generators[row * DEGREE] = Integer::from(metadata[0]);
    }
    timings.initial_cache_ns = started.elapsed().as_nanos();

    let started = Instant::now();
    let embedding = PreparedCubicEmbedding::from_validated(field, 320)?;
    let factor_primes = primes_through(PRIME_LIMIT);
    let prime_products = cumulative_prime_products(&factor_primes, FACTOR_LIMIT)?;
    let factor_product = factor_base
        .catalog
        .rational_primes
        .iter()
        .fold(Integer::from(1), |product, prime| product * prime);
    timings.catalog_setup_ns = started.elapsed().as_nanos();

    let scheduled: Vec<i64> = search_permutation
        .iter()
        .map(|value| *value as i64)
        .collect();
    let residue_degrees: Vec<i64> = factor_base
        .catalog
        .ideals
        .iter()
        .map(|ideal| ideal.residue_degree as i64)
        .collect();
    let mut schedule = [0_i64; 4];
    let mut schedule_cursor = [0_i64; 5];
    let mut schedule_counters = [0_i64; 4];
    let mut schedule_progress = [0_i64; 4];
    let mut enumeration = EnumerationWorkspace::new(DEGREE);
    let mut ideal_workspace = PreparedIdealWorkspace::new();
    let mut counters = CollectorCounters::default();

    // PARI's `relsup` is consumed only by dependent relations found before
    // full modular rank.  Once rank is full, `add_rel_i` assigns every new
    // row a positive marker and deliberately leaves `relsup` unchanged.  The
    // actual completion condition is therefore the requested resident row
    // count, not `relsup == 0`.  This distinction matters for tiny factor
    // bases that reach rank before encountering any dependent row.
    while (cache.missing() != 0 || cache.len() < target)
        && counters.visited_ideals < limits.maximum_visited_ideals
        && counters.primitive_nonscalar_candidates < limits.maximum_candidates
    {
        if schedule[1] != 0 {
            schedule_progress[2] = 1;
            schedule_progress[3] = 0;
        }
        let packet_id = next_small_norm_ideal(
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
        )?;
        let Some(packet_id) = packet_id else { break };
        let packet_index = usize::try_from(packet_id - 1)
            .map_err(|_| ClassGroupError::UnsupportedPreparedField)?;
        counters.visited_ideals += 1;
        divisor_relation.fill(0);
        divisor_relation[packet_index] = 1;
        let maximum_positive_relations = if cache.missing() == 0 {
            RELATIONS_PER_IDEAL + SUPPLEMENTARY_RELATIONS
        } else {
            RELATIONS_PER_IDEAL
        };
        let _ = collect_prepared_ideal_relations(
            field,
            &factor_base,
            &factor_base.exact_ideals[packet_index],
            &divisor_relation,
            &embedding,
            &factor_product,
            &factor_primes,
            &prime_products,
            &mut cache,
            &mut relation,
            &mut generators,
            &mut enumeration,
            &mut ideal_workspace,
            &mut counters,
            &mut timings,
            limits.maximum_candidates,
            500,
            maximum_positive_relations,
            false,
        )?;
    }

    // PARI's random continuation changes the searched lattice: it forms a random
    // product of the live subfactor base and multiplies that by each search
    // ideal.  Repeating the first schedule with a larger cursor bound cannot
    // reveal missing class directions and is intentionally not used here.
    let mut random = PariRandom::from_seed(1).expect("the fixed qualification seed is positive");
    let maximum_random_ideals = 16 * subfactor_count;
    while (cache.missing() != 0 || cache.len() < target)
        && counters.random_ideals < maximum_random_ideals
        && counters.visited_ideals < limits.maximum_visited_ideals
        && counters.primitive_nonscalar_candidates < limits.maximum_candidates
    {
        let (random_ideal, random_divisor) = loop {
            let mut product = CubicIdeal::unit();
            let mut divisor = vec![0_i64; size];
            let mut nonzero = false;
            for &one_based in &search_permutation[..subfactor_count] {
                let exponent = random.next_four_bits();
                if exponent == 0 {
                    continue;
                }
                nonzero = true;
                divisor[one_based - 1] += i64::from(exponent);
                let power = ideal_workspace.pow(
                    field,
                    &factor_base.exact_ideals[one_based - 1],
                    exponent,
                )?;
                product = ideal_workspace.multiply(field, &product, &power)?;
            }
            if nonzero && !product.is_scalar() {
                break (product, divisor);
            }
        };
        counters.random_ideals += 1;
        let mut appended_this_random = 0_usize;
        let unresolved = cache.missing_pivot_indices();
        let targeted = !unresolved.is_empty();

        for search_index in unresolved.iter().copied().chain(
            (!targeted)
                .then_some(0)
                .into_iter()
                .flat_map(|_| search_permutation.iter().map(|one_based| one_based - 1)),
        ) {
            if (cache.missing() == 0 && cache.len() >= target)
                || counters.visited_ideals >= limits.maximum_visited_ideals
                || counters.primitive_nonscalar_candidates >= limits.maximum_candidates
            {
                break;
            }
            let search_ideal = ideal_workspace.multiply(
                field,
                &random_ideal,
                &factor_base.exact_ideals[search_index],
            )?;
            counters.visited_ideals += 1;
            counters.random_search_ideals += 1;
            divisor_relation.copy_from_slice(&random_divisor);
            divisor_relation[search_index] += 1;
            let appended = collect_prepared_ideal_relations(
                field,
                &factor_base,
                &search_ideal,
                &divisor_relation,
                &embedding,
                &factor_product,
                &factor_primes,
                &prime_products,
                &mut cache,
                &mut relation,
                &mut generators,
                &mut enumeration,
                &mut ideal_workspace,
                &mut counters,
                &mut timings,
                limits.maximum_candidates,
                500,
                1,
                true,
            )?;
            if appended {
                appended_this_random += 1;
                if appended_this_random >= 16 {
                    break;
                }
            }
        }
    }

    timings.total_ns = total_started.elapsed().as_nanos();
    generators.truncate(cache.len() * DEGREE);
    Ok(PreparedCubicRelationPresentation {
        relations: cache.records().to_vec(),
        generators,
        first_nonzero_hints: cache.first_nonzero_hints().to_vec(),
        metadata: cache.metadata().to_vec(),
        factor_base,
        factor_base_authority,
        subfactor_count,
        search_permutation,
        counters,
        timings,
        complete_rank_and_surplus: cache.missing() == 0 && cache.len() >= target,
        missing_rank: cache.missing(),
        relation_capacity: capacity,
        full_relation_capacity,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_prepared_capacity_preserves_the_unbounded_default() {
        assert_eq!(
            prepared_relation_capacity(1_130, 203, 64),
            Ok((267, 11_420))
        );
        assert_eq!(
            prepared_relation_capacity(1_130, 203, usize::MAX),
            Ok((11_420, 11_420))
        );
        assert_eq!(
            prepared_relation_capacity(usize::MAX, 0, 0),
            Err(ClassGroupError::CandidateOverflow)
        );
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
}
