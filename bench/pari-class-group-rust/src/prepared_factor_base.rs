// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact factor bases for rational integral cubic bases.
//!
//! Ordinary primes are obtained from the defining polynomial and converted
//! into ideals `p O + g(alpha) O` in the validated maximal-order basis.  Index
//! primes do not use the invalid equation-order factorization: the current
//! exact corridor enumerates degree-one residue characters and admits only a
//! decomposition whose dimension accounting is unambiguous.

use rug::{Integer, ops::Pow};

use crate::factor_base::{
    FactorBase, PrimeIdeal, prepared_cubic_bounds_for_discriminant, prepared_cubic_factor_pattern,
    rational_primes_through,
};
use crate::prepared::ValidatedPreparedCubic;
use crate::prepared_ideal::{
    CubicIdeal, DegreeOnePrimeCharacter, PreparedIdealError, PreparedIdealWorkspace,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreparedFactorBaseError {
    CoefficientOutsideI64,
    DiscriminantOutsideI128,
    IndexPrimeOutsideU32,
    IndexPrimeCharacterSearchTooLarge {
        prime: u32,
        limit: u32,
    },
    AmbiguousIndexPrimeDecomposition {
        prime: u32,
        degree_one_primes: usize,
    },
    IdealNormMismatch {
        prime: i64,
        expected: Integer,
        actual: Integer,
    },
    IdealEntryOutsideI64,
    RelationStorageMismatch,
    InvalidRationalFactor {
        prime: i64,
        exponent: usize,
    },
    RationalFactorsOutOfOrder {
        previous: i64,
        current: i64,
    },
    PrimeMissingFromFactorBase(i64),
    NormValuationMismatch {
        prime: i64,
        expected: usize,
        accounted: usize,
    },
    ValuationOutsideI64,
    Ideal(PreparedIdealError),
}

impl From<PreparedIdealError> for PreparedFactorBaseError {
    fn from(value: PreparedIdealError) -> Self {
        Self::Ideal(value)
    }
}

#[derive(Clone, Debug)]
pub struct PreparedFactorBase {
    pub catalog: FactorBase,
    pub exact_ideals: Vec<CubicIdeal>,
}

impl PreparedFactorBase {
    /// Refine the factorization of `Norm(element) / Norm(divisor)` and add it
    /// to the already known factorization of `divisor`.
    ///
    /// Random relation search deliberately uses composite factor-base ideals.
    /// Factoring the full element norm would reject rational primes whose
    /// omitted conjugate factors lie beyond the active factor-base bound.
    /// PARI instead factors the quotient norm and carries the divisor
    /// exponents separately; this is the exact maximal-order equivalent.
    pub fn refine_quotient_factorization(
        &self,
        field: &ValidatedPreparedCubic,
        element: &[Integer; 3],
        rational_factors: &[(i64, usize)],
        divisor: &[i64],
        relation: &mut [i64],
        workspace: &mut PreparedIdealWorkspace,
    ) -> Result<(), PreparedFactorBaseError> {
        if relation.len() != self.catalog.ideals.len() || divisor.len() != relation.len() {
            return Err(PreparedFactorBaseError::RelationStorageMismatch);
        }
        relation.copy_from_slice(divisor);
        let mut previous = 0;
        for &(prime, exponent) in rational_factors {
            if prime < 2 || exponent == 0 {
                return Err(PreparedFactorBaseError::InvalidRationalFactor { prime, exponent });
            }
            if prime <= previous {
                return Err(PreparedFactorBaseError::RationalFactorsOutOfOrder {
                    previous,
                    current: prime,
                });
            }
            previous = prime;
            let group = self
                .catalog
                .rational_primes
                .binary_search(&prime)
                .map_err(|_| PreparedFactorBaseError::PrimeMissingFromFactorBase(prime))?;
            let offset = self.catalog.rational_offsets[group];
            let count = self.catalog.rational_counts[group];
            let mut accounted = 0_usize;
            let mut remaining = exponent;
            for index in offset..offset + count {
                let known = usize::try_from(divisor[index])
                    .map_err(|_| PreparedFactorBaseError::ValuationOutsideI64)?;
                let residue_degree = self.catalog.ideals[index].residue_degree;
                let additional_cap = remaining / residue_degree;
                let cap = known
                    .checked_add(additional_cap)
                    .ok_or(PreparedFactorBaseError::ValuationOutsideI64)?;
                let full = workspace.valuation_capped_by_norm(
                    field,
                    &self.exact_ideals[index],
                    element,
                    u32::try_from(cap).map_err(|_| PreparedFactorBaseError::ValuationOutsideI64)?,
                )? as usize;
                let quotient = full.checked_sub(known).ok_or(
                    PreparedFactorBaseError::NormValuationMismatch {
                        prime,
                        expected: exponent,
                        accounted: 0,
                    },
                )?;
                let contribution = residue_degree
                    .checked_mul(quotient)
                    .ok_or(PreparedFactorBaseError::ValuationOutsideI64)?;
                accounted = accounted
                    .checked_add(contribution)
                    .ok_or(PreparedFactorBaseError::ValuationOutsideI64)?;
                remaining = remaining.checked_sub(contribution).ok_or(
                    PreparedFactorBaseError::NormValuationMismatch {
                        prime,
                        expected: exponent,
                        accounted,
                    },
                )?;
                relation[index] = i64::try_from(full)
                    .map_err(|_| PreparedFactorBaseError::ValuationOutsideI64)?;
            }
            if accounted != exponent || remaining != 0 {
                return Err(PreparedFactorBaseError::NormValuationMismatch {
                    prime,
                    expected: exponent,
                    accounted,
                });
            }
        }
        Ok(())
    }

    /// Refine a rational norm factorization using exact ideal-power
    /// membership in the validated maximal-order basis.
    pub fn refine_element_factorization(
        &self,
        field: &ValidatedPreparedCubic,
        element: &[Integer; 3],
        rational_factors: &[(i64, usize)],
        relation: &mut [i64],
        workspace: &mut PreparedIdealWorkspace,
    ) -> Result<(), PreparedFactorBaseError> {
        if relation.len() != self.catalog.ideals.len() {
            return Err(PreparedFactorBaseError::RelationStorageMismatch);
        }
        relation.fill(0);
        let mut previous = 0;
        for &(prime, exponent) in rational_factors {
            if prime < 2 || exponent == 0 {
                return Err(PreparedFactorBaseError::InvalidRationalFactor { prime, exponent });
            }
            if prime <= previous {
                return Err(PreparedFactorBaseError::RationalFactorsOutOfOrder {
                    previous,
                    current: prime,
                });
            }
            previous = prime;
            let group = self
                .catalog
                .rational_primes
                .binary_search(&prime)
                .map_err(|_| PreparedFactorBaseError::PrimeMissingFromFactorBase(prime))?;
            let offset = self.catalog.rational_offsets[group];
            let count = self.catalog.rational_counts[group];
            let mut accounted = 0_usize;
            for index in offset..offset + count {
                let valuation = workspace.valuation(
                    field,
                    &self.exact_ideals[index],
                    element,
                    u32::try_from(exponent + 1).unwrap_or(u32::MAX),
                )? as usize;
                accounted = accounted
                    .checked_add(self.catalog.ideals[index].residue_degree * valuation)
                    .ok_or(PreparedFactorBaseError::ValuationOutsideI64)?;
                relation[index] = i64::try_from(valuation)
                    .map_err(|_| PreparedFactorBaseError::ValuationOutsideI64)?;
            }
            if accounted != exponent {
                return Err(PreparedFactorBaseError::NormValuationMismatch {
                    prime,
                    expected: exponent,
                    accounted,
                });
            }
        }
        Ok(())
    }
}

const INDEX_CHARACTER_SEARCH_LIMIT: u32 = 257;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CubicSplittingRecord {
    pub prime: i64,
    /// `(ramification index, residue degree)` for every prime above `prime`.
    pub factors: Vec<(usize, usize)>,
}

/// Return exact maximal-order splitting types for all rational primes below
/// `bound`. Ordinary primes use Dedekind factorization; explicitly recorded
/// index primes use the validated maximal-order residue characters instead.
pub fn prepared_cubic_splitting_records(
    field: &ValidatedPreparedCubic,
    bound: usize,
) -> Result<Vec<CubicSplittingRecord>, PreparedFactorBaseError> {
    let polynomial: [i64; 4] = field
        .data()
        .polynomial_ascending
        .iter()
        .map(|value| {
            value
                .to_i64()
                .ok_or(PreparedFactorBaseError::CoefficientOutsideI64)
        })
        .collect::<Result<Vec<_>, _>>()?
        .try_into()
        .expect("cubic has four coefficients");
    let mut workspace = PreparedIdealWorkspace::new();
    let mut answer = Vec::new();
    if bound <= 2 {
        return Ok(answer);
    }
    for prime in rational_primes_through(bound - 1) {
        let factors = if field
            .data()
            .index_primes
            .iter()
            .any(|index_prime| index_prime == &prime)
        {
            index_prime_descriptors(field, prime, &mut workspace)?
                .into_iter()
                .map(|(descriptor, _ideal)| (descriptor.ramification, descriptor.residue_degree))
                .collect()
        } else {
            prepared_cubic_factor_pattern(polynomial, prime)
                .into_iter()
                .map(|(factor, ramification)| (ramification, factor.len() - 1))
                .collect()
        };
        answer.push(CubicSplittingRecord { prime, factors });
    }
    Ok(answer)
}

pub fn prepared_maximal_cubic_factor_base(
    field: &ValidatedPreparedCubic,
) -> Result<PreparedFactorBase, PreparedFactorBaseError> {
    let polynomial: [i64; 4] = field
        .data()
        .polynomial_ascending
        .iter()
        .map(|value| {
            value
                .to_i64()
                .ok_or(PreparedFactorBaseError::CoefficientOutsideI64)
        })
        .collect::<Result<Vec<_>, _>>()?
        .try_into()
        .expect("cubic has four coefficients");
    let signed_discriminant = field
        .data()
        .discriminant
        .to_i128()
        .ok_or(PreparedFactorBaseError::DiscriminantOutsideI128)?;
    let (relation_bound, checking_bound) =
        prepared_cubic_bounds_for_discriminant(polynomial, signed_discriminant);
    let logarithm = (relation_bound as f64 + 0.5).ln();
    let mut normal_forms = PreparedIdealWorkspace::new();
    let mut ideals = Vec::new();
    let mut exact_ideals = Vec::new();
    let mut rational_primes = Vec::new();
    let mut rational_offsets = Vec::new();
    let mut rational_counts = Vec::new();
    let mut complete_groups = Vec::new();

    for prime in rational_primes_through(relation_bound) {
        let limit = (logarithm / (prime as f64).ln()) as usize;
        let is_index_prime = field
            .data()
            .index_primes
            .iter()
            .any(|index_prime| index_prime == &prime);
        let mut descriptors = if is_index_prime {
            index_prime_descriptors(field, prime, &mut normal_forms)?
        } else {
            ordinary_prime_descriptors(field, polynomial, prime, limit, &mut normal_forms)?
        };
        if descriptors.is_empty() {
            continue;
        }
        descriptors.sort_by(|left, right| {
            left.0
                .residue_degree
                .cmp(&right.0.residue_degree)
                .then_with(|| left.0.generator.cmp(&right.0.generator))
        });
        let full_count = if is_index_prime {
            descriptors.len()
        } else {
            prepared_cubic_factor_pattern(polynomial, prime).len()
        };
        rational_primes.push(prime);
        rational_offsets.push(ideals.len());
        rational_counts.push(descriptors.len());
        complete_groups.push(descriptors.len() == full_count);
        for (descriptor, ideal) in descriptors {
            ideals.push(descriptor);
            exact_ideals.push(ideal);
        }
    }
    Ok(PreparedFactorBase {
        catalog: FactorBase {
            relation_bound,
            checking_bound,
            ideals,
            rational_primes,
            rational_offsets,
            rational_counts,
            complete_groups,
        },
        exact_ideals,
    })
}

fn ordinary_prime_descriptors(
    field: &ValidatedPreparedCubic,
    polynomial: [i64; 4],
    prime: i64,
    degree_limit: usize,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<Vec<(PrimeIdeal, CubicIdeal)>, PreparedFactorBaseError> {
    let mut answer = Vec::new();
    for (factor, exponent) in prepared_cubic_factor_pattern(polynomial, prime) {
        let degree = factor.len() - 1;
        if degree == 3 || degree > degree_limit {
            continue;
        }
        let power_coefficients: [Integer; 3] =
            std::array::from_fn(|index| Integer::from(factor.get(index).copied().unwrap_or(0)));
        let generator = field.power_basis_coordinates(&power_coefficients);
        let exact = workspace.prime_from_generator(field, prime as u32, &generator)?;
        let expected = Integer::from(prime).pow(degree as u32);
        check_norm(prime, &expected, &exact)?;
        answer.push((
            descriptor(prime, exponent, degree, &generator, &exact)?,
            exact,
        ));
    }
    Ok(answer)
}

fn index_prime_descriptors(
    field: &ValidatedPreparedCubic,
    prime: i64,
    _workspace: &mut PreparedIdealWorkspace,
) -> Result<Vec<(PrimeIdeal, CubicIdeal)>, PreparedFactorBaseError> {
    let prime = u32::try_from(prime).map_err(|_| PreparedFactorBaseError::IndexPrimeOutsideU32)?;
    if prime > INDEX_CHARACTER_SEARCH_LIMIT {
        return Err(PreparedFactorBaseError::IndexPrimeCharacterSearchTooLarge {
            prime,
            limit: INDEX_CHARACTER_SEARCH_LIMIT,
        });
    }
    let mut characters = Vec::new();
    for first in 0..prime {
        for second in 0..prime {
            if let Ok(character) =
                DegreeOnePrimeCharacter::validate(field, prime, [1, first, second])
            {
                characters.push(character);
            }
        }
    }
    let ramification = match characters.len() {
        1 => 3,
        3 => 1,
        count => {
            return Err(PreparedFactorBaseError::AmbiguousIndexPrimeDecomposition {
                prime,
                degree_one_primes: count,
            });
        }
    };
    let mut answer = Vec::new();
    for character in characters {
        let exact = character.kernel();
        check_norm(i64::from(prime), &Integer::from(prime), &exact)?;
        let generator = [
            -Integer::from(character.basis_images()[1]),
            Integer::from(1),
            Integer::new(),
        ];
        answer.push((
            descriptor(i64::from(prime), ramification, 1, &generator, &exact)?,
            exact,
        ));
    }
    Ok(answer)
}

fn check_norm(
    prime: i64,
    expected: &Integer,
    ideal: &CubicIdeal,
) -> Result<(), PreparedFactorBaseError> {
    let actual = ideal.norm();
    if &actual != expected {
        return Err(PreparedFactorBaseError::IdealNormMismatch {
            prime,
            expected: expected.clone(),
            actual,
        });
    }
    Ok(())
}

fn descriptor(
    prime: i64,
    ramification: usize,
    residue_degree: usize,
    generator: &[Integer; 3],
    ideal: &CubicIdeal,
) -> Result<PrimeIdeal, PreparedFactorBaseError> {
    let generator = integer_array_to_i64(generator)?;
    let rows = ideal.basis_rows();
    let hnf_values: [Integer; 9] = std::array::from_fn(|index| rows[index / 3][index % 3].clone());
    let hnf = integer_array_to_i64(&hnf_values)?;
    Ok(PrimeIdeal {
        prime,
        ramification,
        residue_degree,
        generator,
        tau: [0; 9],
        hnf,
        norm: prime.pow(residue_degree as u32),
    })
}

fn integer_array_to_i64<const N: usize>(
    values: &[Integer; N],
) -> Result<[i64; N], PreparedFactorBaseError> {
    let converted = values
        .iter()
        .map(|value| {
            value
                .to_i64()
                .ok_or(PreparedFactorBaseError::IdealEntryOutsideI64)
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(std::array::from_fn(|index| converted[index]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prepared::{EmbeddingPrecisionState, PreparedCubicData};

    fn row6_field() -> ValidatedPreparedCubic {
        ValidatedPreparedCubic::validate(PreparedCubicData {
            polynomial_ascending: [
                2_000_000_000_018_u64.into(),
                (-2_000_000_000_010_i64).into(),
                0.into(),
                1.into(),
            ],
            irreducibility_prime: 7,
            integral_basis_numerators: [
                3.into(),
                0.into(),
                0.into(),
                0.into(),
                3.into(),
                0.into(),
                (-1_333_333_333_340_i64).into(),
                1.into(),
                1.into(),
            ],
            basis_denominator: 3.into(),
            multiplication_table: [
                1.into(),
                0.into(),
                0.into(),
                0.into(),
                1.into(),
                0.into(),
                0.into(),
                0.into(),
                1.into(),
                0.into(),
                1.into(),
                0.into(),
                1_333_333_333_340_u64.into(),
                (-1).into(),
                3.into(),
                (-222_222_222_226_i64).into(),
                222_222_222_223_u64.into(),
                1.into(),
                0.into(),
                0.into(),
                1.into(),
                (-222_222_222_226_i64).into(),
                222_222_222_223_u64.into(),
                1.into(),
                98_765_432_099_456_790_123_456_u128.into(),
                (-1).into(),
                (-222_222_222_223_i64).into(),
            ],
            discriminant: 3_555_555_555_596_888_888_888_939_555_555_555_028_u128.into(),
            signature: (3, 0),
            embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 192 },
            index_primes: vec![3.into()],
        })
        .unwrap()
    }

    #[test]
    fn row6_maximal_factor_base_has_the_predeclared_dimensions() {
        let base = prepared_maximal_cubic_factor_base(&row6_field()).unwrap();
        assert_eq!(base.catalog.ideals.len(), 1_130);
        assert_eq!(base.exact_ideals.len(), base.catalog.ideals.len());
        let group = base
            .catalog
            .rational_primes
            .iter()
            .position(|prime| *prime == 3)
            .expect("index-prime group");
        let index = base.catalog.rational_offsets[group];
        assert_eq!(base.catalog.rational_counts[group], 1);
        assert!(base.catalog.complete_groups[group]);
        assert_eq!(base.catalog.ideals[index].ramification, 3);
        assert_eq!(base.catalog.ideals[index].residue_degree, 1);
        assert_eq!(base.exact_ideals[index].norm(), 3);

        let mut relation = vec![0; base.catalog.ideals.len()];
        let mut workspace = PreparedIdealWorkspace::new();
        base.refine_element_factorization(
            &row6_field(),
            &[(-1).into(), 1.into(), 0.into()],
            &[(3, 2)],
            &mut relation,
            &mut workspace,
        )
        .unwrap();
        assert_eq!(relation[index], 2);

        let splitting = prepared_cubic_splitting_records(&row6_field(), 100).unwrap();
        assert_eq!(splitting.first().unwrap().prime, 2);
        assert_eq!(splitting.last().unwrap().prime, 97);
        assert_eq!(
            splitting
                .iter()
                .find(|record| record.prime == 3)
                .unwrap()
                .factors,
            [(3, 1)]
        );
        for record in splitting {
            assert_eq!(
                record
                    .factors
                    .iter()
                    .map(|(ramification, degree)| ramification * degree)
                    .sum::<usize>(),
                3
            );
        }

        let mut divisor = vec![0; base.catalog.ideals.len()];
        divisor[index] = 1;
        base.refine_quotient_factorization(
            &row6_field(),
            &[(-1).into(), 1.into(), 0.into()],
            &[(3, 1)],
            &divisor,
            &mut relation,
            &mut workspace,
        )
        .unwrap();
        assert_eq!(relation[index], 2);

        divisor[index] = 3;
        assert!(matches!(
            base.refine_quotient_factorization(
                &row6_field(),
                &[(-1).into(), 1.into(), 0.into()],
                &[(3, 1)],
                &divisor,
                &mut relation,
                &mut workspace,
            ),
            Err(PreparedFactorBaseError::NormValuationMismatch { .. })
        ));
    }
}
