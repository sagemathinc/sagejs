// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Exact compact authentication for full-rank, small-surplus relation matrices.
//!
//! This module deliberately recognizes a mathematical corridor, not a field.
//! The retained FLINT factorization is only a fast producer of candidate exact
//! data. Before the sealed result is returned, Rust replays the dependency
//! lattice in the collector's original row order, proves its saturation from
//! exact maximal minors, checks `D / K`, verifies a complete mixed-modulus
//! class map and its modular right inverse, and replays an order witness for
//! every nontrivial invariant factor.

use rug::{Complete, Integer};
use std::collections::BTreeSet;

use crate::class_group::{
    ClassGroupError, PreparedCubicRelationPresentation, modular_independent_relation_rows,
};
use crate::class_maps::{ClassMapError, PresentationClassMap};
use crate::flint_normal_form::{
    FlintNormalFormError, FlintSmallSurplusWorkspace, flint_hnf_basis,
    flint_small_surplus_class_order_with_workspace, flint_smith_class_map,
};

const DEGREE: usize = 3;

/// Explicit resource bounds for compact presentation authentication.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CompactPresentationLimits {
    pub maximum_generators: usize,
    pub maximum_surplus_rows: usize,
    /// Maximum exact maximal-minor determinants considered while proving that
    /// the dependency lattice is primitive.
    pub maximum_saturation_minor_trials: usize,
    /// Maximum number of integers retained in the dense dependency basis.
    pub maximum_dependency_entries: usize,
    /// Maximum number of nontrivial invariant factors retained in the compact map.
    pub maximum_invariant_factors: usize,
    /// Maximum combined number of generator-coordinate and preimage entries.
    pub maximum_map_entries: usize,
    /// Maximum absolute bit length of an invariant factor, map coordinate, or
    /// canonical-generator preimage coefficient.
    pub maximum_map_coefficient_bits: usize,
    /// Maximum bytes in the dense factor/coordinate/preimage buffers of the
    /// general Smith producer. A zero limit deliberately disables that route.
    pub maximum_general_smith_bytes: usize,
    /// Conservative cubic work cap for transform-free HNF followed by Smith
    /// coordinates on the reduced full relation lattice. A zero limit
    /// deliberately disables that route.
    pub maximum_general_smith_transform_work: u64,
    /// Exact Rust verification/replay multiply-add budget.
    pub maximum_verification_multiply_adds: u64,
    /// Maximum absolute bit length of a coefficient in a generator-order
    /// witness or in a later target solve through the retained workspace.
    pub maximum_target_coefficient_bits: usize,
}

impl Default for CompactPresentationLimits {
    fn default() -> Self {
        Self {
            maximum_generators: 16_384,
            maximum_surplus_rows: 32,
            maximum_saturation_minor_trials: 32_768,
            maximum_dependency_entries: 1_000_000,
            maximum_invariant_factors: 16_384,
            maximum_map_entries: 2_000_000,
            maximum_map_coefficient_bits: 1_000_000,
            maximum_general_smith_bytes: 64 * 1024 * 1024,
            maximum_general_smith_transform_work: 100_000_000_000,
            maximum_verification_multiply_adds: u64::MAX,
            maximum_target_coefficient_bits: 1_000_000,
        }
    }
}

/// One exact maximal minor used in the dependency-saturation proof.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompactSaturationMinor {
    /// Columns of the dependency matrix, hence original collector row indices.
    pub relation_row_indices: Vec<usize>,
    pub determinant: Integer,
}

/// Exact proof for one normalized cyclic coordinate generator.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompactGeneratorOrderEvidence {
    pub coordinate: usize,
    /// A preimage of the canonical cyclic generator in the free factor-base lattice.
    pub factor_base_exponents: Vec<Integer>,
    /// Original-collector-order coefficients `c` satisfying
    /// `sum_j c[j] relation[j] = d_coordinate * factor_base_exponents`.
    pub relation_coefficients: Vec<Integer>,
}

/// Retained exact solver bound to the verified row ordering.
///
/// The workspace solves against the selected square rows followed by the
/// surplus rows.  This wrapper always returns coefficients in original
/// collector order and independently replays the answer before releasing it.
#[derive(Debug)]
pub struct CompactPresentationSolverData {
    workspace: FlintSmallSurplusWorkspace,
    solver_to_original_rows: Vec<usize>,
    solver_relations: Vec<i64>,
    factor_base_size: usize,
    maximum_target_coefficient_bits: usize,
}

impl CompactPresentationSolverData {
    pub fn solver_to_original_rows(&self) -> &[usize] {
        &self.solver_to_original_rows
    }

    /// Express one or more row-major targets in the verified relation lattice.
    /// The result is target-major and uses original collector relation order.
    pub fn solve_targets(
        &self,
        targets: &[Integer],
    ) -> Result<Vec<Integer>, CompactPresentationError> {
        if targets.is_empty() || !targets.len().is_multiple_of(self.factor_base_size) {
            return Err(CompactPresentationError::InvalidTargetShape);
        }
        let answer = self.workspace.relation_witnesses_mpz(targets)?;
        if answer.relation_count != self.solver_to_original_rows.len()
            || answer.target_count != targets.len() / self.factor_base_size
        {
            return Err(CompactPresentationError::TargetWitnessMismatch { target: usize::MAX });
        }
        if answer.maximum_coefficient_bits > self.maximum_target_coefficient_bits {
            return Err(CompactPresentationError::TargetCoefficientLimit {
                required: answer.maximum_coefficient_bits,
                limit: self.maximum_target_coefficient_bits,
            });
        }
        let relation_count = self.solver_to_original_rows.len();
        let mut original = vec![Integer::from(0); answer.target_count * relation_count];
        for target in 0..answer.target_count {
            for solver_row in 0..relation_count {
                let original_row = self.solver_to_original_rows[solver_row];
                original[target * relation_count + original_row] =
                    answer.coefficients[target * relation_count + solver_row].clone();
            }
            for column in 0..self.factor_base_size {
                let replay = (0..relation_count).fold(Integer::from(0), |sum, solver_row| {
                    sum + &answer.coefficients[target * relation_count + solver_row]
                        * self.solver_relations[solver_row * self.factor_base_size + column]
                });
                if replay != targets[target * self.factor_base_size + column] {
                    return Err(CompactPresentationError::TargetWitnessMismatch { target });
                }
            }
        }
        Ok(original)
    }
}

