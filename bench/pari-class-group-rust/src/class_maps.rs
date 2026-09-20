// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact maps for a verified relation presentation.
//!
//! Let `A` have one factor-base generator per row and one verified principal
//! relation per column.  Given an exact Smith decomposition
//!
//! ```text
//! D = L * A * R,
//! ```
//!
//! this module identifies the quotient of the free exponent lattice by the
//! *supplied* relation lattice.  It does not claim that the supplied relations
//! generate the full relation lattice, and therefore a nonzero coordinate in
//! this quotient is not, by itself, a proof that an ideal is nonprincipal.
//!
//! A zero coordinate is more useful: this module reconstructs coefficients
//! `c` with `A*c = x`.  Those coefficients certify that `x` is a combination
//! of the verified relation columns.  Constructing an actual principal element
//! additionally requires, for every used relation column `j`, a field element
//! `alpha_j` in a common number-field/order representation satisfying
//!
//! ```text
//! product_i P_i ^ A[i,j] = (alpha_j).
//! ```
//!
//! The desired generator is then `product_j alpha_j ^ c[j]`.  An implementation
//! must support negative `c[j]` (hence fractional field elements or certified
//! exact division), preserve the common embedding/order, and account for the
//! harmless unit ambiguity.  No such field elements are manufactured here.

use rug::Integer;

use crate::hnf::{BigIntMatrix, NormalFormError, SmithDecomposition};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClassMapError {
    NormalForm(NormalFormError),
    /// A finite class-group presentation needs a pivot for every generator.
    NotFullRowRank {
        rank: usize,
        generators: usize,
    },
    ExponentDimension {
        expected: usize,
        actual: usize,
    },
    CoordinateDimension {
        expected: usize,
        actual: usize,
    },
    RelationIndexOutOfBounds {
        index: usize,
        relations: usize,
    },
    RelationDoesNotMapToZero {
        index: usize,
    },
    RelationCombinationWitnessMismatch,
}

impl From<NormalFormError> for ClassMapError {
    fn from(error: NormalFormError) -> Self {
        Self::NormalForm(error)
    }
}

/// Coordinates in the nontrivial invariant factors of one presentation.
///
/// Values are canonical nonnegative residues.  The owning [`PresentationClassMap`]
/// supplies the corresponding moduli and checks dimensions before arithmetic.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClassCoordinates {
    values: Vec<Integer>,
}

impl ClassCoordinates {
    pub fn values(&self) -> &[Integer] {
        &self.values
    }

    pub fn is_zero(&self) -> bool {
        self.values.iter().all(|value| value == &0)
    }
}

/// Exact coordinates expressing an exponent vector as a combination of the
/// supplied relation columns.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RelationCombinationWitness {
    coefficients: Vec<Integer>,
}

impl RelationCombinationWitness {
    pub fn coefficients(&self) -> &[Integer] {
        &self.coefficients
    }

    pub fn used_relation_indices(&self) -> Vec<usize> {
        self.coefficients
            .iter()
            .enumerate()
            .filter_map(|(index, coefficient)| (coefficient != &0).then_some(index))
            .collect()
    }
}

/// Whether this module has enough data to construct a principal field element.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PrincipalElementWitnessState {
    /// The zero exponent vector has principal element one without any further
    /// relation witnesses.
    Identity,
    /// Relation-lattice coordinates are known, but the listed relation columns
    /// still need explicit principal field elements as described in the module
    /// documentation.
    NeedsRelationPrincipalElements { relation_indices: Vec<usize> },
}

/// Principality information relative to the supplied, verified presentation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PresentationZeroState {
    /// Nonzero modulo the currently supplied relation lattice.  Missing valid
    /// relations could still make this vector zero in the true class group.
    NonzeroInCurrentPresentation { coordinates: ClassCoordinates },
    /// Proven to be a combination of supplied principal relation columns.
    ZeroByVerifiedRelations {
        relation_combination: RelationCombinationWitness,
        principal_element: PrincipalElementWitnessState,
    },
}

/// This map describes exactly the quotient by the supplied relation columns.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RelationCoverage {
    SuppliedRelationsOnly,
}

