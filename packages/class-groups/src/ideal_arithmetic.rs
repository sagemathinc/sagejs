// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.
//
// Exact, allocation-bounded (apart from GMP limbs) degree-three lattice
// arithmetic for the PARI class-group experiment.  PARI stores lattice bases
// as matrix columns.  `Matrix3` stores the same mathematical matrix in a flat
// row-major array; all column operations below therefore act on the second
// index.

use rug::{Complete, Integer};
use std::array::from_fn;

const DIMENSION: usize = 3;
const CELLS: usize = DIMENSION * DIMENSION;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Matrix3 {
    entries: [Integer; CELLS],
}

impl Matrix3 {
    pub fn zero() -> Self {
        Self {
            entries: from_fn(|_| Integer::new()),
        }
    }

    pub fn identity() -> Self {
        let mut answer = Self::zero();
        for index in 0..DIMENSION {
            answer[(index, index)] = Integer::from(1);
        }
        answer
    }

    pub fn from_rows(rows: [[Integer; DIMENSION]; DIMENSION]) -> Self {
        Self {
            entries: from_fn(|index| rows[index / DIMENSION][index % DIMENSION].clone()),
        }
    }

    pub fn from_row_major(entries: [Integer; CELLS]) -> Self {
        Self { entries }
    }

    /// Import a flat PARI-style matrix whose three columns are contiguous.
    pub fn from_column_major(entries: [Integer; CELLS]) -> Self {
        let mut answer = Self::zero();
        for column in 0..DIMENSION {
            for row in 0..DIMENSION {
                answer[(row, column)] = entries[column * DIMENSION + row].clone();
            }
        }
        answer
    }

    pub fn to_row_major(&self) -> [Integer; CELLS] {
        self.entries.clone()
    }

    /// Export three contiguous columns for a PARI/Sage.js owner.
    pub fn to_column_major(&self) -> [Integer; CELLS] {
        from_fn(|index| self[(index % DIMENSION, index / DIMENSION)].clone())
    }

    pub fn from_i64_rows(rows: [[i64; DIMENSION]; DIMENSION]) -> Self {
        Self {
            entries: from_fn(|index| Integer::from(rows[index / DIMENSION][index % DIMENSION])),
        }
    }

    #[inline]
    fn offset(row: usize, column: usize) -> usize {
        assert!(row < DIMENSION && column < DIMENSION);
        row * DIMENSION + column
    }

    pub fn multiply(&self, right: &Self) -> Self {
        let mut answer = Self::zero();
        for row in 0..DIMENSION {
            for column in 0..DIMENSION {
                let mut value = Integer::new();
                for inner in 0..DIMENSION {
                    let mut term = self[(row, inner)].clone();
                    term *= &right[(inner, column)];
                    value += term;
                }
                answer[(row, column)] = value;
            }
        }
        answer
    }

    /// Right-multiply an ideal basis by a unimodular basis change.
    ///
    /// This is the exact `ZM_mul(I, u)` operation at the beginning of PARI's
    /// `Fincke_Pohst_ideal`.  Keeping the name explicit avoids confusing this
    /// with multiplication of two fractional ideals in the number field.
    pub fn change_basis(&self, transform: &Self) -> Self {
        self.multiply(transform)
    }

    /// Ordinary matrix power.  This is useful for composing basis changes;
    /// it is deliberately not named or documented as number-field ideal
    /// multiplication.
    pub fn pow(&self, mut exponent: u32) -> Self {
        let mut base = self.clone();
        let mut answer = Self::identity();
        while exponent != 0 {
            if exponent & 1 != 0 {
                answer = answer.multiply(&base);
            }
            exponent >>= 1;
            if exponent != 0 {
                base = base.multiply(&base);
            }
        }
        answer
    }

    pub fn determinant(&self) -> Integer {
        let mut positive = self[(0, 0)].clone();
        positive *= &self[(1, 1)];
        positive *= &self[(2, 2)];
        let mut term = self[(0, 1)].clone();
        term *= &self[(1, 2)];
        term *= &self[(2, 0)];
        positive += term;
        let mut term = self[(0, 2)].clone();
        term *= &self[(1, 0)];
        term *= &self[(2, 1)];
        positive += term;

        let mut negative = self[(0, 2)].clone();
        negative *= &self[(1, 1)];
        negative *= &self[(2, 0)];
        let mut term = self[(0, 1)].clone();
        term *= &self[(1, 0)];
        term *= &self[(2, 2)];
        negative += term;
        let mut term = self[(0, 0)].clone();
        term *= &self[(1, 2)];
        term *= &self[(2, 1)];
        negative += term;
        positive - negative
    }

