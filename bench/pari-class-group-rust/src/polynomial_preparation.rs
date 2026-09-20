// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Rust-owned preparation for an honest subset of public monic cubics.
//!
//! A squarefree equation-order discriminant proves that the power-basis order
//! is maximal: the square of its index in the maximal order divides the
//! equation-order discriminant.  This module uses that theorem to construct a
//! [`ValidatedPreparedCubic`] directly from polynomial coefficients, without
//! PARI, a prepared fixture, or a field-specific table.
//!
//! The squarefreeness proof is deliberately bounded.  It performs exact trial
//! division and a deterministic `u64` primality test for the final cofactor.
//! Inputs outside that proof envelope return a resource-limit error rather than
//! being treated as maximal.

use crate::{
    EmbeddingPrecisionState, PreparedCubicData, PreparedCubicValidationError,
    ValidatedPreparedCubic,
};
use rug::{Integer, ops::Pow};
use std::fmt;

/// Resource limits for exact public-polynomial preparation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PublicCubicPreparationLimits {
    /// Largest trial divisor used by the exact squarefreeness proof.
    pub maximum_trial_divisor: u64,
    /// Largest rational prime searched for an irreducibility witness.
    pub maximum_irreducibility_prime: u32,
    /// Requested precision carried to the later numerical-preparation stage.
    pub embedding_precision_bits: u32,
}

impl Default for PublicCubicPreparationLimits {
    fn default() -> Self {
        Self {
            maximum_trial_divisor: 1_000_003,
            // An irreducible cubic normally obtains a witness almost
            // immediately.  Keeping the default bounded also makes a
            // reducible input fail promptly instead of scanning large fields.
            maximum_irreducibility_prime: 257,
            embedding_precision_bits: 192,
        }
    }
}

/// Exact evidence that the equation-order power basis is already maximal.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SquarefreeDiscriminantCertificate {
    discriminant: Integer,
    /// Complete prime factorization of the absolute discriminant.  Every
    /// exponent is one by construction.
    prime_factors: Vec<Integer>,
}

impl SquarefreeDiscriminantCertificate {
    pub fn discriminant(&self) -> &Integer {
        &self.discriminant
    }

    pub fn prime_factors(&self) -> &[Integer] {
        &self.prime_factors
    }

    /// Independently replay the complete squarefree factorization.
    pub fn verify(&self) -> bool {
        let mut product = Integer::from(1);
        let mut previous = 0_u64;
        for factor in &self.prime_factors {
            let Some(machine_factor) = factor.to_u64() else {
                return false;
            };
            if machine_factor <= previous || !is_prime_u64(machine_factor) {
                return false;
            }
            product *= factor;
            previous = machine_factor;
        }
        product == self.discriminant.clone().abs()
    }
}

/// A replay-validated prepared cubic plus its maximal-order proof.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RustPreparedMaximalCubic {
    field: ValidatedPreparedCubic,
    maximal_order_certificate: SquarefreeDiscriminantCertificate,
}

impl RustPreparedMaximalCubic {
    pub fn field(&self) -> &ValidatedPreparedCubic {
        &self.field
    }

    pub fn into_field(self) -> ValidatedPreparedCubic {
        self.field
    }

