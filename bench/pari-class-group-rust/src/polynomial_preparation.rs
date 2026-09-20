// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Rust-owned, fail-closed preparation for bounded public monic cubics.
//!
//! A squarefree equation-order discriminant proves that the power-basis order
//! is maximal: the square of its index in the maximal order divides the
//! equation-order discriminant.  This module uses that theorem to construct a
//! [`ValidatedPreparedCubic`] directly from polynomial coefficients, without
//! PARI, a prepared fixture, or a field-specific table.  A broader bounded
//! route factors the equation discriminant and proves maximality by exhaustive
//! `p`-power superlattice enumeration through the discriminant valuation bound.
//!
//! The squarefreeness proof is deliberately bounded.  It performs exact trial
//! division and a deterministic `u64` primality test for the final cofactor.
//! Inputs outside that proof envelope return a resource-limit error rather than
//! being treated as maximal.

use crate::{
    EmbeddingPrecisionState, PreparedCubicData, PreparedCubicValidationError,
    ValidatedPreparedCubic,
};
use rug::{Complete, Integer, ops::Pow};
use std::fmt;

const MAXIMUM_SAFE_TRIAL_DIVISOR: u64 = 10_000_000;

/// Resource limits for exact public-polynomial preparation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PublicCubicPreparationLimits {
    /// Maximum absolute coefficient size admitted before any factorization.
    pub maximum_coefficient_bits: u32,
    /// Largest trial divisor used by the exact squarefreeness proof.
    pub maximum_trial_divisor: u64,
    /// Largest rational prime searched for an irreducibility witness.
    pub maximum_irreducibility_prime: u32,
    /// Requested precision carried to the later numerical-preparation stage.
    pub embedding_precision_bits: u32,
    /// Largest prime for which every bounded `p`-power superlattice is enumerated.
    pub maximum_overorder_prime: u64,
    /// Total number of `p`-power superlattice candidates admitted by one call.
    pub maximum_overorder_candidates: u64,
}

impl Default for PublicCubicPreparationLimits {
    fn default() -> Self {
        Self {
            maximum_coefficient_bits: 128,
            maximum_trial_divisor: 1_000_003,
            // An irreducible cubic normally obtains a witness almost
            // immediately.  Keeping the default bounded also makes a
            // reducible input fail promptly instead of scanning large fields.
            maximum_irreducibility_prime: 257,
            embedding_precision_bits: 192,
            maximum_overorder_prime: 257,
            maximum_overorder_candidates: 250_000,
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
    CoefficientLimit {
        index: usize,
        bits: u32,
        maximum_bits: u32,
    },
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
    MaximalOrderProofLimit {
        prime: Integer,
        required_candidates: Option<u64>,
    },
    DiscriminantFactorizationLimit {
        unfactored_cofactor: Integer,
    },
    MaximalOrderConstructionFailed,
    Validation(PreparedCubicValidationError),
}

/// Exhaustion evidence for one rational prime in a cubic maximal-order proof.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CubicLocalMaximalityCertificate {
    pub prime: u64,
    pub maximum_index_exponent: u32,
    pub selected_index_exponent: u32,
    pub enumerated_superlattices: u64,
}

/// Replayable evidence used by the bounded general cubic route.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CubicMaximalOrderCertificate {
    polynomial_ascending: [Integer; 4],
    equation_discriminant: Integer,
    factorization: Vec<(Integer, u32)>,
    local_certificates: Vec<CubicLocalMaximalityCertificate>,
}

impl CubicMaximalOrderCertificate {
    pub fn equation_discriminant(&self) -> &Integer {
        &self.equation_discriminant
    }

    pub fn factorization(&self) -> &[(Integer, u32)] {
        &self.factorization
    }

    pub fn local_certificates(&self) -> &[CubicLocalMaximalityCertificate] {
        &self.local_certificates
    }

    /// Check only the exact factorization identity. Use [`Self::verify`] for
    /// the full primality, local-maximality, basis, table, and field replay.
    pub fn factorization_identity_holds(&self) -> bool {
        let mut product = Integer::from(1);
        for (prime, exponent) in &self.factorization {
            product *= prime.clone().pow(*exponent);
        }
        product == self.equation_discriminant.clone().abs()
    }

