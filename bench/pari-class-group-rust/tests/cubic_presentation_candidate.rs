// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    CubicPresentationCandidateError, CubicPresentationCandidateLimits, PreparedCollectorLimits,
    PublicCubicPreparationLimits, RelationCoverage, authenticate_cubic_presentation_candidate,
    collect_prepared_cubic_relations, prepare_monic_cubic,
};

fn public_cubic(
    coefficients: [i64; 4],
) -> sagejs_pari_class_group_rust_experiment::PreparedPublicCubic {
    prepare_monic_cubic(
        coefficients.map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap()
}

fn public_small_cubic() -> sagejs_pari_class_group_rust_experiment::PreparedPublicCubic {
    public_cubic([-1, -1, 0, 1])
}

#[test]
fn authenticates_public_small_cubic_without_claiming_completeness() {
    let prepared = public_small_cubic();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 10_000,
        },
    )
    .unwrap();
    let relation_count = collected.relations.len() / collected.factor_base.exact_ideals.len();
    let candidate = authenticate_cubic_presentation_candidate(
        &prepared,
        collected,
        CubicPresentationCandidateLimits::default(),
    )
    .unwrap();

    assert_eq!(
        candidate.relation_coverage(),
        RelationCoverage::SuppliedRelationsOnly
    );
    assert_eq!(candidate.principal_relations().len(), relation_count);
    assert_eq!(candidate.class_number_candidate(), &Integer::from(1));
    assert!(candidate.invariant_factors().is_empty());
    assert!(candidate.generator_orders().is_empty());
    let factor_base_size = candidate.collected().factor_base.exact_ideals.len();
    assert_eq!(
        candidate.dependency_lattice().len(),
        relation_count - factor_base_size
    );
    for dependency in candidate.dependency_lattice() {
        assert_eq!(dependency.len(), relation_count);
        for factor in 0..factor_base_size {
            let replayed = dependency.iter().enumerate().fold(
                Integer::from(0),
                |sum, (relation, coefficient)| {
                    sum + coefficient
                        * candidate.collected().relations[relation * factor_base_size + factor]
                },
            );
            assert_eq!(replayed, 0);
        }
    }
    candidate
        .class_map()
        .presentation()
        .verify_all_relations_map_to_zero()
        .unwrap();
}

#[test]
fn retains_nontrivial_generator_order_evidence() {
    let prepared = public_cubic([-29, -30, -8, 1]);
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
        },
    )
    .unwrap();
    let candidate = authenticate_cubic_presentation_candidate(
        &prepared,
        collected,
        CubicPresentationCandidateLimits::default(),
    )
    .unwrap();

    assert_eq!(candidate.invariant_factors(), &[Integer::from(2)]);
    assert_eq!(candidate.class_number_candidate(), &Integer::from(2));
    assert_eq!(candidate.generator_orders().len(), 1);
    let evidence = &candidate.generator_orders()[0];
    assert_eq!(evidence.invariant_factor, 2);
    assert_eq!(
        evidence.factor_base_exponents.len(),
        candidate.collected().factor_base.exact_ideals.len()
    );
    assert_eq!(
        evidence.relation_coefficients.len(),
        candidate.principal_relations().len()
    );
}

#[test]
fn rejects_a_resource_bounded_incomplete_collection() {
    let prepared = public_small_cubic();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 0,
            maximum_candidates: 0,
        },
    )
    .unwrap();
    assert!(
        authenticate_cubic_presentation_candidate(
            &prepared,
            collected,
            CubicPresentationCandidateLimits::default(),
        )
        .is_err()
    );
}

