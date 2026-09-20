// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Prime-ideal valuations for an integral cubic element.
//!
//! This is the exact-arithmetic half of PARI 2.17.4's `divide_p_elt` and
//! `ZC_nfval` path.  Rational smoothness supplies `(p, v_p(N(x)))`; this
//! module refines each rational valuation into the valuations at the prime
//! ideals above `p`.  A rational prime is accepted only when
//!
//! ```text
//! v_p(N(x)) = sum(P | p) f(P/p) * v_P(x).
//! ```
//!
//! `PrimeIdeal::tau` is the prepared row-major matrix used by PARI: whenever
//! every coordinate of `tau * x` is divisible by `p`, division advances the
//! local valuation by one.  PARI accelerates long runs by periodically
//! stripping a common rational `p`; the direct loop below has the same exact
//! semantics and keeps the experiment easy to audit.

use crate::factor_base::{FactorBase, PrimeIdeal};
use rug::{Assign, Integer};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RationalPrimePower {
    pub prime: i64,
    pub exponent: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PrimeValuationError {
    ZeroElement,
    InvalidRationalFactor {
        prime: i64,
        exponent: usize,
    },
    RationalFactorsOutOfOrder {
        previous: i64,
        current: i64,
    },
    PrimeMissingFromFactorBase(i64),
    IncompletePrimeIdealFactorization {
        prime: i64,
        norm_valuation: usize,
        accounted_valuation: i64,
    },
    InvalidDivisorIdeal {
        index: usize,
        exponent: usize,
    },
    ValuationOverflow,
}

/// Reusable degree-three GMP storage for local valuation calculations.
///
/// The collector may keep one workspace for its entire lifetime.  GMP can
/// grow a limb allocation when a genuinely larger candidate appears, but the
/// three `Integer` owners and all vector topology remain fixed.
pub struct PrimeValuationWorkspace {
    current: [Integer; 3],
    next: [Integer; 3],
}

impl PrimeValuationWorkspace {
    pub fn new() -> Self {
        Self {
            current: std::array::from_fn(|_| Integer::new()),
            next: std::array::from_fn(|_| Integer::new()),
        }
    }

    /// Compute `v_P(element)` using the prepared PARI `tau` matrix.
    pub fn valuation(
        &mut self,
        element: &[Integer; 3],
        ideal: &PrimeIdeal,
    ) -> Result<usize, PrimeValuationError> {
        if element.iter().all(Integer::is_zero) {
            return Err(PrimeValuationError::ZeroElement);
        }
        self.current.clone_from(element);
        let prime = Integer::from(ideal.prime);

        // An inert descriptor represents p O_K itself.  Its valuation is the
        // common rational p-adic content of the three integral coordinates.
        if ideal.residue_degree == 3 {
            let mut valuation = 0_usize;
            loop {
                if self
                    .current
                    .iter()
                    .any(|coordinate| !coordinate.is_divisible(&prime))
                {
                    return Ok(valuation);
                }
                for coordinate in &mut self.current {
                    *coordinate /= &prime;
                }
                valuation = valuation
                    .checked_add(1)
                    .ok_or(PrimeValuationError::ValuationOverflow)?;
            }
        }

        let mut valuation = 0_usize;
        loop {
            let mut divisible = true;
            for row in 0..3 {
                self.next[row].assign(0);
                for column in 0..3 {
                    if ideal.tau[row * 3 + column] != 0 {
                        self.next[row] +=
                            Integer::from(ideal.tau[row * 3 + column]) * &self.current[column];
                    }
                }
                if !self.next[row].is_divisible(&prime) {
                    divisible = false;
                }
            }
            if !divisible {
                return Ok(valuation);
            }
            for row in 0..3 {
                self.next[row] /= &prime;
            }
            std::mem::swap(&mut self.current, &mut self.next);
            valuation = valuation
                .checked_add(1)
                .ok_or(PrimeValuationError::ValuationOverflow)?;
        }
    }
}

impl Default for PrimeValuationWorkspace {
    fn default() -> Self {
        Self::new()
    }
}

fn rational_group(base: &FactorBase, prime: i64) -> Option<(usize, usize, usize)> {
    base.rational_primes
        .binary_search(&prime)
        .ok()
        .map(|group| {
            (
                group,
                base.rational_offsets[group],
                base.rational_counts[group],
            )
        })
}

/// Refine a rational norm factorization to a dense factor-base relation.
///
/// Factors must be in increasing rational-prime order, as emitted by PARI's
/// `absZ_factor` path and the Rust smoothness front.  `relation` is cleared on
/// entry.  On failure it deliberately retains the valuations computed before
/// the failed group, mirroring `can_factor`'s partial-output behavior.
pub fn refine_element_factorization(
    base: &FactorBase,
    element: [i64; 3],
    rational_factors: &[RationalPrimePower],
    relation: &mut [i64],
    workspace: &mut PrimeValuationWorkspace,
) -> Result<(), PrimeValuationError> {
    refine_quotient_factorization(base, element, rational_factors, None, relation, workspace)
}

/// Refine the norm factorization of `element / divisor`.
///
/// The optional divisor is `(one_based_factor_base_index, exponent)`.  The H1
/// small-norm collector uses exponent one and passes its current packet ideal.
/// This is the exact specialized meaning of PARI's `mode = 2` corridor: local
/// element valuations are reduced by the known factorization of the divisor
/// ideal before the rational norm identity is checked.
pub fn refine_quotient_factorization(
    base: &FactorBase,
    element: [i64; 3],
    rational_factors: &[RationalPrimePower],
    divisor: Option<(usize, usize)>,
    relation: &mut [i64],
    workspace: &mut PrimeValuationWorkspace,
) -> Result<(), PrimeValuationError> {
    assert_eq!(relation.len(), base.ideals.len());
    relation.fill(0);
    if element == [0, 0, 0] {
        return Err(PrimeValuationError::ZeroElement);
    }
    if let Some((index, exponent)) = divisor {
        if index == 0 || index > base.ideals.len() || exponent == 0 {
            return Err(PrimeValuationError::InvalidDivisorIdeal { index, exponent });
        }
    }
    let element = element.map(Integer::from);
    let mut previous = 0_i64;

    for factor in rational_factors {
        if factor.prime < 2 || factor.exponent == 0 {
            return Err(PrimeValuationError::InvalidRationalFactor {
                prime: factor.prime,
                exponent: factor.exponent,
            });
        }
        if factor.prime <= previous {
            return Err(PrimeValuationError::RationalFactorsOutOfOrder {
                previous,
                current: factor.prime,
            });
        }
        previous = factor.prime;
        let (group, start, count) = rational_group(base, factor.prime).ok_or(
            PrimeValuationError::PrimeMissingFromFactorBase(factor.prime),
        )?;

        // When there is exactly one prime ideal above `p`, the norm identity
        // determines its valuation without any local divisions:
        //
        //     v_p(N(alpha / divisor)) = f(P/p) * v_P(alpha / divisor).
        //
        // Besides avoiding needless work, this is important at index primes:
        // a power-basis-derived `tau` may not describe division in the maximal
        // order, whereas the complete one-prime group and rational quotient
        // norm still determine the exact exponent.  The rational factors are
        // already those of the quotient, so no second divisor subtraction is
        // made in this branch.
        if count == 1 && base.complete_groups[group] {
            let residue_degree = base.ideals[start].residue_degree;
            if residue_degree == 0 || factor.exponent % residue_degree != 0 {
                return Err(PrimeValuationError::IncompletePrimeIdealFactorization {
                    prime: factor.prime,
                    norm_valuation: factor.exponent,
                    accounted_valuation: 0,
                });
            }
            relation[start] = i64::try_from(factor.exponent / residue_degree)
                .map_err(|_| PrimeValuationError::ValuationOverflow)?;
            continue;
        }

        let mut accounted = 0_i64;
        for index in start..start + count {
            let ideal = &base.ideals[index];
            let mut value = i64::try_from(workspace.valuation(&element, ideal)?)
                .map_err(|_| PrimeValuationError::ValuationOverflow)?;
            if let Some((divisor_index, divisor_exponent)) = divisor {
                if divisor_index == index + 1 {
                    value = value
                        .checked_sub(
                            i64::try_from(divisor_exponent)
                                .map_err(|_| PrimeValuationError::ValuationOverflow)?,
                        )
                        .ok_or(PrimeValuationError::ValuationOverflow)?;
                }
            }
            if value != 0 {
                relation[index] = value;
                accounted = accounted
                    .checked_add(
                        value
                            .checked_mul(
                                i64::try_from(ideal.residue_degree)
                                    .map_err(|_| PrimeValuationError::ValuationOverflow)?,
                            )
                            .ok_or(PrimeValuationError::ValuationOverflow)?,
                    )
                    .ok_or(PrimeValuationError::ValuationOverflow)?;
                // PARI stops scanning this prime group as soon as the norm
                // valuation is completely accounted for.
                if accounted
                    == i64::try_from(factor.exponent)
                        .map_err(|_| PrimeValuationError::ValuationOverflow)?
                {
                    break;
                }
            }
        }
        if accounted
            != i64::try_from(factor.exponent).map_err(|_| PrimeValuationError::ValuationOverflow)?
        {
            return Err(PrimeValuationError::IncompletePrimeIdealFactorization {
                prime: factor.prime,
                norm_valuation: factor.exponent,
                accounted_valuation: accounted,
            });
        }
    }
    Ok(())
}

/// Convert the dense relation into PARI's one-based sparse factor list.
pub fn sparse_relation(relation: &[i64]) -> Vec<(usize, i64)> {
    relation
        .iter()
        .enumerate()
        .filter_map(|(index, exponent)| (*exponent != 0).then_some((index + 1, *exponent)))
        .collect()
}
