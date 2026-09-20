// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Neutral, exact input for a prepared cubic number field.
//!
//! This module deliberately contains field data, not class-group answers.  A
//! [`ValidatedPreparedCubic`] can only be obtained after replaying the exact
//! relationships between its polynomial, rational integral basis,
//! multiplication table, discriminant, signature, and equation-order index.

use rug::{Integer, ops::Pow};

const DEGREE: usize = 3;

/// Exact numerical state carried across the preparation/analytic boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EmbeddingPrecisionState {
    /// Embeddings have not yet been computed at the requested precision.
    Pending { target_bits: u32 },
    /// Embeddings were computed and certified to the stated precision.
    Certified {
        target_bits: u32,
        working_bits: u32,
        certified_bits: u32,
    },
}

impl EmbeddingPrecisionState {
    fn validate(&self) -> Result<(), PreparedCubicValidationError> {
        let (target, working, certified) = match *self {
            Self::Pending { target_bits } => (target_bits, None, None),
            Self::Certified {
                target_bits,
                working_bits,
                certified_bits,
            } => (target_bits, Some(working_bits), Some(certified_bits)),
        };
        if target == 0 {
            return Err(PreparedCubicValidationError::ZeroEmbeddingPrecision);
        }
        if let (Some(working), Some(certified)) = (working, certified)
            && (working < target || certified < target || certified > working)
        {
            return Err(PreparedCubicValidationError::InvalidCertifiedPrecision {
                target_bits: target,
                working_bits: working,
                certified_bits: certified,
            });
        }
        Ok(())
    }
}

/// Untrusted, answer-free prepared-field data.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedCubicData {
    /// Defining polynomial in ascending order; the final coefficient must be 1.
    pub polynomial_ascending: [Integer; 4],
    /// Small rational prime at which the cubic has no root, proving
    /// irreducibility over the rationals.
    pub irreducibility_prime: u32,
    /// Row-major power-basis numerators for `b_i = row_i / basis_denominator`.
    pub integral_basis_numerators: [Integer; 9],
    /// Positive common denominator of the integral basis.
    pub basis_denominator: Integer,
    /// `b_i*b_j = sum_k table[9*i + 3*j + k]*b_k`.
    pub multiplication_table: [Integer; 27],
    /// Discriminant of the represented integral order.
    pub discriminant: Integer,
    /// `(r1, r2)` with `r1 + 2*r2 = 3`.
    pub signature: (u8, u8),
    /// Precision state only; approximate embeddings are never trusted here.
    pub embedding_precision: EmbeddingPrecisionState,
    /// All distinct rational prime divisors of the equation-order index.
    pub index_primes: Vec<Integer>,
}

/// An exact prepared cubic whose internal consistency has been replayed.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatedPreparedCubic {
    data: PreparedCubicData,
    equation_order_index: Integer,
}

impl ValidatedPreparedCubic {
    pub fn validate(data: PreparedCubicData) -> Result<Self, PreparedCubicValidationError> {
        validate_polynomial(&data.polynomial_ascending)?;
        validate_irreducibility_certificate(&data.polynomial_ascending, data.irreducibility_prime)?;
        data.embedding_precision.validate()?;
        validate_signature(data.signature, &data.discriminant)?;
        let equation_order_index = validate_basis_and_discriminant(&data)?;
        validate_index_primes(&data.index_primes, &equation_order_index)?;
        validate_multiplication_table(&data)?;
        Ok(Self {
            data,
            equation_order_index,
        })
    }

    pub fn data(&self) -> &PreparedCubicData {
        &self.data
    }

    pub fn equation_order_index(&self) -> &Integer {
        &self.equation_order_index
    }

    pub fn into_data(self) -> PreparedCubicData {
        self.data
    }

