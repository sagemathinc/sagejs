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
use sha2::{Digest, Sha256};

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
    CoordinatePresentationMismatch,
    RelationIndexOutOfBounds {
        index: usize,
        relations: usize,
    },
    RelationDoesNotMapToZero {
        index: usize,
    },
    RelationCombinationWitnessMismatch,
    RelationCombinationUnavailable,
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
    presentation_sha256: [u8; 32],
}

impl ClassCoordinates {
    pub fn values(&self) -> &[Integer] {
        &self.values
    }

    pub fn is_zero(&self) -> bool {
        self.values.iter().all(|value| value == &0)
    }

    pub fn presentation_sha256(&self) -> &[u8; 32] {
        &self.presentation_sha256
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
    relations: Option<BigIntMatrix>,
    generator_count: usize,
    relation_count: usize,
    diagonal: Vec<Integer>,
    nontrivial_positions: Vec<usize>,
    invariant_factors: Vec<Integer>,
    left_transform: Option<BigIntMatrix>,
    right_transform: Option<BigIntMatrix>,
    compact_generator_to_smith: Option<Vec<usize>>,
    generator_coordinates: Option<Vec<Integer>>,
    /// Minted once after the complete immutable representation has passed its
    /// constructor checks. Coordinate operations can then bind to this map
    /// without repeatedly serializing a large exact relation matrix.
    binding_sha256: [u8; 32],
}

impl PresentationClassMap {
    /// Validate `D = L*A*R`, both inverse witnesses, canonical Smith form, full
    /// row rank, and every relation-to-zero map before exposing coordinates.
    pub fn from_verified_smith(
        relations: BigIntMatrix,
        smith: SmithDecomposition,
    ) -> Result<Self, ClassMapError> {
        smith.verify(&relations)?;
        Self::from_preverified_smith(relations, smith)
    }

    /// Construct a class map from the result of
    /// [`ExactNormalFormWorkspace::smith`](crate::hnf::ExactNormalFormWorkspace::smith).
    ///
    /// That producer verifies the full transform identity, both inverse pairs,
    /// and canonical Smith form before returning. Keeping this boundary
    /// crate-private prevents external callers from bypassing the defensive
    /// public constructor while avoiding a duplicate cubic-time replay in the
    /// authenticated candidate pipeline.
    pub(crate) fn from_preverified_smith(
        relations: BigIntMatrix,
        smith: SmithDecomposition,
    ) -> Result<Self, ClassMapError> {
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

        let mut answer = Self {
            generator_count: relations.rows(),
            relation_count: relations.columns(),
            relations: Some(relations),
            diagonal,
            nontrivial_positions,
            invariant_factors,
            left_transform: Some(smith.left_transform),
            right_transform: Some(smith.right_transform),
            compact_generator_to_smith: None,
            generator_coordinates: None,
            binding_sha256: [0; 32],
        };
        answer.verify_all_relations_map_to_zero()?;
        answer.binding_sha256 = answer.compute_binding_sha256();
        Ok(answer)
    }

