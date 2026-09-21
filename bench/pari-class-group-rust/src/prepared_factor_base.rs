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
    FactorBase, PrimeIdeal, prepared_cubic_bounds_for_discriminant_and_index_patterns,
    prepared_cubic_factor_pattern, prepared_cubic_factor_pattern_with_ramification,
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
    InvalidIndexPrimeDecomposition {
        prime: u32,
    },
    IndexPrimeGeneratorNotFound {
        prime: u32,
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
    valuation_powers: Vec<Vec<CubicIdeal>>,
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
        &mut self,
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
                let full = workspace.valuation_capped_by_norm_with_power_cache(
                    field,
                    &self.exact_ideals[index],
                    element,
                    u32::try_from(cap).map_err(|_| PreparedFactorBaseError::ValuationOutsideI64)?,
                    &mut self.valuation_powers[index],
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
    prepared_cubic_splitting_records_range(field, 2, bound)
}

/// Return exact maximal-order splitting types for rational primes in
/// `lower_bound..bound`.
///
/// This is the incremental counterpart of
/// [`prepared_cubic_splitting_records`]. It lets completion searches retain a
/// proved prefix while increasing their analytic cutoff instead of repeatedly
/// factoring the same rational primes.
pub fn prepared_cubic_splitting_records_range(
    field: &ValidatedPreparedCubic,
    lower_bound: usize,
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
    let lower_bound = lower_bound.max(2);
    if bound <= lower_bound {
        return Ok(answer);
    }
    for prime in rational_primes_through(bound - 1) {
        if prime < i64::try_from(lower_bound).unwrap_or(i64::MAX) {
            continue;
        }
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
            let prime_u32 =
                u32::try_from(prime).map_err(|_| PreparedFactorBaseError::IndexPrimeOutsideU32)?;
            prepared_cubic_factor_pattern_with_ramification(
                polynomial,
                prime,
                field.data().discriminant.is_divisible_u(prime_u32),
            )
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
    let mut normal_forms = PreparedIdealWorkspace::new();
    let mut index_prime_descriptors_cache = Vec::new();
    for index_prime in &field.data().index_primes {
        let prime = index_prime
            .to_i64()
            .ok_or(PreparedFactorBaseError::IndexPrimeOutsideU32)?;
        index_prime_descriptors_cache.push((
            prime,
            index_prime_descriptors(field, prime, &mut normal_forms)?,
        ));
    }
    index_prime_descriptors_cache.sort_by_key(|(prime, _)| *prime);
    let index_prime_patterns = index_prime_descriptors_cache
        .iter()
        .map(|(prime, descriptors)| {
            (
                *prime,
                descriptors
                    .iter()
                    .map(|(descriptor, _)| (descriptor.ramification, descriptor.residue_degree))
                    .collect(),
            )
        })
        .collect::<Vec<_>>();
    let (relation_bound, checking_bound) =
        prepared_cubic_bounds_for_discriminant_and_index_patterns(
            polynomial,
            signed_discriminant,
            &index_prime_patterns,
        );
    let logarithm = (relation_bound as f64 + 0.5).ln();
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
        let (mut descriptors, full_count) = if is_index_prime {
            let position = index_prime_descriptors_cache
                .binary_search_by_key(&prime, |(index_prime, _)| *index_prime)
                .expect("every validated index prime was cached");
            let mut descriptors = index_prime_descriptors_cache.remove(position).1;
            let full_count = descriptors.len();
            descriptors.retain(|(descriptor, _)| {
                descriptor.residue_degree != 3 && descriptor.residue_degree <= limit
            });
            (descriptors, full_count)
        } else {
            // Ideal generators require the actual irreducible factor
            // coefficients. The Frobenius fast path used by analytic catalogs
            // deliberately returns degree-only placeholders and is therefore
            // not valid at this representation boundary.
            let pattern = prepared_cubic_factor_pattern(polynomial, prime);
            let full_count = pattern.len();
            (
                ordinary_prime_descriptors(field, prime, limit, &pattern, &mut normal_forms)?,
                full_count,
            )
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
        rational_primes.push(prime);
        rational_offsets.push(ideals.len());
        rational_counts.push(descriptors.len());
        complete_groups.push(descriptors.len() == full_count);
        for (descriptor, ideal) in descriptors {
            ideals.push(descriptor);
            exact_ideals.push(ideal);
        }
    }
    // Populate a slot only if relation refinement actually encounters its
    // rational prime. Large factor bases therefore pay no eager clone cost.
    let valuation_powers = vec![Vec::new(); exact_ideals.len()];
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
        valuation_powers,
    })
}

