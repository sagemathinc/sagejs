// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Stateful Fincke--Pohst cursor from PARI 2.17.4 `buch2.c:step`.
//!
//! The storage is allocated once per collector and reset between ideals.  The
//! indexing deliberately remains one-based inside the loop so the branch
//! structure is directly comparable with PARI and the translated Python.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EnumerationError {
    InvalidShape,
    TrialLimit,
}

pub struct EnumerationWorkspace {
    degree: usize,
    q: Vec<f64>,
    v: Vec<f64>,
    x: Vec<i64>,
    y: Vec<f64>,
    z: Vec<f64>,
    increment: Vec<i64>,
    k: usize,
    trials: usize,
    initialized: bool,
    exhausted: bool,
}

impl EnumerationWorkspace {
    pub fn new(degree: usize) -> Self {
        let stride = degree + 1;
        Self {
            degree,
            q: vec![0.0; stride * stride],
            v: vec![0.0; stride],
            x: vec![0; stride],
            y: vec![0.0; stride],
            z: vec![0.0; stride],
            increment: vec![0; stride],
            k: 0,
            trials: 0,
            initialized: false,
            exhausted: false,
        }
    }

    pub fn reset(&mut self, q: &[f64], v: &[f64]) -> Result<(), EnumerationError> {
        let stride = self.degree + 1;
        if q.len() != stride * stride
            || v.len() != stride
            || !q.iter().all(|value| value.is_finite())
            || !v.iter().all(|value| value.is_finite())
            || v[1..].iter().any(|value| *value <= 0.0)
        {
            return Err(EnumerationError::InvalidShape);
        }
        self.q.copy_from_slice(q);
        self.v.copy_from_slice(v);
        self.x.fill(0);
        self.y.fill(0.0);
        self.z.fill(0.0);
        self.increment.fill(0);
        self.k = 0;
        self.trials = 0;
        self.initialized = false;
        self.exhausted = false;
        Ok(())
    }

    pub fn coordinates(&self) -> &[i64] {
        &self.x
    }

    pub fn trials(&self) -> usize {
        self.trials
    }

    #[inline]
    fn step(&mut self, coordinate: usize) {
        if self.y[coordinate] == 0.0 {
            self.x[coordinate] += 1;
        } else {
            let increment = self.increment[coordinate];
            self.x[coordinate] += increment;
            self.increment[coordinate] = if increment > 0 {
                -1 - increment
            } else {
                1 - increment
            };
        }
    }

    /// Yield the next complete vector, preserving PARI's alternating order.
    pub fn next(&mut self, bound: f64, skip_first: bool) -> Result<bool, EnumerationError> {
        if self.degree < 2 || !bound.is_finite() || bound < 0.0 {
            return Err(EnumerationError::InvalidShape);
        }
        if self.exhausted {
            return Ok(false);
        }
        let stride = self.degree + 1;
        let mut k = self.degree;
        if !self.initialized {
            self.increment[1..].fill(1);
            self.y[self.degree] = 0.0;
            self.z[self.degree] = 0.0;
            self.x[self.degree] = 0;
            self.initialized = true;
        } else {
            k = self.k;
            self.step(k);
        }
        loop {
            let mut forced = false;
            if k > 1 {
                let lower = k - 1;
                self.z[lower] = 0.0;
                for j in k..stride {
                    self.z[lower] += self.q[lower * stride + j] * self.x[j] as f64;
                }
                let value = self.x[k] as f64 + self.z[k];
                self.y[lower] = self.y[k] + value * value * self.v[k];
                if lower <= usize::from(skip_first) && self.y[1] == 0.0 {
                    forced = true;
                }
                self.x[lower] = (-self.z[lower] + 0.5).floor() as i64;
                k = lower;
            }
            loop {
                if !forced {
                    self.trials += 1;
                    if self.trials > 1_000_000 {
                        self.k = k;
                        self.exhausted = true;
                        return Err(EnumerationError::TrialLimit);
                    }
                    let value = self.x[k] as f64 + self.z[k];
                    if self.y[k] + value * value * self.v[k] <= bound {
                        break;
                    }
                    self.step(k);
                    let value = self.x[k] as f64 + self.z[k];
                    if self.y[k] + value * value * self.v[k] <= bound {
                        break;
                    }
                }
                forced = false;
                self.increment[k] = 1;
                k += 1;
                if k > self.degree {
                    self.k = k;
                    self.exhausted = true;
                    return Ok(false);
                }
                self.step(k);
            }
            if k == 1 {
                self.k = k;
                return Ok(true);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagonal_lattice_uses_the_pari_alternating_order() {
        let mut enumeration = EnumerationWorkspace::new(3);
        let q = vec![0.0; 16];
        let mut v = vec![0.0; 4];
        v[1..].fill(1.0);
        // Off-diagonal q is zero, so this enumerates primitive integer lattice
        // candidates in the raw cursor order before the caller filters them.
        enumeration.reset(&q, &v).unwrap();
        let mut seen = Vec::new();
        while seen.len() < 8 && enumeration.next(1.0, false).unwrap() {
            seen.push(enumeration.coordinates()[1..].to_vec());
        }
        assert_eq!(
            seen,
            vec![vec![0, 0, 0], vec![1, 0, 0], vec![0, 1, 0], vec![0, 0, 1],]
        );
        assert!(!enumeration.next(1.0, false).unwrap());
    }

    #[test]
    fn reset_reuses_storage_and_skip_first_omits_the_zero_prefix() {
        let mut enumeration = EnumerationWorkspace::new(2);
        let q = vec![0.0; 9];
        let v = vec![0.0, 1.0, 1.0];
        enumeration.reset(&q, &v).unwrap();
        assert!(enumeration.next(1.0, true).unwrap());
        assert_ne!(&enumeration.coordinates()[1..], &[0, 0]);
    }
}