    /// Construct the exact Smith map of a diagonal relation presentation
    /// without materializing quadratic-size identity transforms.
    ///
    /// Entry `i` is the positive diagonal coefficient of relation column `i`
    /// on generator `i`. The constructor computes and verifies the canonical
    /// Smith ordering; as with [`Self::from_verified_smith`], the caller must
    /// already have authenticated that these are principal relations.
    pub fn from_verified_diagonal_relations(
        diagonal_by_generator: Vec<Integer>,
    ) -> Result<Self, ClassMapError> {
        let generators = diagonal_by_generator.len();
        if generators == 0 || diagonal_by_generator.iter().any(|value| value <= &0) {
            return Err(ClassMapError::NotFullRowRank {
                rank: diagonal_by_generator
                    .iter()
                    .filter(|value| value != &&0)
                    .count(),
                generators,
            });
        }
        let mut generator_order = (0..generators).collect::<Vec<_>>();
        generator_order.sort_by(|left, right| {
            diagonal_by_generator[*left]
                .cmp(&diagonal_by_generator[*right])
                .then(left.cmp(right))
        });
        let diagonal = generator_order
            .iter()
            .map(|index| diagonal_by_generator[*index].clone())
            .collect::<Vec<_>>();
        if diagonal
            .windows(2)
            .any(|pair| Integer::from(&pair[1] % &pair[0]) != 0)
        {
            return Err(ClassMapError::NormalForm(NormalFormError::NonCanonical(
                "diagonal invariant factors do not divide",
            )));
        }
        let mut generator_to_smith = vec![0; generators];
        for (smith_position, generator) in generator_order.into_iter().enumerate() {
            generator_to_smith[generator] = smith_position;
        }
        let mut nontrivial_positions = Vec::new();
        let mut invariant_factors = Vec::new();
        for (position, value) in diagonal.iter().enumerate() {
            if value > &1 {
                nontrivial_positions.push(position);
                invariant_factors.push(value.clone());
            }
        }
        let mut answer = Self {
            relations: None,
            generator_count: generators,
            relation_count: generators,
            diagonal,
            nontrivial_positions,
            invariant_factors,
            left_transform: None,
            right_transform: None,
            compact_generator_to_smith: Some(generator_to_smith),
            generator_coordinates: None,
            binding_sha256: [0; 32],
        };
        answer.binding_sha256 = answer.compute_binding_sha256();
        Ok(answer)
    }

    /// Construct a compact coordinate map and verify every supplied relation
    /// maps to zero. The empty invariant-factor list is the unique
    /// zero-dimensional map for a trivial quotient, so its flattened
    /// generator-coordinate table must also be empty. A separate authority
    /// must authenticate principal ideals and the claimed quotient.
    pub fn from_verified_generator_coordinates(
        invariant_factors: Vec<Integer>,
        generator_coordinates: Vec<Integer>,
        relations: BigIntMatrix,
    ) -> Result<Self, ClassMapError> {
        let generators = relations.rows();
        let expected = generators.saturating_mul(invariant_factors.len());
        if invariant_factors.iter().any(|value| value <= &1)
            || invariant_factors
                .windows(2)
                .any(|pair| Integer::from(&pair[1] % &pair[0]) != 0)
            || generators.checked_mul(invariant_factors.len()) != Some(generator_coordinates.len())
        {
            return Err(ClassMapError::CoordinateDimension {
                expected,
                actual: generator_coordinates.len(),
            });
        }
        let mut answer = Self {
            relation_count: relations.columns(),
            relations: Some(relations),
            generator_count: generators,
            diagonal: invariant_factors.clone(),
            nontrivial_positions: (0..invariant_factors.len()).collect(),
            invariant_factors,
            left_transform: None,
            right_transform: None,
            compact_generator_to_smith: None,
            generator_coordinates: Some(generator_coordinates),
            binding_sha256: [0; 32],
        };
        answer.verify_all_relations_map_to_zero()?;
        answer.binding_sha256 = answer.compute_binding_sha256();
        Ok(answer)
    }

    pub fn generator_count(&self) -> usize {
        self.generator_count
    }

    pub fn relation_count(&self) -> usize {
        self.relation_count
    }

    pub fn relation_coverage(&self) -> RelationCoverage {
        RelationCoverage::SuppliedRelationsOnly
    }

    pub(crate) fn uses_external_generator_coordinates(&self) -> bool {
        self.generator_coordinates.is_some()
    }

    /// Borrow the already-verified compact coordinate table without hashing
    /// or remapping a basis vector for every generator.  This remains
    /// crate-private: callers must separately bind the complete presentation
    /// before treating the table as authority.
    pub(crate) fn compact_generator_coordinates(&self) -> Option<&[Integer]> {
        self.generator_coordinates.as_deref()
    }

    /// Domain-separated digest of the complete verified map representation.
    ///
    /// This binds generator order, relation columns, Smith transforms, and
    /// canonical invariant-factor coordinates. It is suitable for replay
    /// certificates, but is not a substitute for verifying the supplied
    /// principal relations before constructing this capability.
    pub fn binding_sha256(&self) -> [u8; 32] {
        self.binding_sha256
    }

