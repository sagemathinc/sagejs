// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Neutral, exact input for prepared number fields of degrees two through six.
//!
//! This module deliberately contains field data, not class-group answers.  A
//! [`ValidatedPreparedNumberField`] can only be obtained after replaying the exact
//! relationships between its polynomial, represented integral order basis,
//! multiplication table, discriminant, signature, and equation-order index.
//! This layer does not prove that the represented order is maximal, and its
//! precision state is bookkeeping rather than an embedding certificate.

use rug::{Integer, ops::Pow};

const DEGREE: usize = 3;
const MINIMUM_PREPARED_DEGREE: usize = 2;
const MAXIMUM_PREPARED_DEGREE: usize = 6;

/// Exact numerical state carried across the preparation/analytic boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EmbeddingPrecisionState {
    /// Embeddings have not yet been computed at the requested precision.
    Pending { target_bits: u32 },
    /// The producer reports embeddings computed and certified to this precision.
    ///
    /// Validation here checks only the consistency of these three bit counts;
    /// a consumer needing rigorous embeddings must validate their own enclosure
    /// certificate at the numerical boundary.
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

/// Degree-generic, untrusted, answer-free prepared-field data.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedNumberFieldData {
    pub polynomial_ascending: Vec<Integer>,
    pub irreducibility_prime: u32,
    /// Basis numerators for the represented integral order.  Maximality is a
    /// separate preparation certificate and is not inferred by this validator.
    pub integral_basis_numerators: Vec<Integer>,
    pub basis_denominator: Integer,
    pub multiplication_table: Vec<Integer>,
    pub discriminant: Integer,
    pub signature: (u8, u8),
    pub embedding_precision: EmbeddingPrecisionState,
    pub index_primes: Vec<Integer>,
}

/// Exact prepared-field data after its representation relationships replay.
///
/// This means the claimed integral order is internally consistent.  It does
/// not by itself prove maximality or rigorous numerical embedding accuracy.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatedPreparedNumberField {
    data: PreparedNumberFieldData,
    degree: usize,
    equation_order_index: Integer,
}

impl ValidatedPreparedNumberField {
    pub fn validate(data: PreparedNumberFieldData) -> Result<Self, PreparedCubicValidationError> {
        let degree = data.polynomial_ascending.len().saturating_sub(1);
        if !(MINIMUM_PREPARED_DEGREE..=MAXIMUM_PREPARED_DEGREE).contains(&degree) {
            return Err(PreparedCubicValidationError::UnsupportedDegree { degree });
        }
        if data.integral_basis_numerators.len() != degree * degree {
            return Err(PreparedCubicValidationError::InvalidBasisShape {
                expected: degree * degree,
                actual: data.integral_basis_numerators.len(),
            });
        }
        if data.multiplication_table.len() != degree * degree * degree {
            return Err(
                PreparedCubicValidationError::InvalidMultiplicationTableShape {
                    expected: degree * degree * degree,
                    actual: data.multiplication_table.len(),
                },
            );
        }
        if data.polynomial_ascending[degree] != 1 {
            return Err(PreparedCubicValidationError::NonMonicPolynomial);
        }
        let polynomial_disc = generic_polynomial_discriminant(&data.polynomial_ascending);
        if polynomial_disc == 0 {
            return Err(PreparedCubicValidationError::InseparablePolynomial);
        }
        validate_generic_irreducibility_certificate(
            &data.polynomial_ascending,
            data.irreducibility_prime,
        )?;
        data.embedding_precision.validate()?;
        validate_generic_signature(
            &data.polynomial_ascending,
            data.signature,
            &data.discriminant,
        )?;
        let equation_order_index =
            validate_generic_basis_and_discriminant(&data, degree, &polynomial_disc)?;
        validate_index_primes(&data.index_primes, &equation_order_index)?;
        validate_generic_multiplication_table(&data, degree)?;
        Ok(Self {
            data,
            degree,
            equation_order_index,
        })
    }

    pub fn data(&self) -> &PreparedNumberFieldData {
        &self.data
    }

    pub fn degree(&self) -> usize {
        self.degree
    }

    pub fn equation_order_index(&self) -> &Integer {
        &self.equation_order_index
    }

    pub fn into_data(self) -> PreparedNumberFieldData {
        self.data
    }
}