    /// Independently rerun factorization, every bounded `p`-power
    /// superlattice exhaustion, exact table construction, and prepared-field
    /// validation, then compare the complete result and proof transcript.
    pub fn verify(
        &self,
        field: &ValidatedPreparedCubic,
        limits: PublicCubicPreparationLimits,
    ) -> bool {
        if !self.factorization_identity_holds()
            || self.local_certificates.iter().any(|local| {
                local.selected_index_exponent > local.maximum_index_exponent
                    || p_power_superlattice_count(local.prime, local.maximum_index_exponent)
                        != Some(local.enumerated_superlattices)
            })
            || ValidatedPreparedCubic::validate(field.data().clone()).as_ref() != Ok(field)
        {
            return false;
        }
        prepare_monic_cubic_internal(self.polynomial_ascending.clone(), limits)
            .is_ok_and(|replayed| replayed.field == *field && replayed.certificate == *self)
    }
}

/// A public-polynomial preparation whose represented order was proved maximal
/// by an exhaustive bounded cubic overorder search.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedPublicCubic {
    field: ValidatedPreparedCubic,
    certificate: CubicMaximalOrderCertificate,
}

impl PreparedPublicCubic {
    pub fn field(&self) -> &ValidatedPreparedCubic {
        &self.field
    }

    pub fn into_field(self) -> ValidatedPreparedCubic {
        self.field
    }

