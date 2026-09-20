// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Allocation-free Rust port of PARI 2.17.4's `add_rel_i` relation cache.
//!
//! The cache is deliberately a machine-word component.  Relation exponents,
//! the elimination basis, and all dimensions in the prepared H1 experiment
//! are authenticated signed 64-bit values.  Exact algebraic integers belong
//! to the surrounding collector, not to this finite-field rank filter.

const RELATION_MODULUS: i64 = 27_449;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CacheError {
    InvalidLayout,
    InvalidPrimeGroup,
    InvalidFirstNonzero,
    CapacityExhausted,
    NoninvertiblePivot,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AddOutcome {
    /// PARI's `k`: positive for a newly independent row, zero for a dependent
    /// row, and -1 for an exact duplicate.
    pub rank_marker: i64,
    pub appended: bool,
}

/// Caller-owned storage for the resident relation cache.
///
/// `basis` is column-major, matching PARI and the Python port.  `records` are
/// consecutive row vectors.  Allocation happens only in `new`; `reset` and
/// `add_relation` reuse all storage.
pub struct RelationCache {
    size: usize,
    capacity: usize,
    last: usize,
    missing: usize,
    relsup: usize,
    basis: Vec<i64>,
    records: Vec<i64>,
    hashes: Vec<usize>,
    metadata: Vec<i64>,
    scratch: Vec<i64>,
}

impl RelationCache {
    pub fn new(size: usize, capacity: usize, relsup: usize) -> Self {
        Self::try_new(size, capacity, relsup).expect("relation-cache dimensions fit in usize")
    }

    pub fn try_new(size: usize, capacity: usize, relsup: usize) -> Result<Self, CacheError> {
        let basis_length = size.checked_mul(size).ok_or(CacheError::InvalidLayout)?;
        let records_length = capacity
            .checked_mul(size)
            .ok_or(CacheError::InvalidLayout)?;
        let metadata_length = capacity.checked_mul(3).ok_or(CacheError::InvalidLayout)?;
        Ok(Self {
            size,
            capacity,
            last: 0,
            missing: size,
            relsup,
            basis: vec![0; basis_length],
            records: vec![0; records_length],
            hashes: vec![0; capacity],
            metadata: vec![0; metadata_length],
            scratch: vec![0; size],
        })
    }

    pub fn reset(&mut self, relsup: usize) {
        self.last = 0;
        self.missing = self.size;
        self.relsup = relsup;
        self.basis.fill(0);
        // Records and metadata beyond `last` are dead and need not be cleared.
    }

    pub fn len(&self) -> usize {
        self.last
    }

    pub fn is_empty(&self) -> bool {
        self.last == 0
    }

    pub fn missing(&self) -> usize {
        self.missing
    }

    pub fn remaining_supplementary(&self) -> usize {
        self.relsup
    }

    pub fn basis(&self) -> &[i64] {
        &self.basis
    }

    /// Zero-based coordinates not yet represented by a modular pivot.
    pub fn missing_pivot_indices(&self) -> Vec<usize> {
        (0..self.size)
            .filter(|index| self.basis[index * self.size + index] == 0)
            .collect()
    }

    pub fn records(&self) -> &[i64] {
        &self.records[..self.last * self.size]
    }

    pub fn first_nonzero_hints(&self) -> &[usize] {
        &self.hashes[..self.last]
    }

    pub fn metadata(&self) -> &[i64] {
        &self.metadata[..self.last * 3]
    }

    /// Build the complete-rational-prime seed relations used by `init_rel`.
    ///
    /// Offsets are zero-based active-factor-base positions.  The supplied
    /// `relation` is caller-owned scratch and is reused for every group.
    #[allow(clippy::too_many_arguments)]
    pub fn initialize_complete_prime_groups(
        &mut self,
        additional: usize,
        primes: &[i64],
        offsets: &[usize],
        counts: &[usize],
        complete: &[bool],
        ramification: &[i64],
        relation: &mut [i64],
    ) -> Result<usize, CacheError> {
        let groups = primes.len();
        if offsets.len() != groups
            || counts.len() != groups
            || complete.len() != groups
            || ramification.len() != self.size
            || relation.len() != self.size
        {
            return Err(CacheError::InvalidLayout);
        }
        if self.capacity < complete.iter().filter(|value| **value).count() {
            return Err(CacheError::CapacityExhausted);
        }
        self.reset(additional);
        for group in 0..groups {
            if !complete[group] {
                continue;
            }
            let start = offsets[group];
            let count = counts[group];
            if count == 0
                || start.checked_add(count).is_none_or(|end| end > self.size)
                || primes[group] < 2
            {
                return Err(CacheError::InvalidPrimeGroup);
            }
            relation.fill(0);
            relation[start..start + count].copy_from_slice(&ramification[start..start + count]);
            self.add_relation(relation, start + 1, primes[group], 0, 0, false)?;
        }
        Ok(self.last)
    }

    /// Transfer initial rational-prime generators to owned coordinate rows.
    ///
    /// This is the exact ownership handoff immediately following PARI's
    /// `init_rel`: metadata initially contains the rational prime, while the
    /// collector expects a one-based generator-row token.
    pub fn publish_initial_generators(
        &mut self,
        degree: usize,
        generators: &mut [i64],
    ) -> Result<(), CacheError> {
        if degree == 0 || generators.len() < self.last * degree {
            return Err(CacheError::InvalidLayout);
        }
        for row in 0..self.last {
            generators[row * degree] = self.metadata[row * 3];
            generators[row * degree + 1..(row + 1) * degree].fill(0);
            self.metadata[row * 3] = (row + 1) as i64;
        }
        Ok(())
    }

    #[inline]
    fn add_mul_mod(target: &mut [i64], source: &[i64], multiple: i64) {
        debug_assert_eq!(target.len(), source.len());
        for (answer, value) in target.iter_mut().zip(source) {
            let product = i128::from(*value) * i128::from(multiple);
            let sum = i128::from(*answer) + product;
            *answer = sum.rem_euclid(i128::from(RELATION_MODULUS)) as i64;
        }
    }

    /// Insert one prepared relation with the exact `add_rel_i` branch policy.
    #[allow(clippy::too_many_arguments)]
    pub fn add_relation(
        &mut self,
        relation: &[i64],
        first_nonzero: usize,
        generator: i64,
        original: usize,
        automorphism: i64,
        random_relation: bool,
    ) -> Result<AddOutcome, CacheError> {
        let n = self.size;
        if relation.len() != n || first_nonzero < 1 || first_nonzero > n + 1 {
            return Err(CacheError::InvalidFirstNonzero);
        }

        let mut rank_marker = 0_i64;
        if first_nonzero != n + 1 {
            for row in (0..self.last).rev() {
                if self.hashes[row] == first_nonzero
                    && self.records[row * n..(row + 1) * n] == *relation
                {
                    return Ok(AddOutcome {
                        rank_marker: -1,
                        appended: false,
                    });
                }
            }
            if self.last >= self.capacity {
                return Ok(AddOutcome {
                    rank_marker: 0,
                    appended: false,
                });
            }
            if self.missing != 0 {
                self.scratch.copy_from_slice(relation);
                let mut k = n;
                while k > 0 && self.scratch[k - 1] == 0 {
                    k -= 1;
                }
                while k > 0 {
                    let column = (k - 1) * n;
                    if self.basis[column + k - 1] != 0 {
                        // `mod_p` is `ulong` in buch2.c, so both the pivot and
                        // the complete expression are evaluated with unsigned
                        // 64-bit wrap before the final remainder.
                        let pivot = self.scratch[k - 1] as u64;
                        for i in 0..k - 1 {
                            let complement = (RELATION_MODULUS as u64)
                                .wrapping_sub(self.basis[column + i] as u64);
                            self.scratch[i] = (self.scratch[i] as u64)
                                .wrapping_add(pivot.wrapping_mul(complement))
                                .wrapping_rem(RELATION_MODULUS as u64)
                                as i64;
                        }
                        self.scratch[k - 1] = 0;
                        while k > 0 && self.scratch[k - 1] == 0 {
                            k -= 1;
                        }
                    } else {
                        let inverse = relation_mod_inverse(self.scratch[k - 1])?;
                        for elimination in (0..k - 1).rev() {
                            let value = self.scratch[elimination];
                            let base = elimination * n;
                            if value != 0 && self.basis[base + elimination] != 0 {
                                let multiple = RELATION_MODULUS - value;
                                let source = &self.basis[base..base + elimination];
                                Self::add_mul_mod(
                                    &mut self.scratch[..elimination],
                                    source,
                                    multiple,
                                );
                                self.scratch[elimination] = 0;
                            }
                        }
                        for i in 0..k - 1 {
                            if self.scratch[i] != 0 {
                                // `invak` is an unsigned PARI word.  The C
                                // multiplication therefore promotes a negative
                                // relation entry to `ulong` and wraps at 64
                                // bits before reducing modulo `mod_p`.
                                self.basis[column + i] = (self.scratch[i] as u64)
                                    .wrapping_mul(inverse as u64)
                                    .wrapping_rem(RELATION_MODULUS as u64)
                                    as i64;
                            }
                        }
                        self.basis[column + k - 1] = 1;
                        // Preserve upstream's strict `i < n` bound: the final
                        // basis column is intentionally excluded.
                        for upper in k..n.saturating_sub(1) {
                            let upper_base = upper * n;
                            let value = self.basis[upper_base + k - 1];
                            if value != 0 {
                                let multiple = RELATION_MODULUS - value;
                                let (earlier, current_and_later) =
                                    self.basis.split_at_mut(upper_base);
                                let source = &earlier[column..column + k - 1];
                                Self::add_mul_mod(
                                    &mut current_and_later[..k - 1],
                                    source,
                                    multiple,
                                );
                                current_and_later[k - 1] = 0;
                            }
                        }
                        self.missing -= 1;
                        rank_marker = k as i64;
                        break;
                    }
                }
            } else {
                rank_marker = (self.last + 1) as i64;
            }
        }

        if first_nonzero == n + 1
            || rank_marker != 0
            || self.relsup > 0
            || (generator != 0 && random_relation)
        {
            if self.last >= self.capacity {
                return Err(CacheError::CapacityExhausted);
            }
            if rank_marker == 0 && self.relsup > 0 && first_nonzero < n + 1 {
                self.relsup -= 1;
                rank_marker = (self.last + 1 + self.missing) as i64;
            }
            let row = self.last;
            self.records[row * n..(row + 1) * n].copy_from_slice(relation);
            self.hashes[row] = first_nonzero;
            self.metadata[row * 3] = generator;
            if automorphism != 0 {
                self.metadata[row * 3 + 1] = (row as i64 + 1) - original as i64;
            }
            self.metadata[row * 3 + 2] = automorphism;
            self.last += 1;
            return Ok(AddOutcome {
                rank_marker,
                appended: true,
            });
        }
        Ok(AddOutcome {
            rank_marker,
            appended: false,
        })
    }
}

/// PARI's fixed-modulus `Fl_inv`, including the unsigned subtraction behavior
/// of `xgcduu(f=1)` for negative signed inputs.
pub fn relation_mod_inverse(value: i64) -> Result<i64, CacheError> {
    let modulus = RELATION_MODULUS as u64;
    let mut d = modulus;
    let mut d1 = value as u64;
    let mut x = 0_u64;
    let mut x1 = 1_u64;
    let mut swapped = false;
    while d1 > 1 {
        d = d.wrapping_sub(d1);
        if d >= d1 {
            let quotient = 1_u64.wrapping_add(d / d1);
            d %= d1;
            x = x.wrapping_add(quotient.wrapping_mul(x1));
        } else {
            x = x.wrapping_add(x1);
        }
        if d <= 1 {
            swapped = true;
            break;
        }
        d1 = d1.wrapping_sub(d);
        if d1 >= d {
            let quotient = 1_u64.wrapping_add(d1 / d);
            d1 %= d;
            x1 = x1.wrapping_add(quotient.wrapping_mul(x));
        } else {
            x1 = x1.wrapping_add(x);
        }
    }
    let (gcd, answer) = if swapped {
        (if d == 1 { 1 } else { d1 }, modulus - x % modulus)
    } else {
        (if d1 == 1 { 1 } else { d }, x1 % modulus)
    };
    if gcd != 1 || answer == 0 {
        Err(CacheError::NoninvertiblePivot)
    } else {
        Ok(answer as i64)
    }
}
