// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact ideals in a validated cubic integral basis.
//!
//! This is the deliberately conservative arbitrary-precision path used when
//! an equation-order representation is not valid for the maximal order.  An
//! ideal is a full-rank row lattice in the replayed integral basis.  Products
//! are reduced to canonical row HNF, so no power-basis denominator occurs in
//! either multiplication or membership tests.

use rug::Integer;

use crate::hnf::{BigIntMatrix, ExactNormalFormWorkspace, NormalFormError, NormalFormLimits};
use crate::prepared::ValidatedPreparedCubic;

const DEGREE: usize = 3;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreparedIdealError {
    InvalidRationalPrime(u32),
    CharacterDoesNotPreserveOne,
    CharacterDoesNotPreserveMultiplication { left: usize, right: usize },
    SingularIdeal,
    ZeroElementHasUnboundedValuation,
    ValuationLimitExceeded { limit: u32 },
    NormalForm(NormalFormError),
}

impl From<NormalFormError> for PreparedIdealError {
    fn from(value: NormalFormError) -> Self {
        Self::NormalForm(value)
    }
}

/// A degree-one character `O -> F_p`, represented by the images of the
/// validated integral basis.  Its kernel is a prime ideal above `p`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DegreeOnePrimeCharacter {
    rational_prime: u32,
    basis_images: [u32; DEGREE],
}

impl DegreeOnePrimeCharacter {
    pub fn validate(
        field: &ValidatedPreparedCubic,
        rational_prime: u32,
        basis_images: [u32; DEGREE],
    ) -> Result<Self, PreparedIdealError> {
        if !is_prime(rational_prime) {
            return Err(PreparedIdealError::InvalidRationalPrime(rational_prime));
        }
        let images = basis_images.map(|value| value % rational_prime);
        if images[0] != 1 {
            return Err(PreparedIdealError::CharacterDoesNotPreserveOne);
        }
        for left in 0..DEGREE {
            for right in 0..DEGREE {
                let offset = 9 * left + 3 * right;
                let mut image = Integer::new();
                for coordinate in 0..DEGREE {
                    image += &field.data().multiplication_table[offset + coordinate]
                        * images[coordinate];
                }
                let expected = u64::from(images[left]) * u64::from(images[right]);
                if residue_u32(&image, rational_prime)
                    != (expected % u64::from(rational_prime)) as u32
                {
                    return Err(PreparedIdealError::CharacterDoesNotPreserveMultiplication {
                        left,
                        right,
                    });
                }
            }
        }
        Ok(Self {
            rational_prime,
            basis_images: images,
        })
    }

    pub fn rational_prime(&self) -> u32 {
        self.rational_prime
    }

    pub fn basis_images(&self) -> &[u32; DEGREE] {
        &self.basis_images
    }

    pub fn kernel(&self) -> CubicIdeal {
        // p*1, b_1 - image(b_1), b_2 - image(b_2)
        let p = Integer::from(self.rational_prime);
        CubicIdeal {
            basis_rows: [
                [p, Integer::new(), Integer::new()],
                [
                    -Integer::from(self.basis_images[1]),
                    Integer::from(1),
                    Integer::new(),
                ],
                [
                    -Integer::from(self.basis_images[2]),
                    Integer::new(),
                    Integer::from(1),
                ],
            ],
        }
    }
}

/// A full-rank integral ideal represented by a row basis in integral
/// coordinates.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CubicIdeal {
    basis_rows: [[Integer; DEGREE]; DEGREE],
}

impl CubicIdeal {
    pub fn unit() -> Self {
        Self {
            basis_rows: std::array::from_fn(|row| {
                std::array::from_fn(|column| Integer::from(u8::from(row == column)))
            }),
        }
    }

    pub fn basis_rows(&self) -> &[[Integer; DEGREE]; DEGREE] {
        &self.basis_rows
    }

    pub fn norm(&self) -> Integer {
        determinant(&self.basis_rows).abs()
    }

    pub fn is_scalar(&self) -> bool {
        let diagonal = &self.basis_rows[0][0];
        (0..DEGREE).all(|row| {
            (0..DEGREE).all(|column| {
                if row == column {
                    &self.basis_rows[row][column] == diagonal
                } else {
                    self.basis_rows[row][column] == 0
                }
            })
        })
    }

