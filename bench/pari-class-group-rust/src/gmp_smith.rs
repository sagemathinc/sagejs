// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Checked arbitrary-precision Smith reduction for relation presentations.
//!
//! This is the retry path for a presentation whose checked `i128` reduction
//! reports arithmetic overflow.  Callers must restart it from the original,
//! unmodified row-major presentation: a partially reduced fixed-width matrix
//! is not a valid checkpoint after an overflowing operation.

use rug::Integer;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GmpSmithError {
    DimensionOverflow { rows: usize, columns: usize },
    DimensionMismatch { expected: usize, actual: usize },
    RankDeficient { rank: usize, expected: usize },
    InvalidExpectedRank { expected: usize, maximum: usize },
    ReductionStalled,
}

/// Exact candidate invariants derived from a relation presentation.
///
/// This type deliberately contains no transformation matrices.  The reducer
/// currently computes only diagonal invariants; claiming generator maps or
/// relation witnesses here would be dishonest.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExactSmithCandidateInvariants {
    pub diagonal: Vec<Integer>,
    pub invariant_factors: Vec<Integer>,
    pub class_number: Integer,
    pub rank: usize,
}

/// Reusable row-major Smith workspace backed by GMP through `rug::Integer`.
pub struct GmpSmithWorkspace {
    rows: usize,
    columns: usize,
    values: Vec<Integer>,
    pub operations: u64,
}

impl GmpSmithWorkspace {
    pub fn new(rows: usize, columns: usize) -> Result<Self, GmpSmithError> {
        let length = rows
            .checked_mul(columns)
            .ok_or(GmpSmithError::DimensionOverflow { rows, columns })?;
        Ok(Self {
            rows,
            columns,
            values: vec![Integer::new(); length],
            operations: 0,
        })
    }

    #[inline]
    fn index(&self, row: usize, column: usize) -> usize {
        row * self.columns + column
    }

    pub fn reset_from_i128(&mut self, source: &[i128]) -> Result<(), GmpSmithError> {
        if self.values.len() != source.len() {
            return Err(GmpSmithError::DimensionMismatch {
                expected: self.values.len(),
                actual: source.len(),
            });
        }
        for (target, value) in self.values.iter_mut().zip(source) {
            *target = Integer::from(*value);
        }
        self.operations = 0;
        Ok(())
    }

    pub fn reset_from_integers(&mut self, source: &[Integer]) -> Result<(), GmpSmithError> {
        if self.values.len() != source.len() {
            return Err(GmpSmithError::DimensionMismatch {
                expected: self.values.len(),
                actual: source.len(),
            });
        }
        for (target, value) in self.values.iter_mut().zip(source) {
            target.clone_from(value);
        }
        self.operations = 0;
        Ok(())
    }

    fn swap_rows(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        for column in 0..self.columns {
            let a = self.index(first, column);
            let b = self.index(second, column);
            self.values.swap(a, b);
        }
        self.operations += 1;
    }

    fn swap_columns(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        for row in 0..self.rows {
            let a = self.index(row, first);
            let b = self.index(row, second);
            self.values.swap(a, b);
        }
        self.operations += 1;
    }

    fn add_row_multiple(&mut self, target: usize, source: usize, multiple: &Integer) {
        if multiple == &0 {
            return;
        }
        for column in 0..self.columns {
            let source_value = self.values[self.index(source, column)].clone();
            let target_index = self.index(target, column);
            self.values[target_index] += Integer::from(multiple * source_value);
        }
        self.operations += 1;
    }

    fn add_column_multiple(&mut self, target: usize, source: usize, multiple: &Integer) {
        if multiple == &0 {
            return;
        }
        for row in 0..self.rows {
            let source_value = self.values[self.index(row, source)].clone();
            let target_index = self.index(row, target);
            self.values[target_index] += Integer::from(multiple * source_value);
        }
        self.operations += 1;
    }