    pub fn maximal_order_certificate(&self) -> &SquarefreeDiscriminantCertificate {
        &self.maximal_order_certificate
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PublicCubicPreparationError {
    NonMonicPolynomial,
    InseparablePolynomial,
    InvalidLimits,
    NoIrreducibilityWitness {
        maximum_prime: u32,
    },
    NonSquarefreeDiscriminant {
        repeated_prime: Integer,
    },
    SquarefreenessProofLimit {
        unfactored_cofactor: Integer,
        maximum_trial_divisor: u64,
    },
    Validation(PreparedCubicValidationError),
}

impl fmt::Display for PublicCubicPreparationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for PublicCubicPreparationError {}

/// Prepare an irreducible monic cubic when its power-basis maximality follows
/// from a completely factored, squarefree equation-order discriminant.
///
/// Coefficients are in ascending order.  This is an intentionally bounded
/// public-input route, not a general maximal-order algorithm.
pub fn prepare_squarefree_discriminant_monic_cubic(
    polynomial_ascending: [Integer; 4],
    limits: PublicCubicPreparationLimits,
) -> Result<RustPreparedMaximalCubic, PublicCubicPreparationError> {
    if polynomial_ascending[3] != 1 {
        return Err(PublicCubicPreparationError::NonMonicPolynomial);
    }
    if limits.maximum_trial_divisor < 2
        || limits.maximum_irreducibility_prime < 2
        || limits.embedding_precision_bits == 0
    {
        return Err(PublicCubicPreparationError::InvalidLimits);
    }

    let discriminant = cubic_discriminant(&polynomial_ascending);
    if discriminant == 0 {
        return Err(PublicCubicPreparationError::InseparablePolynomial);
    }
    let irreducibility_prime =
        irreducibility_witness(&polynomial_ascending, limits.maximum_irreducibility_prime).ok_or(
            PublicCubicPreparationError::NoIrreducibilityWitness {
                maximum_prime: limits.maximum_irreducibility_prime,
            },
        )?;
    let prime_factors =
        exact_squarefree_factorization(&discriminant, limits.maximum_trial_divisor)?;

    let multiplication_table = power_basis_multiplication_table(&polynomial_ascending);
    let signature = if discriminant > 0 { (3, 0) } else { (1, 1) };
    let data = PreparedCubicData {
        polynomial_ascending,
        irreducibility_prime,
        integral_basis_numerators: identity_basis(),
        basis_denominator: Integer::from(1),
        multiplication_table,
        discriminant: discriminant.clone(),
        signature,
        embedding_precision: EmbeddingPrecisionState::Pending {
            target_bits: limits.embedding_precision_bits,
        },
        index_primes: vec![],
    };
    let field =
        ValidatedPreparedCubic::validate(data).map_err(PublicCubicPreparationError::Validation)?;
    Ok(RustPreparedMaximalCubic {
        field,
        maximal_order_certificate: SquarefreeDiscriminantCertificate {
            discriminant,
            prime_factors,
        },
    })
}

fn cubic_discriminant(polynomial: &[Integer; 4]) -> Integer {
    // For x^3 + b*x^2 + c*x + d.
    let b = &polynomial[2];
    let c = &polynomial[1];
    let d = &polynomial[0];
    let mut answer = b.clone().square() * c.clone().square();
    answer -= 4 * c.clone().pow(3_u32);
    answer -= 4 * b.clone().pow(3_u32) * d;
    answer -= 27 * d.clone().square();
    answer += 18 * (b.clone() * c) * d;
    answer
}

fn identity_basis() -> [Integer; 9] {
    std::array::from_fn(|index| Integer::from((index / 3 == index % 3) as u8))
}

fn multiply_power_basis(
    left: &[Integer; 3],
    right: &[Integer; 3],
    polynomial: &[Integer; 4],
) -> [Integer; 3] {
    let mut raw: [Integer; 5] = std::array::from_fn(|_| Integer::new());
    for left_power in 0..3 {
        for right_power in 0..3 {
            raw[left_power + right_power] += left[left_power].clone() * &right[right_power];
        }
    }
    for power in (3..=4).rev() {
        let coefficient = raw[power].clone();
        for lower_power in 0..3 {
            raw[power - 3 + lower_power] -= coefficient.clone() * &polynomial[lower_power];
        }
    }
    std::array::from_fn(|index| raw[index].clone())
}

fn power_basis_multiplication_table(polynomial: &[Integer; 4]) -> [Integer; 27] {
    let mut table: [Integer; 27] = std::array::from_fn(|_| Integer::new());
    for left in 0..3 {
        for right in 0..3 {
            let left_basis = std::array::from_fn(|index| Integer::from((index == left) as u8));
            let right_basis = std::array::from_fn(|index| Integer::from((index == right) as u8));
            let product = multiply_power_basis(&left_basis, &right_basis, polynomial);
            for coordinate in 0..3 {
                table[9 * left + 3 * right + coordinate] = product[coordinate].clone();
            }
        }
    }
    table
}

fn coefficient_mod_u32(coefficient: &Integer, modulus: u32) -> u32 {
    let residue = coefficient.clone() % modulus;
    if residue < 0 {
        (residue + modulus).to_u32().unwrap()
    } else {
        residue.to_u32().unwrap()
    }
}

fn polynomial_has_root_modulo(polynomial: &[Integer; 4], prime: u32) -> bool {
    (0..prime).any(|root| {
        let mut value = 0_u64;
        for coefficient in polynomial.iter().rev() {
            value = (value * u64::from(root) + u64::from(coefficient_mod_u32(coefficient, prime)))
                % u64::from(prime);
        }
        value == 0
    })
}

fn irreducibility_witness(polynomial: &[Integer; 4], maximum: u32) -> Option<u32> {
    (2..=maximum)
        .filter(|candidate| is_prime_u32(*candidate))
        .find(|prime| !polynomial_has_root_modulo(polynomial, *prime))
}

fn is_prime_u32(value: u32) -> bool {
    is_prime_u64(u64::from(value))
}

fn modular_power(mut base: u64, mut exponent: u64, modulus: u64) -> u64 {
    let mut answer = 1_u64;
    base %= modulus;
    while exponent != 0 {
        if exponent & 1 != 0 {
            answer = ((u128::from(answer) * u128::from(base)) % u128::from(modulus)) as u64;
        }
        base = ((u128::from(base) * u128::from(base)) % u128::from(modulus)) as u64;
        exponent >>= 1;
    }
    answer
}

// Deterministic Miller--Rabin for all u64 values.
fn is_prime_u64(value: u64) -> bool {
    if value < 2 {
        return false;
    }
    for prime in [2_u64, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] {
        if value % prime == 0 {
            return value == prime;
        }
    }
    let shifts = (value - 1).trailing_zeros();
    let odd_part = (value - 1) >> shifts;
    for base in [2_u64, 325, 9_375, 28_178, 450_775, 9_780_504, 1_795_265_022] {
        let base = base % value;
        if base == 0 {
            continue;
        }
        let mut witness = modular_power(base, odd_part, value);
        if witness == 1 || witness == value - 1 {
            continue;
        }
        let mut composite = true;
        for _ in 1..shifts {
            witness = ((u128::from(witness) * u128::from(witness)) % u128::from(value)) as u64;
            if witness == value - 1 {
                composite = false;
                break;
            }
        }
        if composite {
            return false;
        }
    }
    true
}

fn exact_squarefree_factorization(
    discriminant: &Integer,
    maximum_trial_divisor: u64,
) -> Result<Vec<Integer>, PublicCubicPreparationError> {
    let mut remaining = discriminant.clone().abs();
    let mut factors = Vec::new();
    let mut divisor = 2_u64;
    while divisor <= maximum_trial_divisor {
        let divisor_integer = Integer::from(divisor);
        if remaining.clone() % &divisor_integer == 0 {
            remaining /= &divisor_integer;
            if remaining.clone() % &divisor_integer == 0 {
                return Err(PublicCubicPreparationError::NonSquarefreeDiscriminant {
                    repeated_prime: divisor_integer,
                });
            }
            factors.push(divisor_integer);
        }
        if let Some(machine_remaining) = remaining.to_u64() {
            if machine_remaining == 1 {
                return Ok(factors);
            }
            if is_prime_u64(machine_remaining) {
                factors.push(Integer::from(machine_remaining));
                return Ok(factors);
            }
            if divisor > machine_remaining / divisor {
                // Every proper factor would already have been tried.
                factors.push(Integer::from(machine_remaining));
                return Ok(factors);
            }
        }
        divisor = if divisor == 2 { 3 } else { divisor + 2 };
    }
    Err(PublicCubicPreparationError::SquarefreenessProofLimit {
        unfactored_cofactor: remaining,
        maximum_trial_divisor,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn integers(values: [i64; 4]) -> [Integer; 4] {
        values.map(Integer::from)
    }

    #[test]
    fn prepares_complex_cubic_from_only_its_public_polynomial() {
        let prepared = prepare_squarefree_discriminant_monic_cubic(
            integers([-1, -1, 0, 1]),
            PublicCubicPreparationLimits::default(),
        )
        .unwrap();
        assert_eq!(prepared.field().data().discriminant, -23);
        assert_eq!(prepared.field().data().signature, (1, 1));
        assert_eq!(prepared.field().equation_order_index(), &Integer::from(1));
        assert_eq!(
            prepared.maximal_order_certificate().prime_factors(),
            &[Integer::from(23)]
        );
        assert!(prepared.maximal_order_certificate().verify());
        let factor_base = crate::prepared_maximal_cubic_factor_base(prepared.field()).unwrap();
        assert!(!factor_base.catalog.ideals.is_empty());
        let x = [Integer::from(0), Integer::from(1), Integer::from(0)];
        assert_eq!(prepared.field().norm(&x), 1);
    }

    #[test]
    fn prepares_totally_real_cubic_with_generated_table() {
        let prepared = prepare_squarefree_discriminant_monic_cubic(
            integers([1, -4, 0, 1]),
            PublicCubicPreparationLimits::default(),
        )
        .unwrap();
        assert_eq!(prepared.field().data().discriminant, 229);
        assert_eq!(prepared.field().data().signature, (3, 0));
        let x = [Integer::from(0), Integer::from(1), Integer::from(0)];
        let x_squared = prepared.field().multiply_coordinates(&x, &x);
        assert_eq!(x_squared, [0, 0, 1].map(Integer::from));
        assert_eq!(prepared.field().norm(&x), -1);
    }

    #[test]
    fn refuses_a_nonmaximality_ambiguous_equation_order() {
        // x^3 - 2*x^2 - x + 1 is irreducible and has discriminant 49.  Its
        // equation-order discriminant therefore cannot certify maximality via
        // the squarefree theorem used by this bounded route.
        assert_eq!(
            prepare_squarefree_discriminant_monic_cubic(
                integers([1, -1, -2, 1]),
                PublicCubicPreparationLimits::default(),
            ),
            Err(PublicCubicPreparationError::NonSquarefreeDiscriminant {
                repeated_prime: Integer::from(7),
            })
        );
    }

    #[test]
    fn resource_limit_is_explicit_and_does_not_claim_maximality() {
        // Discriminant 229 is prime, so the deterministic final-cofactor test
        // can still close this proof even when trial division is tiny.
        let limits = PublicCubicPreparationLimits {
            maximum_trial_divisor: 2,
            ..PublicCubicPreparationLimits::default()
        };
        assert!(
            prepare_squarefree_discriminant_monic_cubic(integers([1, -4, 0, 1]), limits).is_ok()
        );

        // A >u64 discriminant cannot use that deterministic shortcut and must
        // fail closed once the exact trial-division budget is exhausted.
        let wide = [
            Integer::from(1),
            -(Integer::from(1) << 100_u32),
            Integer::from(0),
            Integer::from(1),
        ];
        assert!(matches!(
            prepare_squarefree_discriminant_monic_cubic(wide, limits),
            Err(PublicCubicPreparationError::SquarefreenessProofLimit { .. })
        ));
    }

    #[test]
    fn rejects_nonmonic_and_inseparable_inputs_before_publication() {
        let mut nonmonic = integers([-1, -1, 0, 1]);
        nonmonic[3] = Integer::from(2);
        assert_eq!(
            prepare_squarefree_discriminant_monic_cubic(
                nonmonic,
                PublicCubicPreparationLimits::default(),
            ),
            Err(PublicCubicPreparationError::NonMonicPolynomial)
        );
        assert_eq!(
            prepare_squarefree_discriminant_monic_cubic(
                integers([0, 0, 0, 1]),
                PublicCubicPreparationLimits::default(),
            ),
            Err(PublicCubicPreparationError::InseparablePolynomial)
        );
    }
}
