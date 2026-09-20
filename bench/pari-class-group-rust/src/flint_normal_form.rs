// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Thin native qualification bridge to the repository's pinned FLINT build.
//!
//! This computes candidate Smith invariants only. It deliberately does not
//! manufacture transformation evidence that the current FLINT call does not
//! return.

use std::ffi::{c_int, c_longlong};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlintNormalFormError {
    InvalidDimensions,
    DimensionMismatch,
    DiagonalOutsideI64,
    ForeignFailure(i32),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintSmithCandidate {
    pub diagonal: Vec<i64>,
    pub invariant_factors: Vec<i64>,
    pub class_number: i64,
    pub rank: usize,
}

unsafe extern "C" {
    fn sagejs_rust_flint_snf_i64(
        rows: usize,
        columns: usize,
        entries: *const c_longlong,
        diagonal: *mut c_longlong,
    ) -> c_int;
}

pub fn flint_smith_candidate(
    entries: &[i64],
    rows: usize,
    columns: usize,
) -> Result<FlintSmithCandidate, FlintNormalFormError> {
    if rows == 0 || columns == 0 {
        return Err(FlintNormalFormError::InvalidDimensions);
    }
    if rows.checked_mul(columns) != Some(entries.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let mut diagonal = vec![0_i64; rows.min(columns)];
    // The bridge validates dimensions before indexing, receives disjoint
    // buffers, and does not retain either pointer.
    let status = unsafe {
        sagejs_rust_flint_snf_i64(
            rows,
            columns,
            entries.as_ptr().cast(),
            diagonal.as_mut_ptr().cast(),
        )
    };
    match status {
        0 => {}
        -1 => return Err(FlintNormalFormError::InvalidDimensions),
        -2 => return Err(FlintNormalFormError::DiagonalOutsideI64),
        code => return Err(FlintNormalFormError::ForeignFailure(code)),
    }
    let rank = diagonal.iter().filter(|value| **value != 0).count();
    let invariant_factors = diagonal
        .iter()
        .copied()
        .filter(|value| value.abs() > 1)
        .collect::<Vec<_>>();
    let class_number = invariant_factors
        .iter()
        .try_fold(1_i64, |product, value| product.checked_mul(value.abs()))
        .ok_or(FlintNormalFormError::DiagonalOutsideI64)?;
    Ok(FlintSmithCandidate {
        diagonal,
        invariant_factors,
        class_number,
        rank,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rectangular_candidate_matches_known_smith_factors() {
        let answer = flint_smith_candidate(&[2, 4, 4, 6, 6, 12], 2, 3).unwrap();
        assert_eq!(answer.diagonal, [2, 6]);
        assert_eq!(answer.invariant_factors, [2, 6]);
        assert_eq!(answer.class_number, 12);
        assert_eq!(answer.rank, 2);
    }
}