    fn subtract_column_multiple(&mut self, target: usize, source: usize, multiple: &Integer) {
        if multiple == &0 {
            return;
        }
        for row in 0..DIMENSION {
            let mut term = self[(row, source)].clone();
            term *= multiple;
            self[(row, target)] -= term;
        }
    }

    fn swap_columns(&mut self, first: usize, second: usize) {
        if first == second {
            return;
        }
        for row in 0..DIMENSION {
            self.entries
                .swap(Self::offset(row, first), Self::offset(row, second));
        }
    }
}

impl std::ops::Index<(usize, usize)> for Matrix3 {
    type Output = Integer;

    fn index(&self, (row, column): (usize, usize)) -> &Self::Output {
        &self.entries[Self::offset(row, column)]
    }
}

impl std::ops::IndexMut<(usize, usize)> for Matrix3 {
    fn index_mut(&mut self, (row, column): (usize, usize)) -> &mut Self::Output {
        let offset = Self::offset(row, column);
        &mut self.entries[offset]
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Fraction {
    numerator: Integer,
    denominator: Integer,
}

impl Fraction {
    fn zero() -> Self {
        Self {
            numerator: Integer::new(),
            denominator: Integer::from(1),
        }
    }

    fn from_integer(value: &Integer) -> Self {
        Self {
            numerator: value.clone(),
            denominator: Integer::from(1),
        }
    }

    fn new(mut numerator: Integer, mut denominator: Integer) -> Self {
        assert!(denominator != 0, "zero exact-rational denominator");
        if denominator < 0 {
            numerator = -numerator;
            denominator = -denominator;
        }
        if numerator == 0 {
            return Self::zero();
        }
        let mut absolute = numerator.clone();
        absolute.abs_mut();
        let divisor = absolute.gcd_ref(&denominator).complete();
        numerator /= &divisor;
        denominator /= divisor;
        Self {
            numerator,
            denominator,
        }
    }

    fn add(&self, right: &Self) -> Self {
        let mut numerator = self.numerator.clone();
        numerator *= &right.denominator;
        let mut term = right.numerator.clone();
        term *= &self.denominator;
        numerator += term;
        let mut denominator = self.denominator.clone();
        denominator *= &right.denominator;
        Self::new(numerator, denominator)
    }

    fn subtract(&self, right: &Self) -> Self {
        let mut negative = right.clone();
        negative.numerator = -negative.numerator;
        self.add(&negative)
    }

    fn multiply(&self, right: &Self) -> Self {
        let mut numerator = self.numerator.clone();
        numerator *= &right.numerator;
        let mut denominator = self.denominator.clone();
        denominator *= &right.denominator;
        Self::new(numerator, denominator)
    }

    fn divide(&self, right: &Self) -> Self {
        assert!(right.numerator != 0, "division by zero exact rational");
        let mut numerator = self.numerator.clone();
        numerator *= &right.denominator;
        let mut denominator = self.denominator.clone();
        denominator *= &right.numerator;
        Self::new(numerator, denominator)
    }

    fn square(&self) -> Self {
        self.multiply(self)
    }

    fn is_zero(&self) -> bool {
        self.numerator == 0
    }

    /// Round to nearest, resolving exact half-integers toward +infinity.
    fn nearest_integer(&self) -> Integer {
        let mut quotient = self.numerator.clone() / &self.denominator;
        let mut product = quotient.clone();
        product *= &self.denominator;
        let mut remainder = self.numerator.clone() - product;
        if remainder < 0 {
            quotient -= 1;
            remainder += &self.denominator;
        }
        remainder *= 2;
        if remainder >= self.denominator {
            quotient += 1;
        }
        quotient
    }

    fn at_most_half_in_absolute_value(&self) -> bool {
        let mut twice = self.numerator.clone();
        twice.abs_mut();
        twice *= 2;
        twice <= self.denominator
    }

    fn greater_or_equal(&self, right: &Self) -> bool {
        let mut left_cross = self.numerator.clone();
        left_cross *= &right.denominator;
        let mut right_cross = right.numerator.clone();
        right_cross *= &self.denominator;
        left_cross >= right_cross
    }
}

#[derive(Clone, Debug)]
struct GramSchmidt {
    mu: [[Fraction; DIMENSION]; DIMENSION],
    squared_norms: [Fraction; DIMENSION],
}

fn exact_gram_schmidt(basis: &Matrix3) -> Result<GramSchmidt, LllError> {
    let mut orthogonal: [[Fraction; DIMENSION]; DIMENSION] =
        from_fn(|_| from_fn(|_| Fraction::zero()));
    let mut mu: [[Fraction; DIMENSION]; DIMENSION] = from_fn(|_| from_fn(|_| Fraction::zero()));
    let mut squared_norms: [Fraction; DIMENSION] = from_fn(|_| Fraction::zero());

    for column in 0..DIMENSION {
        for row in 0..DIMENSION {
            orthogonal[column][row] = Fraction::from_integer(&basis[(row, column)]);
        }
        for previous in 0..column {
            let mut dot = Fraction::zero();
            for row in 0..DIMENSION {
                let product = Fraction::from_integer(&basis[(row, column)])
                    .multiply(&orthogonal[previous][row]);
                dot = dot.add(&product);
            }
            mu[column][previous] = dot.divide(&squared_norms[previous]);
            for row in 0..DIMENSION {
                let projection = mu[column][previous].multiply(&orthogonal[previous][row]);
                orthogonal[column][row] = orthogonal[column][row].subtract(&projection);
            }
        }
        let mut norm = Fraction::zero();
        for coordinate in &orthogonal[column] {
            norm = norm.add(&coordinate.square());
        }
        if norm.is_zero() {
            return Err(LllError::SingularBasis);
        }
        squared_norms[column] = norm;
    }
    Ok(GramSchmidt { mu, squared_norms })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LllError {
    InvalidDelta,
    SingularBasis,
    IterationLimit,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LllReduction {
    pub basis: Matrix3,
    pub transform: Matrix3,
    pub swaps: usize,
    pub size_reductions: usize,
}

/// Exact classical LLL on three integer column vectors.
///
/// The result satisfies `result.basis == input * result.transform`, and the
/// transform is unimodular.  Exact rational Gram--Schmidt makes this a useful
/// correctness oracle and a safe first Rust implementation for H1.  It does
/// not claim instruction-for-instruction identity with PARI's fast/DPE LLL
/// dispatcher; equality of H1's resulting transform remains a separate
/// differential test at the integration boundary.
pub fn lll_reduce_columns(
    input: &Matrix3,
    delta_numerator: u32,
    delta_denominator: u32,
) -> Result<LllReduction, LllError> {
    if delta_denominator == 0
        || u64::from(delta_numerator) * 4 <= u64::from(delta_denominator)
        || delta_numerator > delta_denominator
    {
        return Err(LllError::InvalidDelta);
    }
    let delta = Fraction::new(
        Integer::from(delta_numerator),
        Integer::from(delta_denominator),
    );
    let mut basis = input.clone();
    let mut transform = Matrix3::identity();
    let mut swaps = 0;
    let mut size_reductions = 0;
    let mut column = 1;
    let mut iterations = 0usize;

    while column < DIMENSION {
        iterations += 1;
        if iterations > 100_000 {
            return Err(LllError::IterationLimit);
        }
        let mut gram = exact_gram_schmidt(&basis)?;
        for previous in (0..column).rev() {
            let multiple = gram.mu[column][previous].nearest_integer();
            if multiple != 0 {
                basis.subtract_column_multiple(column, previous, &multiple);
                transform.subtract_column_multiple(column, previous, &multiple);
                size_reductions += 1;
                gram = exact_gram_schmidt(&basis)?;
            }
        }

        let correction = delta.subtract(&gram.mu[column][column - 1].square());
        let right = correction.multiply(&gram.squared_norms[column - 1]);
        if gram.squared_norms[column].greater_or_equal(&right) {
            column += 1;
        } else {
            basis.swap_columns(column, column - 1);
            transform.swap_columns(column, column - 1);
            swaps += 1;
            column = column.saturating_sub(1).max(1);
        }
    }
    Ok(LllReduction {
        basis,
        transform,
        swaps,
        size_reductions,
    })
}

pub fn verify_lll_reduction(
    input: &Matrix3,
    reduction: &LllReduction,
    delta_numerator: u32,
    delta_denominator: u32,
) -> bool {
    if input.multiply(&reduction.transform) != reduction.basis {
        return false;
    }
    let determinant = reduction.transform.determinant();
    if determinant != 1 && determinant != -1 {
        return false;
    }
    if delta_denominator == 0 {
        return false;
    }
    let delta = Fraction::new(
        Integer::from(delta_numerator),
        Integer::from(delta_denominator),
    );
    let Ok(gram) = exact_gram_schmidt(&reduction.basis) else {
        return false;
    };
    for column in 1..DIMENSION {
        for previous in 0..column {
            if !gram.mu[column][previous].at_most_half_in_absolute_value() {
                return false;
            }
        }
        let correction = delta.subtract(&gram.mu[column][column - 1].square());
        let right = correction.multiply(&gram.squared_norms[column - 1]);
        if !gram.squared_norms[column].greater_or_equal(&right) {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use rug::ops::Pow;

    fn absolute(value: Integer) -> Integer {
        if value < 0 { -value } else { value }
    }

    #[test]
    fn exact_matrix_multiply_change_basis_and_power() {
        let matrix = Matrix3::from_i64_rows([[1, 2, 0], [0, 1, 3], [4, 0, 1]]);
        let transform = Matrix3::from_i64_rows([[1, 1, 0], [0, 1, -1], [0, 0, 1]]);
        assert_eq!(matrix.change_basis(&transform), matrix.multiply(&transform));
        assert_eq!(matrix.pow(0), Matrix3::identity());
        assert_eq!(matrix.pow(1), matrix);
        assert_eq!(matrix.pow(5), matrix.pow(2).multiply(&matrix.pow(3)));
        assert_eq!(transform.determinant(), 1);
    }

    #[test]
    fn pari_column_major_round_trip_is_explicit() {
        let column_major: [Integer; CELLS] =
            from_fn(|index| Integer::from(i32::try_from(index + 1).unwrap()));
        let matrix = Matrix3::from_column_major(column_major.clone());
        assert_eq!(
            matrix.to_row_major(),
            from_fn(|index| {
                const ORDER: [i32; CELLS] = [1, 4, 7, 2, 5, 8, 3, 6, 9];
                Integer::from(ORDER[index])
            })
        );
        assert_eq!(matrix.to_column_major(), column_major);
        assert_eq!(Matrix3::from_row_major(matrix.to_row_major()), matrix);
    }

    #[test]
    fn lll_reduction_is_exact_and_unimodular() {
        let input = Matrix3::from_i64_rows([[105, 821, 404], [37, -118, 79], [-19, 222, 511]]);
        let reduction = lll_reduce_columns(&input, 99, 100).unwrap();
        assert!(reduction.swaps > 0 || reduction.size_reductions > 0);
        assert!(verify_lll_reduction(&input, &reduction, 99, 100));
        assert_eq!(
            absolute(reduction.basis.determinant()),
            absolute(input.determinant())
        );
    }

    #[test]
    fn lll_handles_values_far_above_machine_words() {
        let huge = Integer::from(10).pow(70);
        let mut rows: [[Integer; DIMENSION]; DIMENSION] = from_fn(|_| from_fn(|_| Integer::new()));
        rows[0][0] = huge.clone();
        rows[0][1] = huge.clone();
        rows[0][1] += 1;
        rows[0][2] = huge.clone();
        rows[0][2] -= 1;
        rows[1][0] = Integer::from(1);
        rows[1][1] = Integer::from(2);
        rows[1][2] = Integer::from(3);
        rows[2][0] = Integer::from(3);
        rows[2][1] = Integer::from(5);
        rows[2][2] = Integer::from(8);
        let input = Matrix3::from_rows(rows);
        let reduction = lll_reduce_columns(&input, 99, 100).unwrap();
        assert!(verify_lll_reduction(&input, &reduction, 99, 100));
    }

    #[test]
    fn identity_is_already_reduced() {
        let input = Matrix3::identity();
        let reduction = lll_reduce_columns(&input, 99, 100).unwrap();
        assert_eq!(reduction.basis, input);
        assert_eq!(reduction.transform, Matrix3::identity());
        assert_eq!(reduction.swaps, 0);
        assert_eq!(reduction.size_reductions, 0);
    }

    #[test]
    fn singular_and_invalid_delta_fail_closed() {
        let singular = Matrix3::from_i64_rows([[1, 2, 0], [0, 0, 1], [0, 0, 0]]);
        assert_eq!(
            lll_reduce_columns(&singular, 99, 100),
            Err(LllError::SingularBasis)
        );
        assert_eq!(
            lll_reduce_columns(&Matrix3::identity(), 1, 4),
            Err(LllError::InvalidDelta)
        );
    }
}