/// Exact quotient maps derived from a checked Smith decomposition.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PresentationClassMap {
    relations: BigIntMatrix,
    diagonal: Vec<Integer>,
    nontrivial_positions: Vec<usize>,
    invariant_factors: Vec<Integer>,
    left_transform: BigIntMatrix,
    right_transform: BigIntMatrix,
}

impl PresentationClassMap {
    /// Validate `D = L*A*R`, both inverse witnesses, canonical Smith form, full
    /// row rank, and every relation-to-zero map before exposing coordinates.
    pub fn from_verified_smith(
        relations: BigIntMatrix,
        smith: SmithDecomposition,
    ) -> Result<Self, ClassMapError> {
        smith.verify(&relations)?;
        let generators = relations.rows();
        if smith.rank != generators {
            return Err(ClassMapError::NotFullRowRank {
                rank: smith.rank,
                generators,
            });
        }

        let mut diagonal = Vec::with_capacity(generators);
        let mut nontrivial_positions = Vec::new();
        let mut invariant_factors = Vec::new();
        for index in 0..generators {
            let value = smith.diagonal.get(index, index)?.clone();
            if value > 1 {
                nontrivial_positions.push(index);
                invariant_factors.push(value.clone());
            }
            diagonal.push(value);
        }

        let answer = Self {
            relations,
            diagonal,
            nontrivial_positions,
            invariant_factors,
            left_transform: smith.left_transform,
            right_transform: smith.right_transform,
        };
        answer.verify_all_relations_map_to_zero()?;
        Ok(answer)
    }

    pub fn generator_count(&self) -> usize {
        self.relations.rows()
    }

    pub fn relation_count(&self) -> usize {
        self.relations.columns()
    }

    pub fn relation_coverage(&self) -> RelationCoverage {
        RelationCoverage::SuppliedRelationsOnly
    }

    /// Canonical nontrivial factors; factors equal to one are omitted.
    pub fn invariant_factors(&self) -> &[Integer] {
        &self.invariant_factors
    }

    pub fn zero(&self) -> ClassCoordinates {
        ClassCoordinates {
            values: vec![Integer::new(); self.invariant_factors.len()],
        }
    }

    /// Map a factor-base ideal exponent vector to presentation coordinates.
    pub fn coordinates(&self, exponents: &[Integer]) -> Result<ClassCoordinates, ClassMapError> {
        self.check_exponent_dimension(exponents)?;
        let transformed = multiply_matrix_vector(&self.left_transform, exponents)?;
        Ok(ClassCoordinates {
            values: self
                .nontrivial_positions
                .iter()
                .zip(&self.invariant_factors)
                .map(|(&position, modulus)| canonical_residue(&transformed[position], modulus))
                .collect(),
        })
    }

    /// Coordinate images of the original factor-base generators.
    pub fn generator_coordinate_maps(&self) -> Result<Vec<ClassCoordinates>, ClassMapError> {
        let mut answer = Vec::with_capacity(self.generator_count());
        for generator in 0..self.generator_count() {
            let mut basis = vec![Integer::new(); self.generator_count()];
            basis[generator] = Integer::from(1);
            answer.push(self.coordinates(&basis)?);
        }
        Ok(answer)
    }

    pub fn add(
        &self,
        left: &ClassCoordinates,
        right: &ClassCoordinates,
    ) -> Result<ClassCoordinates, ClassMapError> {
        self.check_coordinate_dimension(left)?;
        self.check_coordinate_dimension(right)?;
        Ok(ClassCoordinates {
            values: left
                .values
                .iter()
                .zip(&right.values)
                .zip(&self.invariant_factors)
                .map(|((left, right), modulus)| {
                    canonical_residue(&Integer::from(left + right), modulus)
                })
                .collect(),
        })
    }

    pub fn negate(
        &self,
        coordinates: &ClassCoordinates,
    ) -> Result<ClassCoordinates, ClassMapError> {
        self.check_coordinate_dimension(coordinates)?;
        Ok(ClassCoordinates {
            values: coordinates
                .values
                .iter()
                .zip(&self.invariant_factors)
                .map(|(value, modulus)| canonical_residue(&Integer::from(-value), modulus))
                .collect(),
        })
    }

