// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact combinatorial planning for the Belabas--Friedman residue enclosure.
//!
//! Transcendental evaluation is deliberately outside this module.  This code
//! only authenticates complete cubic splitting data and aggregates the exact
//! signed prime-power schedule used by the rigorous Arb bridge.

use crate::prepared_factor_base::CubicSplittingRecord;
use std::{
    cmp::Reverse,
    collections::{BTreeMap, BinaryHeap},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BelabasFriedmanPlanError {
    InvalidThreshold,
    IncompletePrimeCoverage,
    InvalidSplittingType,
    IntegerOverflow,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BelabasFriedmanPlan {
    pub threshold: u64,
    pub raw_terms: usize,
    /// `(multiplicity, scale, norm, exponent)`, lexicographically ordered by
    /// `(scale, norm, exponent)`. Scale 0 means `X`; scale 1 means `X/9`.
    pub terms: Vec<[i64; 4]>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BdfFactorBasePlan {
    pub bound: u64,
    pub raw_terms: usize,
    /// `(multiplicity, norm, exponent)`, ordered by `(norm, exponent)`.
    pub terms: Vec<[i64; 3]>,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct PendingPower {
    power: u64,
    norm: u64,
    exponent: usize,
    multiplicity: i64,
}

/// Persistent exact planner for a monotonically increasing sequence of
/// Belabas--Friedman thresholds.
///
/// Each call to [`Self::extend_to`] accepts only the splitting records in the
/// interval between the preceding threshold (or 2 for the first call) and the
/// new threshold. Successfully authenticated coverage and pending prime-power
/// events are retained. Thus an escalation neither revalidates the preceding
/// prime prefix nor rebuilds its aggregate terms.
#[derive(Clone, Debug)]
pub struct IncrementalCubicBelabasFriedmanPlan {
    coverage_end: u64,
    threshold: Option<u64>,
    raw_terms: usize,
    aggregated: BTreeMap<(i64, i64, i64), i64>,
    full_scale: BinaryHeap<Reverse<PendingPower>>,
    ninth_scale: BinaryHeap<Reverse<PendingPower>>,
}

impl Default for IncrementalCubicBelabasFriedmanPlan {
    fn default() -> Self {
        Self::new()
    }
}

impl IncrementalCubicBelabasFriedmanPlan {
    pub fn new() -> Self {
        Self {
            coverage_end: 2,
            threshold: None,
            raw_terms: 0,
            aggregated: BTreeMap::new(),
            full_scale: BinaryHeap::new(),
            ninth_scale: BinaryHeap::new(),
        }
    }

    /// Authenticate the next splitting interval and return the exact plan at
    /// `threshold`.
    ///
    /// Thresholds must increase strictly. `splitting_extension` must contain
    /// exactly one valid record, in order, for every prime in
    /// `previous_threshold..threshold`; on the first call that interval is
    /// `2..threshold`. Failed authentication leaves the planner unchanged.
    pub fn extend_to(
        &mut self,
        threshold: u64,
        splitting_extension: &[CubicSplittingRecord],
    ) -> Result<BelabasFriedmanPlan, BelabasFriedmanPlanError> {
        if threshold < 72
            || !threshold.is_multiple_of(9)
            || self.threshold.is_some_and(|previous| threshold <= previous)
        {
            return Err(BelabasFriedmanPlanError::InvalidThreshold);
        }

        let authenticated =
            authenticate_splitting_interval(self.coverage_end, threshold, splitting_extension)?;

        for (prime, norms) in authenticated {
            self.full_scale.push(Reverse(PendingPower {
                power: prime,
                norm: prime,
                exponent: 1,
                multiplicity: -1,
            }));
            self.ninth_scale.push(Reverse(PendingPower {
                power: prime,
                norm: prime,
                exponent: 1,
                multiplicity: 1,
            }));
            for norm in norms {
                self.full_scale.push(Reverse(PendingPower {
                    power: norm,
                    norm,
                    exponent: 1,
                    multiplicity: 1,
                }));
                self.ninth_scale.push(Reverse(PendingPower {
                    power: norm,
                    norm,
                    exponent: 1,
                    multiplicity: -1,
                }));
            }
        }

        consume_pending_powers(
            &mut self.full_scale,
            threshold,
            0,
            &mut self.raw_terms,
            &mut self.aggregated,
        )?;
        consume_pending_powers(
            &mut self.ninth_scale,
            threshold / 9,
            1,
            &mut self.raw_terms,
            &mut self.aggregated,
        )?;
        self.coverage_end = threshold;
        self.threshold = Some(threshold);

        Ok(BelabasFriedmanPlan {
            threshold,
            raw_terms: self.raw_terms,
            terms: self
                .aggregated
                .iter()
                .filter_map(|(&(scale, norm, exponent), &multiplicity)| {
                    (multiplicity != 0).then_some([multiplicity, scale, norm, exponent])
                })
                .collect(),
        })
    }
}

fn authenticate_splitting_interval(
    start: u64,
    end: u64,
    splitting: &[CubicSplittingRecord],
) -> Result<Vec<(u64, Vec<u64>)>, BelabasFriedmanPlanError> {
    let mut records = splitting.iter();
    let mut authenticated = Vec::with_capacity(splitting.len());
    for prime in (start..end).filter(|value| is_prime(*value)) {
        let record = records
            .next()
            .ok_or(BelabasFriedmanPlanError::IncompletePrimeCoverage)?;
        if u64::try_from(record.prime)
            .map_err(|_| BelabasFriedmanPlanError::InvalidSplittingType)?
            != prime
        {
            return Err(BelabasFriedmanPlanError::IncompletePrimeCoverage);
        }
        let degree =
            record
                .factors
                .iter()
                .try_fold(0_usize, |degree, &(ramification, residue_degree)| {
                    if ramification == 0 || residue_degree == 0 {
                        return None;
                    }
                    degree.checked_add(ramification.checked_mul(residue_degree)?)
                });
        if record.factors.is_empty() || degree != Some(3) {
            return Err(BelabasFriedmanPlanError::InvalidSplittingType);
        }
        let norms = record
            .factors
            .iter()
            .map(|&(_ramification, residue_degree)| {
                prime
                    .checked_pow(
                        u32::try_from(residue_degree)
                            .map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?,
                    )
                    .ok_or(BelabasFriedmanPlanError::IntegerOverflow)
            })
            .collect::<Result<Vec<_>, _>>()?;
        authenticated.push((prime, norms));
    }
    if records.next().is_some() {
        return Err(BelabasFriedmanPlanError::IncompletePrimeCoverage);
    }
    Ok(authenticated)
}

fn consume_pending_powers(
    pending: &mut BinaryHeap<Reverse<PendingPower>>,
    bound: u64,
    scale: i64,
    raw_terms: &mut usize,
    aggregated: &mut BTreeMap<(i64, i64, i64), i64>,
) -> Result<(), BelabasFriedmanPlanError> {
    while pending.peek().is_some_and(|event| event.0.power < bound) {
        let Reverse(event) = pending.pop().expect("peek proved a pending event");
        *raw_terms = raw_terms
            .checked_add(1)
            .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
        let norm =
            i64::try_from(event.norm).map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?;
        let exponent =
            i64::try_from(event.exponent).map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?;
        let entry = aggregated.entry((scale, norm, exponent)).or_default();
        *entry = entry
            .checked_add(event.multiplicity)
            .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
        if let (Some(power), Some(exponent)) = (
            event.power.checked_mul(event.norm),
            event.exponent.checked_add(1),
        ) {
            pending.push(Reverse(PendingPower {
                power,
                exponent,
                ..event
            }));
        }
    }
    Ok(())
}

fn is_prime(value: u64) -> bool {
    if value < 2 {
        return false;
    }
    if value % 2 == 0 {
        return value == 2;
    }
    let mut divisor = 3_u64;
    while divisor <= value / divisor {
        if value % divisor == 0 {
            return false;
        }
        divisor += 2;
    }
    true
}

fn powers_strict(base: u64, bound: u64) -> Vec<u64> {
    let mut powers = Vec::new();
    let mut power = 1_u64;
    while power <= (bound - 1) / base {
        power *= base;
        powers.push(power);
    }
    powers
}

pub fn build_cubic_belabas_friedman_plan(
    threshold: u64,
    splitting: &[CubicSplittingRecord],
) -> Result<BelabasFriedmanPlan, BelabasFriedmanPlanError> {
    if threshold < 72 || !threshold.is_multiple_of(9) {
        return Err(BelabasFriedmanPlanError::InvalidThreshold);
    }
    let expected_count = (2..threshold).filter(|value| is_prime(*value)).count();
    if splitting.len() != expected_count {
        return Err(BelabasFriedmanPlanError::IncompletePrimeCoverage);
    }
    let ninth = threshold / 9;
    let mut expected_prime = 2_u64;
    let mut aggregated = BTreeMap::<(i64, i64, i64), i64>::new();
    let mut raw_terms = 0_usize;
    let mut add = |sign: i64, scale: i64, norm: u64, exponent: usize| {
        raw_terms = raw_terms
            .checked_add(1)
            .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
        let norm = i64::try_from(norm).map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?;
        let exponent =
            i64::try_from(exponent).map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?;
        let entry = aggregated.entry((scale, norm, exponent)).or_default();
        *entry = entry
            .checked_add(sign)
            .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
        Ok::<(), BelabasFriedmanPlanError>(())
    };
    for record in splitting {
        while expected_prime < threshold && !is_prime(expected_prime) {
            expected_prime += 1;
        }
        let prime = u64::try_from(record.prime)
            .map_err(|_| BelabasFriedmanPlanError::InvalidSplittingType)?;
        if prime != expected_prime {
            return Err(BelabasFriedmanPlanError::IncompletePrimeCoverage);
        }
        expected_prime += 1;
        if record.factors.is_empty()
            || record
                .factors
                .iter()
                .any(|&(ramification, degree)| ramification == 0 || degree == 0)
            || record
                .factors
                .iter()
                .map(|&(ramification, degree)| ramification * degree)
                .sum::<usize>()
                != 3
        {
            return Err(BelabasFriedmanPlanError::InvalidSplittingType);
        }
        for (index, _) in powers_strict(prime, threshold).iter().enumerate() {
            add(-1, 0, prime, index + 1)?;
        }
        for &(_ramification, residue_degree) in &record.factors {
            let norm = prime
                .checked_pow(
                    u32::try_from(residue_degree)
                        .map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?,
                )
                .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
            for (index, _) in powers_strict(norm, threshold).iter().enumerate() {
                add(1, 0, norm, index + 1)?;
            }
        }
        if prime < ninth {
            for (index, _) in powers_strict(prime, ninth).iter().enumerate() {
                add(1, 1, prime, index + 1)?;
            }
            for &(_ramification, residue_degree) in &record.factors {
                let norm = prime
                    .checked_pow(
                        u32::try_from(residue_degree)
                            .map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?,
                    )
                    .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
                for (index, _) in powers_strict(norm, ninth).iter().enumerate() {
                    add(-1, 1, norm, index + 1)?;
                }
            }
        }
    }
    let terms = aggregated
        .into_iter()
        .filter_map(|((scale, norm, exponent), multiplicity)| {
            (multiplicity != 0).then_some([multiplicity, scale, norm, exponent])
        })
        .collect();
    Ok(BelabasFriedmanPlan {
        threshold,
        raw_terms,
        terms,
    })
}

pub fn build_cubic_bdf_factor_base_plan(
    bound: u64,
    splitting: &[CubicSplittingRecord],
) -> Result<BdfFactorBasePlan, BelabasFriedmanPlanError> {
    if bound < 2 {
        return Err(BelabasFriedmanPlanError::InvalidThreshold);
    }
    let expected_count = (2..bound).filter(|value| is_prime(*value)).count();
    if splitting.len() < expected_count {
        return Err(BelabasFriedmanPlanError::IncompletePrimeCoverage);
    }
    let mut expected_prime = 2_u64;
    let mut aggregated = BTreeMap::<(i64, i64), i64>::new();
    let mut raw_terms = 0_usize;
    for record in splitting.iter().take(expected_count) {
        while expected_prime < bound && !is_prime(expected_prime) {
            expected_prime += 1;
        }
        let prime = u64::try_from(record.prime)
            .map_err(|_| BelabasFriedmanPlanError::InvalidSplittingType)?;
        if prime != expected_prime {
            return Err(BelabasFriedmanPlanError::IncompletePrimeCoverage);
        }
        expected_prime += 1;
        if record.factors.is_empty()
            || record
                .factors
                .iter()
                .any(|&(ramification, degree)| ramification == 0 || degree == 0)
            || record
                .factors
                .iter()
                .map(|&(ramification, degree)| ramification * degree)
                .sum::<usize>()
                != 3
        {
            return Err(BelabasFriedmanPlanError::InvalidSplittingType);
        }
        for &(_ramification, residue_degree) in &record.factors {
            let norm = prime
                .checked_pow(
                    u32::try_from(residue_degree)
                        .map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?,
                )
                .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
            if norm >= bound {
                continue;
            }
            for (index, _) in powers_strict(norm, bound).iter().enumerate() {
                raw_terms = raw_terms
                    .checked_add(1)
                    .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
                let key = (
                    i64::try_from(norm).map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?,
                    i64::try_from(index + 1)
                        .map_err(|_| BelabasFriedmanPlanError::IntegerOverflow)?,
                );
                let entry = aggregated.entry(key).or_default();
                *entry = entry
                    .checked_add(1)
                    .ok_or(BelabasFriedmanPlanError::IntegerOverflow)?;
            }
        }
    }
    let terms = aggregated
        .into_iter()
        .map(|((norm, exponent), multiplicity)| [multiplicity, norm, exponent])
        .collect();
    Ok(BdfFactorBasePlan {
        bound,
        raw_terms,
        terms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn synthetic_splitting(start: u64, end: u64) -> Vec<CubicSplittingRecord> {
        (start..end)
            .filter(|value| is_prime(*value))
            .map(|prime| CubicSplittingRecord {
                prime: i64::try_from(prime).unwrap(),
                factors: match prime % 4 {
                    0 => vec![(3, 1)],
                    1 => vec![(1, 1), (1, 2)],
                    2 => vec![(1, 3)],
                    _ => vec![(1, 1), (1, 1), (1, 1)],
                },
            })
            .collect()
    }

    #[test]
    fn rejects_incomplete_splitting_data() {
        assert_eq!(
            build_cubic_belabas_friedman_plan(72, &[]),
            Err(BelabasFriedmanPlanError::IncompletePrimeCoverage)
        );
    }

    #[test]
    fn incremental_plans_equal_fresh_plans_across_the_supported_threshold_range() {
        let mut incremental = IncrementalCubicBelabasFriedmanPlan::new();
        let mut complete_splitting = Vec::new();
        let mut previous = 2;
        for threshold in (72..=23_994).step_by(9) {
            let extension = synthetic_splitting(previous, threshold);
            complete_splitting.extend(extension.iter().cloned());
            let actual = incremental.extend_to(threshold, &extension).unwrap();
            let expected =
                build_cubic_belabas_friedman_plan(threshold, &complete_splitting).unwrap();
            assert_eq!(actual, expected, "threshold {threshold}");
            previous = threshold;
        }
    }

    #[test]
    fn incremental_authentication_rejects_malformed_extensions_without_losing_coverage() {
        let valid = synthetic_splitting(2, 72);
        let mut incremental = IncrementalCubicBelabasFriedmanPlan::new();

        assert_eq!(
            incremental.extend_to(72, &valid[..valid.len() - 1]),
            Err(BelabasFriedmanPlanError::IncompletePrimeCoverage)
        );

        let mut wrong_prime = valid.clone();
        wrong_prime[0].prime = 3;
        assert_eq!(
            incremental.extend_to(72, &wrong_prime),
            Err(BelabasFriedmanPlanError::IncompletePrimeCoverage)
        );

        let mut negative_prime = valid.clone();
        negative_prime[0].prime = -2;
        assert_eq!(
            incremental.extend_to(72, &negative_prime),
            Err(BelabasFriedmanPlanError::InvalidSplittingType)
        );

        let mut invalid_factors = valid.clone();
        invalid_factors[0].factors = vec![(0, 1), (1, 3)];
        assert_eq!(
            incremental.extend_to(72, &invalid_factors),
            Err(BelabasFriedmanPlanError::InvalidSplittingType)
        );

        let mut extra = valid.clone();
        extra.push(CubicSplittingRecord {
            prime: 73,
            factors: vec![(1, 3)],
        });
        assert_eq!(
            incremental.extend_to(72, &extra),
            Err(BelabasFriedmanPlanError::IncompletePrimeCoverage)
        );

        let recovered = incremental.extend_to(72, &valid).unwrap();
        assert_eq!(
            recovered,
            build_cubic_belabas_friedman_plan(72, &valid).unwrap()
        );
        assert_eq!(
            incremental.extend_to(72, &[]),
            Err(BelabasFriedmanPlanError::InvalidThreshold)
        );

        let valid_extension = synthetic_splitting(72, 144);
        let mut malformed_extension = valid_extension.clone();
        malformed_extension[0].factors = vec![(usize::MAX, 2)];
        assert_eq!(
            incremental.extend_to(144, &malformed_extension),
            Err(BelabasFriedmanPlanError::InvalidSplittingType)
        );

        let extended = incremental.extend_to(144, &valid_extension).unwrap();
        let mut complete = valid;
        complete.extend(valid_extension);
        assert_eq!(
            extended,
            build_cubic_belabas_friedman_plan(144, &complete).unwrap()
        );
    }
}