/// A sealed exact presentation of the quotient by the supplied relations.
///
/// This is still candidate evidence: it proves the finite quotient and all
/// maps relative to the supplied principal relations, not global class-group
/// completeness.
#[derive(Debug)]
pub struct VerifiedCompactPresentation {
    invariant_factors: Vec<Integer>,
    class_number: Integer,
    /// Generator-major normalized coordinates, one bit per invariant factor.
    generator_coordinates: Vec<Integer>,
    /// Dependency-major saturated basis, in original collector row order.
    dependencies: Vec<Vec<Integer>>,
    square_rows: Vec<usize>,
    surplus_rows: Vec<usize>,
    square_determinant: Integer,
    projected_dependency_determinant: Integer,
    saturation_minors: Vec<CompactSaturationMinor>,
    generator_orders: Vec<CompactGeneratorOrderEvidence>,
    solver_data: CompactPresentationSolverData,
}

/// Unforgeable, presentation-bound permission to authenticate compact
/// generator coordinates in a production maximal-order context.
///
/// Only a fully verified [`VerifiedCompactPresentation`] can mint this token,
/// and the digest prevents reuse with another relation matrix or coordinate
/// table elsewhere in the crate.
pub(crate) struct VerifiedCompactCoordinateAuthority {
    presentation_sha256: [u8; 32],
}

impl VerifiedCompactCoordinateAuthority {
    pub(crate) fn authenticates(&self, presentation: &PresentationClassMap) -> bool {
        self.presentation_sha256 == presentation.binding_sha256()
    }
}

impl VerifiedCompactPresentation {
    pub fn invariant_factors(&self) -> &[Integer] {
        &self.invariant_factors
    }

    pub fn class_number(&self) -> &Integer {
        &self.class_number
    }

    pub fn generator_count(&self) -> usize {
        self.solver_data.factor_base_size
    }

    pub fn relation_count(&self) -> usize {
        self.solver_data.solver_to_original_rows.len()
    }

    pub fn coordinates(&self, generator: usize) -> Option<&[Integer]> {
        let width = self.invariant_factors.len();
        (generator < self.generator_count())
            .then(|| &self.generator_coordinates[generator * width..(generator + 1) * width])
    }

    pub fn generator_coordinates(&self) -> &[Integer] {
        &self.generator_coordinates
    }

    pub fn dependencies(&self) -> &[Vec<Integer>] {
        &self.dependencies
    }

    pub fn square_rows(&self) -> &[usize] {
        &self.square_rows
    }

    pub fn surplus_rows(&self) -> &[usize] {
        &self.surplus_rows
    }

    pub fn square_determinant(&self) -> &Integer {
        &self.square_determinant
    }

    pub fn projected_dependency_determinant(&self) -> &Integer {
        &self.projected_dependency_determinant
    }

    pub fn saturation_minors(&self) -> &[CompactSaturationMinor] {
        &self.saturation_minors
    }

    pub fn generator_orders(&self) -> &[CompactGeneratorOrderEvidence] {
        &self.generator_orders
    }

    pub fn solver_data(&self) -> &CompactPresentationSolverData {
        &self.solver_data
    }