    fn compute_binding_sha256(&self) -> [u8; 32] {
        fn integer(hasher: &mut Sha256, value: &Integer) {
            let bytes = value.to_string();
            hasher.update((bytes.len() as u64).to_le_bytes());
            hasher.update(bytes.as_bytes());
        }
        fn matrix(hasher: &mut Sha256, value: &BigIntMatrix) {
            hasher.update((value.rows() as u64).to_le_bytes());
            hasher.update((value.columns() as u64).to_le_bytes());
            for row in 0..value.rows() {
                for column in 0..value.columns() {
                    integer(
                        hasher,
                        value.get(row, column).expect("indices are in bounds"),
                    );
                }
            }
        }

        let mut hasher = Sha256::new();
        hasher.update(b"sagejs.presentation-class-map/v1\0");
        match (
            &self.relations,
            &self.compact_generator_to_smith,
            &self.generator_coordinates,
        ) {
            (Some(relations), None, None) => {
                hasher.update([0]);
                matrix(&mut hasher, relations);
            }
            (None, Some(generator_to_smith), None) => {
                hasher.update([1]);
                hasher.update((generator_to_smith.len() as u64).to_le_bytes());
                for (generator, &smith_position) in generator_to_smith.iter().enumerate() {
                    hasher.update((generator as u64).to_le_bytes());
                    hasher.update((smith_position as u64).to_le_bytes());
                    integer(&mut hasher, &self.diagonal[smith_position]);
                }
            }
            (Some(relations), None, Some(generator_coordinates)) => {
                hasher.update([2]);
                matrix(&mut hasher, relations);
                hasher.update((generator_coordinates.len() as u64).to_le_bytes());
                for value in generator_coordinates {
                    integer(&mut hasher, value);
                }
            }
            _ => unreachable!("presentation storage variants remain paired"),
        }
        hasher.update((self.diagonal.len() as u64).to_le_bytes());
        for value in &self.diagonal {
            integer(&mut hasher, value);
        }
        hasher.update((self.nontrivial_positions.len() as u64).to_le_bytes());
        for &position in &self.nontrivial_positions {
            hasher.update((position as u64).to_le_bytes());
        }
        hasher.update((self.invariant_factors.len() as u64).to_le_bytes());
        for value in &self.invariant_factors {
            integer(&mut hasher, value);
        }
        if let Some(left_transform) = &self.left_transform {
            matrix(&mut hasher, left_transform);
        }
        if let Some(right_transform) = &self.right_transform {
            matrix(&mut hasher, right_transform);
        }
        hasher.finalize().into()
    }

    /// Canonical nontrivial factors; factors equal to one are omitted.
    pub fn invariant_factors(&self) -> &[Integer] {
        &self.invariant_factors
    }

    pub fn zero(&self) -> ClassCoordinates {
        ClassCoordinates {
            values: vec![Integer::new(); self.invariant_factors.len()],
            presentation_sha256: self.binding_sha256(),
        }
    }

    /// Map a factor-base ideal exponent vector to presentation coordinates.
    pub fn coordinates(&self, exponents: &[Integer]) -> Result<ClassCoordinates, ClassMapError> {
        self.check_exponent_dimension(exponents)?;
        Ok(ClassCoordinates {
            values: self.coordinate_values(exponents)?,
            presentation_sha256: self.binding_sha256(),
        })
    }

