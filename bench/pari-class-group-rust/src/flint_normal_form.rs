// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Thin native qualification bridge to the repository's pinned FLINT build.
//!
//! This computes candidate Smith invariants only. It deliberately does not
//! manufacture transformation evidence that the current FLINT call does not
//! return.

use crate::ideal_arithmetic::Matrix3;
use std::array::from_fn;
use std::ffi::{CString, c_char, c_int, c_longlong};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlintNormalFormError {
    InvalidDimensions,
    DimensionMismatch,
    DiagonalOutsideI64,
    RankDeficient,
    ForeignFailure(i32),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintSmithCandidate {
    pub diagonal: Vec<i64>,
    pub invariant_factors: Vec<i64>,
    pub class_number: i64,
    pub rank: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlintSmithClassMap {
    pub invariant_factors: Vec<i64>,
    /// Generator-major coordinates, reduced to `[0, invariant_factor)`.
    pub generator_coordinates: Vec<i64>,
    pub generator_count: usize,
}

impl FlintSmithClassMap {
    pub fn coordinates(&self, generator: usize) -> Option<&[i64]> {
        let width = self.invariant_factors.len();
        if generator >= self.generator_count {
            return None;
        }
        Some(&self.generator_coordinates[generator * width..(generator + 1) * width])
    }

    pub fn annihilates(&self, relations: &[i64], rows: usize) -> bool {
        if rows.checked_mul(self.generator_count) != Some(relations.len()) {
            return false;
        }
        for relation in relations.chunks_exact(self.generator_count) {
            for (coordinate, modulus) in self.invariant_factors.iter().copied().enumerate() {
                let residue = relation
                    .iter()
                    .enumerate()
                    .fold(0_i128, |sum, (generator, coefficient)| {
                        sum + i128::from(*coefficient)
                            * i128::from(self.coordinates(generator).unwrap()[coordinate])
                    })
                    .rem_euclid(i128::from(modulus));
                if residue != 0 {
                    return false;
                }
            }
        }
        true
    }
}

unsafe extern "C" {
    fn sagejs_rust_flint_snf_i64(
        rows: usize,
        columns: usize,
        entries: *const c_longlong,
        diagonal: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_hnf_basis_i64(
        rows: usize,
        columns: usize,
        entries: *const c_longlong,
        basis: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_lll_columns_decimal(
        entries: *const *const c_char,
        transform: *mut c_longlong,
    ) -> c_int;
    fn sagejs_rust_flint_snf_class_map_i64(
        size: usize,
        entries: *const c_longlong,
        invariant_factors: *mut c_longlong,
        generator_coordinates: *mut c_longlong,
        invariant_count: *mut usize,
    ) -> c_int;
}

pub fn flint_smith_class_map(
    basis: &[i64],
    size: usize,
) -> Result<FlintSmithClassMap, FlintNormalFormError> {
    if size == 0 || size.checked_mul(size) != Some(basis.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let mut factors = vec![0_i64; size];
    let mut unpacked_coordinates = vec![0_i64; basis.len()];
    let mut invariant_count = 0_usize;
    // Buffers are disjoint and fully sized for the maximum possible number of
    // invariant factors. The bridge writes the actual count before returning.
    let status = unsafe {
        sagejs_rust_flint_snf_class_map_i64(
            size,
            basis.as_ptr().cast(),
            factors.as_mut_ptr().cast(),
            unpacked_coordinates.as_mut_ptr().cast(),
            &mut invariant_count,
        )
    };
    match status {
        0 => {}
        -1 => return Err(FlintNormalFormError::InvalidDimensions),
        -2 => return Err(FlintNormalFormError::DiagonalOutsideI64),
        code => return Err(FlintNormalFormError::ForeignFailure(code)),
    }
    if invariant_count > size {
        return Err(FlintNormalFormError::ForeignFailure(-4));
    }
    factors.truncate(invariant_count);
    let mut generator_coordinates = Vec::with_capacity(size * invariant_count);
    for generator in 0..size {
        generator_coordinates.extend_from_slice(
            &unpacked_coordinates[generator * size..generator * size + invariant_count],
        );
    }
    Ok(FlintSmithClassMap {
        invariant_factors: factors,
        generator_coordinates,
        generator_count: size,
    })
}

pub fn flint_lll_column_transform(input: &Matrix3) -> Result<Matrix3, FlintNormalFormError> {
    let decimal: [CString; 9] = from_fn(|index| {
        let row = index / 3;
        let column = index % 3;
        CString::new(input[(row, column)].to_string()).expect("integer decimal has no NUL")
    });
    let pointers: [*const c_char; 9] = from_fn(|index| decimal[index].as_ptr());
    let mut transform = [0_i64; 9];
    // Every string and both pointer arrays remain alive across the call. The
    // adapter parses by value and retains no Rust-owned pointer.
    let status = unsafe {
        sagejs_rust_flint_lll_columns_decimal(pointers.as_ptr(), transform.as_mut_ptr().cast())
    };
    match status {
        0 => Ok(Matrix3::from_i64_rows(from_fn(|row| {
            from_fn(|column| transform[row * 3 + column])
        }))),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -2 => Err(FlintNormalFormError::DiagonalOutsideI64),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
}

pub fn flint_hnf_basis(
    entries: &[i64],
    rows: usize,
    columns: usize,
) -> Result<Vec<i64>, FlintNormalFormError> {
    if rows < columns || columns == 0 {
        return Err(FlintNormalFormError::InvalidDimensions);
    }
    if rows.checked_mul(columns) != Some(entries.len()) {
        return Err(FlintNormalFormError::DimensionMismatch);
    }
    let basis_length = columns
        .checked_mul(columns)
        .ok_or(FlintNormalFormError::InvalidDimensions)?;
    let mut basis = vec![0_i64; basis_length];
    // The bridge receives disjoint, correctly sized buffers and retains no
    // pointer. FLINT owns and clears all arbitrary-precision temporaries.
    let status = unsafe {
        sagejs_rust_flint_hnf_basis_i64(
            rows,
            columns,
            entries.as_ptr().cast(),
            basis.as_mut_ptr().cast(),
        )
    };
    match status {
        0 => Ok(basis),
        -1 => Err(FlintNormalFormError::InvalidDimensions),
        -2 => Err(FlintNormalFormError::DiagonalOutsideI64),
        -3 => Err(FlintNormalFormError::RankDeficient),
        code => Err(FlintNormalFormError::ForeignFailure(code)),
    }
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
    use crate::ideal_arithmetic::{LllReduction, verify_lll_reduction};

    #[test]
    fn rectangular_candidate_matches_known_smith_factors() {
        let answer = flint_smith_candidate(&[2, 4, 4, 6, 6, 12], 2, 3).unwrap();
        assert_eq!(answer.diagonal, [2, 6]);
        assert_eq!(answer.invariant_factors, [2, 6]);
        assert_eq!(answer.class_number, 12);
        assert_eq!(answer.rank, 2);
    }

    #[test]
    fn hnf_reduces_a_full_rank_rectangular_presentation_to_a_square_basis() {
        let source = [2, 4, 4, 6, 6, 12];
        let basis = flint_hnf_basis(&source, 3, 2).unwrap();
        let direct = flint_smith_candidate(&source, 3, 2).unwrap();
        let reduced = flint_smith_candidate(&basis, 2, 2).unwrap();
        assert_eq!(reduced, direct);
    }

    #[test]
    fn flint_lll_transform_obeys_the_column_basis_contract() {
        let source = Matrix3::from_i64_rows([[105, 821, 404], [37, 11, 91], [8, 23, 2]]);
        let transform = flint_lll_column_transform(&source).unwrap();
        let reduction = LllReduction {
            basis: source.change_basis(&transform),
            transform,
            swaps: 0,
            size_reductions: 0,
        };
        assert!(verify_lll_reduction(&source, &reduction, 99, 100));
    }

    #[test]
    fn compact_smith_map_annihilates_the_source_relations() {
        let source = [2, 0, 1, 2];
        let map = flint_smith_class_map(&source, 2).unwrap();
        assert_eq!(map.invariant_factors, [4]);
        assert!(map.annihilates(&source, 2));
        assert!(map.coordinates(0).unwrap()[0] != 0 || map.coordinates(1).unwrap()[0] != 0);
        assert!(map.coordinates(2).is_none());
    }
}
