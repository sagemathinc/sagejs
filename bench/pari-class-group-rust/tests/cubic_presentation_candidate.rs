// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    CubicPresentationCandidateLimits, PreparedCollectorLimits, PublicCubicPreparationLimits,
    RelationCoverage, authenticate_cubic_presentation_candidate, collect_prepared_cubic_relations,
    prepare_monic_cubic,
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