fn ordinary_prime_descriptors(
    field: &ValidatedPreparedCubic,
    prime: i64,
    degree_limit: usize,
    pattern: &[(Vec<i64>, usize)],
    workspace: &mut PreparedIdealWorkspace,
) -> Result<Vec<(PrimeIdeal, CubicIdeal)>, PreparedFactorBaseError> {
    let mut answer = Vec::new();
    for (factor, exponent) in pattern {
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
            descriptor(prime, *exponent, degree, &generator, &exact)?,
            exact,
        ));
    }
    Ok(answer)
}

fn index_prime_descriptors(
    field: &ValidatedPreparedCubic,
    prime: i64,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<Vec<(PrimeIdeal, CubicIdeal)>, PreparedFactorBaseError> {
    let prime = u32::try_from(prime).map_err(|_| PreparedFactorBaseError::IndexPrimeOutsideU32)?;
    if prime > INDEX_CHARACTER_SEARCH_LIMIT {
        return Err(PreparedFactorBaseError::IndexPrimeCharacterSearchTooLarge {
            prime,
            limit: INDEX_CHARACTER_SEARCH_LIMIT,
        });
    }
    let mut ideals = Vec::new();
    for first in 0..prime {
        for second in 0..prime {
            if let Ok(character) =
                DegreeOnePrimeCharacter::validate(field, prime, [1, first, second])
            {
                let kernel = character.kernel();
                let ideal = workspace.from_generators(kernel.basis_rows())?;
                let preferred = [
                    -Integer::from(character.basis_images()[1]),
                    Integer::from(1),
                    Integer::new(),
                ];
                let preferred = (workspace.prime_from_generator(field, prime, &preferred)?
                    == ideal)
                    .then_some(preferred);
                ideals.push((1_usize, ideal, preferred));
            }
        }
    }

    // A degree-two maximal ideal has a one-dimensional image in A = O/pO.
    // Enumerating normalized projective lines is bounded by p^2+p+1 and avoids
    // making any equation-order/Dedekind assumption at an index prime.
    for pivot in 0..3 {
        let mut line = [0_u32; 3];
        line[pivot] = 1;
        let suffix = 2 - pivot;
        let count = prime.pow(suffix as u32);
        for encoded in 0..count {
            let mut value = encoded;
            for coordinate in pivot + 1..3 {
                line[coordinate] = value % prime;
                value /= prime;
            }
            if line == [1, 0, 0] || !is_stable_line(field, prime, &line) {
                continue;
            }
            let Some(u) = quotient_generator(&line, prime) else {
                continue;
            };
            let u_squared = multiply_mod_p(field, prime, &u, &u);
            let Some(coefficients) = coordinates_mod_p([one_mod_p(), u, line], u_squared, prime)
            else {
                continue;
            };
            let constant = coefficients[0];
            let linear = coefficients[1];
            if (0..prime).any(|root| {
                mod_sub(
                    mod_sub(
                        mod_mul(root, root, prime),
                        mod_mul(linear, root, prime),
                        prime,
                    ),
                    constant,
                    prime,
                ) == 0
            }) {
                continue;
            }
            let p = Integer::from(prime);
            let generators = [
                [p.clone(), Integer::new(), Integer::new()],
                [Integer::new(), p.clone(), Integer::new()],
                [Integer::new(), Integer::new(), p],
                line.map(Integer::from),
            ];
            let ideal = workspace.from_generators(&generators)?;
            if ideal.norm() == Integer::from(prime).pow(2_u32)
                && !ideals.iter().any(|(_, known, _)| known == &ideal)
            {
                ideals.push((2, ideal, None));
            }
        }
    }

    // With no proper residue component, authenticate that A itself is the
    // degree-three residue field.  In a cubic field algebra one of the two
    // nonconstant basis vectors is cyclic; its rootless cubic proves this.
    if ideals.is_empty() {
        let field_proved = [[0, 1, 0], [0, 0, 1]].into_iter().any(|u| {
            let square = multiply_mod_p(field, prime, &u, &u);
            let Some(cube_coordinates) = coordinates_mod_p(
                [one_mod_p(), u, square],
                multiply_mod_p(field, prime, &square, &u),
                prime,
            ) else {
                return false;
            };
            !(0..prime).any(|root| {
                let root_squared = mod_mul(root, root, prime);
                let root_cubed = mod_mul(root_squared, root, prime);
                let evaluated = mod_sub(
                    mod_sub(
                        mod_sub(
                            root_cubed,
                            mod_mul(cube_coordinates[2], root_squared, prime),
                            prime,
                        ),
                        mod_mul(cube_coordinates[1], root, prime),
                        prime,
                    ),
                    cube_coordinates[0],
                    prime,
                );
                evaluated == 0
            })
        });
        if !field_proved {
            return Err(PreparedFactorBaseError::InvalidIndexPrimeDecomposition { prime });
        }
        let zero = [Integer::new(), Integer::new(), Integer::new()];
        ideals.push((
            3,
            workspace.prime_from_generator(field, prime, &zero)?,
            Some(zero),
        ));
    }

    let scalar = [Integer::from(prime), Integer::new(), Integer::new()];
    let mut authenticated = Vec::with_capacity(ideals.len());
    let mut dimension = 0_usize;
    let mut product = CubicIdeal::unit();
    for (residue_degree, ideal, preferred_generator) in ideals {
        check_norm(
            i64::from(prime),
            &Integer::from(prime).pow(residue_degree as u32),
            &ideal,
        )?;
        let ramification = workspace.valuation(field, &ideal, &scalar, 4)? as usize;
        if ramification == 0 || ramification > 3 {
            return Err(PreparedFactorBaseError::InvalidIndexPrimeDecomposition { prime });
        }
        dimension = dimension
            .checked_add(ramification * residue_degree)
            .ok_or(PreparedFactorBaseError::InvalidIndexPrimeDecomposition { prime })?;
        let power = workspace.pow(field, &ideal, ramification as u8)?;
        product = workspace.multiply(field, &product, &power)?;
        authenticated.push((ramification, residue_degree, ideal, preferred_generator));
    }
    let p = Integer::from(prime);
    let p_ideal = workspace.from_generators(&[
        [p.clone(), Integer::new(), Integer::new()],
        [Integer::new(), p.clone(), Integer::new()],
        [Integer::new(), Integer::new(), p],
    ])?;
    if dimension != 3 || product != p_ideal {
        return Err(PreparedFactorBaseError::InvalidIndexPrimeDecomposition { prime });
    }

    let mut answer = Vec::new();
    for (ramification, residue_degree, exact, preferred_generator) in authenticated {
        let generator = match preferred_generator {
            Some(generator) => generator,
            None => ideal_generator(field, prime, &exact, workspace)?,
        };
        answer.push((
            descriptor(
                i64::from(prime),
                ramification,
                residue_degree,
                &generator,
                &exact,
            )?,
            exact,
        ));
    }
    answer.sort_by(|left, right| {
        left.0
            .residue_degree
            .cmp(&right.0.residue_degree)
            .then_with(|| left.0.ramification.cmp(&right.0.ramification))
            .then_with(|| left.0.generator.cmp(&right.0.generator))
    });
    Ok(answer)
}

fn one_mod_p() -> [u32; 3] {
    [1, 0, 0]
}

fn mod_mul(left: u32, right: u32, prime: u32) -> u32 {
    ((u64::from(left) * u64::from(right)) % u64::from(prime)) as u32
}

fn mod_sub(left: u32, right: u32, prime: u32) -> u32 {
    (left + prime - right) % prime
}

fn residue_mod_p(value: &Integer, prime: u32) -> u32 {
    let mut residue = value.clone() % prime;
    if residue < 0 {
        residue += prime;
    }
    residue.to_u32_wrapping()
}

fn multiply_mod_p(
    field: &ValidatedPreparedCubic,
    prime: u32,
    left: &[u32; 3],
    right: &[u32; 3],
) -> [u32; 3] {
    let mut answer = [0_u32; 3];
    for (left_index, &left_value) in left.iter().enumerate() {
        for (right_index, &right_value) in right.iter().enumerate() {
            let scalar = mod_mul(left_value, right_value, prime);
            for (coordinate, entry) in answer.iter_mut().enumerate() {
                let coefficient = residue_mod_p(
                    &field.data().multiplication_table
                        [9 * left_index + 3 * right_index + coordinate],
                    prime,
                );
                *entry = (*entry + mod_mul(scalar, coefficient, prime)) % prime;
            }
        }
    }
    answer
}

fn is_stable_line(field: &ValidatedPreparedCubic, prime: u32, line: &[u32; 3]) -> bool {
    let pivot = line.iter().position(|&value| value != 0).unwrap();
    (0..3).all(|basis_index| {
        let basis = std::array::from_fn(|index| u32::from(index == basis_index));
        let product = multiply_mod_p(field, prime, line, &basis);
        let scalar = product[pivot];
        (0..3).all(|index| product[index] == mod_mul(scalar, line[index], prime))
    })
}

fn quotient_generator(line: &[u32; 3], prime: u32) -> Option<[u32; 3]> {
    [[0, 1, 0], [0, 0, 1]]
        .into_iter()
        .find(|candidate| determinant_mod_p(&[one_mod_p(), *candidate, *line], prime) != 0)
}

fn determinant_mod_p(rows: &[[u32; 3]; 3], prime: u32) -> u32 {
    let positive = (mod_mul(rows[0][0], mod_mul(rows[1][1], rows[2][2], prime), prime)
        + mod_mul(rows[0][1], mod_mul(rows[1][2], rows[2][0], prime), prime)
        + mod_mul(rows[0][2], mod_mul(rows[1][0], rows[2][1], prime), prime))
        % prime;
    let negative = (mod_mul(rows[0][2], mod_mul(rows[1][1], rows[2][0], prime), prime)
        + mod_mul(rows[0][1], mod_mul(rows[1][0], rows[2][2], prime), prime)
        + mod_mul(rows[0][0], mod_mul(rows[1][2], rows[2][1], prime), prime))
        % prime;
    mod_sub(positive, negative, prime)
}

fn inverse_mod_p(value: u32, prime: u32) -> u32 {
    (1..prime)
        .find(|&candidate| mod_mul(value, candidate, prime) == 1)
        .expect("nonzero field element has an inverse")
}

/// Solve `columns * coefficients = value` over F_p.
fn coordinates_mod_p(columns: [[u32; 3]; 3], value: [u32; 3], prime: u32) -> Option<[u32; 3]> {
    let mut augmented = [[0_u32; 4]; 3];
    for row in 0..3 {
        for column in 0..3 {
            augmented[row][column] = columns[column][row];
        }
        augmented[row][3] = value[row];
    }
    for pivot in 0..3 {
        let source = (pivot..3).find(|&row| augmented[row][pivot] != 0)?;
        augmented.swap(pivot, source);
        let inverse = inverse_mod_p(augmented[pivot][pivot], prime);
        for column in pivot..4 {
            augmented[pivot][column] = mod_mul(augmented[pivot][column], inverse, prime);
        }
        for row in 0..3 {
            if row == pivot {
                continue;
            }
            let scalar = augmented[row][pivot];
            for column in pivot..4 {
                augmented[row][column] = mod_sub(
                    augmented[row][column],
                    mod_mul(scalar, augmented[pivot][column], prime),
                    prime,
                );
            }
        }
    }
    Some(std::array::from_fn(|index| augmented[index][3]))
}

fn ideal_generator(
    field: &ValidatedPreparedCubic,
    prime: u32,
    ideal: &CubicIdeal,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<[Integer; 3], PreparedFactorBaseError> {
    if ideal.norm() == Integer::from(prime).pow(3_u32) {
        return Ok([Integer::new(), Integer::new(), Integer::new()]);
    }
    for pivot in 0..3 {
        let mut vector = [0_u32; 3];
        vector[pivot] = 1;
        let suffix = 2 - pivot;
        for encoded in 0..prime.pow(suffix as u32) {
            let mut value = encoded;
            for coordinate in pivot + 1..3 {
                vector[coordinate] = value % prime;
                value /= prime;
            }
            let candidate = vector.map(Integer::from);
            if ideal.contains(&candidate)?
                && workspace.prime_from_generator(field, prime, &candidate)? == *ideal
            {
                return Ok(candidate);
            }
        }
    }
    Err(PreparedFactorBaseError::IndexPrimeGeneratorNotFound { prime })
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
        let mut base = prepared_maximal_cubic_factor_base(&row6_field()).unwrap();
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

        let mut incremental = prepared_cubic_splitting_records_range(&row6_field(), 2, 41).unwrap();
        incremental.extend(prepared_cubic_splitting_records_range(&row6_field(), 41, 100).unwrap());
        assert_eq!(
            incremental,
            prepared_cubic_splitting_records(&row6_field(), 100).unwrap()
        );

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
