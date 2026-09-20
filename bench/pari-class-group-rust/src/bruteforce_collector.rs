// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! A deliberately simple exact relation collector for prepared cubic fields.
//!
//! This is a contrast experiment, not a translation of PARI's small-norm
//! search.  It enumerates primitive, nonscalar algebraic integers in growing
//! coefficient boxes and retains those whose principal ideals factor over the
//! prepared factor base.  No LLL, real embedding, or oracle relation is used.

use crate::factor_base::{FactorBase, prepared_cubic_factor_base};
use crate::prepared::ValidatedPreparedCubic;
use crate::prepared_factor_base::{
    PreparedFactorBase, PreparedFactorBaseError, prepared_maximal_cubic_factor_base,
};
use crate::prepared_ideal::PreparedIdealWorkspace;
use crate::prime_valuation::{
    PrimeValuationWorkspace, RationalPrimePower, refine_element_factorization,
};
use crate::relation_cache::{CacheError, RelationCache};
use crate::smooth_admission::{
    AdmissionError, CubicNormForm, FactorOutcome, cumulative_prime_products, factor_integer_norm,
    factor_norm, primes_through,
};
use rug::Integer;

const DEFAULT_SUPPLEMENTARY_RELATIONS: usize = 7;
const PRIME_LIMIT: usize = 65_537;
const FACTOR_LIMIT: u64 = 65_537;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct BruteForceStatistics {
    pub visited: u64,
    pub primitive_nonscalar: u64,
    pub smooth_norms: u64,
    pub factor_base_smooth: u64,
    pub appended: u64,
    pub independent: u64,
    pub duplicate: u64,
    pub maximum_radius: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BruteForceError {
    Admission(AdmissionError),
    Cache(CacheError),
    PreparedFactorBase(PreparedFactorBaseError),
}

impl From<AdmissionError> for BruteForceError {
    fn from(value: AdmissionError) -> Self {
        Self::Admission(value)
    }
}

impl From<CacheError> for BruteForceError {
    fn from(value: CacheError) -> Self {
        Self::Cache(value)
    }
}

impl From<PreparedFactorBaseError> for BruteForceError {
    fn from(value: PreparedFactorBaseError) -> Self {
        Self::PreparedFactorBase(value)
    }
}

pub struct BruteForceResult {
    pub factor_base: FactorBase,
    pub cache: RelationCache,
    /// Algebraic-integer coordinates aligned with the retained relation rows.
    /// Initial rational-prime relations use `[p, 0, 0]`.
    pub elements: Vec<[i64; 3]>,
    pub statistics: BruteForceStatistics,
}

pub struct PreparedBruteForceResult {
    pub factor_base: PreparedFactorBase,
    pub cache: RelationCache,
    pub elements: Vec<[Integer; 3]>,
    pub statistics: BruteForceStatistics,
}

fn gcd(mut left: i64, mut right: i64) -> i64 {
    left = left.abs();
    right = right.abs();
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left
}

fn primitive(coordinates: [i64; 3]) -> bool {
    gcd(gcd(coordinates[0], coordinates[1]), coordinates[2]) == 1
}

fn canonical_up_to_sign(coordinates: [i64; 3]) -> bool {
    coordinates
        .iter()
        .rev()
        .find(|coordinate| **coordinate != 0)
        .is_some_and(|coordinate| *coordinate > 0)
}

fn on_shell(coordinates: [i64; 3], radius: i64) -> bool {
    coordinates
        .iter()
        .any(|coordinate| coordinate.abs() == radius)
}

fn first_nonzero(relation: &[i64]) -> usize {
    relation
        .iter()
        .position(|entry| *entry != 0)
        .map_or(relation.len() + 1, |index| index + 1)
}

fn initialize_cache(
    base: &FactorBase,
    supplementary_relations: usize,
) -> Result<RelationCache, CacheError> {
    let size = base.ideals.len();
    let capacity = 10 * (size + supplementary_relations) + 50;
    let mut cache = RelationCache::new(size, capacity, supplementary_relations);
    let ramification = base
        .ideals
        .iter()
        .map(|ideal| ideal.ramification as i64)
        .collect::<Vec<_>>();
    let mut relation = vec![0_i64; size];
    cache.initialize_complete_prime_groups(
        supplementary_relations,
        &base.rational_primes,
        &base.rational_offsets,
        &base.rational_counts,
        &base.complete_groups,
        &ramification,
        &mut relation,
    )?;
    Ok(cache)
}

/// Search coefficient shells through `maximum_radius`.
///
/// The result owns the exact relation rows.  A completed H1 search has 73
/// rows and `cache.missing() == 0`; the caller can feed those rows directly to
/// the ordinary exact Smith stage.
pub fn collect_primitive_box(
    polynomial: [i64; 4],
    basis: [i64; 9],
    maximum_radius: i64,
) -> Result<BruteForceResult, BruteForceError> {
    collect_primitive_box_with_supplementary(
        polynomial,
        basis,
        maximum_radius,
        DEFAULT_SUPPLEMENTARY_RELATIONS,
    )
}

/// Variant used to study how many extra relations are needed to saturate the
/// relation lattice, independently of PARI's default seven-row heuristic.
pub fn collect_primitive_box_with_supplementary(
    polynomial: [i64; 4],
    basis: [i64; 9],
    maximum_radius: i64,
    supplementary_relations: usize,
) -> Result<BruteForceResult, BruteForceError> {
    let base = prepared_cubic_factor_base(polynomial, basis);
    let norm_form = CubicNormForm::from_prepared_basis(polynomial, basis)?;
    let primes = primes_through(PRIME_LIMIT);
    let products = cumulative_prime_products(&primes, FACTOR_LIMIT)?;
    let factor_product =
        base.rational_primes
            .iter()
            .fold(Integer::from(1), |mut product, prime| {
                product *= *prime;
                product
            });
    let mut cache = initialize_cache(&base, supplementary_relations)?;
    let mut elements = cache
        .metadata()
        .chunks_exact(3)
        .map(|metadata| [metadata[0], 0, 0])
        .collect::<Vec<_>>();
    let mut valuation_workspace = PrimeValuationWorkspace::new();
    let mut relation = vec![0_i64; base.ideals.len()];
    let mut statistics = BruteForceStatistics::default();
    let target = base.ideals.len() + supplementary_relations;

    for radius in 1..=maximum_radius {
        statistics.maximum_radius = radius;
        for z in -radius..=radius {
            for y in -radius..=radius {
                for x in -radius..=radius {
                    let coordinates = [x, y, z];
                    if !on_shell(coordinates, radius) || (y == 0 && z == 0) {
                        continue;
                    }
                    statistics.visited += 1;
                    if !primitive(coordinates) || !canonical_up_to_sign(coordinates) {
                        continue;
                    }
                    statistics.primitive_nonscalar += 1;
                    let norm = norm_form.norm(coordinates)?;
                    let FactorOutcome::Factored(factors) = factor_norm(
                        norm,
                        &factor_product,
                        &primes,
                        &products,
                        FACTOR_LIMIT,
                        PRIME_LIMIT as u64,
                    )?
                    else {
                        continue;
                    };
                    if factors.is_empty() {
                        continue;
                    }
                    statistics.smooth_norms += 1;
                    let rational = factors
                        .iter()
                        .map(|factor| RationalPrimePower {
                            prime: factor.prime as i64,
                            exponent: factor.exponent as usize,
                        })
                        .collect::<Vec<_>>();
                    if refine_element_factorization(
                        &base,
                        coordinates,
                        &rational,
                        &mut relation,
                        &mut valuation_workspace,
                    )
                    .is_err()
                    {
                        continue;
                    }
                    statistics.factor_base_smooth += 1;
                    let outcome = cache.add_relation(
                        &relation,
                        first_nonzero(&relation),
                        statistics.primitive_nonscalar as i64,
                        0,
                        0,
                        false,
                    )?;
                    if outcome.rank_marker == -1 {
                        statistics.duplicate += 1;
                    }
                    if outcome.appended {
                        statistics.appended += 1;
                        elements.push(coordinates);
                    }
                    if outcome.rank_marker > 0 && cache.missing() < base.ideals.len() {
                        // Once rank is complete, supplementary rows also have
                        // a positive synthetic marker.  Count independence
                        // only while the missing-rank counter actually falls.
                        statistics.independent = (base.ideals.len() - cache.missing()) as u64;
                    }
                    if cache.len() >= target && cache.missing() == 0 {
                        return Ok(BruteForceResult {
                            factor_base: base,
                            cache,
                            elements,
                            statistics,
                        });
                    }
                }
            }
        }
    }
    Ok(BruteForceResult {
        factor_base: base,
        cache,
        elements,
        statistics,
    })
}

/// The coefficient-box diagnostic over a validated maximal-order basis.
///
/// Unlike the legacy entry point, factor-base ideals and valuations are
/// computed in the rational integral basis, including index primes.
pub fn collect_validated_primitive_box_with_supplementary(
    field: &ValidatedPreparedCubic,
    maximum_radius: i64,
    supplementary_relations: usize,
) -> Result<PreparedBruteForceResult, BruteForceError> {
    let base = prepared_maximal_cubic_factor_base(field)?;
    let primes = primes_through(PRIME_LIMIT);
    let products = cumulative_prime_products(&primes, FACTOR_LIMIT)?;
    let factor_product =
        base.catalog
            .rational_primes
            .iter()
            .fold(Integer::from(1), |mut product, prime| {
                product *= *prime;
                product
            });
    let mut cache = initialize_cache(&base.catalog, supplementary_relations)?;
    let mut elements = cache
        .metadata()
        .chunks_exact(3)
        .map(|metadata| [Integer::from(metadata[0]), Integer::new(), Integer::new()])
        .collect::<Vec<_>>();
    let mut ideal_workspace = PreparedIdealWorkspace::new();
    let mut relation = vec![0_i64; base.catalog.ideals.len()];
    let mut statistics = BruteForceStatistics::default();
    let target = base.catalog.ideals.len() + supplementary_relations;

    for radius in 1..=maximum_radius {
        statistics.maximum_radius = radius;
        for z in -radius..=radius {
            for y in -radius..=radius {
                for x in -radius..=radius {
                    let bounded = [x, y, z];
                    if !on_shell(bounded, radius) || (y == 0 && z == 0) {
                        continue;
                    }
                    statistics.visited += 1;
                    if !primitive(bounded) || !canonical_up_to_sign(bounded) {
                        continue;
                    }
                    statistics.primitive_nonscalar += 1;
                    let coordinates = bounded.map(Integer::from);
                    let norm = field.norm(&coordinates);
                    let FactorOutcome::Factored(factors) = factor_integer_norm(
                        &norm,
                        &factor_product,
                        &primes,
                        &products,
                        FACTOR_LIMIT,
                        PRIME_LIMIT as u64,
                    )?
                    else {
                        continue;
                    };
                    if factors.is_empty() {
                        continue;
                    }
                    statistics.smooth_norms += 1;
                    let rational = factors
                        .iter()
                        .map(|factor| (factor.prime as i64, factor.exponent as usize))
                        .collect::<Vec<_>>();
                    if base
                        .refine_element_factorization(
                            field,
                            &coordinates,
                            &rational,
                            &mut relation,
                            &mut ideal_workspace,
                        )
                        .is_err()
                    {
                        continue;
                    }
                    statistics.factor_base_smooth += 1;
                    let outcome = cache.add_relation(
                        &relation,
                        first_nonzero(&relation),
                        statistics.primitive_nonscalar as i64,
                        0,
                        0,
                        false,
                    )?;
                    if outcome.rank_marker == -1 {
                        statistics.duplicate += 1;
                    }
                    if outcome.appended {
                        statistics.appended += 1;
                        elements.push(coordinates);
                    }
                    if outcome.rank_marker > 0 && cache.missing() < base.catalog.ideals.len() {
                        statistics.independent =
                            (base.catalog.ideals.len() - cache.missing()) as u64;
                    }
                    if cache.len() >= target && cache.missing() == 0 {
                        return Ok(PreparedBruteForceResult {
                            factor_base: base,
                            cache,
                            elements,
                            statistics,
                        });
                    }
                }
            }
        }
    }
    Ok(PreparedBruteForceResult {
        factor_base: base,
        cache,
        elements,
        statistics,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primitive_and_sign_filters_are_deterministic() {
        assert!(primitive([1, 0, 0]));
        assert!(primitive([6, 10, 15]));
        assert!(!primitive([6, 10, 14]));
        assert!(canonical_up_to_sign([-7, 2, 0]));
        assert!(!canonical_up_to_sign([7, -2, 0]));
        assert!(canonical_up_to_sign([-7, -2, 1]));
    }

    #[test]
    fn shell_filter_visits_each_box_point_once() {
        let count = (-2..=2)
            .flat_map(|z| (-2..=2).flat_map(move |y| (-2..=2).map(move |x| [x, y, z])))
            .filter(|coordinates| on_shell(*coordinates, 2))
            .count();
        assert_eq!(count, 5_usize.pow(3) - 3_usize.pow(3));
    }

    #[test]
    #[ignore = "about 0.5 seconds in a release build"]
    fn h1_box_scan_reaches_a_trivial_class_group_presentation() {
        let answer = collect_primitive_box_with_supplementary(
            [20_034, -20_018, 0, 1],
            [1, 0, 0, 0, 1, 0, -13_345, 2, 1],
            47,
            20,
        )
        .unwrap();
        assert_eq!(answer.factor_base.ideals.len(), 66);
        assert_eq!(answer.cache.missing(), 0);
        assert_eq!(answer.cache.len(), 86);
        assert_eq!(answer.statistics.maximum_radius, 47);
    }
}