    /// Multiply two integral-coordinate elements in the validated basis.
    ///
    /// This is deliberately driven by the replayed multiplication table, so
    /// rational power-basis denominators never enter the hot arithmetic.
    pub fn multiply_coordinates(
        &self,
        left: &[Integer; DEGREE],
        right: &[Integer; DEGREE],
    ) -> [Integer; DEGREE] {
        let mut product: [Integer; DEGREE] = std::array::from_fn(|_| Integer::new());
        for (left_index, left_coefficient) in left.iter().enumerate() {
            if left_coefficient == &0 {
                continue;
            }
            for (right_index, right_coefficient) in right.iter().enumerate() {
                if right_coefficient == &0 {
                    continue;
                }
                let scalar = left_coefficient.clone() * right_coefficient;
                let offset = 9 * left_index + 3 * right_index;
                for (coordinate, value) in product.iter_mut().enumerate() {
                    *value += scalar.clone() * &self.data.multiplication_table[offset + coordinate];
                }
            }
        }
        product
    }

    /// Exact field norm of an element expressed in the validated integral
    /// basis.  The determinant is arbitrary precision and therefore also
    /// serves as the promotion path for bounded collectors.
    pub fn norm(&self, coordinates: &[Integer; DEGREE]) -> Integer {
        let mut multiplication: [Integer; 9] = std::array::from_fn(|_| Integer::new());
        for column in 0..DEGREE {
            for (basis_index, coefficient) in coordinates.iter().enumerate() {
                if coefficient == &0 {
                    continue;
                }
                let offset = 9 * basis_index + 3 * column;
                for row in 0..DEGREE {
                    multiplication[3 * row + column] +=
                        coefficient.clone() * &self.data.multiplication_table[offset + row];
                }
            }
        }
        determinant_3x3(&multiplication)
    }

    /// Express an equation-order power-basis element in the validated
    /// integral basis.  Validation has already proved that the equation order
    /// is contained in this order, so each Cramer quotient is exact.
    pub fn power_basis_coordinates(&self, coefficients: &[Integer; DEGREE]) -> [Integer; DEGREE] {
        let basis_rows: [[Integer; DEGREE]; DEGREE] = std::array::from_fn(|row| {
            std::array::from_fn(|column| {
                self.data.integral_basis_numerators[DEGREE * row + column].clone()
            })
        });
        let determinant = determinant_rows(&basis_rows);
        let target: [Integer; DEGREE] = std::array::from_fn(|coordinate| {
            coefficients[coordinate].clone() * &self.data.basis_denominator
        });
        std::array::from_fn(|row| {
            let mut numerator = basis_rows.clone();
            numerator[row] = target.clone();
            let numerator = determinant_rows(&numerator);
            debug_assert_eq!(numerator.clone() % &determinant, 0);
            numerator / &determinant
        })
    }
}

impl TryFrom<PreparedCubicData> for ValidatedPreparedCubic {
    type Error = PreparedCubicValidationError;

