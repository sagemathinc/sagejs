// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! A deliberately simple exact relation collector for prepared cubic fields.
//!
//! This is a contrast experiment, not a translation of PARI's small-norm
//! search.  It enumerates primitive, nonscalar algebraic integers in growing
//! coefficient boxes and retains those whose principal ideals factor over the
//! prepared factor base.  No LLL, real embedding, or oracle relation is used.

use crate::factor_base::{FactorBase, prepared_cubic_factor_base};
use crate::prime_valuation::{
    PrimeValuationWorkspace, RationalPrimePower, refine_element_factorization,
};
use crate::relation_cache::{CacheError, RelationCache};
use crate::smooth_admission::{
    AdmissionError, CubicNormForm, FactorOutcome, cumulative_prime_products, factor_norm,
    primes_through,
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

pub struct BruteForceResult {
    pub factor_base: FactorBase,
    pub cache: RelationCache,
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
        statistics,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn selected_minor_determinant(records: &[i64], rows: &[usize]) -> Integer {
        let size = rows.len();
        let width = records.len() / (rows.iter().copied().max().unwrap() + 1);
        assert_eq!(width, size);
        let mut matrix = rows
            .iter()
            .flat_map(|row| records[row * width..(row + 1) * width].iter())
            .map(|entry| Integer::from(*entry))
            .collect::<Vec<_>>();
        let mut previous = Integer::from(1);
        let mut sign = 1_i32;
        for pivot in 0..size - 1 {
            let pivot_row = (pivot..size)
                .find(|row| matrix[row * size + pivot] != 0)
                .expect("selected minor is singular");
            if pivot_row != pivot {
                for column in 0..size {
                    matrix.swap(pivot * size + column, pivot_row * size + column);
                }
                sign = -sign;
            }
            let pivot_value = matrix[pivot * size + pivot].clone();
            for row in pivot + 1..size {
                for column in pivot + 1..size {
                    let mut value = Integer::from(&matrix[row * size + column] * &pivot_value);
                    value -=
                        Integer::from(&matrix[row * size + pivot] * &matrix[pivot * size + column]);
                    value /= &previous;
                    matrix[row * size + column] = value;
                }
                matrix[row * size + pivot] = Integer::from(0);
            }
            previous = pivot_value;
        }
        let mut determinant = matrix[size * size - 1].clone();
        if sign < 0 {
            determinant = -determinant;
        }
        determinant
    }

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
            [1, 0, 0, 0, 1, 0, 0, 0, 1],
            73,
            20,
        )
        .unwrap();
        assert_eq!(answer.factor_base.ideals.len(), 66);
        assert_eq!(answer.cache.missing(), 0);
        assert_eq!(answer.cache.len(), 86);
        assert_eq!(answer.statistics.maximum_radius, 73);

        // Three exhibited maximal minors have gcd one.  Consequently the
        // 86 relation rows generate all of Z^66 and the presentation has
        // class number one; this is a compact exact certificate independent
        // of a particular Smith implementation.
        let basis = [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26,
            27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 44, 45, 46, 47, 48, 49, 50,
            51, 52, 53, 54, 55, 56, 57, 59, 60, 61, 62, 63, 64, 65, 68, 70, 71, 81, 84, 85,
        ];
        let mut second = basis;
        second[0] = 80;
        let mut third = basis;
        third[3] = 80;
        let determinants = [basis, second, third].map(|rows| {
            selected_minor_determinant(answer.cache.records(), &rows)
                .abs()
                .to_u64()
                .unwrap()
        });
        assert_eq!(determinants, [2_871, 3_277, 15_717]);
        assert_eq!(super::gcd(super::gcd(2_871, 3_277), 15_717), 1);
    }
}