impl TryFrom<PreparedNumberFieldData> for ValidatedPreparedNumberField {
    type Error = PreparedCubicValidationError;

    fn try_from(value: PreparedNumberFieldData) -> Result<Self, Self::Error> {
        Self::validate(value)
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
        let generic = ValidatedPreparedNumberField::validate(PreparedNumberFieldData {
            polynomial_ascending: data.polynomial_ascending.to_vec(),
            irreducibility_prime: data.irreducibility_prime,
            integral_basis_numerators: data.integral_basis_numerators.to_vec(),
            basis_denominator: data.basis_denominator.clone(),
            multiplication_table: data.multiplication_table.to_vec(),
            discriminant: data.discriminant.clone(),
            signature: data.signature,
            embedding_precision: data.embedding_precision.clone(),
            index_primes: data.index_primes.clone(),
        })?;
        let equation_order_index = generic.equation_order_index;
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
    UnsupportedDegree {
        degree: usize,
    },
    InvalidBasisShape {
        expected: usize,
        actual: usize,
    },
    InvalidMultiplicationTableShape {
        expected: usize,
        actual: usize,
    },
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
    ReducibleModuloIrreducibilityPrime {
        prime: u32,
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

/// Degree-generic name for the validation error.  The cubic name remains a
/// compatibility alias for callers of the first experimental boundary.
pub type PreparedNumberFieldValidationError = PreparedCubicValidationError;

fn determinant(matrix: &[Integer], size: usize) -> Integer {
    if size == 0 {
        return Integer::from(1);
    }
    let mut work = matrix.to_vec();
    let mut previous = Integer::from(1);
    let mut sign = 1_i32;
    for pivot_index in 0..size.saturating_sub(1) {
        let Some(pivot_row) = (pivot_index..size).find(|row| work[*row * size + pivot_index] != 0)
        else {
            return Integer::new();
        };
        if pivot_row != pivot_index {
            for column in 0..size {
                work.swap(pivot_row * size + column, pivot_index * size + column);
            }
            sign = -sign;
        }
        let pivot = work[pivot_index * size + pivot_index].clone();
        for row in (pivot_index + 1)..size {
            for column in (pivot_index + 1)..size {
                let numerator = work[row * size + column].clone() * &pivot
                    - work[row * size + pivot_index].clone() * &work[pivot_index * size + column];
                debug_assert_eq!(numerator.clone() % &previous, 0);
                work[row * size + column] = numerator / &previous;
            }
            work[row * size + pivot_index] = Integer::new();
        }
        previous = pivot;
    }
    work[size * size - 1].clone() * sign
}

fn generic_polynomial_discriminant(polynomial: &[Integer]) -> Integer {
    let degree = polynomial.len() - 1;
    let derivative = (1..=degree)
        .map(|power| polynomial[power].clone() * power)
        .collect::<Vec<_>>();
    let resultant_size = 2 * degree - 1;
    let mut sylvester = vec![Integer::new(); resultant_size * resultant_size];
    for row in 0..(degree - 1) {
        for (power, coefficient) in polynomial.iter().enumerate() {
            sylvester[row * resultant_size + row + power] = coefficient.clone();
        }
    }
    for derivative_row in 0..degree {
        let row = degree - 1 + derivative_row;
        for (power, coefficient) in derivative.iter().enumerate() {
            sylvester[row * resultant_size + derivative_row + power] = coefficient.clone();
        }
    }
    let resultant = determinant(&sylvester, resultant_size);
    if degree * (degree - 1) / 2 % 2 == 0 {
        resultant
    } else {
        -resultant
    }
}

fn trim_mod_polynomial(polynomial: &mut Vec<u32>) {
    while polynomial.len() > 1 && polynomial.last() == Some(&0) {
        polynomial.pop();
    }
}

fn modular_power(mut base: u64, mut exponent: u32, modulus: u32) -> u32 {
    let mut result = 1_u64;
    let modulus = u64::from(modulus);
    while exponent != 0 {
        if exponent & 1 != 0 {
            result = result * base % modulus;
        }
        base = base * base % modulus;
        exponent >>= 1;
    }
    result as u32
}

fn finite_polynomial_remainder(mut value: Vec<u32>, divisor: &[u32], prime: u32) -> Vec<u32> {
    trim_mod_polynomial(&mut value);
    let divisor_degree = divisor.len() - 1;
    let inverse_leading = modular_power(u64::from(divisor[divisor_degree]), prime - 2, prime);
    while value.len() >= divisor.len() && !(value.len() == 1 && value[0] == 0) {
        let shift = value.len() - divisor.len();
        let scale =
            u64::from(*value.last().unwrap()) * u64::from(inverse_leading) % u64::from(prime);
        for (index, coefficient) in divisor.iter().enumerate() {
            let offset = shift + index;
            let subtract = scale * u64::from(*coefficient) % u64::from(prime);
            value[offset] = ((u64::from(value[offset]) + u64::from(prime) - subtract)
                % u64::from(prime)) as u32;
        }
        trim_mod_polynomial(&mut value);
    }
    value
}

fn finite_polynomial_mul_mod(left: &[u32], right: &[u32], modulus: &[u32], prime: u32) -> Vec<u32> {
    let mut product = vec![0_u32; left.len() + right.len() - 1];
    for (i, a) in left.iter().enumerate() {
        for (j, b) in right.iter().enumerate() {
            product[i + j] = ((u64::from(product[i + j]) + u64::from(*a) * u64::from(*b))
                % u64::from(prime)) as u32;
        }
    }
    finite_polynomial_remainder(product, modulus, prime)
}

fn finite_polynomial_pow_mod(
    mut base: Vec<u32>,
    mut exponent: u32,
    modulus: &[u32],
    prime: u32,
) -> Vec<u32> {
    let mut answer = vec![1_u32];
    while exponent != 0 {
        if exponent & 1 != 0 {
            answer = finite_polynomial_mul_mod(&answer, &base, modulus, prime);
        }
        base = finite_polynomial_mul_mod(&base, &base, modulus, prime);
        exponent >>= 1;
    }
    answer
}

fn finite_polynomial_gcd(mut left: Vec<u32>, mut right: Vec<u32>, prime: u32) -> Vec<u32> {
    trim_mod_polynomial(&mut left);
    trim_mod_polynomial(&mut right);
    while !(right.len() == 1 && right[0] == 0) {
        let remainder = finite_polynomial_remainder(left, &right, prime);
        left = right;
        right = remainder;
    }
    left
}

fn validate_generic_irreducibility_certificate(
    polynomial: &[Integer],
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
    let finite = polynomial
        .iter()
        .map(|coefficient| {
            let mut residue = coefficient.clone() % prime;
            if residue < 0 {
                residue += prime;
            }
            residue.to_u32_wrapping()
        })
        .collect::<Vec<_>>();
    let degree = polynomial.len() - 1;
    // Preserve the particularly useful linear-factor witness for quadratics
    // and cubics.  Higher degrees use the complete Rabin test below without
    // first paying for an unnecessary scan of every residue modulo `prime`.
    if degree <= 3 {
        for root in 0..prime {
            let value = finite.iter().rev().fold(0_u64, |value, coefficient| {
                (value * u64::from(root) + u64::from(*coefficient)) % u64::from(prime)
            });
            if value == 0 {
                return Err(
                    PreparedCubicValidationError::PolynomialHasRootModuloWitness { prime, root },
                );
            }
        }
    }
    let x = vec![0_u32, 1];
    for divisor in (2..=degree).filter(|candidate| {
        degree % candidate == 0 && (2..*candidate).all(|factor| candidate % factor != 0)
    }) {
        let mut frobenius = x.clone();
        for _ in 0..(degree / divisor) {
            frobenius = finite_polynomial_pow_mod(frobenius, prime, &finite, prime);
        }
        if frobenius.len() < 2 {
            frobenius.resize(2, 0);
        }
        frobenius[1] = (frobenius[1] + prime - 1) % prime;
        trim_mod_polynomial(&mut frobenius);
        if finite_polynomial_gcd(finite.clone(), frobenius, prime).len() > 1 {
            return Err(PreparedCubicValidationError::ReducibleModuloIrreducibilityPrime { prime });
        }
    }
    let mut frobenius = x.clone();
    for _ in 0..degree {
        frobenius = finite_polynomial_pow_mod(frobenius, prime, &finite, prime);
    }
    trim_mod_polynomial(&mut frobenius);
    if frobenius != x {
        return Err(PreparedCubicValidationError::ReducibleModuloIrreducibilityPrime { prime });
    }
    Ok(())
}

#[derive(Clone)]
struct ExactRational {
    numerator: Integer,
    denominator: Integer,
}

impl ExactRational {
    fn new(mut numerator: Integer, mut denominator: Integer) -> Self {
        debug_assert_ne!(denominator, 0);
        if denominator < 0 {
            numerator = -numerator;
            denominator = -denominator;
        }
        let gcd = numerator.clone().abs().gcd(&denominator);
        Self {
            numerator: numerator / &gcd,
            denominator: denominator / gcd,
        }
    }

    fn integer(value: Integer) -> Self {
        Self::new(value, Integer::from(1))
    }

    fn is_zero(&self) -> bool {
        self.numerator == 0
    }

    fn sub(&self, other: &Self) -> Self {
        Self::new(
            self.numerator.clone() * &other.denominator
                - other.numerator.clone() * &self.denominator,
            self.denominator.clone() * &other.denominator,
        )
    }

    fn mul(&self, other: &Self) -> Self {
        Self::new(
            self.numerator.clone() * &other.numerator,
            self.denominator.clone() * &other.denominator,
        )
    }

    fn div(&self, other: &Self) -> Self {
        Self::new(
            self.numerator.clone() * &other.denominator,
            self.denominator.clone() * &other.numerator,
        )
    }

    fn neg(&self) -> Self {
        Self::new(-self.numerator.clone(), self.denominator.clone())
    }
}

fn trim_rational_polynomial(polynomial: &mut Vec<ExactRational>) {
    while polynomial.len() > 1 && polynomial.last().is_some_and(ExactRational::is_zero) {
        polynomial.pop();
    }
}

fn rational_polynomial_remainder(
    mut value: Vec<ExactRational>,
    divisor: &[ExactRational],
) -> Vec<ExactRational> {
    trim_rational_polynomial(&mut value);
    while value.len() >= divisor.len() && !value.last().unwrap().is_zero() {
        let shift = value.len() - divisor.len();
        let scale = value.last().unwrap().div(divisor.last().unwrap());
        for (index, coefficient) in divisor.iter().enumerate() {
            value[shift + index] = value[shift + index].sub(&scale.mul(coefficient));
        }
        trim_rational_polynomial(&mut value);
    }
    value
}

fn exact_real_root_count(polynomial: &[Integer]) -> usize {
    let initial = polynomial
        .iter()
        .cloned()
        .map(ExactRational::integer)
        .collect::<Vec<_>>();
    let derivative = (1..polynomial.len())
        .map(|power| ExactRational::integer(polynomial[power].clone() * power))
        .collect::<Vec<_>>();
    let mut sturm = vec![initial, derivative];
    while !sturm.last().unwrap().iter().all(ExactRational::is_zero) {
        let length = sturm.len();
        let mut remainder =
            rational_polynomial_remainder(sturm[length - 2].clone(), &sturm[length - 1]);
        if remainder.iter().all(ExactRational::is_zero) {
            break;
        }
        for coefficient in &mut remainder {
            *coefficient = coefficient.neg();
        }
        sturm.push(remainder);
    }
    let variations = |positive_infinity: bool| {
        let mut previous = 0_i32;
        let mut count = 0;
        for polynomial in &sturm {
            let leading = polynomial.last().unwrap();
            let mut sign = match leading.numerator.cmp0() {
                std::cmp::Ordering::Less => -1,
                std::cmp::Ordering::Equal => 0,
                std::cmp::Ordering::Greater => 1,
            };
            if !positive_infinity && (polynomial.len() - 1) % 2 != 0 {
                sign = -sign;
            }
            if previous != 0 && sign != previous {
                count += 1;
            }
            previous = sign;
        }
        count
    };
    variations(false) - variations(true)
}

fn validate_generic_signature(
    polynomial: &[Integer],
    signature: (u8, u8),
    discriminant: &Integer,
) -> Result<(), PreparedCubicValidationError> {
    let degree = polynomial.len() - 1;
    if signature.0 as usize + 2 * signature.1 as usize != degree {
        return Err(PreparedCubicValidationError::InvalidSignature {
            real_places: signature.0,
            complex_pairs: signature.1,
        });
    }
    if (discriminant < &0) != (signature.1 % 2 == 1) {
        return Err(PreparedCubicValidationError::SignatureDiscriminantMismatch);
    }
    let real_places = exact_real_root_count(polynomial);
    if real_places != signature.0 as usize {
        return Err(PreparedCubicValidationError::InvalidSignature {
            real_places: signature.0,
            complex_pairs: signature.1,
        });
    }
    Ok(())
}

fn validate_generic_basis_and_discriminant(
    data: &PreparedNumberFieldData,
    degree: usize,
    polynomial_disc: &Integer,
) -> Result<Integer, PreparedCubicValidationError> {
    if data.basis_denominator <= 0 {
        return Err(PreparedCubicValidationError::NonPositiveBasisDenominator);
    }
    let signed_determinant = determinant(&data.integral_basis_numerators, degree);
    if signed_determinant == 0 {
        return Err(PreparedCubicValidationError::SingularBasis);
    }
    let transpose = (0..degree * degree)
        .map(|index| {
            data.integral_basis_numerators[degree * (index % degree) + index / degree].clone()
        })
        .collect::<Vec<_>>();
    for power in 0..degree {
        for column in 0..degree {
            let mut numerator_matrix = transpose.clone();
            for row in 0..degree {
                numerator_matrix[degree * row + column] = if row == power {
                    data.basis_denominator.clone()
                } else {
                    Integer::new()
                };
            }
            if determinant(&numerator_matrix, degree) % &signed_determinant != 0 {
                return Err(PreparedCubicValidationError::BasisDoesNotContainEquationOrder);
            }
        }
    }
    let absolute_determinant = signed_determinant.abs();
    let denominator_power = data.basis_denominator.clone().pow(degree as u32);
    if denominator_power.clone() % &absolute_determinant != 0 {
        return Err(PreparedCubicValidationError::NonIntegralEquationOrderIndex);
    }
    let index = denominator_power / absolute_determinant;
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

fn generic_multiply_power_basis(
    left: &[Integer],
    right: &[Integer],
    polynomial: &[Integer],
) -> Vec<Integer> {
    let degree = left.len();
    let mut raw = vec![Integer::new(); 2 * degree - 1];
    for i in 0..degree {
        for j in 0..degree {
            raw[i + j] += &left[i] * &right[j];
        }
    }
    for power in (degree..=(2 * degree - 2)).rev() {
        let coefficient = raw[power].clone();
        for j in 0..degree {
            raw[power - degree + j] -= &coefficient * &polynomial[j];
        }
    }
    raw.truncate(degree);
    raw
}

fn validate_generic_multiplication_table(
    data: &PreparedNumberFieldData,
    degree: usize,
) -> Result<(), PreparedCubicValidationError> {
    for left in 0..degree {
        let left_row = data.integral_basis_numerators[degree * left..degree * (left + 1)].to_vec();
        for right in 0..degree {
            let right_row =
                data.integral_basis_numerators[degree * right..degree * (right + 1)].to_vec();
            let actual =
                generic_multiply_power_basis(&left_row, &right_row, &data.polynomial_ascending);
            let mut expected = vec![Integer::new(); degree];
            for basis in 0..degree {
                let structure =
                    &data.multiplication_table[degree * degree * left + degree * right + basis];
                for power in 0..degree {
                    expected[power] +=
                        structure * &data.integral_basis_numerators[degree * basis + power];
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

    fn power_basis_fixture(
        polynomial: &[i64],
        irreducibility_prime: u32,
        signature: (u8, u8),
        discriminant: i64,
    ) -> PreparedNumberFieldData {
        let polynomial = polynomial
            .iter()
            .copied()
            .map(Integer::from)
            .collect::<Vec<_>>();
        let degree = polynomial.len() - 1;
        let mut basis = vec![Integer::new(); degree * degree];
        for index in 0..degree {
            basis[degree * index + index] = Integer::from(1);
        }
        let mut table = Vec::with_capacity(degree * degree * degree);
        for left in 0..degree {
            for right in 0..degree {
                let mut left_vector = vec![Integer::new(); degree];
                let mut right_vector = vec![Integer::new(); degree];
                left_vector[left] = Integer::from(1);
                right_vector[right] = Integer::from(1);
                table.extend(generic_multiply_power_basis(
                    &left_vector,
                    &right_vector,
                    &polynomial,
                ));
            }
        }
        PreparedNumberFieldData {
            polynomial_ascending: polynomial,
            irreducibility_prime,
            integral_basis_numerators: basis,
            basis_denominator: Integer::from(1),
            multiplication_table: table,
            discriminant: Integer::from(discriminant),
            signature,
            embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 128 },
            index_primes: vec![],
        }
    }

    #[test]
    fn validates_power_basis_fields_in_degrees_two_through_six() {
        let fixtures = [
            power_basis_fixture(&[1, 0, 1], 3, (0, 1), -4),
            PreparedNumberFieldData {
                polynomial_ascending: index_three_fixture().polynomial_ascending.to_vec(),
                irreducibility_prime: 7,
                integral_basis_numerators: index_three_fixture().integral_basis_numerators.to_vec(),
                basis_denominator: Integer::from(3),
                multiplication_table: index_three_fixture().multiplication_table.to_vec(),
                discriminant: Integer::from(3_559_689_395_028_i64),
                signature: (3, 0),
                embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 128 },
                index_primes: vec![Integer::from(3)],
            },
            power_basis_fixture(&[1, -1, 0, 0, 1], 2, (0, 2), 229),
            power_basis_fixture(&[1, -1, 0, 0, 0, 1], 3, (1, 2), 2_869),
            power_basis_fixture(&[1, 1, 0, 0, 0, 0, 1], 2, (0, 3), -43_531),
        ];
        for (offset, data) in fixtures.into_iter().enumerate() {
            let field = ValidatedPreparedNumberField::validate(data).unwrap();
            assert_eq!(field.degree(), offset + 2);
            assert_eq!(
                field.equation_order_index(),
                if offset == 1 { &3 } else { &1 }
            );
        }
    }

    #[test]
    fn generic_validation_rejects_shapes_and_nonreal_signature_claims() {
        let mut bad_basis = power_basis_fixture(&[1, -1, 0, 0, 1], 2, (0, 2), 229);
        bad_basis.integral_basis_numerators.pop();
        assert!(matches!(
            ValidatedPreparedNumberField::validate(bad_basis),
            Err(PreparedCubicValidationError::InvalidBasisShape { .. })
        ));

        let mut bad_table = power_basis_fixture(&[1, -1, 0, 0, 1], 2, (0, 2), 229);
        bad_table.multiplication_table.pop();
        assert!(matches!(
            ValidatedPreparedNumberField::validate(bad_table),
            Err(PreparedCubicValidationError::InvalidMultiplicationTableShape { .. })
        ));

        // The discriminant is positive for both (0,2) and (4,0), so this
        // specifically exercises exact Sturm root counting, not merely sign.
        let mut bad_signature = power_basis_fixture(&[1, -1, 0, 0, 1], 2, (0, 2), 229);
        bad_signature.signature = (4, 0);
        assert!(matches!(
            ValidatedPreparedNumberField::validate(bad_signature),
            Err(PreparedCubicValidationError::InvalidSignature { .. })
        ));
    }

    #[test]
    fn generic_rabin_certificate_rejects_reducible_quartic_without_linear_factors() {
        let mut data = power_basis_fixture(&[1, -1, 0, 0, 1], 2, (0, 2), 229);
        // (x^2 + 1)(x^2 + x + 2), with neither factor linear modulo 3.
        data.polynomial_ascending = integers([2, 1, 3, 1, 1]).to_vec();
        data.irreducibility_prime = 3;
        assert_eq!(
            ValidatedPreparedNumberField::validate(data),
            Err(PreparedCubicValidationError::ReducibleModuloIrreducibilityPrime { prime: 3 })
        );
    }

    #[test]
    fn generic_validation_rejects_out_of_range_degree() {
        let data = PreparedNumberFieldData {
            polynomial_ascending: integers([1, 0, 0, 0, 0, 0, 0, 1]).to_vec(),
            irreducibility_prime: 2,
            integral_basis_numerators: vec![],
            basis_denominator: Integer::from(1),
            multiplication_table: vec![],
            discriminant: Integer::from(1),
            signature: (1, 3),
            embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 128 },
            index_primes: vec![],
        };
        assert_eq!(
            ValidatedPreparedNumberField::validate(data),
            Err(PreparedCubicValidationError::UnsupportedDegree { degree: 7 })
        );
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
