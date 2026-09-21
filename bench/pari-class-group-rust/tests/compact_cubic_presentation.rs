// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#![cfg(feature = "flint-normal-form")]

use rug::{Complete, Integer};
use sagejs_pari_class_group_rust_experiment::{
    ArbitraryIdealReductionError, CompactPresentationError, CompactPresentationLimits,
    CubicConditionalCompletionOptions, CubicPresentationCandidateError,
    CubicPresentationCandidateLimits, PreparedCollectorLimits, PreparedContinuationLimits,
    PreparedCubicRelationCollector, PublicCubicPreparationLimits,
    authenticate_compact_cubic_presentation_candidate, authenticate_compact_presentation,
    authenticate_compact_presentation_with_cache, collect_prepared_cubic_relations,
    complete_cubic_class_group_conditionally, prepare_monic_cubic,
};

fn collect(
    coefficients: [i64; 4],
) -> sagejs_pari_class_group_rust_experiment::PreparedCubicRelationPresentation {
    let prepared = prepare_monic_cubic(
        coefficients.map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
        },
    )
    .unwrap()
}

#[test]
fn compact_proof_reaches_the_authenticated_public_candidate_boundary() {
    let prepared = prepare_monic_cubic(
        [-37, -30, -8, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
        },
    )
    .unwrap();
    let candidate = authenticate_compact_cubic_presentation_candidate(
        &prepared,
        collected,
        CubicPresentationCandidateLimits::default(),
        CompactPresentationLimits::default(),
    )
    .unwrap();

    assert_eq!(candidate.invariant_factors(), &[2, 2]);
    assert_eq!(candidate.class_number_candidate(), &Integer::from(4));
    assert_eq!(candidate.generator_orders().len(), 2);
    assert_eq!(
        candidate.dependency_lattice().len(),
        candidate.principal_relations().len()
            - candidate.collected().factor_base.exact_ideals.len()
    );
    candidate
        .class_map()
        .presentation()
        .verify_all_relations_map_to_zero()
        .unwrap();
}

#[test]
fn row6_reaches_the_compact_authenticated_candidate_boundary_from_coefficients() {
    let prepared = prepare_monic_cubic(
        [2_000_000_000_018_i64, -2_000_000_000_010, 0, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 1_000_000,
            maximum_candidates: 1_000_000,
        },
    )
    .unwrap();
    let candidate = authenticate_compact_cubic_presentation_candidate(
        &prepared,
        collected,
        CubicPresentationCandidateLimits::default(),
        CompactPresentationLimits {
            // Row 6 is elementary 2, so it must remain on the packed GF(2)
            // route and never enter the general dense-Smith producer.
            maximum_general_smith_transform_work: 0,
            ..CompactPresentationLimits::default()
        },
    )
    .unwrap();

    assert_eq!(candidate.invariant_factors(), &[2, 2]);
    assert_eq!(candidate.class_number_candidate(), &Integer::from(4));
    assert_eq!(candidate.collected().factor_base.exact_ideals.len(), 1_130);
    assert_eq!(candidate.generator_orders().len(), 2);
}

#[test]
fn row6_completes_conditionally_end_to_end_from_coefficients() {
    let total_started = std::time::Instant::now();
    let prepared = prepare_monic_cubic(
        [2_000_000_000_018_i64, -2_000_000_000_010, 0, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let preparation = total_started.elapsed();
    let collection_started = std::time::Instant::now();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 1_000_000,
            maximum_candidates: 1_000_000,
        },
    )
    .unwrap();
    let collection = collection_started.elapsed();
    let authentication_started = std::time::Instant::now();
    let candidate = authenticate_compact_cubic_presentation_candidate(
        &prepared,
        collected,
        CubicPresentationCandidateLimits::default(),
        CompactPresentationLimits::default(),
    )
    .unwrap();
    let authentication = authentication_started.elapsed();
    let completion_started = std::time::Instant::now();
    let completed = complete_cubic_class_group_conditionally(
        prepared,
        candidate,
        CubicConditionalCompletionOptions {
            logarithm_precision_bits: 8_192,
            replay_precision_bits: 4_096,
            analytic_precision_bits: 512,
            ..CubicConditionalCompletionOptions::default()
        },
    )
    .unwrap();
    let completion = completion_started.elapsed();

    assert_eq!(completed.invariant_factors(), &[Integer::from(2), 2.into()]);
    assert_eq!(completed.class_number(), &Integer::from(4));
    assert_eq!(completed.precision().attempted_levels().len(), 2);
    assert!(completed.verify_sealed_evidence());
    eprintln!(
        "row6 stages: preparation={preparation:?} collection={collection:?} authentication={authentication:?} completion={completion:?} total={:?}",
        total_started.elapsed()
    );
}