#[test]
fn rejects_counterfeit_principal_elements_and_relation_exponents() {
    let prepared = public_small_cubic();
    let collect = || {
        collect_prepared_cubic_relations(
            prepared.field(),
            PreparedCollectorLimits {
                maximum_visited_ideals: 10_000,
                maximum_candidates: 10_000,
            },
        )
        .unwrap()
    };

    let mut bad_element = collect();
    bad_element.generators[0] += 1;
    assert!(
        authenticate_cubic_presentation_candidate(
            &prepared,
            bad_element,
            CubicPresentationCandidateLimits::default(),
        )
        .is_err()
    );

    let mut bad_relation = collect();
    let nonzero = bad_relation
        .relations
        .iter()
        .position(|exponent| *exponent > 0)
        .unwrap();
    bad_relation.relations[nonzero] = -1;
    assert!(
        authenticate_cubic_presentation_candidate(
            &prepared,
            bad_relation,
            CubicPresentationCandidateLimits::default(),
        )
        .is_err()
    );
}

#[test]
fn rejects_mutated_or_cross_field_collector_authority() {
    let first = public_small_cubic();
    let second = public_cubic([1, 1, 0, 1]);
    let collect = || {
        collect_prepared_cubic_relations(
            first.field(),
            PreparedCollectorLimits {
                maximum_visited_ideals: 10_000,
                maximum_candidates: 10_000,
            },
        )
        .unwrap()
    };

    let cross_field = collect();
    assert!(
        authenticate_cubic_presentation_candidate(
            &second,
            cross_field,
            CubicPresentationCandidateLimits::default(),
        )
        .is_err()
    );

    let mut mutated = collect();
    mutated.factor_base.catalog.complete_groups[0] =
        !mutated.factor_base.catalog.complete_groups[0];
    assert!(
        authenticate_cubic_presentation_candidate(
            &first,
            mutated,
            CubicPresentationCandidateLimits::default(),
        )
        .is_err()
    );
}

#[test]
fn recomputes_surplus_instead_of_trusting_collector_flags() {
    let prepared = public_small_cubic();
    let mut collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 10_000,
        },
    )
    .unwrap();
    let factor_base_size = collected.factor_base.exact_ideals.len();
    // The collector contract requires seven supplementary relations. Keep six
    // and counterfeit its diagnostic booleans.
    let keep = factor_base_size + 6;
    collected.relations.truncate(keep * factor_base_size);
    collected.generators.truncate(keep * 3);
    collected.first_nonzero_hints.truncate(keep);
    collected.metadata.truncate(keep * 3);
    collected.complete_rank_and_surplus = true;
    collected.missing_rank = 0;

    assert!(matches!(
        authenticate_cubic_presentation_candidate(
            &prepared,
            collected,
            CubicPresentationCandidateLimits::default(),
        ),
        Err(CubicPresentationCandidateError::InsufficientRelationSurplus {
            required,
            actual,
        }) if required == factor_base_size + 7 && actual == keep
    ));
}

#[test]
fn enforces_exponent_and_post_smith_replay_budgets() {
    let prepared = public_small_cubic();
    let collect = || {
        collect_prepared_cubic_relations(
            prepared.field(),
            PreparedCollectorLimits {
                maximum_visited_ideals: 10_000,
                maximum_candidates: 10_000,
            },
        )
        .unwrap()
    };

    let mut excessive_exponent = collect();
    excessive_exponent.relations[0] = 257;
    let mut limits = CubicPresentationCandidateLimits::default();
    limits.normal_form.max_operations = 0;
    assert!(matches!(
        authenticate_cubic_presentation_candidate(&prepared, excessive_exponent, limits),
        Err(CubicPresentationCandidateError::RelationExponentLimit {
            relation: 0,
            factor: 0,
            exponent: 257,
            limit: 256,
        })
    ));

    let mut limits = CubicPresentationCandidateLimits::default();
    limits.maximum_verification_multiply_adds = 0;
    assert!(matches!(
        authenticate_cubic_presentation_candidate(&prepared, collect(), limits),
        Err(CubicPresentationCandidateError::VerificationBudgetExceeded {
            required,
            limit: 0,
        }) if required > 0
    ));

    let mut limits = CubicPresentationCandidateLimits::default();
    limits.maximum_principal_factor_terms = 0;
    assert!(matches!(
        authenticate_cubic_presentation_candidate(&prepared, collect(), limits),
        Err(
            CubicPresentationCandidateError::PrincipalFactorTermBudgetExceeded {
                required: 1,
                limit: 0,
            }
        )
    ));
}