    fn smallest_nonzero(&self, start: usize) -> Option<(usize, usize)> {
        let mut answer: Option<(usize, usize, Integer)> = None;
        for row in start..self.rows {
            for column in start..self.columns {
                let value = &self.values[self.index(row, column)];
                if value == &0 {
                    continue;
                }
                let absolute = value.clone().abs();
                if answer.as_ref().is_none_or(|item| absolute < item.2) {
                    answer = Some((row, column, absolute));
                }
            }
        }
        answer.map(|(row, column, _)| (row, column))
    }

    fn clear_pivot_cross(&mut self, pivot: usize) -> Result<(), GmpSmithError> {
        loop {
            let mut changed = false;
            for row in (pivot + 1)..self.rows {
                while self.values[self.index(row, pivot)] != 0 {
                    let quotient = Integer::from(
                        &self.values[self.index(row, pivot)]
                            / &self.values[self.index(pivot, pivot)],
                    );
                    self.add_row_multiple(row, pivot, &(-quotient));
                    if self.values[self.index(row, pivot)] != 0 {
                        self.swap_rows(row, pivot);
                    }
                    changed = true;
                }
            }
            for column in (pivot + 1)..self.columns {
                while self.values[self.index(pivot, column)] != 0 {
                    let quotient = Integer::from(
                        &self.values[self.index(pivot, column)]
                            / &self.values[self.index(pivot, pivot)],
                    );
                    self.add_column_multiple(column, pivot, &(-quotient));
                    if self.values[self.index(pivot, column)] != 0 {
                        self.swap_columns(column, pivot);
                    }
                    changed = true;
                }
            }
            let column_clear =
                ((pivot + 1)..self.rows).all(|row| self.values[self.index(row, pivot)] == 0);
            let row_clear = ((pivot + 1)..self.columns)
                .all(|column| self.values[self.index(pivot, column)] == 0);
            if column_clear && row_clear {
                return Ok(());
            }
            if !changed {
                return Err(GmpSmithError::ReductionStalled);
            }
        }
    }

    pub fn smith_diagonal(&mut self) -> Result<Vec<Integer>, GmpSmithError> {
        let limit = self.rows.min(self.columns);
        let mut pivot = 0;
        while pivot < limit {
            let Some((row, column)) = self.smallest_nonzero(pivot) else {
                break;
            };
            self.swap_rows(pivot, row);
            self.swap_columns(pivot, column);
            loop {
                self.clear_pivot_cross(pivot)?;
                let divisor = self.values[self.index(pivot, pivot)].clone().abs();
                let mut offending = None;
                'search: for row in (pivot + 1)..self.rows {
                    for column in (pivot + 1)..self.columns {
                        if Integer::from(&self.values[self.index(row, column)] % &divisor) != 0 {
                            offending = Some(row);
                            break 'search;
                        }
                    }
                }
                let Some(row) = offending else {
                    break;
                };
                self.add_row_multiple(pivot, row, &Integer::from(1));
            }
            let diagonal_index = self.index(pivot, pivot);
            if self.values[diagonal_index] < 0 {
                for column in pivot..self.columns {
                    let index = self.index(pivot, column);
                    self.values[index] *= -1;
                }
                self.operations += 1;
            }
            pivot += 1;
        }
        Ok((0..limit)
            .map(|index| self.values[self.index(index, index)].clone())
            .collect())
    }

    pub fn candidate_invariants(
        &mut self,
        expected_rank: usize,
    ) -> Result<ExactSmithCandidateInvariants, GmpSmithError> {
        let maximum_rank = self.rows.min(self.columns);
        if expected_rank > maximum_rank {
            return Err(GmpSmithError::InvalidExpectedRank {
                expected: expected_rank,
                maximum: maximum_rank,
            });
        }
        let diagonal = self.smith_diagonal()?;
        let rank = diagonal.iter().filter(|value| **value != 0).count();
        if rank != expected_rank {
            return Err(GmpSmithError::RankDeficient {
                rank,
                expected: expected_rank,
            });
        }
        let invariant_factors = diagonal
            .iter()
            .filter(|value| *value > &1)
            .cloned()
            .collect::<Vec<_>>();
        let class_number = invariant_factors
            .iter()
            .fold(Integer::from(1), |product, value| product * value);
        Ok(ExactSmithCandidateInvariants {
            diagonal,
            invariant_factors,
            class_number,
            rank,
        })
    }
}

