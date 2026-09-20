// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Candidate-only authentication of a collected cubic relation presentation.
//!
//! This phase deliberately stops before unit reconstruction and analytic or
//! unconditional completion.  It proves facts about the quotient by the
//! supplied principal relations; it does not prove that those relations are
//! the complete principal-relation lattice.
//!
//! The first implementation intentionally uses the transform-bearing generic
//! exact Smith reducer.  It is suitable for small public cubics and gives the
//! strongest, easiest-to-replay map.  Large presentations such as row 6 need
//! a later producer-bound version of the retained small-surplus/compact-map
//! algorithm; silently dropping transforms here would weaken the contract.

use rug::Integer;

use crate::arbitrary_ideal_reduction::{
    ArbitraryIdealReductionError, AuthenticatedPresentationClassMap, MaximalCubicOrder,
    PrincipalRelationWitness, authenticate_presentation_class_map,
};
use crate::class_group::PreparedCubicRelationPresentation;
use crate::class_maps::{ClassMapError, PresentationClassMap, RelationCoverage};
use crate::hnf::{BigIntMatrix, ExactNormalFormWorkspace, NormalFormError, NormalFormLimits};
use crate::polynomial_preparation::PreparedPublicCubic;
use crate::prepared_ideal::PreparedIdealWorkspace;

const DEGREE: usize = 3;

/// Bounded exact-normal-form resources for presentation authentication.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CubicPresentationCandidateLimits {
    pub normal_form: NormalFormLimits,
}

impl Default for CubicPresentationCandidateLimits {
    fn default() -> Self {
        Self {
            normal_form: NormalFormLimits {
                max_entries: 10_000_000,
                max_operations: 50_000_000,
            },
        }
    }
}

/// Exact order evidence for one nontrivial Smith generator.
///
/// `factor_base_exponents` represents the generator in the free lattice on
/// the factor base. `relation_coefficients` proves
///
/// ```text
/// relations * relation_coefficients
///     = invariant_factor * factor_base_exponents.
/// ```
///
/// The attached relation witnesses therefore prove that this candidate
/// generator has order dividing `invariant_factor` in the supplied quotient.
/// Exactness of its order follows inside that quotient from the verified Smith
/// decomposition.  Neither statement is a global class-group completeness
/// claim.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CubicCandidateGeneratorOrderEvidence {
    pub smith_position: usize,
    pub invariant_factor: Integer,
    pub factor_base_exponents: Vec<Integer>,
    pub relation_coefficients: Vec<Integer>,
}

/// A sealed, exact view of the quotient by all supplied principal relations.
///
/// The type name intentionally includes `Candidate`: rank plus surplus,
/// transform-verified Smith form, and replayed principal ideals do not prove
/// that the collected lattice is complete.  Unit and analytic/unconditional
/// completion must wrap this object in a stronger type rather than relabel it.
#[derive(Clone, Debug)]
pub struct AuthenticatedCubicPresentationCandidate {
    collected: PreparedCubicRelationPresentation,
    principal_relations: Vec<PrincipalRelationWitness>,
    class_map: AuthenticatedPresentationClassMap,
    generator_orders: Vec<CubicCandidateGeneratorOrderEvidence>,
    class_number_candidate: Integer,
}

impl AuthenticatedCubicPresentationCandidate {
    pub fn collected(&self) -> &PreparedCubicRelationPresentation {
        &self.collected
    }

    pub fn principal_relations(&self) -> &[PrincipalRelationWitness] {
        &self.principal_relations
    }

    pub fn class_map(&self) -> &AuthenticatedPresentationClassMap {
        &self.class_map
    }

    pub fn generator_orders(&self) -> &[CubicCandidateGeneratorOrderEvidence] {
        &self.generator_orders
    }

    pub fn invariant_factors(&self) -> &[Integer] {
        self.class_map.presentation().invariant_factors()
    }

    pub fn class_number_candidate(&self) -> &Integer {
        &self.class_number_candidate
    }

