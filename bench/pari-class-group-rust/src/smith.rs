// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Checked fixed-width Smith reduction used by the experimental class-group core.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SmithError {
    DimensionMismatch { expected: usize, actual: usize },
    ArithmeticOverflow,
    ReductionStalled,
}

/// Reusable workspace for a row-major, checked-`i128` Smith reduction.
pub struct WordSmithWorkspace {
    rows: usize,
    columns: usize,
    values: Vec<i128>,
    pub operations: u64,
    pub maximum_absolute_value: i128,
}

impl WordSmithWorkspace {
    pub fn new(rows: usize, columns: usize) -> Self {
        Self {
            rows,
            columns,
            values: vec![0; rows * columns],
            operations: 0,
            maximum_absolute_value: 0,
        }
    }

    #[inline]
    fn index(&self, row: usize, column: usize) -> usize {
        row * self.columns + column
    }

    pub fn reset_from(&mut self, source: &[i128]) -> Result<(), SmithError> {
        if self.values.len() != source.len() {
            return Err(SmithError::DimensionMismatch {
                expected: self.values.len(),
                actual: source.len(),
            });
        }
        self.values.copy_from_slice(source);
        self.operations = 0;
        self.maximum_absolute_value = source
            .iter()
            .map(|value| value.checked_abs().ok_or(SmithError::ArithmeticOverflow))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .max()
            .unwrap_or(0);
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

    fn checked_add_multiple(value: i128, source: i128, multiple: i128) -> Result<i128, SmithError> {
        value
            .checked_add(
                source
                    .checked_mul(multiple)
                    .ok_or(SmithError::ArithmeticOverflow)?,
            )
            .ok_or(SmithError::ArithmeticOverflow)
    }

    fn add_row_multiple(
        &mut self,
        target: usize,
        source: usize,
        multiple: i128,
    ) -> Result<(), SmithError> {
        if multiple == 0 {
            return Ok(());
        }
        for column in 0..self.columns {
            let source_value = self.values[self.index(source, column)];
            let target_index = self.index(target, column);
            let answer =
                Self::checked_add_multiple(self.values[target_index], source_value, multiple)?;
            self.values[target_index] = answer;
            self.maximum_absolute_value = self
                .maximum_absolute_value
                .max(answer.checked_abs().ok_or(SmithError::ArithmeticOverflow)?);
        }
        self.operations += 1;
        Ok(())
    }

    fn add_column_multiple(
        &mut self,
        target: usize,
        source: usize,
        multiple: i128,
    ) -> Result<(), SmithError> {
        if multiple == 0 {
            return Ok(());
        }
        for row in 0..self.rows {
            let source_value = self.values[self.index(row, source)];
            let target_index = self.index(row, target);
            let answer =
                Self::checked_add_multiple(self.values[target_index], source_value, multiple)?;
            self.values[target_index] = answer;
            self.maximum_absolute_value = self
                .maximum_absolute_value
                .max(answer.checked_abs().ok_or(SmithError::ArithmeticOverflow)?);
        }
        self.operations += 1;
        Ok(())
    }

    fn smallest_nonzero(&self, start: usize) -> Result<Option<(usize, usize)>, SmithError> {
        let mut answer: Option<(usize, usize, i128)> = None;
        for row in start..self.rows {
            for column in start..self.columns {
                let value = self.values[self.index(row, column)];
                if value == 0 {
                    continue;
                }
                let absolute = value.checked_abs().ok_or(SmithError::ArithmeticOverflow)?;
                if answer.is_none_or(|item| absolute < item.2) {
                    answer = Some((row, column, absolute));
                }
            }
        }
        Ok(answer.map(|(row, column, _)| (row, column)))
    }

    fn clear_pivot_cross(&mut self, pivot: usize) -> Result<(), SmithError> {
        loop {
            let mut changed = false;
            for row in (pivot + 1)..self.rows {
                while self.values[self.index(row, pivot)] != 0 {
                    let quotient =
                        self.values[self.index(row, pivot)] / self.values[self.index(pivot, pivot)];
                    let multiple = quotient
                        .checked_neg()
                        .ok_or(SmithError::ArithmeticOverflow)?;
                    self.add_row_multiple(row, pivot, multiple)?;
                    if self.values[self.index(row, pivot)] != 0 {
                        self.swap_rows(row, pivot);
                    }
                    changed = true;
                }
            }
            for column in (pivot + 1)..self.columns {
                while self.values[self.index(pivot, column)] != 0 {
                    let quotient = self.values[self.index(pivot, column)]
                        / self.values[self.index(pivot, pivot)];
                    let multiple = quotient
                        .checked_neg()
                        .ok_or(SmithError::ArithmeticOverflow)?;
                    self.add_column_multiple(column, pivot, multiple)?;
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
                return Err(SmithError::ReductionStalled);
            }
        }
    }

    pub fn smith_diagonal(&mut self) -> Result<Vec<i128>, SmithError> {
        let limit = self.rows.min(self.columns);
        let mut pivot = 0;
        while pivot < limit {
            let Some((row, column)) = self.smallest_nonzero(pivot)? else {
                break;
            };
            self.swap_rows(pivot, row);
            self.swap_columns(pivot, column);
            loop {
                self.clear_pivot_cross(pivot)?;
                let divisor = self.values[self.index(pivot, pivot)]
                    .checked_abs()
                    .ok_or(SmithError::ArithmeticOverflow)?;
                let mut offending = None;
                'search: for row in (pivot + 1)..self.rows {
                    for column in (pivot + 1)..self.columns {
                        if self.values[self.index(row, column)] % divisor != 0 {
                            offending = Some(row);
                            break 'search;
                        }
                    }
                }
                let Some(row) = offending else {
                    break;
                };
                self.add_row_multiple(pivot, row, 1)?;
            }
            let diagonal_index = self.index(pivot, pivot);
            if self.values[diagonal_index] < 0 {
                for column in pivot..self.columns {
                    let index = self.index(pivot, column);
                    self.values[index] = self.values[index]
                        .checked_neg()
                        .ok_or(SmithError::ArithmeticOverflow)?;
                }
                self.operations += 1;
            }
            pivot += 1;
        }
        Ok((0..limit)
            .map(|index| self.values[self.index(index, index)])
            .collect())
    }
}

/// Convert relation vectors into the row-major presentation expected by Smith.
pub fn transpose_relation_records(records: &[i64], rows: usize, columns: usize) -> Vec<i128> {
    assert_eq!(records.len(), rows * columns);
    let mut presentation = vec![0_i128; rows * columns];
    for column in 0..columns {
        for row in 0..rows {
            presentation[row * columns + column] = i128::from(records[column * rows + row]);
        }
    }
    presentation
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smith_handles_rectangular_and_nontorsion_cases() {
        let cases = [
            (2, 3, vec![2, 4, 4, 6, 6, 12], vec![2, 6]),
            (2, 2, vec![2, 0, 0, 3], vec![1, 6]),
            (3, 2, vec![1, 2, 3, 4, 5, 6], vec![1, 2]),
            (2, 2, vec![0, 0, 0, 0], vec![0, 0]),
        ];
        for (rows, columns, values, expected) in cases {
            let mut workspace = WordSmithWorkspace::new(rows, columns);
            workspace.reset_from(&values).unwrap();
            assert_eq!(workspace.smith_diagonal().unwrap(), expected);
        }
    }

    #[test]
    fn checked_word_path_reports_overflow_and_bad_dimensions() {
        let mut workspace = WordSmithWorkspace::new(1, 1);
        assert_eq!(
            workspace.reset_from(&[]),
            Err(SmithError::DimensionMismatch {
                expected: 1,
                actual: 0
            })
        );
        assert_eq!(
            workspace.reset_from(&[i128::MIN]),
            Err(SmithError::ArithmeticOverflow)
        );
        assert_eq!(
            WordSmithWorkspace::checked_add_multiple(i128::MAX, 1, 1),
            Err(SmithError::ArithmeticOverflow)
        );
        assert_eq!(
            WordSmithWorkspace::checked_add_multiple(0, i128::MAX, 2),
            Err(SmithError::ArithmeticOverflow)
        );
    }
}
