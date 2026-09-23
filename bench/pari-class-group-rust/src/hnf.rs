// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact integer normal forms for relation lattices.
//!
//! This module is intentionally self-contained while the Rust class-group
//! qualification experiment is in progress.  It implements row Hermite form
//! and Smith form over `rug::Integer`, retaining the elementary-operation
//! witnesses rather than returning an unauthenticated list of invariants.
//!
//! The conventions are
//!
//! ```text
//! H = U A,       U_inverse U = U U_inverse = I,
//! D = L A R,     L_inverse L = L L_inverse = I,
//!                 R_inverse R = R R_inverse = I.
//! ```
//!
//! Thus `U`, `L`, and `R` are unimodular by construction.  HNF is row-style:
//! zero rows occur last, pivot columns increase, pivots are positive, and an
//! entry above a pivot lies in `[0, pivot)`.  The append API currently performs
//! a bounded full recomputation from the retained exact input.  That is a
//! deliberate correctness fallback, not a claim of an incremental algorithm.

use rug::Integer;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ExactArithmeticError {
    ZeroDivisor,
    NonPositiveHnfPivot,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NormalFormError {
    DimensionOverflow {
        rows: usize,
        columns: usize,
    },
    DimensionMismatch {
        expected: usize,
        actual: usize,
    },
    IncompatibleDimensions {
        left: (usize, usize),
        right: (usize, usize),
    },
    IndexOutOfBounds {
        row: usize,
        column: usize,
        dimensions: (usize, usize),
    },
    CapacityExceeded {
        required: usize,
        limit: usize,
    },
    OperationLimitExceeded {
        limit: u64,
    },
    Arithmetic(ExactArithmeticError),
    WitnessMismatch(&'static str),
    NonCanonical(&'static str),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct NormalFormLimits {
    /// Maximum number of entries in any one working matrix.
    pub max_entries: usize,
    /// Maximum elementary row/column operations in one reduction.
    pub max_operations: u64,
}

impl Default for NormalFormLimits {
    fn default() -> Self {
        Self {
            max_entries: usize::MAX,
            max_operations: u64::MAX,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BigIntMatrix {
    rows: usize,
    columns: usize,
    values: Vec<Integer>,
}

impl BigIntMatrix {
    pub fn try_new(
        rows: usize,
        columns: usize,
        values: Vec<Integer>,
    ) -> Result<Self, NormalFormError> {
        let expected = checked_length(rows, columns)?;
        if values.len() != expected {
            return Err(NormalFormError::DimensionMismatch {
                expected,
                actual: values.len(),
            });
        }
        Ok(Self {
            rows,
            columns,
            values,
        })
    }

    pub fn from_i128(
        rows: usize,
        columns: usize,
        values: &[i128],
    ) -> Result<Self, NormalFormError> {
        Self::try_new(
            rows,
            columns,
            values.iter().copied().map(Integer::from).collect(),
        )
    }

    pub fn zeros(rows: usize, columns: usize) -> Result<Self, NormalFormError> {
        let length = checked_length(rows, columns)?;
        Ok(Self {
            rows,
            columns,
            values: vec![Integer::new(); length],
        })
    }

    pub fn identity(size: usize) -> Result<Self, NormalFormError> {
        let mut result = Self::zeros(size, size)?;
        for index in 0..size {
            result.values[index * size + index] = Integer::from(1);
        }
        Ok(result)
    }

    pub fn rows(&self) -> usize {
        self.rows
    }

    pub fn columns(&self) -> usize {
        self.columns
    }

    pub fn values(&self) -> &[Integer] {
        &self.values
    }

    pub fn get(&self, row: usize, column: usize) -> Result<&Integer, NormalFormError> {
        if row >= self.rows || column >= self.columns {
            return Err(NormalFormError::IndexOutOfBounds {
                row,
                column,
                dimensions: (self.rows, self.columns),
            });
        }
        Ok(&self.values[row * self.columns + column])
    }

    pub fn multiply(&self, other: &Self) -> Result<Self, NormalFormError> {
        if self.columns != other.rows {
            return Err(NormalFormError::IncompatibleDimensions {
                left: (self.rows, self.columns),
                right: (other.rows, other.columns),
            });
        }
        let mut answer = Self::zeros(self.rows, other.columns)?;
        for row in 0..self.rows {
            for inner in 0..self.columns {
                if self.values[row * self.columns + inner] == 0 {
                    continue;
                }
                for column in 0..other.columns {
                    let product = Integer::from(
                        &self.values[row * self.columns + inner]
                            * &other.values[inner * other.columns + column],
                    );
                    answer.values[row * other.columns + column] += product;
                }
            }
        }
        Ok(answer)
    }

    pub fn is_identity(&self) -> bool {
        self.rows == self.columns
            && (0..self.rows).all(|row| {
                (0..self.columns).all(|column| {
                    self.values[row * self.columns + column] == if row == column { 1 } else { 0 }
                })
            })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UpdateStrategy {
    /// The exact original rows are retained and the HNF is recomputed.
    BoundedFullRecomputation,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HnfDecomposition {
    pub hnf: BigIntMatrix,
    pub left_transform: BigIntMatrix,
    pub left_inverse: BigIntMatrix,
    pub pivot_columns: Vec<usize>,
    pub operations: u64,
    pub update_strategy: UpdateStrategy,
}

impl HnfDecomposition {
    pub fn rank(&self) -> usize {
        self.pivot_columns.len()
    }

    pub fn verify(&self, original: &BigIntMatrix) -> Result<(), NormalFormError> {
        if self.left_transform.multiply(original)? != self.hnf {
            return Err(NormalFormError::WitnessMismatch("H != U*A"));
        }
        if !self
            .left_transform
            .multiply(&self.left_inverse)?
            .is_identity()
            || !self
                .left_inverse
                .multiply(&self.left_transform)?
                .is_identity()
        {
            return Err(NormalFormError::WitnessMismatch(
                "U and U_inverse are not mutual inverses",
            ));
        }
        verify_row_hnf(&self.hnf, &self.pivot_columns)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SmithDecomposition {
    pub diagonal: BigIntMatrix,
    pub left_transform: BigIntMatrix,
    pub left_inverse: BigIntMatrix,
    pub right_transform: BigIntMatrix,
    pub right_inverse: BigIntMatrix,
    pub rank: usize,
    pub operations: u64,
}

impl SmithDecomposition {
    pub fn invariant_factors(&self) -> Vec<Integer> {
        (0..self.rank)
            .map(|index| self.diagonal.values[index * self.diagonal.columns + index].clone())
            .collect()
    }

    pub fn verify(&self, original: &BigIntMatrix) -> Result<(), NormalFormError> {
        let transformed = self
            .left_transform
            .multiply(original)?
            .multiply(&self.right_transform)?;
        if transformed != self.diagonal {
            return Err(NormalFormError::WitnessMismatch("D != L*A*R"));
        }
        if !self
            .left_transform
            .multiply(&self.left_inverse)?
            .is_identity()
            || !self
                .left_inverse
                .multiply(&self.left_transform)?
                .is_identity()
        {
            return Err(NormalFormError::WitnessMismatch(
                "L and L_inverse are not mutual inverses",
            ));
        }
        if !self
            .right_transform
            .multiply(&self.right_inverse)?
            .is_identity()
            || !self
                .right_inverse
                .multiply(&self.right_transform)?
                .is_identity()
        {
            return Err(NormalFormError::WitnessMismatch(
                "R and R_inverse are not mutual inverses",
            ));
        }
        verify_smith(&self.diagonal, self.rank)
    }
}

/// Reusable GMP-backed storage for HNF and SNF reductions.
pub struct ExactNormalFormWorkspace {
    limits: NormalFormLimits,
    rows: usize,
    columns: usize,
    work: Vec<Integer>,
    left: Vec<Integer>,
    left_inverse: Vec<Integer>,
    right: Vec<Integer>,
    right_inverse: Vec<Integer>,
    appended_source: Vec<Integer>,
    operations: u64,
}

impl ExactNormalFormWorkspace {
    pub fn new(limits: NormalFormLimits) -> Self {
        Self {
            limits,
            rows: 0,
            columns: 0,
            work: Vec::new(),
            left: Vec::new(),
            left_inverse: Vec::new(),
            right: Vec::new(),
            right_inverse: Vec::new(),
            appended_source: Vec::new(),
            operations: 0,
        }
    }

    pub fn capacities(&self) -> (usize, usize, usize) {
        (
            self.work.capacity(),
            self.left.capacity(),
            self.right.capacity(),
        )
    }

    pub fn row_hnf(&mut self, input: &BigIntMatrix) -> Result<HnfDecomposition, NormalFormError> {
        self.reset(input, false)?;
        let mut pivots = Vec::with_capacity(self.rows.min(self.columns));
        let mut pivot_row = 0;
        for column in 0..self.columns {
            if pivot_row == self.rows {
                break;
            }
            let Some(nonzero) =
                (pivot_row..self.rows).find(|&row| self.work[self.index(row, column)] != 0)
            else {
                continue;
            };
            self.swap_rows(pivot_row, nonzero)?;
            for row in (pivot_row + 1)..self.rows {
                while self.work[self.index(row, column)] != 0 {
                    let pivot = self.work[self.index(pivot_row, column)].clone();
                    let quotient = exact_quotient(&self.work[self.index(row, column)], &pivot)?;
                    self.add_row_multiple(row, pivot_row, &(-quotient))?;
                    if self.work[self.index(row, column)] != 0 {
                        self.swap_rows(row, pivot_row)?;
                    }
                }
            }
            if self.work[self.index(pivot_row, column)] < 0 {
                self.negate_row(pivot_row)?;
            }
            let pivot = self.work[self.index(pivot_row, column)].clone();
            for row in 0..pivot_row {
                let quotient = floor_quotient(&self.work[self.index(row, column)], &pivot)?;
                self.add_row_multiple(row, pivot_row, &(-quotient))?;
            }
            pivots.push(column);
            pivot_row += 1;
        }
        let decomposition = HnfDecomposition {
            hnf: self.work_matrix()?,
            left_transform: square_matrix(self.rows, &self.left)?,
            left_inverse: square_matrix(self.rows, &self.left_inverse)?,
            pivot_columns: pivots,
            operations: self.operations,
            update_strategy: UpdateStrategy::BoundedFullRecomputation,
        };
        decomposition.verify(input)?;
        Ok(decomposition)
    }

    /// Append relation rows and recompute from the exact combined matrix.
    ///
    /// This fallback uses at most `(old_rows + new_rows) * columns` source
    /// entries and is interrupted by `max_operations`; it never silently
    /// truncates a relation or resumes from a partially reduced matrix.
    pub fn append_rows_and_recompute(
        &mut self,
        existing: &BigIntMatrix,
        appended: &BigIntMatrix,
    ) -> Result<HnfDecomposition, NormalFormError> {
        if existing.columns != appended.columns {
            return Err(NormalFormError::IncompatibleDimensions {
                left: (existing.rows, existing.columns),
                right: (appended.rows, appended.columns),
            });
        }
        let rows =
            existing
                .rows
                .checked_add(appended.rows)
                .ok_or(NormalFormError::DimensionOverflow {
                    rows: existing.rows,
                    columns: existing.columns,
                })?;
        let required = checked_length(rows, existing.columns)?;
        self.check_capacity(required)?;
        self.appended_source.clear();
        self.appended_source.extend(existing.values.iter().cloned());
        self.appended_source.extend(appended.values.iter().cloned());
        let combined = BigIntMatrix::try_new(
            rows,
            existing.columns,
            core::mem::take(&mut self.appended_source),
        )?;
        let result = self.row_hnf(&combined);
        self.appended_source = combined.values;
        result
    }

    pub fn smith(&mut self, input: &BigIntMatrix) -> Result<SmithDecomposition, NormalFormError> {
        self.reset(input, true)?;
        let limit = self.rows.min(self.columns);
        let mut pivot_index = 0;
        while pivot_index < limit {
            let Some((row, column)) = self.smallest_nonzero(pivot_index) else {
                break;
            };
            self.swap_rows(pivot_index, row)?;
            self.swap_columns(pivot_index, column)?;
            loop {
                self.clear_pivot_cross(pivot_index)?;
                let divisor = self.work[self.index(pivot_index, pivot_index)]
                    .clone()
                    .abs();
                if divisor == 0 {
                    return Err(NormalFormError::Arithmetic(
                        ExactArithmeticError::ZeroDivisor,
                    ));
                }
                let mut offending_row = None;
                'search: for row in (pivot_index + 1)..self.rows {
                    for column in (pivot_index + 1)..self.columns {
                        if Integer::from(&self.work[self.index(row, column)] % &divisor) != 0 {
                            offending_row = Some(row);
                            break 'search;
                        }
                    }
                }
                let Some(row) = offending_row else {
                    break;
                };
                self.add_row_multiple(pivot_index, row, &Integer::from(1))?;
            }
            if self.work[self.index(pivot_index, pivot_index)] < 0 {
                self.negate_row(pivot_index)?;
            }
            pivot_index += 1;
        }
        let decomposition = SmithDecomposition {
            diagonal: self.work_matrix()?,
            left_transform: square_matrix(self.rows, &self.left)?,
            left_inverse: square_matrix(self.rows, &self.left_inverse)?,
            right_transform: square_matrix(self.columns, &self.right)?,
            right_inverse: square_matrix(self.columns, &self.right_inverse)?,
            rank: pivot_index,
            operations: self.operations,
        };
        decomposition.verify(input)?;
        Ok(decomposition)
    }

    fn reset(&mut self, input: &BigIntMatrix, need_right: bool) -> Result<(), NormalFormError> {
        let work_length = checked_length(input.rows, input.columns)?;
        let left_length = checked_length(input.rows, input.rows)?;
        self.check_capacity(work_length)?;
        self.check_capacity(left_length)?;
        if need_right {
            self.check_capacity(checked_length(input.columns, input.columns)?)?;
        }
        self.rows = input.rows;
        self.columns = input.columns;
        clone_into_reused(&mut self.work, &input.values);
        reset_identity(&mut self.left, self.rows);
        reset_identity(&mut self.left_inverse, self.rows);
        if need_right {
            reset_identity(&mut self.right, self.columns);
            reset_identity(&mut self.right_inverse, self.columns);
        } else {
            self.right.clear();
            self.right_inverse.clear();
        }
        self.operations = 0;
        Ok(())
    }

    fn check_capacity(&self, required: usize) -> Result<(), NormalFormError> {
        if required > self.limits.max_entries {
            Err(NormalFormError::CapacityExceeded {
                required,
                limit: self.limits.max_entries,
            })
        } else {
            Ok(())
        }
    }

    fn bump(&mut self) -> Result<(), NormalFormError> {
        if self.operations >= self.limits.max_operations {
            return Err(NormalFormError::OperationLimitExceeded {
                limit: self.limits.max_operations,
            });
        }
        self.operations += 1;
        Ok(())
    }

    #[inline]
    fn index(&self, row: usize, column: usize) -> usize {
        row * self.columns + column
    }

    fn work_matrix(&self) -> Result<BigIntMatrix, NormalFormError> {
        BigIntMatrix::try_new(self.rows, self.columns, self.work.clone())
    }

    fn swap_rows(&mut self, first: usize, second: usize) -> Result<(), NormalFormError> {
        if first == second {
            return Ok(());
        }
        self.bump()?;
        swap_rows(&mut self.work, self.columns, first, second);
        swap_rows(&mut self.left, self.rows, first, second);
        swap_columns(&mut self.left_inverse, self.rows, first, second);
        Ok(())
    }

    fn add_row_multiple(
        &mut self,
        target: usize,
        source: usize,
        multiple: &Integer,
    ) -> Result<(), NormalFormError> {
        if multiple == &0 {
            return Ok(());
        }
        self.bump()?;
        add_row_multiple(&mut self.work, self.columns, target, source, multiple);
        add_row_multiple(&mut self.left, self.rows, target, source, multiple);
        add_column_multiple(
            &mut self.left_inverse,
            self.rows,
            source,
            target,
            &(-multiple.clone()),
        );
        Ok(())
    }

    fn negate_row(&mut self, row: usize) -> Result<(), NormalFormError> {
        self.bump()?;
        negate_row(&mut self.work, self.columns, row);
        negate_row(&mut self.left, self.rows, row);
        negate_column(&mut self.left_inverse, self.rows, row);
        Ok(())
    }

    fn swap_columns(&mut self, first: usize, second: usize) -> Result<(), NormalFormError> {
        if first == second {
            return Ok(());
        }
        self.bump()?;
        swap_columns(&mut self.work, self.columns, first, second);
        swap_columns(&mut self.right, self.columns, first, second);
        swap_rows(&mut self.right_inverse, self.columns, first, second);
        Ok(())
    }

    fn add_column_multiple(
        &mut self,
        target: usize,
        source: usize,
        multiple: &Integer,
    ) -> Result<(), NormalFormError> {
        if multiple == &0 {
            return Ok(());
        }
        self.bump()?;
        add_column_multiple(&mut self.work, self.columns, target, source, multiple);
        add_column_multiple(&mut self.right, self.columns, target, source, multiple);
        add_row_multiple(
            &mut self.right_inverse,
            self.columns,
            source,
            target,
            &(-multiple.clone()),
        );
        Ok(())
    }

    fn smallest_nonzero(&self, start: usize) -> Option<(usize, usize)> {
        let mut answer: Option<(usize, usize, Integer)> = None;
        for row in start..self.rows {
            for column in start..self.columns {
                let value = &self.work[self.index(row, column)];
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

    fn clear_pivot_cross(&mut self, pivot: usize) -> Result<(), NormalFormError> {
        loop {
            for row in (pivot + 1)..self.rows {
                while self.work[self.index(row, pivot)] != 0 {
                    let quotient = exact_quotient(
                        &self.work[self.index(row, pivot)],
                        &self.work[self.index(pivot, pivot)],
                    )?;
                    self.add_row_multiple(row, pivot, &(-quotient))?;
                    if self.work[self.index(row, pivot)] != 0 {
                        self.swap_rows(row, pivot)?;
                    }
                }
            }
            for column in (pivot + 1)..self.columns {
                while self.work[self.index(pivot, column)] != 0 {
                    let quotient = exact_quotient(
                        &self.work[self.index(pivot, column)],
                        &self.work[self.index(pivot, pivot)],
                    )?;
                    self.add_column_multiple(column, pivot, &(-quotient))?;
                    if self.work[self.index(pivot, column)] != 0 {
                        self.swap_columns(column, pivot)?;
                    }
                }
            }
            let column_clear =
                ((pivot + 1)..self.rows).all(|row| self.work[self.index(row, pivot)] == 0);
            let row_clear =
                ((pivot + 1)..self.columns).all(|column| self.work[self.index(pivot, column)] == 0);
            if column_clear && row_clear {
                return Ok(());
            }
        }
    }
}

fn checked_length(rows: usize, columns: usize) -> Result<usize, NormalFormError> {
    rows.checked_mul(columns)
        .ok_or(NormalFormError::DimensionOverflow { rows, columns })
}

fn clone_into_reused(target: &mut Vec<Integer>, source: &[Integer]) {
    target.clear();
    target.extend(source.iter().cloned());
}

fn reset_identity(target: &mut Vec<Integer>, size: usize) {
    target.clear();
    target.resize(size * size, Integer::new());
    for index in 0..size {
        target[index * size + index] = Integer::from(1);
    }
}

fn square_matrix(size: usize, source: &[Integer]) -> Result<BigIntMatrix, NormalFormError> {
    BigIntMatrix::try_new(size, size, source.to_vec())
}

fn exact_quotient(numerator: &Integer, denominator: &Integer) -> Result<Integer, NormalFormError> {
    if denominator == &0 {
        return Err(NormalFormError::Arithmetic(
            ExactArithmeticError::ZeroDivisor,
        ));
    }
    Ok(Integer::from(numerator / denominator))
}

fn floor_quotient(
    numerator: &Integer,
    positive_denominator: &Integer,
) -> Result<Integer, NormalFormError> {
    if positive_denominator <= &0 {
        return Err(NormalFormError::Arithmetic(
            ExactArithmeticError::NonPositiveHnfPivot,
        ));
    }
    let mut quotient = exact_quotient(numerator, positive_denominator)?;
    let remainder = Integer::from(numerator - Integer::from(&quotient * positive_denominator));
    if remainder < 0 {
        quotient -= 1;
    }
    Ok(quotient)
}

fn swap_rows(values: &mut [Integer], columns: usize, first: usize, second: usize) {
    for column in 0..columns {
        values.swap(first * columns + column, second * columns + column);
    }
}

fn swap_columns(values: &mut [Integer], columns: usize, first: usize, second: usize) {
    let rows = if columns == 0 {
        0
    } else {
        values.len() / columns
    };
    for row in 0..rows {
        values.swap(row * columns + first, row * columns + second);
    }
}

fn add_row_multiple(
    values: &mut [Integer],
    columns: usize,
    target: usize,
    source: usize,
    multiple: &Integer,
) {
    for column in 0..columns {
        let source_value = values[source * columns + column].clone();
        values[target * columns + column] += Integer::from(source_value * multiple);
    }
}

fn add_column_multiple(
    values: &mut [Integer],
    columns: usize,
    target: usize,
    source: usize,
    multiple: &Integer,
) {
    if columns == 0 {
        return;
    }
    for row in 0..(values.len() / columns) {
        let source_value = values[row * columns + source].clone();
        values[row * columns + target] += Integer::from(source_value * multiple);
    }
}

fn negate_row(values: &mut [Integer], columns: usize, row: usize) {
    for column in 0..columns {
        values[row * columns + column] *= -1;
    }
}

fn negate_column(values: &mut [Integer], columns: usize, column: usize) {
    if columns == 0 {
        return;
    }
    for row in 0..(values.len() / columns) {
        values[row * columns + column] *= -1;
    }
}

fn verify_row_hnf(matrix: &BigIntMatrix, pivot_columns: &[usize]) -> Result<(), NormalFormError> {
    if pivot_columns.len() > matrix.rows {
        return Err(NormalFormError::NonCanonical("too many HNF pivots"));
    }
    let mut previous = None;
    for (row, &pivot_column) in pivot_columns.iter().enumerate() {
        if pivot_column >= matrix.columns || previous.is_some_and(|column| pivot_column <= column) {
            return Err(NormalFormError::NonCanonical(
                "HNF pivot columns are not strictly increasing",
            ));
        }
        let pivot = &matrix.values[row * matrix.columns + pivot_column];
        if pivot <= &0 {
            return Err(NormalFormError::NonCanonical("HNF pivot is not positive"));
        }
        for column in 0..pivot_column {
            if matrix.values[row * matrix.columns + column] != 0 {
                return Err(NormalFormError::NonCanonical(
                    "entry left of an HNF pivot is nonzero",
                ));
            }
        }
        for below in (row + 1)..matrix.rows {
            if matrix.values[below * matrix.columns + pivot_column] != 0 {
                return Err(NormalFormError::NonCanonical(
                    "entry below an HNF pivot is nonzero",
                ));
            }
        }
        for above in 0..row {
            let value = &matrix.values[above * matrix.columns + pivot_column];
            if value < &0 || value >= pivot {
                return Err(NormalFormError::NonCanonical(
                    "entry above an HNF pivot is outside [0,pivot)",
                ));
            }
        }
        previous = Some(pivot_column);
    }
    for row in pivot_columns.len()..matrix.rows {
        if (0..matrix.columns).any(|column| matrix.values[row * matrix.columns + column] != 0) {
            return Err(NormalFormError::NonCanonical(
                "nonzero row follows HNF rank",
            ));
        }
    }
    Ok(())
}

fn verify_smith(matrix: &BigIntMatrix, rank: usize) -> Result<(), NormalFormError> {
    if rank > matrix.rows.min(matrix.columns) {
        return Err(NormalFormError::NonCanonical(
            "Smith rank exceeds dimensions",
        ));
    }
    for row in 0..matrix.rows {
        for column in 0..matrix.columns {
            if row != column && matrix.values[row * matrix.columns + column] != 0 {
                return Err(NormalFormError::NonCanonical("Smith form is not diagonal"));
            }
        }
    }
    for index in 0..rank {
        let value = &matrix.values[index * matrix.columns + index];
        if value <= &0 {
            return Err(NormalFormError::NonCanonical(
                "Smith nonzero invariant is not positive",
            ));
        }
        if index > 0 {
            let previous = &matrix.values[(index - 1) * matrix.columns + index - 1];
            if Integer::from(value % previous) != 0 {
                return Err(NormalFormError::NonCanonical(
                    "Smith invariant factors do not divide",
                ));
            }
        }
    }
    for index in rank..matrix.rows.min(matrix.columns) {
        if matrix.values[index * matrix.columns + index] != 0 {
            return Err(NormalFormError::NonCanonical(
                "nonzero Smith diagonal follows rank",
            ));
        }
    }
    Ok(())
}