    pub(crate) fn authorize_presentation(
        &self,
        presentation: &PresentationClassMap,
    ) -> Result<VerifiedCompactCoordinateAuthority, ClassMapError> {
        if presentation.generator_count() != self.generator_count()
            || presentation.relation_count() != self.relation_count()
            || presentation.invariant_factors() != self.invariant_factors()
        {
            return Err(ClassMapError::CoordinatePresentationMismatch);
        }
        let mut original_to_solver = vec![usize::MAX; self.relation_count()];
        for (solver_row, &original_row) in
            self.solver_data.solver_to_original_rows.iter().enumerate()
        {
            if original_row >= original_to_solver.len()
                || original_to_solver[original_row] != usize::MAX
            {
                return Err(ClassMapError::CoordinatePresentationMismatch);
            }
            original_to_solver[original_row] = solver_row;
        }
        for (original_row, &solver_row) in original_to_solver.iter().enumerate() {
            if solver_row == usize::MAX {
                return Err(ClassMapError::CoordinatePresentationMismatch);
            }
            let actual = presentation.relation_vector(original_row)?;
            let expected = &self.solver_data.solver_relations
                [solver_row * self.generator_count()..(solver_row + 1) * self.generator_count()];
            if actual.len() != expected.len()
                || actual
                    .iter()
                    .zip(expected)
                    .any(|(actual, expected)| actual != expected)
            {
                return Err(ClassMapError::CoordinatePresentationMismatch);
            }
        }
        let actual_coordinates = presentation
            .compact_generator_coordinates()
            .ok_or(ClassMapError::CoordinatePresentationMismatch)?;
        if actual_coordinates.len() != self.generator_coordinates.len()
            || actual_coordinates
                .iter()
                .zip(&self.generator_coordinates)
                .any(|(actual, expected)| actual != expected)
        {
            return Err(ClassMapError::CoordinatePresentationMismatch);
        }
        Ok(VerifiedCompactCoordinateAuthority {
            presentation_sha256: presentation.binding_sha256(),
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CompactPresentationError {
    InvalidLimits,
    InvalidShape,
    GeneratorLimit { required: usize, limit: usize },
    SurplusLimit { required: usize, limit: usize },
    DependencyEntryLimit { required: usize, limit: usize },
    RankSelection(ClassGroupError),
    Flint(FlintNormalFormError),
    SquareDeterminantMismatch,
    DependencyDoesNotAnnihilate { dependency: usize, column: usize },
    SingularDependencyProjection,
    DependencyProjectionDoesNotDivideSquareDeterminant,
    ClassOrderMismatch,
    SaturationNotProved { trials: usize, gcd: Integer },
    InvariantFactorLimit { required: usize, limit: usize },
    MapEntryLimit { required: usize, limit: usize },
    MapCoefficientLimit { required: usize, limit: usize },
    GeneralSmithDimensionLimit { required: usize, limit: usize },
    GeneralSmithEntryLimit { required: usize, limit: usize },
    GeneralSmithByteLimit { required: usize, limit: usize },
    GeneralSmithWorkLimit { required: u64, limit: u64 },
    VerificationBudgetExceeded { required: u64, limit: u64 },
    InvalidInvariantFactors,
    InvariantFactorProductMismatch,
    ClassMapDoesNotAnnihilate { relation: usize, coordinate: usize },
    ClassMapRankMismatch { expected: usize, actual: usize },
    ClassMapNotSurjective { coordinate: usize },
    InvalidTargetShape,
    TargetCoefficientLimit { required: usize, limit: usize },
    TargetWitnessMismatch { target: usize },
}

impl From<FlintNormalFormError> for CompactPresentationError {
    fn from(value: FlintNormalFormError) -> Self {
        Self::Flint(value)
    }
}

/// Validate all compact dimensions and advertised storage limits before any
/// matrix-wide rank, determinant, or dependency computation.
pub(crate) fn validate_compact_presentation_shape(
    collected: &PreparedCubicRelationPresentation,
    limits: CompactPresentationLimits,
) -> Result<(usize, usize), CompactPresentationError> {
    if limits.maximum_generators == 0
        || limits.maximum_surplus_rows == 0
        || limits.maximum_saturation_minor_trials == 0
        || limits.maximum_dependency_entries == 0
        || limits.maximum_invariant_factors == 0
        || limits.maximum_map_entries == 0
        || limits.maximum_map_coefficient_bits == 0
        || limits.maximum_target_coefficient_bits == 0
    {
        return Err(CompactPresentationError::InvalidLimits);
    }
    let generators = collected.factor_base.exact_ideals.len();
    if generators == 0
        || collected.relations.len() % generators != 0
        || collected.generators.len() % DEGREE != 0
    {
        return Err(CompactPresentationError::InvalidShape);
    }
    if generators > limits.maximum_generators {
        return Err(CompactPresentationError::GeneratorLimit {
            required: generators,
            limit: limits.maximum_generators,
        });
    }
    let relation_count = collected.relations.len() / generators;
    if relation_count <= generators
        || collected.first_nonzero_hints.len() != relation_count
        || collected.generators.len() / DEGREE != relation_count
        || collected.metadata.len() != relation_count.saturating_mul(DEGREE)
    {
        return Err(CompactPresentationError::InvalidShape);
    }
    let surplus = relation_count - generators;
    if surplus > limits.maximum_surplus_rows {
        return Err(CompactPresentationError::SurplusLimit {
            required: surplus,
            limit: limits.maximum_surplus_rows,
        });
    }
    let dependency_entries = surplus.checked_mul(relation_count).ok_or(
        CompactPresentationError::DependencyEntryLimit {
            required: usize::MAX,
            limit: limits.maximum_dependency_entries,
        },
    )?;
    if dependency_entries > limits.maximum_dependency_entries {
        return Err(CompactPresentationError::DependencyEntryLimit {
            required: dependency_entries,
            limit: limits.maximum_dependency_entries,
        });
    }
    Ok((generators, relation_count))
}

/// Authenticate a full-rank small-surplus presentation without using any
/// field identity, polynomial coefficient, expected class number, or Row-6
/// recognition.
pub fn authenticate_compact_presentation(
    collected: &PreparedCubicRelationPresentation,
    limits: CompactPresentationLimits,
) -> Result<VerifiedCompactPresentation, CompactPresentationError> {
    let (generators, relation_count) = validate_compact_presentation_shape(collected, limits)?;
    let surplus = relation_count - generators;

    // Collector status booleans are telemetry.  Recompute full rank and the
    // precise row partition from the relation matrix itself.
    let exact_first_nonzero_hints = collected
        .relations
        .chunks_exact(generators)
        .map(|row| {
            row.iter()
                .position(|entry| *entry != 0)
                .map_or(generators + 1, |column| column + 1)
        })
        .collect::<Vec<_>>();
    let (square, square_rows) = modular_independent_relation_rows(
        &collected.relations,
        &exact_first_nonzero_hints,
        generators,
    )
    .map_err(CompactPresentationError::RankSelection)?;
    let selected = square_rows.iter().copied().collect::<BTreeSet<_>>();
    let surplus_rows = (0..relation_count)
        .filter(|row| !selected.contains(row))
        .collect::<Vec<_>>();
    if surplus_rows.len() != surplus {
        return Err(CompactPresentationError::InvalidShape);
    }
    let mut surplus_relations = Vec::with_capacity(surplus * generators);
    for &row in &surplus_rows {
        surplus_relations
            .extend_from_slice(&collected.relations[row * generators..(row + 1) * generators]);
    }

    let (compact, workspace) =
        flint_small_surplus_class_order_with_workspace(&square, &surplus_relations, generators)?;
    // The FLINT bridge computes this determinant exactly as part of the same
    // fraction-free factorization that produces the retained dependency
    // workspace. Recomputing the 1,130-square determinant with a second
    // scalar GMP Bareiss pass costs more than the entire remaining class-group
    // computation and does not remove the need to trust an exact arithmetic
    // kernel. Keep the original square rows and determinant in the returned
    // evidence so a detached verifier can replay them. The live boundary still
    // independently replays every dependency, proves saturation from exact
    // small minors, checks D/K, and verifies the complete mod-two class map.
    let mut square_determinant = compact.square_determinant.clone();
    square_determinant.abs_mut();
    if square_determinant == 0 {
        return Err(CompactPresentationError::SquareDeterminantMismatch);
    }

    let mut solver_to_original_rows = square_rows.clone();
    solver_to_original_rows.extend_from_slice(&surplus_rows);
    let mut solver_relations = square.clone();
    solver_relations.extend_from_slice(&surplus_relations);
    let dependencies = reorder_and_verify_dependencies(
        &compact.dependency_coefficients,
        surplus,
        &solver_to_original_rows,
        &collected.relations,
        generators,
    )?;

    let projected = dependencies
        .iter()
        .flat_map(|dependency| surplus_rows.iter().map(|&row| dependency[row].clone()))
        .collect::<Vec<_>>();
    let mut projected_determinant = determinant_bareiss(&projected, surplus)?;
    projected_determinant.abs_mut();
    if projected_determinant == 0 {
        return Err(CompactPresentationError::SingularDependencyProjection);
    }
    let saturation_minors = saturation_minor_certificate(
        &dependencies,
        &surplus_rows,
        limits.maximum_saturation_minor_trials,
    )?;
    if Integer::from(&square_determinant % &projected_determinant) != 0 {
        return Err(CompactPresentationError::DependencyProjectionDoesNotDivideSquareDeterminant);
    }
    let class_number = Integer::from(&square_determinant / &projected_determinant);
    if class_number != compact.class_order {
        return Err(CompactPresentationError::ClassOrderMismatch);
    }
    // FLINT is only a producer for the compact Smith map.  The exact D/K
    // index proof above remains the authority; Rust independently verifies
    // the map, its mixed-modulus right inverse, and the invariant-factor
    // product before accepting it.
    let elementary_order = Integer::from(1) << compact.two_rank;
    let (invariant_factors, generator_coordinates, generator_preimages): (
        Vec<Integer>,
        Vec<Integer>,
        Vec<Integer>,
    ) = if class_number == elementary_order {
        preflight_retained_map(generators, compact.two_rank, limits)?;
        let (normalized, selected) =
            normalize_gf2_map(&compact.generator_coordinates, generators, compact.two_rank)?;
        let mut preimages = vec![Integer::from(0); compact.two_rank * generators];
        for (coordinate, generator) in selected.into_iter().enumerate() {
            preimages[coordinate * generators + generator] = Integer::from(1);
        }
        (
            vec![Integer::from(2); compact.two_rank],
            normalized.into_iter().map(Integer::from).collect(),
            preimages,
        )
    } else {
        preflight_general_smith(generators, surplus, limits)?;
        // Reduce the complete relation lattice before asking for any Smith
        // transforms. The resulting HNF basis has determinant equal to the
        // final class order, avoiding the enormous incidental transforms of
        // the selected square sublattice. Rust below still verifies every
        // original relation, the mixed-modulus right inverse, and the exact
        // invariant-factor product before accepting the map.
        let reduced_basis = flint_hnf_basis(&solver_relations, relation_count, generators)?;
        let smith_map = flint_smith_class_map(&reduced_basis, generators)?;
        (
            smith_map
                .invariant_factors
                .into_iter()
                .map(Integer::from)
                .collect(),
            smith_map
                .generator_coordinates
                .into_iter()
                .map(Integer::from)
                .collect(),
            smith_map
                .generator_preimages
                .into_iter()
                .map(Integer::from)
                .collect(),
        )
    };
    let invariant_count = invariant_factors.len();
    preflight_retained_map(generators, invariant_count, limits)?;
    let verification_multiply_adds =
        compact_verification_multiply_adds(generators, relation_count, invariant_count).ok_or(
            CompactPresentationError::VerificationBudgetExceeded {
                required: u64::MAX,
                limit: limits.maximum_verification_multiply_adds,
            },
        )?;
    if verification_multiply_adds > limits.maximum_verification_multiply_adds {
        return Err(CompactPresentationError::VerificationBudgetExceeded {
            required: verification_multiply_adds,
            limit: limits.maximum_verification_multiply_adds,
        });
    }
    verify_mixed_modulus_map(
        &invariant_factors,
        &generator_coordinates,
        &generator_preimages,
        &collected.relations,
        generators,
        &class_number,
        limits.maximum_map_coefficient_bits,
    )?;

    let solver_data = CompactPresentationSolverData {
        workspace,
        solver_to_original_rows,
        solver_relations,
        factor_base_size: generators,
        maximum_target_coefficient_bits: limits.maximum_target_coefficient_bits,
    };
    let generator_orders = if invariant_count == 0 {
        Vec::new()
    } else {
        let mut targets = vec![Integer::from(0); invariant_count * generators];
        for coordinate in 0..invariant_count {
            for generator in 0..generators {
                targets[coordinate * generators + generator] = Integer::from(
                    &invariant_factors[coordinate]
                        * &generator_preimages[coordinate * generators + generator],
                );
            }
        }
        let coefficients = solver_data.solve_targets(&targets)?;
        (0..invariant_count)
            .map(|coordinate| CompactGeneratorOrderEvidence {
                coordinate,
                factor_base_exponents: generator_preimages
                    [coordinate * generators..(coordinate + 1) * generators]
                    .to_vec(),
                relation_coefficients: coefficients
                    [coordinate * relation_count..(coordinate + 1) * relation_count]
                    .to_vec(),
            })
            .collect()
    };

    Ok(VerifiedCompactPresentation {
        invariant_factors,
        class_number,
        generator_coordinates,
        dependencies,
        square_rows,
        surplus_rows,
        square_determinant,
        projected_dependency_determinant: projected_determinant,
        saturation_minors,
        generator_orders,
        solver_data,
    })
}

fn preflight_retained_map(
    generators: usize,
    invariant_count: usize,
    limits: CompactPresentationLimits,
) -> Result<(), CompactPresentationError> {
    if invariant_count > limits.maximum_invariant_factors {
        return Err(CompactPresentationError::InvariantFactorLimit {
            required: invariant_count,
            limit: limits.maximum_invariant_factors,
        });
    }
    let map_entries = generators
        .checked_mul(invariant_count)
        .and_then(|entries| entries.checked_mul(2))
        .ok_or(CompactPresentationError::MapEntryLimit {
            required: usize::MAX,
            limit: limits.maximum_map_entries,
        })?;
    if map_entries > limits.maximum_map_entries {
        return Err(CompactPresentationError::MapEntryLimit {
            required: map_entries,
            limit: limits.maximum_map_entries,
        });
    }
    Ok(())
}

fn preflight_general_smith(
    generators: usize,
    surplus: usize,
    limits: CompactPresentationLimits,
) -> Result<(), CompactPresentationError> {
    if generators > limits.maximum_invariant_factors {
        return Err(CompactPresentationError::GeneralSmithDimensionLimit {
            required: generators,
            limit: limits.maximum_invariant_factors,
        });
    }
    let square_entries = generators.checked_mul(generators).ok_or(
        CompactPresentationError::GeneralSmithEntryLimit {
            required: usize::MAX,
            limit: limits.maximum_map_entries,
        },
    )?;
    // The producer must provision both complete generator-coordinate and
    // preimage maps before the actual invariant count is known.
    let map_entries =
        square_entries
            .checked_mul(2)
            .ok_or(CompactPresentationError::GeneralSmithEntryLimit {
                required: usize::MAX,
                limit: limits.maximum_map_entries,
            })?;
    if map_entries > limits.maximum_map_entries {
        return Err(CompactPresentationError::GeneralSmithEntryLimit {
            required: map_entries,
            limit: limits.maximum_map_entries,
        });
    }
    // Conservative fixed-slot peak: initial/reduced/final Rust maps and
    // relations (eight squares plus the surplus rectangle and two factor
    // vectors), together with the five simultaneous FLINT fmpz matrix slot
    // arrays used by a transform-bearing square Smith call. This deliberately
    // excludes allocator metadata and dynamically grown intermediate fmpz
    // limbs. Those limbs do not have an allocator-hard byte cap here; the
    // admitted matrix dimension, i64 input representation, and transform-work
    // cap bound the practical corridor, while output coefficients are checked
    // independently after the producer returns.
    let dense_slots = square_entries
        .checked_mul(13)
        .and_then(|entries| entries.checked_add(surplus.checked_mul(generators)?))
        .and_then(|entries| entries.checked_add(generators.checked_mul(2)?))
        .ok_or(CompactPresentationError::GeneralSmithByteLimit {
            required: usize::MAX,
            limit: limits.maximum_general_smith_bytes,
        })?;
    let dense_bytes = dense_slots.checked_mul(std::mem::size_of::<i64>()).ok_or(
        CompactPresentationError::GeneralSmithByteLimit {
            required: usize::MAX,
            limit: limits.maximum_general_smith_bytes,
        },
    )?;
    if dense_bytes > limits.maximum_general_smith_bytes {
        return Err(CompactPresentationError::GeneralSmithByteLimit {
            required: dense_bytes,
            limit: limits.maximum_general_smith_bytes,
        });
    }
    let dimension =
        u64::try_from(generators).map_err(|_| CompactPresentationError::GeneralSmithWorkLimit {
            required: u64::MAX,
            limit: limits.maximum_general_smith_transform_work,
        })?;
    let surplus =
        u64::try_from(surplus).map_err(|_| CompactPresentationError::GeneralSmithWorkLimit {
            required: u64::MAX,
            limit: limits.maximum_general_smith_transform_work,
        })?;
    let square = dimension.checked_mul(dimension).ok_or(
        CompactPresentationError::GeneralSmithWorkLimit {
            required: u64::MAX,
            limit: limits.maximum_general_smith_transform_work,
        },
    )?;
    // Transform-free rectangular HNF plus transform-bearing Smith on its
    // reduced square basis: 2*m^3 + surplus*m^2. Unlike the previous route,
    // no Smith transform or map composition is performed on the large-index
    // selected square sublattice.
    let work = square
        .checked_mul(dimension)
        .and_then(|cube| cube.checked_mul(2))
        .and_then(|base| {
            surplus
                .checked_mul(square)
                .and_then(|tail| base.checked_add(tail))
        })
        .ok_or(CompactPresentationError::GeneralSmithWorkLimit {
            required: u64::MAX,
            limit: limits.maximum_general_smith_transform_work,
        })?;
    if work > limits.maximum_general_smith_transform_work {
        return Err(CompactPresentationError::GeneralSmithWorkLimit {
            required: work,
            limit: limits.maximum_general_smith_transform_work,
        });
    }
    Ok(())
}

pub(crate) fn compact_verification_multiply_adds(
    generators: usize,
    relations: usize,
    invariant_count: usize,
) -> Option<u64> {
    let generators = u64::try_from(generators).ok()?;
    let relations = u64::try_from(relations).ok()?;
    let surplus = relations.checked_sub(generators)?;
    let invariant_count = u64::try_from(invariant_count).ok()?;
    let dense_passes = surplus.checked_add(invariant_count.checked_mul(4)?)?;
    let dense = generators
        .checked_mul(relations)?
        .checked_mul(dense_passes)?;
    let right_inverse = generators
        .checked_mul(invariant_count)?
        .checked_mul(invariant_count)?;
    dense.checked_add(right_inverse)
}

fn reorder_and_verify_dependencies(
    solver_dependencies: &[Integer],
    rank: usize,
    solver_to_original_rows: &[usize],
    original_relations: &[i64],
    columns: usize,
) -> Result<Vec<Vec<Integer>>, CompactPresentationError> {
    let relation_count = solver_to_original_rows.len();
    if solver_dependencies.len() != rank.saturating_mul(relation_count)
        || original_relations.len() != relation_count.saturating_mul(columns)
    {
        return Err(CompactPresentationError::InvalidShape);
    }
    let mut answer = Vec::with_capacity(rank);
    for dependency in 0..rank {
        let mut reordered = vec![Integer::from(0); relation_count];
        for solver_row in 0..relation_count {
            reordered[solver_to_original_rows[solver_row]] =
                solver_dependencies[dependency * relation_count + solver_row].clone();
        }
        for column in 0..columns {
            let replay = (0..relation_count).fold(Integer::from(0), |sum, row| {
                sum + &reordered[row] * original_relations[row * columns + column]
            });
            if replay != 0 {
                return Err(CompactPresentationError::DependencyDoesNotAnnihilate {
                    dependency,
                    column,
                });
            }
        }
        answer.push(reordered);
    }
    Ok(answer)
}

fn determinant_bareiss(
    entries: &[Integer],
    size: usize,
) -> Result<Integer, CompactPresentationError> {
    if entries.len() != size.saturating_mul(size) {
        return Err(CompactPresentationError::InvalidShape);
    }
    if size == 0 {
        return Ok(Integer::from(1));
    }
    let mut matrix = entries.to_vec();
    let mut previous = Integer::from(1);
    let mut sign = 1_i8;
    for pivot_column in 0..size.saturating_sub(1) {
        let Some(pivot_row) =
            (pivot_column..size).find(|&row| matrix[row * size + pivot_column] != 0)
        else {
            return Ok(Integer::from(0));
        };
        if pivot_row != pivot_column {
            for column in 0..size {
                matrix.swap(pivot_row * size + column, pivot_column * size + column);
            }
            sign = -sign;
        }
        let pivot = matrix[pivot_column * size + pivot_column].clone();
        for row in pivot_column + 1..size {
            for column in pivot_column + 1..size {
                let numerator = Integer::from(&matrix[row * size + column] * &pivot)
                    - Integer::from(
                        &matrix[row * size + pivot_column] * &matrix[pivot_column * size + column],
                    );
                if Integer::from(&numerator % &previous) != 0 {
                    return Err(CompactPresentationError::SquareDeterminantMismatch);
                }
                matrix[row * size + column] = numerator / &previous;
            }
            matrix[row * size + pivot_column] = Integer::from(0);
        }
        previous = pivot;
    }
    let mut result = matrix[(size - 1) * size + size - 1].clone();
    if sign < 0 {
        result = -result;
    }
    Ok(result)
}

fn dependency_minor(
    dependencies: &[Vec<Integer>],
    columns: &[usize],
) -> Result<Integer, CompactPresentationError> {
    let rank = dependencies.len();
    if columns.len() != rank
        || dependencies
            .iter()
            .any(|row| columns.iter().any(|&column| column >= row.len()))
    {
        return Err(CompactPresentationError::InvalidShape);
    }
    determinant_bareiss(
        &dependencies
            .iter()
            .flat_map(|row| columns.iter().map(|&column| row[column].clone()))
            .collect::<Vec<_>>(),
        rank,
    )
}

pub(crate) fn modular_basis_columns(
    dependencies: &[Vec<Integer>],
    prime: u32,
) -> Option<Vec<usize>> {
    let columns = dependencies.first()?.len();
    modular_basis_columns_in_order(dependencies, prime, &(0..columns).collect::<Vec<_>>())
}

pub(crate) fn modular_basis_columns_in_order(
    dependencies: &[Vec<Integer>],
    prime: u32,
    column_order: &[usize],
) -> Option<Vec<usize>> {
    let rank = dependencies.len();
    let columns = dependencies.first()?.len();
    if column_order.len() != columns || column_order.iter().any(|&column| column >= columns) {
        return None;
    }
    let mut basis = Vec::<(usize, Vec<u32>, usize)>::with_capacity(rank);
    for &column in column_order {
        let mut vector = dependencies
            .iter()
            .map(|dependency| {
                let mut residue = Integer::from(&dependency[column] % prime);
                if residue < 0 {
                    residue += prime;
                }
                residue.to_u32_wrapping()
            })
            .collect::<Vec<_>>();
        for (pivot, row, _) in &basis {
            let multiplier = vector[*pivot];
            if multiplier != 0 {
                for index in 0..rank {
                    vector[index] = (vector[index] + prime
                        - ((u64::from(multiplier) * u64::from(row[index])) % u64::from(prime))
                            as u32)
                        % prime;
                }
            }
        }
        let Some(pivot) = vector.iter().position(|&entry| entry != 0) else {
            continue;
        };
        let inverse = (1..prime).find(|candidate| {
            (u64::from(*candidate) * u64::from(vector[pivot])) % u64::from(prime) == 1
        })?;
        for entry in &mut vector {
            *entry = ((u64::from(*entry) * u64::from(inverse)) % u64::from(prime)) as u32;
        }
        basis.push((pivot, vector, column));
        if basis.len() == rank {
            return Some(basis.into_iter().map(|(_, _, column)| column).collect());
        }
    }
    None
}

pub(crate) fn saturation_minor_certificate(
    dependencies: &[Vec<Integer>],
    preferred_columns: &[usize],
    maximum_trials: usize,
) -> Result<Vec<CompactSaturationMinor>, CompactPresentationError> {
    let rank = dependencies.len();
    let columns = dependencies.first().map_or(0, Vec::len);
    if rank == 0 || preferred_columns.len() != rank || columns < rank {
        return Err(CompactPresentationError::InvalidShape);
    }
    let mut selected = Vec::new();
    let mut seen = BTreeSet::<Vec<usize>>::new();
    let mut gcd = Integer::from(0);
    let mut trials = 0_usize;

    if consider_saturation_minor(
        dependencies,
        preferred_columns.to_vec(),
        maximum_trials,
        &mut trials,
        &mut seen,
        &mut gcd,
        &mut selected,
    )? {
        return Ok(selected);
    }
    // A single maximal minor often leaves only a small residual index.  When
    // that residual fits a word, factor it exactly and select one full-rank
    // minor modulo each prime divisor.  Such a minor is not divisible by that
    // prime, so the accumulated determinant gcd loses the factor without a
    // broad combinatorial minor search.
    if let Some(residual) = gcd.to_u32() {
        for prime in distinct_prime_factors_u32(residual) {
            if let Some(candidate) = modular_basis_columns(dependencies, prime)
                && consider_saturation_minor(
                    dependencies,
                    candidate,
                    maximum_trials,
                    &mut trials,
                    &mut seen,
                    &mut gcd,
                    &mut selected,
                )?
            {
                return Ok(selected);
            }
        }
    }
    // Independent modular bases diversify all columns at once and typically
    // make the determinant gcd one in only a few exact minors. Try them before
    // local single-column substitutions so a budget comparable to the rank is
    // not consumed exploring one narrow neighborhood of the preferred minor.
    for prime in [65_519_u32, 65_513, 65_497, 65_483, 2, 3, 5, 7, 11, 13, 17] {
        if let Some(candidate) = modular_basis_columns(dependencies, prime)
            && consider_saturation_minor(
                dependencies,
                candidate,
                maximum_trials,
                &mut trials,
                &mut seen,
                &mut gcd,
                &mut selected,
            )?
        {
            return Ok(selected);
        }
        if trials == maximum_trials {
            return Err(CompactPresentationError::SaturationNotProved { trials, gcd });
        }
    }
    for replacement in 0..columns {
        for position in 0..rank {
            let mut candidate = preferred_columns.to_vec();
            candidate[position] = replacement;
            if consider_saturation_minor(
                dependencies,
                candidate,
                maximum_trials,
                &mut trials,
                &mut seen,
                &mut gcd,
                &mut selected,
            )? {
                return Ok(selected);
            }
            if trials == maximum_trials {
                return Err(CompactPresentationError::SaturationNotProved { trials, gcd });
            }
        }
    }
    let mut state = 0x9e37_79b9_7f4a_7c15_u64
        ^ (columns as u64).rotate_left(17)
        ^ (rank as u64).rotate_left(41);
    let maximum_random_attempts = maximum_trials.saturating_mul(4);
    for _ in 0..maximum_random_attempts {
        if trials == maximum_trials {
            break;
        }
        let mut candidate = Vec::with_capacity(rank);
        while candidate.len() < rank {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let column = (state % columns as u64) as usize;
            if !candidate.contains(&column) {
                candidate.push(column);
            }
        }
        if consider_saturation_minor(
            dependencies,
            candidate,
            maximum_trials,
            &mut trials,
            &mut seen,
            &mut gcd,
            &mut selected,
        )? {
            return Ok(selected);
        }
    }
    Err(CompactPresentationError::SaturationNotProved { trials, gcd })
}

fn distinct_prime_factors_u32(mut value: u32) -> Vec<u32> {
    let mut factors = Vec::new();
    let mut divisor = 2_u32;
    while u64::from(divisor) * u64::from(divisor) <= u64::from(value) {
        if value.is_multiple_of(divisor) {
            factors.push(divisor);
            while value.is_multiple_of(divisor) {
                value /= divisor;
            }
        }
        divisor += if divisor == 2 { 1 } else { 2 };
    }
    if value > 1 {
        factors.push(value);
    }
    factors
}

#[allow(clippy::too_many_arguments)]
fn consider_saturation_minor(
    dependencies: &[Vec<Integer>],
    mut candidate: Vec<usize>,
    maximum_trials: usize,
    trials: &mut usize,
    seen: &mut BTreeSet<Vec<usize>>,
    gcd: &mut Integer,
    selected: &mut Vec<CompactSaturationMinor>,
) -> Result<bool, CompactPresentationError> {
    let rank = dependencies.len();
    candidate.sort_unstable();
    candidate.dedup();
    if candidate.len() != rank || !seen.insert(candidate.clone()) {
        return Ok(false);
    }
    if *trials == maximum_trials {
        return Ok(false);
    }
    *trials += 1;
    let mut determinant = dependency_minor(dependencies, &candidate)?;
    determinant.abs_mut();
    if determinant == 0 {
        return Ok(false);
    }
    let next = gcd.gcd_ref(&determinant).complete();
    if next != *gcd {
        *gcd = next;
        selected.push(CompactSaturationMinor {
            relation_row_indices: candidate,
            determinant,
        });
    }
    Ok(*gcd == 1)
}

fn verify_mixed_modulus_map(
    invariant_factors: &[Integer],
    coordinates: &[Integer],
    preimages: &[Integer],
    relations: &[i64],
    generators: usize,
    class_number: &Integer,
    maximum_coefficient_bits: usize,
) -> Result<(), CompactPresentationError> {
    let width = invariant_factors.len();
    let expected = generators
        .checked_mul(width)
        .ok_or(CompactPresentationError::InvalidShape)?;
    if coordinates.len() != expected
        || preimages.len() != expected
        || !relations.len().is_multiple_of(generators)
        || invariant_factors.iter().any(|factor| factor <= &1)
        || invariant_factors
            .windows(2)
            .any(|pair| Integer::from(&pair[1] % &pair[0]) != 0)
    {
        return Err(CompactPresentationError::InvalidInvariantFactors);
    }
    let product = invariant_factors
        .iter()
        .fold(Integer::from(1), |product, factor| product * factor);
    if &product != class_number {
        return Err(CompactPresentationError::InvariantFactorProductMismatch);
    }
    if width == 0 {
        return Ok(());
    }
    let exponent = invariant_factors.last().expect("nonempty factors");
    for value in invariant_factors.iter().chain(coordinates).chain(preimages) {
        if value.significant_bits() as usize > maximum_coefficient_bits {
            return Err(CompactPresentationError::MapCoefficientLimit {
                required: value.significant_bits() as usize,
                limit: maximum_coefficient_bits,
            });
        }
    }
    for generator in 0..generators {
        for coordinate in 0..width {
            let value = &coordinates[generator * width + coordinate];
            if value < &0 || value >= &invariant_factors[coordinate] {
                return Err(CompactPresentationError::InvalidInvariantFactors);
            }
        }
    }
    if preimages
        .iter()
        .any(|value| value < &0 || value >= exponent)
    {
        return Err(CompactPresentationError::InvalidInvariantFactors);
    }
    for (relation, row) in relations.chunks_exact(generators).enumerate() {
        for coordinate in 0..width {
            let modulus = &invariant_factors[coordinate];
            let mut sum = Integer::from(0);
            for generator in 0..generators {
                sum += Integer::from(&coordinates[generator * width + coordinate] * row[generator]);
            }
            sum %= modulus;
            if sum < 0 {
                sum += modulus;
            }
            if sum != 0 {
                return Err(CompactPresentationError::ClassMapDoesNotAnnihilate {
                    relation,
                    coordinate,
                });
            }
        }
    }
    for source_coordinate in 0..width {
        for target_coordinate in 0..width {
            let modulus = &invariant_factors[target_coordinate];
            let mut sum = Integer::from(0);
            for generator in 0..generators {
                sum += Integer::from(
                    &preimages[source_coordinate * generators + generator]
                        * &coordinates[generator * width + target_coordinate],
                );
            }
            sum %= modulus;
            if sum < 0 {
                sum += modulus;
            }
            let expected = Integer::from(if source_coordinate == target_coordinate {
                1
            } else {
                0
            });
            if sum != expected {
                return Err(CompactPresentationError::ClassMapNotSurjective {
                    coordinate: source_coordinate,
                });
            }
        }
    }
    Ok(())
}

fn normalize_gf2_map(
    coordinates: &[u8],
    generators: usize,
    rank: usize,
) -> Result<(Vec<u8>, Vec<usize>), CompactPresentationError> {
    if coordinates.len() != generators.saturating_mul(rank)
        || coordinates.iter().any(|&entry| entry > 1)
    {
        return Err(CompactPresentationError::InvalidShape);
    }
    if rank == 0 {
        return Ok((Vec::new(), Vec::new()));
    }
    let mut basis = Vec::<(usize, Vec<u8>, usize)>::with_capacity(rank);
    for generator in 0..generators {
        let mut row = coordinates[generator * rank..(generator + 1) * rank].to_vec();
        for (pivot, basis_row, _) in &basis {
            if row[*pivot] != 0 {
                for column in 0..rank {
                    row[column] ^= basis_row[column];
                }
            }
        }
        if let Some(pivot) = row.iter().position(|&entry| entry != 0) {
            for (_, basis_row, _) in &mut basis {
                if basis_row[pivot] != 0 {
                    for column in 0..rank {
                        basis_row[column] ^= row[column];
                    }
                }
            }
            basis.push((pivot, row, generator));
            basis.sort_by_key(|entry| entry.0);
            if basis.len() == rank {
                break;
            }
        }
    }
    if basis.len() != rank {
        return Err(CompactPresentationError::ClassMapRankMismatch {
            expected: rank,
            actual: basis.len(),
        });
    }
    let selected = basis.iter().map(|entry| entry.2).collect::<Vec<_>>();
    let mut augmented = vec![vec![0_u8; 2 * rank]; rank];
    for row in 0..rank {
        augmented[row][..rank]
            .copy_from_slice(&coordinates[selected[row] * rank..(selected[row] + 1) * rank]);
        augmented[row][rank + row] = 1;
    }
    for column in 0..rank {
        let pivot = (column..rank)
            .find(|&row| augmented[row][column] != 0)
            .ok_or(CompactPresentationError::ClassMapRankMismatch {
                expected: rank,
                actual: column,
            })?;
        augmented.swap(column, pivot);
        for row in 0..rank {
            if row != column && augmented[row][column] != 0 {
                for entry in column..2 * rank {
                    augmented[row][entry] ^= augmented[column][entry];
                }
            }
        }
    }
    let mut normalized = vec![0_u8; coordinates.len()];
    for generator in 0..generators {
        for coordinate in 0..rank {
            normalized[generator * rank + coordinate] = (0..rank).fold(0, |value, index| {
                value
                    ^ (coordinates[generator * rank + index] & augmented[index][rank + coordinate])
            });
        }
    }
    for (coordinate, &generator) in selected.iter().enumerate() {
        for image in 0..rank {
            if normalized[generator * rank + image] != u8::from(image == coordinate) {
                return Err(CompactPresentationError::ClassMapRankMismatch {
                    expected: rank,
                    actual: coordinate,
                });
            }
        }
    }
    Ok((normalized, selected))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retained_map_preflight_counts_coordinates_and_preimages() {
        let limits = CompactPresentationLimits {
            maximum_map_entries: 11,
            ..CompactPresentationLimits::default()
        };
        assert_eq!(
            preflight_retained_map(3, 2, limits),
            Err(CompactPresentationError::MapEntryLimit {
                required: 12,
                limit: 11,
            })
        );
    }

    #[test]
    fn saturation_can_be_proved_without_a_unit_minor() {
        let dependencies = vec![vec![Integer::from(2), Integer::from(3)]];
        let evidence = saturation_minor_certificate(&dependencies, &[0], 8).unwrap();
        assert_eq!(evidence.len(), 2);
        assert_eq!(evidence[0].determinant, 2);
        assert_eq!(evidence[1].determinant, 3);
    }

    #[test]
    fn saturation_uses_diverse_modular_bases_with_a_rank_sized_budget() {
        let dependencies = vec![
            vec![0, 1, 0, 0].into_iter().map(Integer::from).collect(),
            vec![6, 0, 3, 2].into_iter().map(Integer::from).collect(),
        ];
        let evidence = saturation_minor_certificate(&dependencies, &[0, 1], 3).unwrap();
        assert_eq!(evidence.len(), 3);
        assert_eq!(evidence[0].determinant.clone().abs(), 6);
        assert_eq!(evidence[1].determinant.clone().abs(), 3);
        assert_eq!(evidence[2].determinant.clone().abs(), 2);
    }

    #[test]
    fn dependency_reorder_preserves_original_relation_order() {
        // Solver rows are original rows [1, 0, 2].  (-1, 2, 1) therefore
        // becomes (2, -1, 1), annihilating [2], [3], [-1].
        let dependencies = reorder_and_verify_dependencies(
            &[Integer::from(-1), Integer::from(2), Integer::from(1)],
            1,
            &[1, 0, 2],
            &[2, 3, -1],
            1,
        )
        .unwrap();
        assert_eq!(
            dependencies[0],
            [Integer::from(2), Integer::from(-1), Integer::from(1)]
        );
    }

    #[test]
    fn mixed_modulus_map_accepts_c2_by_c4_and_c4_by_c8() {
        for (factors, relations, class_number) in [
            (
                vec![Integer::from(2), Integer::from(4)],
                vec![2, 0, 0, 4],
                Integer::from(8),
            ),
            (
                vec![Integer::from(4), Integer::from(8)],
                vec![4, 0, 0, 8],
                Integer::from(32),
            ),
        ] {
            let coordinates = vec![
                Integer::from(1),
                Integer::from(0),
                Integer::from(0),
                Integer::from(1),
            ];
            let preimages = coordinates.clone();
            verify_mixed_modulus_map(
                &factors,
                &coordinates,
                &preimages,
                &relations,
                2,
                &class_number,
                64,
            )
            .unwrap();
        }
    }

    #[test]
    fn mixed_modulus_map_rejects_coordinatewise_but_not_joint_surjectivity() {
        // On C2 x C4, both target coordinates are individually hit, but
        // (0,2) and (1,1) generate only the cyclic subgroup of order four.
        let factors = [Integer::from(2), Integer::from(4)];
        let coordinates = [
            Integer::from(0),
            Integer::from(2),
            Integer::from(1),
            Integer::from(1),
        ];
        let counterfeit_preimages = [
            Integer::from(1),
            Integer::from(0),
            Integer::from(0),
            Integer::from(1),
        ];
        assert!(matches!(
            verify_mixed_modulus_map(
                &factors,
                &coordinates,
                &counterfeit_preimages,
                &[2, 0, 0, 4],
                2,
                &Integer::from(8),
                64,
            ),
            Err(CompactPresentationError::ClassMapNotSurjective { .. })
        ));
    }

    #[test]
    fn elementary_fast_and_general_routes_verify_the_same_quotient() {
        let square = [2, 0, 0, 2];
        let surplus = [2, 2];
        let relations = [2, 0, 0, 2, 2, 2];
        let fast = crate::flint_normal_form::flint_small_surplus_class_order(&square, &surplus, 2)
            .unwrap();
        let (fast_coordinates, selected) =
            normalize_gf2_map(&fast.generator_coordinates, 2, fast.two_rank).unwrap();
        let mut fast_preimages = vec![Integer::from(0); fast.two_rank * 2];
        for (coordinate, generator) in selected.into_iter().enumerate() {
            fast_preimages[coordinate * 2 + generator] = Integer::from(1);
        }
        let fast_factors = vec![Integer::from(2); fast.two_rank];
        verify_mixed_modulus_map(
            &fast_factors,
            &fast_coordinates
                .into_iter()
                .map(Integer::from)
                .collect::<Vec<_>>(),
            &fast_preimages,
            &relations,
            2,
            &fast.class_order,
            64,
        )
        .unwrap();

        let general =
            crate::flint_normal_form::flint_small_surplus_smith_class_map(&square, &surplus, 2)
                .unwrap();
        let general_factors = general
            .invariant_factors
            .iter()
            .copied()
            .map(Integer::from)
            .collect::<Vec<_>>();
        verify_mixed_modulus_map(
            &general_factors,
            &general
                .generator_coordinates
                .iter()
                .copied()
                .map(Integer::from)
                .collect::<Vec<_>>(),
            &general
                .generator_preimages
                .iter()
                .copied()
                .map(Integer::from)
                .collect::<Vec<_>>(),
            &relations,
            2,
            &fast.class_order,
            64,
        )
        .unwrap();
        assert_eq!(fast_factors, general_factors);
    }
}
