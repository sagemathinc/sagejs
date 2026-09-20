// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#![cfg(feature = "flint-normal-form")]

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    CubicCompletionProofMode, CubicConditionalCompletionError, CubicConditionalCompletionOptions,
    CubicPresentationCandidateLimits, PreparedCollectorLimits, PublicCubicPreparationLimits,
    authenticate_cubic_presentation_candidate, collect_prepared_cubic_relations,
    complete_cubic_class_group_conditionally, prepare_monic_cubic,
};

fn prepare(coefficients: [i64; 4]) -> sagejs_pari_class_group_rust_experiment::PreparedPublicCubic {
    prepare_monic_cubic(
        coefficients.map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap()
}

fn candidate(
    prepared: &sagejs_pari_class_group_rust_experiment::PreparedPublicCubic,
) -> sagejs_pari_class_group_rust_experiment::AuthenticatedCubicPresentationCandidate {
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
        },
    )
    .unwrap();
    authenticate_cubic_presentation_candidate(
        prepared,
        collected,
        CubicPresentationCandidateLimits::default(),
    )
    .unwrap()
}

#[test]
fn completes_coefficient_only_trivial_cubics_of_both_signatures() {
    // x^3 - x - 1, discriminant -23 and signature (1, 1).
    let complex = prepare([-1, -1, 0, 1]);
    // x^3 - 2*x^2 - x + 1, discriminant 49 and signature (3, 0).
    let totally_real = prepare([1, -1, -2, 1]);
    assert_eq!(complex.field().data().discriminant, -23);
    assert_eq!(totally_real.field().data().discriminant, 49);

    for prepared in [complex, totally_real] {
        let candidate = candidate(&prepared);
        let completed = complete_cubic_class_group_conditionally(
            prepared,
            candidate,
            CubicConditionalCompletionOptions::default(),
        )
        .unwrap();
        assert_eq!(completed.class_number(), &Integer::from(1));
        assert!(completed.invariant_factors().is_empty());
        assert!(completed.verify_sealed_evidence());
        assert_eq!(
            completed.units().fundamental_units().len(),
            usize::from(completed.prepared().field().data().signature.0)
                + usize::from(completed.prepared().field().data().signature.1)
                - 1
        );
        assert!(completed.analytic().bf_threshold() >= 72);
    }
}

#[test]
fn rejects_cross_field_authority_and_unsupported_proof_mode() {
    let first = prepare([-1, -1, 0, 1]);
    let second = prepare([1, -1, -2, 1]);
    assert_eq!(
        complete_cubic_class_group_conditionally(
            second,
            candidate(&first),
            CubicConditionalCompletionOptions::default(),
        )
        .unwrap_err(),
        CubicConditionalCompletionError::PreparedAuthorityMismatch
    );

    let candidate = candidate(&first);
    let mut options = CubicConditionalCompletionOptions::default();
    options.proof_mode = CubicCompletionProofMode::Unconditional;
    assert_eq!(
        complete_cubic_class_group_conditionally(first, candidate, options).unwrap_err(),
        CubicConditionalCompletionError::UnsupportedProofMode
    );
}

#[test]
fn rejects_resource_exhaustion_before_unit_or_analytic_work() {
    let prepared = prepare([-1, -1, 0, 1]);
    let candidate = candidate(&prepared);
    let options = CubicConditionalCompletionOptions {
        maximum_relations: 1,
        ..CubicConditionalCompletionOptions::default()
    };
    assert_eq!(
        complete_cubic_class_group_conditionally(prepared, candidate, options).unwrap_err(),
        CubicConditionalCompletionError::ResourceLimit("relations")
    );
}

#[test]
fn counterfeit_relation_generator_never_reaches_completion() {
    let prepared = prepare([-1, -1, 0, 1]);
    let mut collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: 10_000,
            maximum_candidates: 100_000,
        },
    )
    .unwrap();
    collected.generators[0] += 1;
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
fn rejects_index_prime_fields_until_maximal_order_splitting_is_exact() {
    // This equation order has index four in the maximal order. Completion
    // must not feed its ambiguous index-prime residue characters to BF/BDF.
    let prepared = prepare([20_018, -20_010, 0, 1]);
    assert!(!prepared.field().data().index_primes.is_empty());
    let candidate = candidate(&prepared);
    assert_eq!(
        complete_cubic_class_group_conditionally(
            prepared,
            candidate,
            CubicConditionalCompletionOptions::default(),
        )
        .unwrap_err(),
        CubicConditionalCompletionError::UnsupportedIndexPrimeCompletion
    );
}

#[test]
fn rejects_when_the_analytic_threshold_budget_cannot_isolate_index() {
    let prepared = prepare([-1, -1, 0, 1]);
    let candidate = candidate(&prepared);
    let options = CubicConditionalCompletionOptions {
        maximum_analytic_threshold: 72,
        analytic_precision_bits: 64,
        ..CubicConditionalCompletionOptions::default()
    };
    assert_eq!(
        complete_cubic_class_group_conditionally(prepared, candidate, options).unwrap_err(),
        CubicConditionalCompletionError::AnalyticIndexNotIsolated
    );
}
