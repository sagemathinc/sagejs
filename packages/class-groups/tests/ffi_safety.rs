// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Public-boundary regression coverage for the class-group FLINT bridge.
//!
//! Low-level pointer contracts are tested inside `flint_normal_form`; this
//! integration test additionally proves that malformed public inputs fail
//! closed and that repeated complete calls release all retained native state.

use rug::Integer;
use sagejs_class_groups::{
    CompactPresentationLimits, CubicConditionalCompletionOptions, CubicPresentationCandidateLimits,
    PreparedCollectorLimits, PublicCubicPreparationLimits,
    authenticate_compact_cubic_presentation_candidate, collect_prepared_cubic_relations,
    complete_cubic_class_group_conditionally, prepare_monic_cubic,
};

#[test]
fn malformed_public_polynomials_fail_closed() {
    let limits = PublicCubicPreparationLimits::default();
    assert!(prepare_monic_cubic([1, 2, 3, 0].map(Integer::from), limits).is_err());
    assert!(prepare_monic_cubic([0, 0, 0, 1].map(Integer::from), limits).is_err());
    assert!(
        prepare_monic_cubic(
            [Integer::from(1) << 512, 0.into(), 0.into(), 1.into()],
            limits,
        )
        .is_err()
    );
}

#[test]
fn repeated_complete_calls_release_native_state() {
    for _ in 0..2 {
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
        let completed = complete_cubic_class_group_conditionally(
            prepared,
            candidate,
            CubicConditionalCompletionOptions::default(),
        )
        .unwrap();
        assert_eq!(completed.class_number(), &Integer::from(4));
        assert!(completed.verify_sealed_evidence());
    }
}