    fn coordinate_values(&self, exponents: &[Integer]) -> Result<Vec<Integer>, ClassMapError> {
        if let Some(generator_coordinates) = &self.generator_coordinates {
            let width = self.invariant_factors.len();
            let mut values = vec![Integer::new(); width];
            for (generator, exponent) in exponents.iter().enumerate() {
                for coordinate in 0..width {
                    values[coordinate] += Integer::from(
                        exponent * &generator_coordinates[generator * width + coordinate],
                    );
                }
            }
            for (value, modulus) in values.iter_mut().zip(&self.invariant_factors) {
                *value = canonical_residue(value, modulus);
            }
            return Ok(values);
        }
        let transformed = self.transform_to_smith(exponents)?;
        Ok(self
            .nontrivial_positions
            .iter()
            .zip(&self.invariant_factors)
            .map(|(&position, modulus)| canonical_residue(&transformed[position], modulus))
            .collect())
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
            presentation_sha256: self.binding_sha256(),
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
            presentation_sha256: self.binding_sha256(),
        })
    }

    pub fn verify_relation_maps_to_zero(&self, index: usize) -> Result<(), ClassMapError> {
        if index >= self.relation_count() {
            return Err(ClassMapError::RelationIndexOutOfBounds {
                index,
                relations: self.relation_count(),
            });
        }
        let relation = self.relation_vector(index)?;
        if self
            .coordinate_values(&relation)?
            .iter()
            .any(|value| value != &0)
        {
            return Err(ClassMapError::RelationDoesNotMapToZero { index });
        }
        Ok(())
    }

    pub(crate) fn relation_vector(&self, index: usize) -> Result<Vec<Integer>, ClassMapError> {
        if index >= self.relation_count() {
            return Err(ClassMapError::RelationIndexOutOfBounds {
                index,
                relations: self.relation_count(),
            });
        }
        Ok(if let Some(relations) = &self.relations {
            (0..self.generator_count())
                .map(|row| relations.get(row, index).cloned())
                .collect::<Result<Vec<_>, _>>()?
        } else {
            let generator_to_smith = self
                .compact_generator_to_smith
                .as_ref()
                .expect("compact presentation has a permutation");
            let mut relation = vec![Integer::new(); self.generator_count()];
            relation[index] = self.diagonal[generator_to_smith[index]].clone();
            relation
        })
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
        if self.generator_coordinates.is_some() {
            if exponents.iter().all(|value| value == &0) {
                return Ok(PresentationZeroState::ZeroByVerifiedRelations {
                    relation_combination: RelationCombinationWitness {
                        coefficients: vec![Integer::new(); self.relation_count()],
                    },
                    principal_element: PrincipalElementWitnessState::Identity,
                });
            }
            return Err(ClassMapError::RelationCombinationUnavailable);
        }

        let transformed = self.transform_to_smith(exponents)?;
        let mut diagonal_coordinates = vec![Integer::new(); self.relation_count()];
        for index in 0..self.generator_count() {
            // Coordinates being zero modulo every nontrivial factor, together
            // with the omitted modulus-one factors, makes this exact.
            diagonal_coordinates[index] =
                Integer::from(&transformed[index] / &self.diagonal[index]);
        }
        let coefficients = if let Some(right_transform) = &self.right_transform {
            multiply_matrix_vector(right_transform, &diagonal_coordinates)?
        } else {
            let generator_to_smith = self
                .compact_generator_to_smith
                .as_ref()
                .expect("compact presentation has a permutation");
            (0..self.generator_count())
                .map(|generator| diagonal_coordinates[generator_to_smith[generator]].clone())
                .collect()
        };
        let reconstructed = if let Some(relations) = &self.relations {
            multiply_matrix_vector(relations, &coefficients)?
        } else {
            let generator_to_smith = self
                .compact_generator_to_smith
                .as_ref()
                .expect("compact presentation has a permutation");
            coefficients
                .iter()
                .enumerate()
                .map(|(generator, coefficient)| {
                    Integer::from(coefficient * &self.diagonal[generator_to_smith[generator]])
                })
                .collect()
        };
        if reconstructed != exponents {
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

    fn transform_to_smith(&self, exponents: &[Integer]) -> Result<Vec<Integer>, ClassMapError> {
        if let Some(left_transform) = &self.left_transform {
            return multiply_matrix_vector(left_transform, exponents);
        }
        let generator_to_smith = self
            .compact_generator_to_smith
            .as_ref()
            .expect("compact presentation has a permutation");
        let mut transformed = vec![Integer::new(); self.generator_count()];
        for (generator, value) in exponents.iter().enumerate() {
            transformed[generator_to_smith[generator]] = value.clone();
        }
        Ok(transformed)
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
        if coordinates.presentation_sha256 != self.binding_sha256() {
            return Err(ClassMapError::CoordinatePresentationMismatch);
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