    pub fn contains(&self, element: &[Integer; DEGREE]) -> Result<bool, PreparedIdealError> {
        let denominator = determinant(&self.basis_rows);
        if denominator == 0 {
            return Err(PreparedIdealError::SingularIdeal);
        }
        for row in 0..DEGREE {
            let mut numerator_matrix = self.basis_rows.clone();
            numerator_matrix[row] = element.clone();
            if determinant(&numerator_matrix) % &denominator != 0 {
                return Ok(false);
            }
        }
        Ok(true)
    }
}

/// Reusable HNF storage for products and valuation-by-membership.
pub struct PreparedIdealWorkspace {
    normal_form: ExactNormalFormWorkspace,
}

impl Default for PreparedIdealWorkspace {
    fn default() -> Self {
        Self::new()
    }
}

impl PreparedIdealWorkspace {
    pub fn new() -> Self {
        Self {
            normal_form: ExactNormalFormWorkspace::new(NormalFormLimits::default()),
        }
    }

    pub fn multiply(
        &mut self,
        field: &ValidatedPreparedCubic,
        left: &CubicIdeal,
        right: &CubicIdeal,
    ) -> Result<CubicIdeal, PreparedIdealError> {
        let mut generators = Vec::with_capacity(DEGREE * DEGREE * DEGREE);
        for left_row in &left.basis_rows {
            for right_row in &right.basis_rows {
                generators.extend(field.multiply_coordinates(left_row, right_row));
            }
        }
        let matrix = BigIntMatrix::try_new(DEGREE * DEGREE, DEGREE, generators)?;
        let hnf = self.normal_form.row_hnf(&matrix)?;
        if hnf.rank() != DEGREE {
            return Err(PreparedIdealError::SingularIdeal);
        }
        let basis_rows = std::array::from_fn(|row| {
            std::array::from_fn(|column| {
                hnf.hnf
                    .get(row, column)
                    .expect("rank-three HNF has three columns")
                    .clone()
            })
        });
        Ok(CubicIdeal { basis_rows })
    }

    pub fn pow(
        &mut self,
        field: &ValidatedPreparedCubic,
        ideal: &CubicIdeal,
        mut exponent: u8,
    ) -> Result<CubicIdeal, PreparedIdealError> {
        let mut answer = CubicIdeal::unit();
        let mut power = ideal.clone();
        while exponent != 0 {
            if exponent & 1 != 0 {
                answer = self.multiply(field, &answer, &power)?;
            }
            exponent >>= 1;
            if exponent != 0 {
                power = self.multiply(field, &power, &power)?;
            }
        }
        Ok(answer)
    }

    /// Canonicalize an integral generating set as a rank-three row lattice.
    pub fn from_generators(
        &mut self,
        generators: &[[Integer; DEGREE]],
    ) -> Result<CubicIdeal, PreparedIdealError> {
        let values = generators
            .iter()
            .flat_map(|row| row.iter().cloned())
            .collect();
        let matrix = BigIntMatrix::try_new(generators.len(), DEGREE, values)?;
        let hnf = self.normal_form.row_hnf(&matrix)?;
        if hnf.rank() != DEGREE {
            return Err(PreparedIdealError::SingularIdeal);
        }
        let basis_rows = std::array::from_fn(|row| {
            std::array::from_fn(|column| {
                hnf.hnf
                    .get(row, column)
                    .expect("rank-three HNF has three columns")
                    .clone()
            })
        });
        Ok(CubicIdeal { basis_rows })
    }

    /// Construct `p O + generator O` in the validated integral basis.
    pub fn prime_from_generator(
        &mut self,
        field: &ValidatedPreparedCubic,
        rational_prime: u32,
        generator: &[Integer; DEGREE],
    ) -> Result<CubicIdeal, PreparedIdealError> {
        if !is_prime(rational_prime) {
            return Err(PreparedIdealError::InvalidRationalPrime(rational_prime));
        }
        let p = Integer::from(rational_prime);
        let mut generators = Vec::with_capacity(2 * DEGREE);
        for coordinate in 0..DEGREE {
            let mut row: [Integer; DEGREE] = std::array::from_fn(|_| Integer::new());
            row[coordinate] = p.clone();
            generators.push(row);
        }
        for coordinate in 0..DEGREE {
            let basis: [Integer; DEGREE] =
                std::array::from_fn(|index| Integer::from(u8::from(index == coordinate)));
            generators.push(field.multiply_coordinates(generator, &basis));
        }
        self.from_generators(&generators)
    }

