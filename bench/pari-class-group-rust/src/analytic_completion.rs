// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact combinatorial planning for the Belabas--Friedman residue enclosure.
//!
//! Transcendental evaluation is deliberately outside this module.  This code
//! only authenticates complete cubic splitting data and aggregates the exact
//! signed prime-power schedule used by the rigorous Arb bridge.

use crate::prepared_factor_base::CubicSplittingRecord;
use std::collections::BTreeMap;

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

    #[test]
    fn rejects_incomplete_splitting_data() {
        assert_eq!(
            build_cubic_belabas_friedman_plan(72, &[]),
            Err(BelabasFriedmanPlanError::IncompletePrimeCoverage)
        );
    }
}
