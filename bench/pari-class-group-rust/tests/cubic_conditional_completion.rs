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
fn completes_an_index_prime_field_using_maximal_order_splitting() {
    let prepared = prepare([20_018, -20_010, 0, 1]);
    assert!(!prepared.field().data().index_primes.is_empty());
    let candidate = candidate(&prepared);
    let completed = complete_cubic_class_group_conditionally(
        prepared,
        candidate,
        CubicConditionalCompletionOptions::default(),
    )
    .unwrap();
    assert!(completed.verify_sealed_evidence());
}

#[test]
fn bounded_precision_escalation_seals_the_open_d3_0019_field() {
    // generated-d3-0019-d998ace3f59a: x^3 + x^2 - 225*x - 214.
    let prepared = prepare([-214, -225, 1, 1]);
    let authenticated = candidate(&prepared);
    let low_options = CubicConditionalCompletionOptions {
        logarithm_precision_bits: 4_096,
        replay_precision_bits: 2_048,
        analytic_precision_bits: 512,
        ..CubicConditionalCompletionOptions::default()
    };
    assert_eq!(
        complete_cubic_class_group_conditionally(
            prepared.clone(),
            authenticated.clone(),
            low_options,
        )
        .unwrap_err(),
        CubicConditionalCompletionError::ReconstructionUnstable
    );

    let completed = complete_cubic_class_group_conditionally(
        prepared,
        authenticated,
        CubicConditionalCompletionOptions {
            logarithm_precision_bits: 8_192,
            replay_precision_bits: 4_096,
            analytic_precision_bits: 512,
            ..CubicConditionalCompletionOptions::default()
        },
    )
    .unwrap();
    assert!(completed.verify_sealed_evidence());
    assert_eq!(completed.class_number(), &Integer::from(1));
    assert_eq!(completed.precision().attempted_levels().len(), 2);
    assert_eq!(
        completed.precision().attempted_levels()[0].logarithm_precision_bits,
        4_096
    );
    assert_eq!(
        completed
            .precision()
            .accepted_level()
            .logarithm_precision_bits,
        8_192
    );
    assert_eq!(
        completed.precision().accepted_level().replay_precision_bits,
        4_096
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
    let error = complete_cubic_class_group_conditionally(prepared, candidate, options).unwrap_err();
    assert_eq!(format!("{error:?}"), "AnalyticIndexNotIsolated");
    assert!(matches!(
        error,
        CubicConditionalCompletionError::AnalyticIndexNotIsolated {
            final_attempt: None
        }
    ));
}

#[test]
fn retains_the_final_failed_analytic_interval_without_publishing_it() {
    let prepared = prepare([224, -205, -4, 1]);
    let candidate = candidate(&prepared);
    let options = CubicConditionalCompletionOptions {
        logarithm_precision_bits: 4_096,
        replay_precision_bits: 2_048,
        maximum_analytic_threshold: 1_152,
        analytic_precision_bits: 64,
        ..CubicConditionalCompletionOptions::default()
    };
    let error = complete_cubic_class_group_conditionally(prepared, candidate, options).unwrap_err();
    assert_eq!(format!("{error:?}"), "AnalyticIndexNotIsolated");
    let CubicConditionalCompletionError::AnalyticIndexNotIsolated {
        final_attempt: Some(diagnostic),
    } = error
    else {
        panic!("the attempted BF cutoff must retain its final enclosure")
    };
    assert_eq!(diagnostic.threshold, 1_152);
    assert!(!diagnostic.tail_bound_below_quarter);
    assert!(diagnostic.enclosure.index.lower <= diagnostic.enclosure.index.upper);
    assert!(diagnostic.enclosure.tail_bound.lower <= diagnostic.enclosure.tail_bound.upper);
    assert_eq!(
        format!("{diagnostic:?}"),
        "AnalyticIndexFailureDiagnostic(<redacted>)"
    );
}