/// Compute exact candidate invariants from an untouched `i128` checkpoint.
pub fn exact_candidate_invariants_from_i128(
    source: &[i128],
    rows: usize,
    columns: usize,
    expected_rank: usize,
) -> Result<ExactSmithCandidateInvariants, GmpSmithError> {
    let mut workspace = GmpSmithWorkspace::new(rows, columns)?;
    workspace.reset_from_i128(source)?;
    workspace.candidate_invariants(expected_rank)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::smith::{SmithError, WordSmithWorkspace};

    #[test]
    fn agrees_with_checked_word_path_on_small_presentations() {
        let cases = [
            (2, 3, vec![2, 4, 4, 6, 6, 12]),
            (2, 2, vec![2, 0, 0, 3]),
            (3, 2, vec![1, 2, 3, 4, 5, 6]),
            (2, 2, vec![0, 0, 0, 0]),
            (3, 3, vec![6, 4, 2, 2, 8, 4, 0, 2, 10]),
        ];
        for (rows, columns, values) in cases {
            let mut words = WordSmithWorkspace::new(rows, columns);
            words.reset_from(&values).unwrap();
            let expected = words.smith_diagonal().unwrap();

            let mut exact = GmpSmithWorkspace::new(rows, columns).unwrap();
            exact.reset_from_i128(&values).unwrap();
            let actual = exact.smith_diagonal().unwrap();
            assert_eq!(
                actual,
                expected.into_iter().map(Integer::from).collect::<Vec<_>>()
            );
        }
    }

    #[test]
    fn retries_from_the_original_checkpoint_after_forced_word_overflow() {
        let source = [i128::MIN];
        let mut words = WordSmithWorkspace::new(1, 1);
        assert_eq!(
            words.reset_from(&source),
            Err(SmithError::ArithmeticOverflow)
        );

        let answer = exact_candidate_invariants_from_i128(&source, 1, 1, 1).unwrap();
        let expected: Integer = Integer::from(1) << 127;
        assert_eq!(answer.diagonal, vec![expected.clone()]);
        assert_eq!(answer.invariant_factors, vec![expected.clone()]);
        assert_eq!(answer.class_number, expected);
        assert_eq!(answer.rank, 1);
    }

    #[test]
    fn reports_dimension_and_rank_failures_without_panicking() {
        assert_eq!(
            GmpSmithWorkspace::new(usize::MAX, 2).err(),
            Some(GmpSmithError::DimensionOverflow {
                rows: usize::MAX,
                columns: 2,
            })
        );
        let mut workspace = GmpSmithWorkspace::new(2, 2).unwrap();
        assert_eq!(
            workspace.reset_from_i128(&[1, 2, 3]),
            Err(GmpSmithError::DimensionMismatch {
                expected: 4,
                actual: 3,
            })
        );
        workspace.reset_from_i128(&[1, 2, 2, 4]).unwrap();
        assert_eq!(
            workspace.candidate_invariants(2),
            Err(GmpSmithError::RankDeficient {
                rank: 1,
                expected: 2,
            })
        );

        let mut short = GmpSmithWorkspace::new(2, 1).unwrap();
        short.reset_from_i128(&[1, 0]).unwrap();
        assert_eq!(
            short.candidate_invariants(2),
            Err(GmpSmithError::InvalidExpectedRank {
                expected: 2,
                maximum: 1,
            })
        );
    }
}