    pub fn relation_coverage(&self) -> RelationCoverage {
        self.class_map.presentation().relation_coverage()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CubicPresentationCandidateError {
    IncompleteRelations {
        missing_rank: usize,
        relation_count: usize,
        factor_base_size: usize,
    },
    InvalidShape,
    NegativeRelationExponent {
        relation: usize,
        factor: usize,
        exponent: i64,
    },
    RelationExponentOutsideU32 {
        relation: usize,
        factor: usize,
        exponent: i64,
    },
    GeneratorOrderWitnessMismatch {
        smith_position: usize,
    },
    NormalForm(NormalFormError),
    ClassMap(ClassMapError),
    Authentication(ArbitraryIdealReductionError),
}

impl From<NormalFormError> for CubicPresentationCandidateError {
    fn from(value: NormalFormError) -> Self {
        Self::NormalForm(value)
    }
}

impl From<ClassMapError> for CubicPresentationCandidateError {
    fn from(value: ClassMapError) -> Self {
        Self::ClassMap(value)
    }
}

impl From<ArbitraryIdealReductionError> for CubicPresentationCandidateError {
    fn from(value: ArbitraryIdealReductionError) -> Self {
        Self::Authentication(value)
    }
}

/// Authenticate a complete-rank collected presentation without claiming that
/// it is the complete class group.
///
/// The field/order authority comes from `prepared`; the collected factor base
/// and every relation principal element are replayed in that exact maximal
/// order before the sealed map is returned.
pub fn authenticate_cubic_presentation_candidate(
    prepared: &PreparedPublicCubic,
    collected: PreparedCubicRelationPresentation,
    limits: CubicPresentationCandidateLimits,
) -> Result<AuthenticatedCubicPresentationCandidate, CubicPresentationCandidateError> {
    let factor_base_size = collected.factor_base.exact_ideals.len();
    if factor_base_size == 0
        || collected.relations.len() % factor_base_size != 0
        || collected.generators.len() % DEGREE != 0
    {
        return Err(CubicPresentationCandidateError::InvalidShape);
    }
    let relation_count = collected.relations.len() / factor_base_size;
    let expected_generator_entries =
        relation_count
            .checked_mul(DEGREE)
            .ok_or(NormalFormError::DimensionOverflow {
                rows: relation_count,
                columns: DEGREE,
            })?;
    let expected_metadata_entries =
        relation_count
            .checked_mul(3)
            .ok_or(NormalFormError::DimensionOverflow {
                rows: relation_count,
                columns: 3,
            })?;
    if collected.generators.len() / DEGREE != relation_count
        || collected.generators.len() != expected_generator_entries
        || collected.first_nonzero_hints.len() != relation_count
        || collected.metadata.len() != expected_metadata_entries
    {
        return Err(CubicPresentationCandidateError::InvalidShape);
    }
    if !collected.complete_rank_and_surplus || collected.missing_rank != 0 {
        return Err(CubicPresentationCandidateError::IncompleteRelations {
            missing_rank: collected.missing_rank,
            relation_count,
            factor_base_size,
        });
    }

    let relation_entries =
        factor_base_size
            .checked_mul(relation_count)
            .ok_or(NormalFormError::DimensionOverflow {
                rows: factor_base_size,
                columns: relation_count,
            })?;
    if relation_entries > limits.normal_form.max_entries {
        return Err(NormalFormError::CapacityExceeded {
            required: relation_entries,
            limit: limits.normal_form.max_entries,
        }
        .into());
    }
    let mut relation_values = vec![Integer::new(); relation_entries];
    let mut principal_relations = Vec::with_capacity(relation_count);
    for relation in 0..relation_count {
        let mut exponents = Vec::with_capacity(factor_base_size);
        for factor in 0..factor_base_size {
            let exponent = collected.relations[relation * factor_base_size + factor];
            if exponent < 0 {
                return Err(CubicPresentationCandidateError::NegativeRelationExponent {
                    relation,
                    factor,
                    exponent,
                });
            }
            let exponent = u32::try_from(exponent).map_err(|_| {
                CubicPresentationCandidateError::RelationExponentOutsideU32 {
                    relation,
                    factor,
                    exponent,
                }
            })?;
            relation_values[factor * relation_count + relation] = Integer::from(exponent);
            exponents.push(exponent);
        }
        principal_relations.push(PrincipalRelationWitness {
            exponents,
            principal_element: std::array::from_fn(|coordinate| {
                collected.generators[relation * DEGREE + coordinate].clone()
            }),
        });
    }

    let relations = BigIntMatrix::try_new(factor_base_size, relation_count, relation_values)?;
    let mut workspace = ExactNormalFormWorkspace::new(limits.normal_form);
    let smith = workspace.smith(&relations)?;
    if smith.rank != factor_base_size {
        return Err(CubicPresentationCandidateError::IncompleteRelations {
            missing_rank: factor_base_size - smith.rank,
            relation_count,
            factor_base_size,
        });
    }

    let mut generator_orders = Vec::new();
    for smith_position in 0..factor_base_size {
        let invariant_factor = smith.diagonal.get(smith_position, smith_position)?.clone();
        if invariant_factor <= 1 {
            continue;
        }
        let factor_base_exponents = (0..factor_base_size)
            .map(|factor| smith.left_inverse.get(factor, smith_position).cloned())
            .collect::<Result<Vec<_>, _>>()?;
        let relation_coefficients = (0..relation_count)
            .map(|relation| smith.right_transform.get(relation, smith_position).cloned())
            .collect::<Result<Vec<_>, _>>()?;
        for factor in 0..factor_base_size {
            let mut replayed = Integer::new();
            for relation in 0..relation_count {
                replayed += Integer::from(
                    relations.get(factor, relation)? * &relation_coefficients[relation],
                );
            }
            let expected = Integer::from(&invariant_factor * &factor_base_exponents[factor]);
            if replayed != expected {
                return Err(
                    CubicPresentationCandidateError::GeneratorOrderWitnessMismatch {
                        smith_position,
                    },
                );
            }
        }
        generator_orders.push(CubicCandidateGeneratorOrderEvidence {
            smith_position,
            invariant_factor,
            factor_base_exponents,
            relation_coefficients,
        });
    }

    let presentation = PresentationClassMap::from_verified_smith(relations, smith)?;
    let class_number_candidate = presentation
        .invariant_factors()
        .iter()
        .fold(Integer::from(1), |product, factor| product * factor);
    let mut ideal_workspace = PreparedIdealWorkspace::new();
    let class_map = authenticate_presentation_class_map(
        MaximalCubicOrder::from_public_prepared(prepared),
        &collected.factor_base,
        presentation,
        &principal_relations,
        &mut ideal_workspace,
    )?;

    Ok(AuthenticatedCubicPresentationCandidate {
        collected,
        principal_relations,
        class_map,
        generator_orders,
        class_number_candidate,
    })
}