    pub fn verify_relation_maps_to_zero(&self, index: usize) -> Result<(), ClassMapError> {
        if index >= self.relation_count() {
            return Err(ClassMapError::RelationIndexOutOfBounds {
                index,
                relations: self.relation_count(),
            });
        }
        let relation = (0..self.generator_count())
            .map(|row| self.relations.get(row, index).cloned())
            .collect::<Result<Vec<_>, _>>()?;
        if !self.coordinates(&relation)?.is_zero() {
            return Err(ClassMapError::RelationDoesNotMapToZero { index });
        }
        Ok(())
    }

    pub fn verify_all_relations_map_to_zero(&self) -> Result<(), ClassMapError> {
        for index in 0..self.relation_count() {
            self.verify_relation_maps_to_zero(index)?;
        }
        Ok(())
    }

    /// Decide zero in the supplied presentation and, for zero vectors, recover
    /// exact relation-combination coordinates.
    pub fn presentation_zero_state(
        &self,
        exponents: &[Integer],
    ) -> Result<PresentationZeroState, ClassMapError> {
        self.check_exponent_dimension(exponents)?;
        let coordinates = self.coordinates(exponents)?;
        if !coordinates.is_zero() {
            return Ok(PresentationZeroState::NonzeroInCurrentPresentation { coordinates });
        }

        let transformed = multiply_matrix_vector(&self.left_transform, exponents)?;
        let mut diagonal_coordinates = vec![Integer::new(); self.relation_count()];
        for index in 0..self.generator_count() {
            // Coordinates being zero modulo every nontrivial factor, together
            // with the omitted modulus-one factors, makes this exact.
            diagonal_coordinates[index] =
                Integer::from(&transformed[index] / &self.diagonal[index]);
        }
        let coefficients = multiply_matrix_vector(&self.right_transform, &diagonal_coordinates)?;
        if multiply_matrix_vector(&self.relations, &coefficients)? != exponents {
            return Err(ClassMapError::RelationCombinationWitnessMismatch);
        }
        let relation_combination = RelationCombinationWitness { coefficients };
        let relation_indices = relation_combination.used_relation_indices();
        let principal_element = if relation_indices.is_empty() {
            PrincipalElementWitnessState::Identity
        } else {
            PrincipalElementWitnessState::NeedsRelationPrincipalElements { relation_indices }
        };
        Ok(PresentationZeroState::ZeroByVerifiedRelations {
            relation_combination,
            principal_element,
        })
    }

    fn check_exponent_dimension(&self, exponents: &[Integer]) -> Result<(), ClassMapError> {
        if exponents.len() != self.generator_count() {
            return Err(ClassMapError::ExponentDimension {
                expected: self.generator_count(),
                actual: exponents.len(),
            });
        }
        Ok(())
    }

    fn check_coordinate_dimension(
        &self,
        coordinates: &ClassCoordinates,
    ) -> Result<(), ClassMapError> {
        if coordinates.values.len() != self.invariant_factors.len() {
            return Err(ClassMapError::CoordinateDimension {
                expected: self.invariant_factors.len(),
                actual: coordinates.values.len(),
            });
        }
        Ok(())
    }
}

fn multiply_matrix_vector(
    matrix: &BigIntMatrix,
    vector: &[Integer],
) -> Result<Vec<Integer>, ClassMapError> {
    if matrix.columns() != vector.len() {
        return Err(ClassMapError::ExponentDimension {
            expected: matrix.columns(),
            actual: vector.len(),
        });
    }
    let mut answer = vec![Integer::new(); matrix.rows()];
    for (row, target) in answer.iter_mut().enumerate() {
        for (column, value) in vector.iter().enumerate() {
            *target += Integer::from(matrix.get(row, column)? * value);
        }
    }
    Ok(answer)
}

fn canonical_residue(value: &Integer, modulus: &Integer) -> Integer {
    let mut residue = Integer::from(value % modulus);
    if residue < 0 {
        residue += modulus;
    }
    residue
}
