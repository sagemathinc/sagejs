// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Isolated qualification of public quadratic class groups.
//!
//! The imaginary-quadratic v2 route is a complete, answer-free engine on its
//! documented bounded domain. It validates maximal-order preparation from
//! public coefficients, enumerates reduced forms, uses exact ideal-lattice
//! Gauss composition, and returns replay-verifiable invariants, generators,
//! class coordinates, and unconditional proof status.
//!
//! The real-quadratic experiment remains preparation-only. Public coefficients
//! reach a replay-validated generic prepared field, but the root experiment's
//! next factor-base and collector APIs are cubic-only. The following
//! compile-fail test preserves that precise real-quadratic boundary; it does
//! not limit the independent imaginary-quadratic engine in this crate:
//!
//! ```compile_fail,E0308
//! use sagejs_pari_class_group_rust_experiment::{
//!     ValidatedPreparedNumberField, prepared_maximal_cubic_factor_base,
//! };
//! fn enter_existing_engine(field: &ValidatedPreparedNumberField) {
//!     let _ = prepared_maximal_cubic_factor_base(field);
//! }
//! ```

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    EmbeddingPrecisionState, PreparedNumberFieldData, PreparedNumberFieldValidationError,
    ValidatedPreparedNumberField,
};
use serde::Serialize;
use std::fmt;

mod imaginary;

pub use imaginary::{
    BinaryQuadraticForm, CompleteImaginaryClassGroup, CompleteImaginaryClassNumber,
    GENERAL_IMAGINARY_CASES, ImaginaryClassGroupError, PublicImaginaryQuadraticInput,
    SMALL_IMAGINARY_CASES, compose_reduced_forms, compute_imaginary_class_group,
    compute_imaginary_class_group_from_coefficients,
    compute_imaginary_class_number_from_coefficients, verify_imaginary_class_group,
};

pub const ENGINE_ENTRY_POINT: &str = "prepared_maximal_cubic_factor_base";
pub const ENGINE_REQUIRED_TYPE: &str = "ValidatedPreparedCubic";
pub const AVAILABLE_PREPARED_TYPE: &str = "ValidatedPreparedNumberField(degree=2)";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PublicQuadraticInput {
    pub id: &'static str,
    /// Coefficients in ascending order.
    pub polynomial_ascending: [i64; 3],
}

pub const REAL_QUADRATIC_CASES: [PublicQuadraticInput; 4] = [
    PublicQuadraticInput {
        id: "real-d5",
        polynomial_ascending: [-1, -1, 1],
    },
    PublicQuadraticInput {
        id: "real-d13",
        polynomial_ascending: [-3, -1, 1],
    },
    PublicQuadraticInput {
        id: "real-d229-class-number-3",
        polynomial_ascending: [-57, -1, 1],
    },
    PublicQuadraticInput {
        id: "real-d401-class-number-5",
        polynomial_ascending: [-100, -1, 1],
    },
];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MaximalOrderCertificate {
    discriminant: Integer,
    prime_factors: Vec<Integer>,
}

impl MaximalOrderCertificate {
    pub fn discriminant(&self) -> &Integer {
        &self.discriminant
    }

    pub fn prime_factors(&self) -> &[Integer] {
        &self.prime_factors
    }