#[test]
fn authenticates_a_generic_elementary_two_presentation() {
    // x^3 - 8*x^2 - 30*x - 37 has class group C2 x C2.  Nothing in the
    // verifier recognizes these coefficients or this field.
    let mut collected = collect([-37, -30, -8, 1]);
    // Collector summaries and pivot hints carry no authority here.
    collected.complete_rank_and_surplus = false;
    collected.missing_rank = usize::MAX;
    collected.first_nonzero_hints.fill(1);
    let verified =
        authenticate_compact_presentation(&collected, CompactPresentationLimits::default())
            .unwrap();

    assert_eq!(verified.invariant_factors(), &[2, 2]);
    assert_eq!(verified.class_number(), &Integer::from(4));
    assert_eq!(verified.generator_orders().len(), 2);
    assert_eq!(verified.dependencies().len(), verified.surplus_rows().len());
    assert_eq!(
        Integer::from(verified.square_determinant() / verified.projected_dependency_determinant()),
        *verified.class_number()
    );
    let minor_gcd = verified
        .saturation_minors()
        .iter()
        .fold(Integer::from(0), |gcd, minor| {
            gcd.gcd_ref(&minor.determinant).complete()
        });
    assert_eq!(minor_gcd, 1);

    assert!(
        verified
            .generator_orders()
            .iter()
            .all(|evidence| { evidence.factor_base_exponents.len() == verified.generator_count() })
    );
}