    fn try_from(value: PreparedCubicData) -> Result<Self, Self::Error> {
        Self::validate(value)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreparedCubicValidationError {
    NonMonicPolynomial,
    InseparablePolynomial,
    InvalidIrreducibilityPrime {
        value: u32,
    },
    IrreducibilityPrimeTooLarge {
        value: u32,
        maximum: u32,
    },
    PolynomialHasRootModuloWitness {
        prime: u32,
        root: u32,
    },
    NonPositiveBasisDenominator,
    SingularBasis,
    BasisDoesNotContainEquationOrder,
    NonIntegralEquationOrderIndex,
    DiscriminantNotDivisibleByIndexSquare,
    DiscriminantMismatch {
        expected: Integer,
        supplied: Integer,
    },
    InvalidSignature {
        real_places: u8,
        complex_pairs: u8,
    },
    SignatureDiscriminantMismatch,
    ZeroEmbeddingPrecision,
    InvalidCertifiedPrecision {
        target_bits: u32,
        working_bits: u32,
        certified_bits: u32,
    },
    IndexPrimesNotStrictlyIncreasing,
    IndexPrimeTooLargeForExactValidation {
        value: Integer,
    },
    CompositeIndexPrime {
        value: Integer,
    },
    IndexPrimeDoesNotDivideIndex {
        value: Integer,
    },
    MissingIndexPrimeFactor {
        remaining: Integer,
    },
    MultiplicationTableMismatch {
        left: usize,
        right: usize,
    },
}

fn validate_polynomial(polynomial: &[Integer; 4]) -> Result<(), PreparedCubicValidationError> {
    if polynomial[3] != 1 {
        return Err(PreparedCubicValidationError::NonMonicPolynomial);
    }
    if polynomial_discriminant(polynomial) == 0 {
        return Err(PreparedCubicValidationError::InseparablePolynomial);
    }
    Ok(())
}

const MAXIMUM_IRREDUCIBILITY_PRIME: u32 = 1_000_003;

fn is_prime_u32(value: u32) -> bool {
    if value < 2 {
        return false;
    }
    if value % 2 == 0 {
        return value == 2;
    }
    let mut divisor = 3_u32;
    while divisor <= value / divisor {
        if value % divisor == 0 {
            return false;
        }
        divisor += 2;
    }
    true
}

fn validate_irreducibility_certificate(
    polynomial: &[Integer; 4],
    prime: u32,
) -> Result<(), PreparedCubicValidationError> {
    if prime > MAXIMUM_IRREDUCIBILITY_PRIME {
        return Err(PreparedCubicValidationError::IrreducibilityPrimeTooLarge {
            value: prime,
            maximum: MAXIMUM_IRREDUCIBILITY_PRIME,
        });
    }
    if !is_prime_u32(prime) {
        return Err(PreparedCubicValidationError::InvalidIrreducibilityPrime { value: prime });
    }
    let residues: [u32; 4] = std::array::from_fn(|index| {
        let mut residue = polynomial[index].clone() % prime;
        if residue < 0 {
            residue += prime;
        }
        residue.to_u32_wrapping()
    });
    for root in 0..prime {
        let mut value = 0_u64;
        for coefficient in residues.iter().rev() {
            value = (value * u64::from(root) + u64::from(*coefficient)) % u64::from(prime);
        }
        if value == 0 {
            return Err(
                PreparedCubicValidationError::PolynomialHasRootModuloWitness { prime, root },
            );
        }
    }
    Ok(())
}

fn polynomial_discriminant(c: &[Integer; 4]) -> Integer {
    // x^3 + b*x^2 + c*x + d.
    let (d, linear, quadratic) = (&c[0], &c[1], &c[2]);
    let mut answer = quadratic.clone().square() * linear.clone().square();
    answer -= 4 * linear.clone().pow(3);
    answer -= 4 * quadratic.clone().pow(3) * d;
    answer -= 27 * d.clone().square();
    answer += (quadratic.clone() * linear * d) * 18;
    answer
}

fn validate_signature(
    signature: (u8, u8),
    discriminant: &Integer,
) -> Result<(), PreparedCubicValidationError> {
    if signature.0 as usize + 2 * signature.1 as usize != DEGREE {
        return Err(PreparedCubicValidationError::InvalidSignature {
            real_places: signature.0,
            complex_pairs: signature.1,
        });
    }
    let expected = if discriminant > &0 { (3, 0) } else { (1, 1) };
    if signature != expected {
        return Err(PreparedCubicValidationError::SignatureDiscriminantMismatch);
    }
    Ok(())
}

fn determinant_3x3(m: &[Integer; 9]) -> Integer {
    let minor0 = m[4].clone() * &m[8] - m[5].clone() * &m[7];
    let minor1 = m[3].clone() * &m[8] - m[5].clone() * &m[6];
    let minor2 = m[3].clone() * &m[7] - m[4].clone() * &m[6];
    m[0].clone() * minor0 - m[1].clone() * minor1 + m[2].clone() * minor2
}

fn determinant_rows(matrix: &[[Integer; DEGREE]; DEGREE]) -> Integer {
    let flat: [Integer; 9] =
        std::array::from_fn(|index| matrix[index / DEGREE][index % DEGREE].clone());
    determinant_3x3(&flat)
}

fn validate_basis_and_discriminant(
    data: &PreparedCubicData,
) -> Result<Integer, PreparedCubicValidationError> {
    if data.basis_denominator <= 0 {
        return Err(PreparedCubicValidationError::NonPositiveBasisDenominator);
    }
    let signed_determinant = determinant_3x3(&data.integral_basis_numerators);
    if signed_determinant == 0 {
        return Err(PreparedCubicValidationError::SingularBasis);
    }
    validate_equation_order_containment(
        &data.integral_basis_numerators,
        &data.basis_denominator,
        &signed_determinant,
    )?;
    let determinant = signed_determinant.abs();
    let denominator_cube = data.basis_denominator.clone().pow(3);
    if denominator_cube.clone() % &determinant != 0 {
        return Err(PreparedCubicValidationError::NonIntegralEquationOrderIndex);
    }
    let index = denominator_cube / determinant;
    if index == 0 {
        return Err(PreparedCubicValidationError::BasisDoesNotContainEquationOrder);
    }
    let polynomial_disc = polynomial_discriminant(&data.polynomial_ascending);
    let index_square = index.clone().square();
    if polynomial_disc.clone() % &index_square != 0 {
        return Err(PreparedCubicValidationError::DiscriminantNotDivisibleByIndexSquare);
    }
    let expected = polynomial_disc / index_square;
    if expected != data.discriminant {
        return Err(PreparedCubicValidationError::DiscriminantMismatch {
            expected,
            supplied: data.discriminant.clone(),
        });
    }
    Ok(index)
}

fn validate_equation_order_containment(
    basis: &[Integer; 9],
    denominator: &Integer,
    determinant: &Integer,
) -> Result<(), PreparedCubicValidationError> {
    // If rows of N are the basis numerators, expressing each power-basis
    // vector in the prepared basis means solving N^T*z = denominator*e_j.
    // Cramer's rule is tiny here and keeps this ingress independent of an HNF
    // implementation or machine-word assumptions.
    let transpose: [Integer; 9] =
        std::array::from_fn(|index| basis[3 * (index % 3) + index / 3].clone());
    for power in 0..3 {
        for column in 0..3 {
            let mut numerator_matrix = transpose.clone();
            for row in 0..3 {
                numerator_matrix[3 * row + column] = if row == power {
                    denominator.clone()
                } else {
                    Integer::new()
                };
            }
            if determinant_3x3(&numerator_matrix) % determinant != 0 {
                return Err(PreparedCubicValidationError::BasisDoesNotContainEquationOrder);
            }
        }
    }
    Ok(())
}

fn validate_index_primes(
    primes: &[Integer],
    index: &Integer,
) -> Result<(), PreparedCubicValidationError> {
    let mut remaining = index.clone();
    let mut previous: Option<&Integer> = None;
    for prime in primes {
        if previous.is_some_and(|value| value >= prime) {
            return Err(PreparedCubicValidationError::IndexPrimesNotStrictlyIncreasing);
        }
        let Some(machine_prime) = prime.to_u32() else {
            return Err(
                PreparedCubicValidationError::IndexPrimeTooLargeForExactValidation {
                    value: prime.clone(),
                },
            );
        };
        if !is_prime_u32(machine_prime) {
            return Err(PreparedCubicValidationError::CompositeIndexPrime {
                value: prime.clone(),
            });
        }
        if remaining.clone() % prime != 0 {
            return Err(PreparedCubicValidationError::IndexPrimeDoesNotDivideIndex {
                value: prime.clone(),
            });
        }
        while remaining.clone() % prime == 0 {
            remaining /= prime;
        }
        previous = Some(prime);
    }
    if remaining != 1 {
        return Err(PreparedCubicValidationError::MissingIndexPrimeFactor { remaining });
    }
    Ok(())
}

fn multiply_power_basis(
    left: &[Integer; 3],
    right: &[Integer; 3],
    polynomial: &[Integer; 4],
) -> [Integer; 3] {
    let mut raw: [Integer; 5] = std::array::from_fn(|_| Integer::new());
    for i in 0..3 {
        for j in 0..3 {
            raw[i + j] += &left[i] * &right[j];
        }
    }
    for degree in (3..=4).rev() {
        let coefficient = raw[degree].clone();
        if coefficient == 0 {
            continue;
        }
        // alpha^degree = -sum_{j=0}^2 c_j alpha^(degree-3+j).
        for j in 0..3 {
            raw[degree - 3 + j] -= &coefficient * &polynomial[j];
        }
    }
    [raw[0].clone(), raw[1].clone(), raw[2].clone()]
}

fn validate_multiplication_table(
    data: &PreparedCubicData,
) -> Result<(), PreparedCubicValidationError> {
    for left in 0..3 {
        let left_row: [Integer; 3] =
            std::array::from_fn(|j| data.integral_basis_numerators[3 * left + j].clone());
        for right in 0..3 {
            let right_row: [Integer; 3] =
                std::array::from_fn(|j| data.integral_basis_numerators[3 * right + j].clone());
            let actual = multiply_power_basis(&left_row, &right_row, &data.polynomial_ascending);
            let mut expected: [Integer; 3] = std::array::from_fn(|_| Integer::new());
            for basis in 0..3 {
                let structure = &data.multiplication_table[9 * left + 3 * right + basis];
                for power in 0..3 {
                    expected[power] +=
                        structure * &data.integral_basis_numerators[3 * basis + power];
                }
            }
            for value in &mut expected {
                *value *= &data.basis_denominator;
            }
            if actual != expected {
                return Err(PreparedCubicValidationError::MultiplicationTableMismatch {
                    left,
                    right,
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn integers<const N: usize>(values: [i64; N]) -> [Integer; N] {
        values.map(Integer::from)
    }

    fn wide_integers<const N: usize>(values: [i128; N]) -> [Integer; N] {
        values.map(Integer::from)
    }

    fn index_three_fixture() -> PreparedCubicData {
        PreparedCubicData {
            polynomial_ascending: integers([20_018, -20_010, 0, 1]),
            irreducibility_prime: 7,
            integral_basis_numerators: integers([3, 0, 0, 0, 3, 0, -13_340, 1, 1]),
            basis_denominator: Integer::from(3),
            multiplication_table: integers([
                1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 13_340, -1, 3, -2_226, 2_223, 1, 0, 0, 1,
                -2_226, 2_223, 1, 9_883_456, -1, -2_223,
            ]),
            discriminant: Integer::from(3_559_689_395_028_i64),
            signature: (3, 0),
            embedding_precision: EmbeddingPrecisionState::Certified {
                target_bits: 128,
                working_bits: 192,
                certified_bits: 160,
            },
            index_primes: vec![Integer::from(3)],
        }
    }

    fn row_six_fixture() -> PreparedCubicData {
        PreparedCubicData {
            polynomial_ascending: wide_integers([2_000_000_000_018, -2_000_000_000_010, 0, 1]),
            irreducibility_prime: 7,
            integral_basis_numerators: wide_integers([3, 0, 0, 0, 3, 0, -1_333_333_333_340, 1, 1]),
            basis_denominator: Integer::from(3),
            multiplication_table: wide_integers([
                1,
                0,
                0,
                0,
                1,
                0,
                0,
                0,
                1,
                0,
                1,
                0,
                1_333_333_333_340,
                -1,
                3,
                -222_222_222_226,
                222_222_222_223,
                1,
                0,
                0,
                1,
                -222_222_222_226,
                222_222_222_223,
                1,
                98_765_432_099_456_790_123_456,
                -1,
                -222_222_222_223,
            ]),
            discriminant: Integer::from(3_555_555_555_596_888_888_888_939_555_555_555_028_i128),
            signature: (3, 0),
            embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 192 },
            index_primes: vec![Integer::from(3)],
        }
    }

    #[test]
    fn validates_index_three_rational_basis() {
        let field = ValidatedPreparedCubic::validate(index_three_fixture()).unwrap();
        assert_eq!(field.equation_order_index(), &3);
        assert_eq!(field.data().basis_denominator, 3);
    }

    #[test]
    fn exact_integral_basis_arithmetic_handles_row_six() {
        let field = ValidatedPreparedCubic::validate(row_six_fixture()).unwrap();
        assert_eq!(field.equation_order_index(), &3);

        let one = wide_integers([1, 0, 0]);
        let x = wide_integers([0, 1, 0]);
        let omega = wide_integers([0, 0, 1]);
        assert_eq!(
            field.multiply_coordinates(&x, &x),
            wide_integers([1_333_333_333_340, -1, 3,])
        );
        assert_eq!(field.norm(&one), 1);
        assert_eq!(field.norm(&x), -2_000_000_000_018_i64);

        let alpha = wide_integers([7, -11, 13]);
        let beta = wide_integers([-5, 3, 2]);
        let product = field.multiply_coordinates(&alpha, &beta);
        assert_eq!(field.norm(&product), field.norm(&alpha) * field.norm(&beta));
        assert_ne!(field.norm(&omega), 0);
    }

    #[test]
    fn accepts_coefficients_beyond_machine_words() {
        let a: Integer = Integer::from(1) << 200;
        let discriminant = 4 * a.clone().pow(3) - 27;
        let data = PreparedCubicData {
            polynomial_ascending: [
                Integer::from(1),
                -a.clone(),
                Integer::new(),
                Integer::from(1),
            ],
            irreducibility_prime: 3,
            integral_basis_numerators: integers([1, 0, 0, 0, 1, 0, 0, 0, 1]),
            basis_denominator: Integer::from(1),
            multiplication_table: [
                Integer::from(1),
                Integer::new(),
                Integer::new(),
                Integer::new(),
                Integer::from(1),
                Integer::new(),
                Integer::new(),
                Integer::new(),
                Integer::from(1),
                Integer::new(),
                Integer::from(1),
                Integer::new(),
                Integer::new(),
                Integer::new(),
                Integer::from(1),
                Integer::from(-1),
                a.clone(),
                Integer::new(),
                Integer::new(),
                Integer::new(),
                Integer::from(1),
                Integer::from(-1),
                a.clone(),
                Integer::new(),
                Integer::new(),
                Integer::from(-1),
                a,
            ],
            discriminant,
            signature: (3, 0),
            embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 256 },
            index_primes: vec![],
        };
        let field = ValidatedPreparedCubic::validate(data).unwrap();
        assert!(field.data().polynomial_ascending[1].significant_bits() > 64);
    }

    #[test]
    fn rejects_malformed_table() {
        let mut data = index_three_fixture();
        data.multiplication_table[13] += 1;
        assert_eq!(
            ValidatedPreparedCubic::validate(data),
            Err(PreparedCubicValidationError::MultiplicationTableMismatch { left: 1, right: 1 })
        );
    }

    #[test]
    fn rejects_reducible_cubic() {
        let mut data = index_three_fixture();
        data.polynomial_ascending = integers([0, -1, 0, 1]);
        data.irreducibility_prime = 2;
        assert_eq!(
            ValidatedPreparedCubic::validate(data),
            Err(PreparedCubicValidationError::PolynomialHasRootModuloWitness { prime: 2, root: 0 })
        );
    }

    #[test]
    fn rejects_corrupt_irreducibility_certificate() {
        let mut data = index_three_fixture();
        data.irreducibility_prime = 4;
        assert_eq!(
            ValidatedPreparedCubic::validate(data),
            Err(PreparedCubicValidationError::InvalidIrreducibilityPrime { value: 4 })
        );
    }

    #[test]
    fn rejects_missing_index_prime() {
        let mut data = index_three_fixture();
        data.index_primes.clear();
        assert_eq!(
            ValidatedPreparedCubic::validate(data),
            Err(PreparedCubicValidationError::MissingIndexPrimeFactor {
                remaining: Integer::from(3),
            })
        );
    }

    #[test]
    fn rejects_false_precision_certificate() {
        let mut data = index_three_fixture();
        data.embedding_precision = EmbeddingPrecisionState::Certified {
            target_bits: 192,
            working_bits: 128,
            certified_bits: 128,
        };
        assert!(matches!(
            ValidatedPreparedCubic::validate(data),
            Err(PreparedCubicValidationError::InvalidCertifiedPrecision { .. })
        ));
    }
}