    pub fn verify(&self) -> bool {
        let mut product = Integer::from(1);
        let mut previous = 0_u64;
        for factor in &self.prime_factors {
            let Some(value) = factor.to_u64() else {
                return false;
            };
            if value <= previous || !is_prime(value) {
                return false;
            }
            product *= factor;
            previous = value;
        }
        product == self.discriminant
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedMaximalQuadratic {
    field: ValidatedPreparedNumberField,
    certificate: MaximalOrderCertificate,
}

impl PreparedMaximalQuadratic {
    pub fn field(&self) -> &ValidatedPreparedNumberField {
        &self.field
    }

    pub fn certificate(&self) -> &MaximalOrderCertificate {
        &self.certificate
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreparationError {
    NonMonic,
    NotReal,
    NoIrreducibilityWitness,
    DiscriminantOutsideQualificationRange,
    NonSquarefreeDiscriminant { repeated_prime: u64 },
    RootValidation(PreparedNumberFieldValidationError),
}

impl fmt::Display for PreparationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for PreparationError {}

/// Prepare a real monic quadratic whose squarefree equation-order
/// discriminant proves that its power basis is the maximal order.
pub fn prepare_public_real_quadratic(
    input: PublicQuadraticInput,
) -> Result<PreparedMaximalQuadratic, PreparationError> {
    let [constant, linear, leading] = input.polynomial_ascending;
    if leading != 1 {
        return Err(PreparationError::NonMonic);
    }
    let discriminant = Integer::from(linear).square() - 4 * constant;
    if discriminant <= 0 {
        return Err(PreparationError::NotReal);
    }
    let irreducibility_prime = (2_u32..=257)
        .filter(|value| is_prime(u64::from(*value)))
        .find(|prime| !has_root_mod_prime(input.polynomial_ascending, *prime))
        .ok_or(PreparationError::NoIrreducibilityWitness)?;
    let machine_discriminant = discriminant
        .to_u64()
        .ok_or(PreparationError::DiscriminantOutsideQualificationRange)?;
    let prime_factors = squarefree_factorization(machine_discriminant)?;

    // In the basis (1, alpha), alpha^2 = -constant - linear*alpha.
    let multiplication_table = vec![
        Integer::from(1),
        Integer::from(0),
        Integer::from(0),
        Integer::from(1),
        Integer::from(0),
        Integer::from(1),
        Integer::from(-constant),
        Integer::from(-linear),
    ];
    let data = PreparedNumberFieldData {
        polynomial_ascending: input.polynomial_ascending.map(Integer::from).to_vec(),
        irreducibility_prime,
        integral_basis_numerators: vec![
            Integer::from(1),
            Integer::from(0),
            Integer::from(0),
            Integer::from(1),
        ],
        basis_denominator: Integer::from(1),
        multiplication_table,
        discriminant: discriminant.clone(),
        signature: (2, 0),
        embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 192 },
        index_primes: vec![],
    };
    let field =
        ValidatedPreparedNumberField::validate(data).map_err(PreparationError::RootValidation)?;
    Ok(PreparedMaximalQuadratic {
        field,
        certificate: MaximalOrderCertificate {
            discriminant,
            prime_factors: prime_factors.into_iter().map(Integer::from).collect(),
        },
    })
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundaryReport {
    pub schema: &'static str,
    pub field_id: &'static str,
    pub polynomial_ascending: [i64; 3],
    pub degree: usize,
    pub signature: [u8; 2],
    pub discriminant: String,
    pub maximal_order_certificate_verified: bool,
    pub runtime_uses_pari_or_fixture_data: bool,
    pub status: &'static str,
    pub first_unsupported_boundary: UnsupportedBoundary,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedBoundary {
    pub entry_point: &'static str,
    pub available_input_type: &'static str,
    pub required_input_type: &'static str,
    pub consequence: &'static str,
}

pub fn qualify_case(input: PublicQuadraticInput) -> Result<BoundaryReport, PreparationError> {
    let prepared = prepare_public_real_quadratic(input)?;
    Ok(BoundaryReport {
        schema: "sagejs.rust-class-group/public-quadratic-boundary-v1",
        field_id: input.id,
        polynomial_ascending: input.polynomial_ascending,
        degree: prepared.field().degree(),
        signature: [
            prepared.field().data().signature.0,
            prepared.field().data().signature.1,
        ],
        discriminant: prepared.field().data().discriminant.to_string(),
        maximal_order_certificate_verified: prepared.certificate().verify(),
        runtime_uses_pari_or_fixture_data: false,
        status: "unsupported-before-class-group-engine",
        first_unsupported_boundary: UnsupportedBoundary {
            entry_point: ENGINE_ENTRY_POINT,
            available_input_type: AVAILABLE_PREPARED_TYPE,
            required_input_type: ENGINE_REQUIRED_TYPE,
            consequence: "no existing degree-2 factor base, ideal arithmetic, relation collector, completion proof, or exact public class-group result",
        },
    })
}

fn has_root_mod_prime(polynomial: [i64; 3], prime: u32) -> bool {
    (0..prime).any(|root| {
        let modulus = i64::from(prime);
        let root = i64::from(root);
        polynomial.iter().rev().fold(0_i64, |value, coefficient| {
            (value * root + coefficient).rem_euclid(modulus)
        }) == 0
    })
}

fn squarefree_factorization(mut value: u64) -> Result<Vec<u64>, PreparationError> {
    let mut factors = Vec::new();
    let mut candidate = 2_u64;
    while candidate <= value / candidate {
        if value.is_multiple_of(candidate) {
            value /= candidate;
            if value.is_multiple_of(candidate) {
                return Err(PreparationError::NonSquarefreeDiscriminant {
                    repeated_prime: candidate,
                });
            }
            factors.push(candidate);
        }
        candidate += if candidate == 2 { 1 } else { 2 };
    }
    if value > 1 {
        factors.push(value);
    }
    Ok(factors)
}

fn is_prime(value: u64) -> bool {
    if value < 2 {
        return false;
    }
    if value.is_multiple_of(2) {
        return value == 2;
    }
    let mut divisor = 3_u64;
    while divisor <= value / divisor {
        if value.is_multiple_of(divisor) {
            return false;
        }
        divisor += 2;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use sagejs_pari_class_group_rust_experiment::{
        PreparedFactorBase, PreparedFactorBaseError, ValidatedPreparedCubic,
        prepared_maximal_cubic_factor_base,
    };

    #[test]
    fn all_public_cases_reach_replay_validated_maximal_orders() {
        for input in REAL_QUADRATIC_CASES {
            let prepared = prepare_public_real_quadratic(input).unwrap();
            assert_eq!(prepared.field().degree(), 2);
            assert_eq!(prepared.field().equation_order_index(), &Integer::from(1));
            assert!(prepared.certificate().verify());
        }
    }

    #[test]
    fn locks_the_existing_engine_entry_point_to_its_actual_cubic_type() {
        let _: fn(&ValidatedPreparedCubic) -> Result<PreparedFactorBase, PreparedFactorBaseError> =
            prepared_maximal_cubic_factor_base;
    }

    #[test]
    fn fails_closed_when_power_basis_maximality_is_not_proved() {
        let result = prepare_public_real_quadratic(PublicQuadraticInput {
            id: "nonmaximal-power-basis",
            polynomial_ascending: [-2, 0, 1],
        });
        assert_eq!(
            result,
            Err(PreparationError::NonSquarefreeDiscriminant { repeated_prime: 2 })
        );
    }
}