    /// Return `v_P(element)` by exact membership in successive ideal powers.
    ///
    /// The caller supplies a finite limit so a malformed prime ideal cannot
    /// turn qualification into an unbounded loop.
    pub fn valuation(
        &mut self,
        field: &ValidatedPreparedCubic,
        prime: &CubicIdeal,
        element: &[Integer; DEGREE],
        limit: u32,
    ) -> Result<u32, PreparedIdealError> {
        if element.iter().all(|value| value == &0) {
            return Err(PreparedIdealError::ZeroElementHasUnboundedValuation);
        }
        let mut power = prime.clone();
        for valuation in 0..limit {
            if !power.contains(element)? {
                return Ok(valuation);
            }
            power = self.multiply(field, &power, prime)?;
        }
        if !power.contains(element)? {
            return Ok(limit);
        }
        Err(PreparedIdealError::ValuationLimitExceeded { limit })
    }
}

fn residue_u32(value: &Integer, modulus: u32) -> u32 {
    let mut residue = value.clone() % modulus;
    if residue < 0 {
        residue += modulus;
    }
    residue.to_u32_wrapping()
}

fn is_prime(value: u32) -> bool {
    if value < 2 {
        return false;
    }
    if value % 2 == 0 {
        return value == 2;
    }
    let mut divisor = 3;
    while divisor <= value / divisor {
        if value % divisor == 0 {
            return false;
        }
        divisor += 2;
    }
    true
}

fn determinant(matrix: &[[Integer; DEGREE]; DEGREE]) -> Integer {
    let minor_0 = matrix[1][1].clone() * &matrix[2][2] - matrix[1][2].clone() * &matrix[2][1];
    let minor_1 = matrix[1][0].clone() * &matrix[2][2] - matrix[1][2].clone() * &matrix[2][0];
    let minor_2 = matrix[1][0].clone() * &matrix[2][1] - matrix[1][1].clone() * &matrix[2][0];
    matrix[0][0].clone() * minor_0 - matrix[0][1].clone() * minor_1 + matrix[0][2].clone() * minor_2
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prepared::{EmbeddingPrecisionState, PreparedCubicData};

    fn row6_field() -> ValidatedPreparedCubic {
        let a = Integer::from(1_333_333_333_340_u64);
        ValidatedPreparedCubic::validate(PreparedCubicData {
            polynomial_ascending: [
                Integer::from(2_000_000_000_018_u64),
                Integer::from(-2_000_000_000_010_i64),
                Integer::new(),
                Integer::from(1),
            ],
            irreducibility_prime: 7,
            integral_basis_numerators: [
                Integer::from(3),
                Integer::new(),
                Integer::new(),
                Integer::new(),
                Integer::from(3),
                Integer::new(),
                -a,
                Integer::from(1),
                Integer::from(1),
            ],
            basis_denominator: Integer::from(3),
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
            discriminant: Integer::from(3_555_555_555_596_888_888_888_939_555_555_555_028_u128),
            signature: (3, 0),
            embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 192 },
            index_primes: vec![Integer::from(3)],
        })
        .expect("row-6 prepared field validates")
    }

    #[test]
    fn row6_index_prime_character_and_valuation_are_exact() {
        let field = row6_field();
        let character =
            DegreeOnePrimeCharacter::validate(&field, 3, [1, 1, 1]).expect("row-6 mod-3 character");
        let prime = character.kernel();
        assert_eq!(prime.norm(), 3);

        let x_minus_one = [Integer::from(-1), Integer::from(1), Integer::new()];
        let mut workspace = PreparedIdealWorkspace::new();
        assert_eq!(workspace.valuation(&field, &prime, &x_minus_one, 8), Ok(2));

        let square = workspace.multiply(&field, &prime, &prime).expect("P^2");
        let cube = workspace.multiply(&field, &square, &prime).expect("P^3");
        assert_eq!(
            workspace.pow(&field, &prime, 0).unwrap(),
            CubicIdeal::unit()
        );
        assert_eq!(workspace.pow(&field, &prime, 3).unwrap(), cube);
        assert_eq!(square.norm(), 9);
        assert_eq!(cube.norm(), 27);
        assert!(square.contains(&x_minus_one).expect("membership"));
        assert!(!cube.contains(&x_minus_one).expect("membership"));
    }

    #[test]
    fn invalid_character_is_rejected() {
        let field = row6_field();
        assert!(matches!(
            DegreeOnePrimeCharacter::validate(&field, 3, [1, 0, 0]),
            Err(PreparedIdealError::CharacterDoesNotPreserveMultiplication { .. })
        ));
    }
}