#[test]
fn continuation_cache_matches_fresh_authentication_of_enlarged_relations() {
    let prepared = prepare_monic_cubic(
        [-37, -30, -8, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let mut collector = PreparedCubicRelationCollector::new(
        prepared.field(),
        PreparedContinuationLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
            maximum_relations: 10_000,
            maximum_dependencies: 64,
        },
    )
    .unwrap();
    let first = collector.advance_to_supplementary(7).unwrap();
    let first = authenticate_compact_presentation_with_cache(
        &first,
        CompactPresentationLimits::default(),
        None,
    )
    .unwrap();
    let cache = first.into_continuation_cache();
    let enlarged = collector.advance_to_supplementary(14).unwrap();
    let reused = authenticate_compact_presentation_with_cache(
        &enlarged,
        CompactPresentationLimits::default(),
        Some(cache),
    )
    .unwrap();
    let fresh =
        authenticate_compact_presentation(&enlarged, CompactPresentationLimits::default()).unwrap();

    assert_eq!(reused.invariant_factors(), fresh.invariant_factors());
    assert_eq!(reused.class_number(), fresh.class_number());
    assert_eq!(
        reused.generator_coordinates(),
        fresh.generator_coordinates()
    );
    assert_eq!(reused.dependencies(), fresh.dependencies());
    assert_eq!(reused.square_rows(), fresh.square_rows());
    assert_eq!(reused.surplus_rows(), fresh.surplus_rows());
    assert_eq!(reused.square_determinant(), fresh.square_determinant());
}

#[test]
fn authenticates_a_non_elementary_two_quotient() {
    // x^3 - 8*x^2 - 30*x - 26 has cyclic class group C3.
    let collected = collect([-26, -30, -8, 1]);
    let verified =
        authenticate_compact_presentation(&collected, CompactPresentationLimits::default())
            .unwrap();
    assert_eq!(verified.invariant_factors(), &[Integer::from(3)]);
    assert_eq!(verified.class_number(), &Integer::from(3));
}

#[test]
fn general_smith_work_limit_fails_closed_before_the_general_producer() {
    // This C3 quotient cannot use the elementary-two route.
    let collected = collect([-26, -30, -8, 1]);
    let limits = CompactPresentationLimits {
        maximum_general_smith_transform_work: 0,
        ..CompactPresentationLimits::default()
    };
    assert!(matches!(
        authenticate_compact_presentation(&collected, limits),
        Err(CompactPresentationError::GeneralSmithWorkLimit { limit: 0, .. })
    ));
}

#[test]
fn exact_mixed_map_verification_budget_is_enforced_before_replay() {
    let collected = collect([-26, -30, -8, 1]);
    let limits = CompactPresentationLimits {
        maximum_verification_multiply_adds: 0,
        ..CompactPresentationLimits::default()
    };
    assert!(matches!(
        authenticate_compact_presentation(&collected, limits),
        Err(CompactPresentationError::VerificationBudgetExceeded { limit: 0, .. })
    ));
}

#[test]
fn enforces_the_small_surplus_limit_before_flint_work() {
    let collected = collect([-1, -1, 0, 1]);
    let mut limits = CompactPresentationLimits::default();
    limits.maximum_surplus_rows = 1;
    assert!(matches!(
        authenticate_compact_presentation(&collected, limits),
        Err(CompactPresentationError::SurplusLimit { .. })
    ));
}

#[test]
fn compact_candidate_enforces_zero_verification_budget_before_exact_work() {
    let prepared = prepare_monic_cubic(
        [-37, -30, -8, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
        },
    )
    .unwrap();
    let mut limits = CubicPresentationCandidateLimits::default();
    limits.maximum_verification_multiply_adds = 0;
    assert!(matches!(
        authenticate_compact_cubic_presentation_candidate(
            &prepared,
            collected,
            limits,
            CompactPresentationLimits::default(),
        ),
        Err(CubicPresentationCandidateError::VerificationBudgetExceeded { limit: 0, .. })
    ));
}

#[test]
fn compact_candidate_enforces_storage_limits_before_rank_work() {
    let prepared = prepare_monic_cubic(
        [-37, -30, -8, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
        },
    )
    .unwrap();
    let compact_limits = CompactPresentationLimits {
        maximum_generators: 1,
        ..CompactPresentationLimits::default()
    };
    assert!(matches!(
        authenticate_compact_cubic_presentation_candidate(
            &prepared,
            collected,
            CubicPresentationCandidateLimits::default(),
            compact_limits,
        ),
        Err(CubicPresentationCandidateError::Compact(
            CompactPresentationError::GeneratorLimit { limit: 1, .. }
        ))
    ));
}

#[test]
fn compact_candidate_rejects_cross_field_and_corrupt_base_authority() {
    let first = prepare_monic_cubic(
        [-37, -30, -8, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let second = prepare_monic_cubic(
        [-26, -30, -8, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let collect_first = || {
        collect_prepared_cubic_relations(
            first.field(),
            PreparedCollectorLimits {
                maximum_visited_ideals: 10_000,
                maximum_candidates: 100_000,
            },
        )
        .unwrap()
    };
    let compact_limits = CompactPresentationLimits::default();
    assert!(matches!(
        authenticate_compact_cubic_presentation_candidate(
            &second,
            collect_first(),
            CubicPresentationCandidateLimits::default(),
            compact_limits,
        ),
        Err(CubicPresentationCandidateError::Authentication(
            ArbitraryIdealReductionError::FactorBaseShape
        ))
    ));

    let mut corrupted = collect_first();
    corrupted.factor_base.catalog.complete_groups[0] =
        !corrupted.factor_base.catalog.complete_groups[0];
    assert!(matches!(
        authenticate_compact_cubic_presentation_candidate(
            &first,
            corrupted,
            CubicPresentationCandidateLimits::default(),
            compact_limits,
        ),
        Err(CubicPresentationCandidateError::Authentication(
            ArbitraryIdealReductionError::FactorBaseShape
        ))
    ));

    let mut corrupted_relation = collect_first();
    corrupted_relation.relations[0] += 1;
    assert!(matches!(
        authenticate_compact_cubic_presentation_candidate(
            &first,
            corrupted_relation,
            CubicPresentationCandidateLimits::default(),
            compact_limits,
        ),
        Err(CubicPresentationCandidateError::Authentication(
            ArbitraryIdealReductionError::PrincipalRelationWitnessMismatch { .. }
        ))
    ));

    let mut corrupted_generator = collect_first();
    corrupted_generator.generators[0] += 1;
    assert!(matches!(
        authenticate_compact_cubic_presentation_candidate(
            &first,
            corrupted_generator,
            CubicPresentationCandidateLimits::default(),
            compact_limits,
        ),
        Err(CubicPresentationCandidateError::Authentication(
            ArbitraryIdealReductionError::PrincipalRelationWitnessMismatch { .. }
        ))
    ));
}