    pub fn maximal_order_certificate(&self) -> &CubicMaximalOrderCertificate {
        &self.certificate
    }
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
    if !(2..=MAXIMUM_SAFE_TRIAL_DIVISOR).contains(&limits.maximum_trial_divisor)
        || limits.maximum_irreducibility_prime < 2
        || limits.embedding_precision_bits == 0
        || limits.maximum_overorder_prime < 2
        || limits.maximum_overorder_candidates == 0
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

#[derive(Clone, Debug, Eq, PartialEq)]
struct RationalCubicBasis {
    numerators: [Integer; 9],
    denominator: Integer,
}

/// Prepare a public irreducible monic cubic, including bounded nontrivial
/// equation-order indices.
///
/// For every prime whose square divides the equation-order discriminant, this
/// enumerates every `p`-power superlattice through index
/// `p^floor(v_p(discriminant)/2)`. A lattice is accepted only when an exact
/// multiplication-table reconstruction proves it is an order. No larger
/// integral overorder can exist because its squared index would divide the
/// equation-order discriminant. Any factorization or enumeration outside the
/// explicit limits fails closed.
pub fn prepare_monic_cubic(
    polynomial_ascending: [Integer; 4],
    limits: PublicCubicPreparationLimits,
) -> Result<PreparedPublicCubic, PublicCubicPreparationError> {
    prepare_monic_cubic_internal(polynomial_ascending, limits)
}

fn prepare_monic_cubic_internal(
    polynomial_ascending: [Integer; 4],
    limits: PublicCubicPreparationLimits,
) -> Result<PreparedPublicCubic, PublicCubicPreparationError> {
    if polynomial_ascending[3] != 1 {
        return Err(PublicCubicPreparationError::NonMonicPolynomial);
    }
    for (index, coefficient) in polynomial_ascending.iter().enumerate() {
        let bits = coefficient.significant_bits();
        if bits > limits.maximum_coefficient_bits {
            return Err(PublicCubicPreparationError::CoefficientLimit {
                index,
                bits,
                maximum_bits: limits.maximum_coefficient_bits,
            });
        }
    }
    if !(2..=MAXIMUM_SAFE_TRIAL_DIVISOR).contains(&limits.maximum_trial_divisor)
        || limits.maximum_irreducibility_prime < 2
        || limits.embedding_precision_bits == 0
        || limits.maximum_coefficient_bits == 0
        || limits.maximum_overorder_prime < 2
        || limits.maximum_overorder_candidates == 0
    {
        return Err(PublicCubicPreparationError::InvalidLimits);
    }
    let equation_discriminant = cubic_discriminant(&polynomial_ascending);
    if equation_discriminant == 0 {
        return Err(PublicCubicPreparationError::InseparablePolynomial);
    }
    let irreducibility_prime =
        irreducibility_witness(&polynomial_ascending, limits.maximum_irreducibility_prime).ok_or(
            PublicCubicPreparationError::NoIrreducibilityWitness {
                maximum_prime: limits.maximum_irreducibility_prime,
            },
        )?;
    let factorization = factor_integer_exact(
        equation_discriminant.clone().abs(),
        limits.maximum_trial_divisor,
    )?;

    let mut basis = RationalCubicBasis {
        numerators: identity_basis(),
        denominator: Integer::from(1),
    };
    let mut local_certificates = Vec::new();
    let mut candidates_used = 0_u64;
    for (prime, exponent) in &factorization {
        if *exponent < 2 {
            continue;
        }
        let Some(machine_prime) = prime.to_u64() else {
            return Err(PublicCubicPreparationError::MaximalOrderProofLimit {
                prime: prime.clone(),
                required_candidates: None,
            });
        };
        if machine_prime > limits.maximum_overorder_prime {
            return Err(PublicCubicPreparationError::MaximalOrderProofLimit {
                prime: prime.clone(),
                required_candidates: None,
            });
        }
        let maximum_index_exponent = exponent / 2;
        let remaining_budget = limits
            .maximum_overorder_candidates
            .checked_sub(candidates_used)
            .ok_or(PublicCubicPreparationError::MaximalOrderProofLimit {
                prime: prime.clone(),
                required_candidates: None,
            })?;
        let (enlarged, selected_index_exponent, enumerated) = maximal_integral_p_power_overorder(
            &basis,
            &polynomial_ascending,
            machine_prime,
            maximum_index_exponent,
            remaining_budget,
        )
        .map_err(
            |required_candidates| PublicCubicPreparationError::MaximalOrderProofLimit {
                prime: prime.clone(),
                required_candidates,
            },
        )?;
        candidates_used += enumerated;
        basis = enlarged;
        local_certificates.push(CubicLocalMaximalityCertificate {
            prime: machine_prime,
            maximum_index_exponent,
            selected_index_exponent,
            enumerated_superlattices: enumerated,
        });
    }

    let index =
        basis_index(&basis).ok_or(PublicCubicPreparationError::MaximalOrderConstructionFailed)?;
    let index_squared = index.clone().square();
    if equation_discriminant.clone() % &index_squared != 0 {
        return Err(PublicCubicPreparationError::MaximalOrderConstructionFailed);
    }
    let discriminant = equation_discriminant.clone() / index_squared;
    let multiplication_table = multiplication_table_for_basis(&basis, &polynomial_ascending)
        .ok_or(PublicCubicPreparationError::MaximalOrderConstructionFailed)?;
    let index_primes = factorization
        .iter()
        .filter(|(prime, _)| index.clone() % prime == 0)
        .map(|(prime, _)| prime.clone())
        .collect();
    let data = PreparedCubicData {
        polynomial_ascending,
        irreducibility_prime,
        integral_basis_numerators: basis.numerators,
        basis_denominator: basis.denominator,
        multiplication_table,
        discriminant: discriminant.clone(),
        signature: if discriminant > 0 { (3, 0) } else { (1, 1) },
        embedding_precision: EmbeddingPrecisionState::Pending {
            target_bits: limits.embedding_precision_bits,
        },
        index_primes,
    };
    let field =
        ValidatedPreparedCubic::validate(data).map_err(PublicCubicPreparationError::Validation)?;
    let certificate_polynomial = field.data().polynomial_ascending.clone();
    Ok(PreparedPublicCubic {
        field,
        certificate: CubicMaximalOrderCertificate {
            polynomial_ascending: certificate_polynomial,
            equation_discriminant,
            factorization,
            local_certificates,
        },
    })
}

fn determinant(rows: &[Integer; 9]) -> Integer {
    rows[0].clone() * (rows[4].clone() * &rows[8] - rows[5].clone() * &rows[7])
        - rows[1].clone() * (rows[3].clone() * &rows[8] - rows[5].clone() * &rows[6])
        + rows[2].clone() * (rows[3].clone() * &rows[7] - rows[4].clone() * &rows[6])
}

fn basis_index(basis: &RationalCubicBasis) -> Option<Integer> {
    let determinant = determinant(&basis.numerators).abs();
    if determinant == 0 {
        return None;
    }
    let numerator = basis.denominator.clone().pow(3_u32);
    if numerator.clone() % &determinant != 0 {
        return None;
    }
    Some(numerator / determinant)
}

fn normalized_basis(mut basis: RationalCubicBasis) -> RationalCubicBasis {
    let mut common = basis.denominator.clone().abs();
    for value in &basis.numerators {
        common.gcd_mut(value);
    }
    if common > 1 {
        basis.denominator /= &common;
        for value in &mut basis.numerators {
            *value /= &common;
        }
    }
    if basis.denominator < 0 {
        basis.denominator = -basis.denominator;
        for value in &mut basis.numerators {
            *value = -value.clone();
        }
    }
    basis
}

fn p_power(value: u64, exponent: u32) -> Option<u64> {
    value.checked_pow(exponent)
}

fn p_power_superlattice_count(prime: u64, maximum_exponent: u32) -> Option<u64> {
    let mut total = 0_u64;
    for exponent in 1..=maximum_exponent {
        for first in 0..=exponent {
            for second in 0..=(exponent - first) {
                let third = exponent - first - second;
                let count = p_power(prime, second.checked_add(2_u32.checked_mul(third)?)?)?;
                total = total.checked_add(count)?;
            }
        }
    }
    Some(total)
}

fn p_power_superlattice_basis(
    basis: &RationalCubicBasis,
    diagonal: [u64; 3],
    upper: [u64; 3],
) -> RationalCubicBasis {
    let [a, b, c] = diagonal;
    let [u, v, w] = upper;
    // If H=[[a,u,v],[0,b,w],[0,0,c]] is the canonical row-HNF
    // basis of the dual sublattice, the desired superlattice basis is
    // (H^T)^-1.  The following is det(H)*(H^T)^-1.
    let change = [
        Integer::from(b) * c,
        Integer::from(0),
        Integer::from(0),
        -(Integer::from(u) * c),
        Integer::from(a) * c,
        Integer::from(0),
        Integer::from(u) * w - Integer::from(v) * b,
        -(Integer::from(a) * w),
        Integer::from(a) * b,
    ];
    let mut numerators: [Integer; 9] = std::array::from_fn(|_| Integer::new());
    for row in 0..3 {
        for source in 0..3 {
            for column in 0..3 {
                numerators[3 * row + column] +=
                    &change[3 * row + source] * &basis.numerators[3 * source + column];
            }
        }
    }
    normalized_basis(RationalCubicBasis {
        numerators,
        denominator: basis.denominator.clone() * a * b * c,
    })
}

fn maximal_integral_p_power_overorder(
    basis: &RationalCubicBasis,
    polynomial: &[Integer; 4],
    prime: u64,
    maximum_exponent: u32,
    candidate_budget: u64,
) -> Result<(RationalCubicBasis, u32, u64), Option<u64>> {
    let required = p_power_superlattice_count(prime, maximum_exponent).ok_or(None)?;
    if required > candidate_budget {
        return Err(Some(required));
    }
    let base_index = basis_index(basis).ok_or(None)?;
    let mut selected = basis.clone();
    let mut selected_exponent = 0_u32;
    let mut enumerated = 0_u64;
    for total in 1..=maximum_exponent {
        for first in 0..=total {
            for second in 0..=(total - first) {
                let third = total - first - second;
                let a = p_power(prime, first).ok_or(None)?;
                let b = p_power(prime, second).ok_or(None)?;
                let c = p_power(prime, third).ok_or(None)?;
                for u in 0..b {
                    for v in 0..c {
                        for w in 0..c {
                            enumerated = enumerated.checked_add(1).ok_or(None)?;
                            let candidate = p_power_superlattice_basis(basis, [a, b, c], [u, v, w]);
                            let Some(candidate_index) = basis_index(&candidate) else {
                                continue;
                            };
                            let expected = base_index.clone() * Integer::from(prime).pow(total);
                            if candidate_index != expected {
                                continue;
                            }
                            if multiplication_table_for_basis(&candidate, polynomial).is_some() {
                                selected = candidate;
                                selected_exponent = total;
                            }
                        }
                    }
                }
            }
        }
    }
    if enumerated != required {
        return Err(None);
    }
    Ok((selected, selected_exponent, enumerated))
}

fn reduced_product(left: &[Integer], right: &[Integer], polynomial: &[Integer; 4]) -> [Integer; 3] {
    let mut raw: [Integer; 5] = std::array::from_fn(|_| Integer::new());
    for i in 0..3 {
        for j in 0..3 {
            raw[i + j] += left[i].clone() * &right[j];
        }
    }
    for power in (3..=4).rev() {
        let leading = raw[power].clone();
        for lower in 0..3 {
            raw[power - 3 + lower] -= leading.clone() * &polynomial[lower];
        }
    }
    std::array::from_fn(|index| raw[index].clone())
}

fn coordinates_in_basis(
    vector_numerator: &[Integer; 3],
    basis: &RationalCubicBasis,
) -> Option<[Integer; 3]> {
    let basis_determinant = determinant(&basis.numerators);
    if basis_determinant == 0 {
        return None;
    }
    let denominator = basis.denominator.clone() * &basis_determinant;
    let mut answer: [Integer; 3] = std::array::from_fn(|_| Integer::new());
    for row in 0..3 {
        let mut replaced = basis.numerators.clone();
        for column in 0..3 {
            replaced[3 * row + column] = vector_numerator[column].clone();
        }
        let numerator = determinant(&replaced);
        if numerator.clone() % &denominator != 0 {
            return None;
        }
        answer[row] = numerator / &denominator;
    }
    Some(answer)
}

fn multiplication_table_for_basis(
    basis: &RationalCubicBasis,
    polynomial: &[Integer; 4],
) -> Option<[Integer; 27]> {
    let mut table: [Integer; 27] = std::array::from_fn(|_| Integer::new());
    for left in 0..3 {
        for right in 0..3 {
            let product = reduced_product(
                &basis.numerators[3 * left..3 * left + 3],
                &basis.numerators[3 * right..3 * right + 3],
                polynomial,
            );
            let coordinates = coordinates_in_basis(&product, basis)?;
            for coordinate in 0..3 {
                table[9 * left + 3 * right + coordinate] = coordinates[coordinate].clone();
            }
        }
    }
    Some(table)
}

fn integer_pow_mod(base: &Integer, exponent: &Integer, modulus: &Integer) -> Integer {
    let mut answer = Integer::from(1);
    let mut power = base.clone() % modulus;
    let mut remaining = exponent.clone();
    while remaining > 0 {
        if remaining.is_odd() {
            answer = (answer * &power) % modulus;
        }
        remaining >>= 1;
        if remaining > 0 {
            power = power.clone().square() % modulus;
        }
    }
    answer
}

fn pocklington_proves_prime(value: &Integer, maximum_trial_divisor: u64, depth: usize) -> bool {
    if depth > 64 || value < &2 {
        return false;
    }
    if let Some(machine) = value.to_u64() {
        return is_prime_u64(machine);
    }
    for small in [2_u64, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37] {
        if value.clone() % small == 0 {
            return false;
        }
    }
    let predecessor: Integer = value.clone() - 1;
    let Ok(factors) =
        factor_integer_exact_inner(predecessor.clone(), maximum_trial_divisor, depth + 1)
    else {
        return false;
    };
    // Complete factorization of n-1 is stronger than the usual F > sqrt(n)
    // hypothesis.  Separate bases are allowed for its distinct prime factors.
    for (prime, _) in factors {
        let exponent: Integer = predecessor.clone() / &prime;
        let mut witnessed = false;
        for base in 2_u32..=256 {
            let base = Integer::from(base);
            if integer_pow_mod(&base, &predecessor, value) != 1 {
                continue;
            }
            let residue: Integer = integer_pow_mod(&base, &exponent, value) - 1;
            if residue.gcd_ref(value).complete() == 1 {
                witnessed = true;
                break;
            }
        }
        if !witnessed {
            return false;
        }
    }
    true
}

fn pollard_rho(value: &Integer) -> Option<Integer> {
    if value.is_even() {
        return Some(Integer::from(2));
    }
    // Deterministic seeds and a hard iteration ceiling make failure a resource
    // outcome, never permission to treat a probable prime as proved.
    for constant in 1_u32..=32 {
        let c = Integer::from(constant);
        let mut x = Integer::from(2 + constant);
        let mut y = x.clone();
        for _ in 0..200_000 {
            x = (x.square() + &c) % value;
            y = (y.square() + &c) % value;
            y = (y.square() + &c) % value;
            let difference: Integer = if x >= y {
                x.clone() - &y
            } else {
                y.clone() - &x
            };
            let divisor = difference.gcd_ref(value).complete();
            if divisor > 1 && divisor < *value {
                return Some(divisor);
            }
            if divisor == *value {
                break;
            }
        }
    }
    None
}

fn factor_integer_exact(
    value: Integer,
    maximum_trial_divisor: u64,
) -> Result<Vec<(Integer, u32)>, PublicCubicPreparationError> {
    factor_integer_exact_inner(value, maximum_trial_divisor, 0).map_err(|remaining| {
        PublicCubicPreparationError::DiscriminantFactorizationLimit {
            unfactored_cofactor: remaining,
        }
    })
}

fn factor_integer_exact_inner(
    mut value: Integer,
    maximum_trial_divisor: u64,
    depth: usize,
) -> Result<Vec<(Integer, u32)>, Integer> {
    if depth > 64 {
        return Err(value);
    }
    let mut flat = Vec::new();
    let mut divisor = 2_u64;
    while divisor <= maximum_trial_divisor {
        while value.clone() % divisor == 0 {
            flat.push(Integer::from(divisor));
            value /= divisor;
        }
        if value == 1 {
            break;
        }
        if let Some(machine) = value.to_u64()
            && is_prime_u64(machine)
        {
            flat.push(value);
            value = Integer::from(1);
            break;
        }
        divisor = if divisor == 2 {
            3
        } else {
            divisor.checked_add(2).ok_or_else(|| value.clone())?
        };
    }
    if value > 1 {
        if pocklington_proves_prime(&value, maximum_trial_divisor, depth + 1) {
            flat.push(value);
        } else {
            let factor = pollard_rho(&value).ok_or_else(|| value.clone())?;
            for (prime, exponent) in
                factor_integer_exact_inner(factor.clone(), maximum_trial_divisor, depth + 1)?
            {
                flat.extend(std::iter::repeat_n(prime, exponent as usize));
            }
            for (prime, exponent) in
                factor_integer_exact_inner(value / factor, maximum_trial_divisor, depth + 1)?
            {
                flat.extend(std::iter::repeat_n(prime, exponent as usize));
            }
        }
    }
    flat.sort();
    let mut result: Vec<(Integer, u32)> = Vec::new();
    for prime in flat {
        if let Some((previous, exponent)) = result.last_mut()
            && previous == &prime
        {
            *exponent += 1;
        } else {
            result.push((prime, 1));
        }
    }
    Ok(result)
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

    #[test]
    fn maximal_order_certificate_replay_rejects_counterfeit_transcripts() {
        let limits = PublicCubicPreparationLimits::default();
        let prepared = prepare_monic_cubic(integers([-178, 87, -99, 1]), limits).unwrap();
        assert!(prepared.certificate.verify(&prepared.field, limits));

        let mut bad_factorization = prepared.certificate.clone();
        bad_factorization.factorization[0].1 += 1;
        assert!(!bad_factorization.verify(&prepared.field, limits));

        let mut bad_local_exhaustion = prepared.certificate.clone();
        bad_local_exhaustion.local_certificates[0].enumerated_superlattices += 1;
        assert!(!bad_local_exhaustion.verify(&prepared.field, limits));

        let other = prepare_monic_cubic(integers([1, 1, 0, 1]), limits).unwrap();
        assert!(!prepared.certificate.verify(&other.field, limits));
    }
}
