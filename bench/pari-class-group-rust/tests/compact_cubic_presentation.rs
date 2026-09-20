// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#![cfg(feature = "flint-normal-form")]

use rug::{Complete, Integer};
use sagejs_pari_class_group_rust_experiment::{
    CompactPresentationError, CompactPresentationLimits, PreparedCollectorLimits,
    PublicCubicPreparationLimits, authenticate_compact_elementary_two_presentation,
    collect_prepared_cubic_relations, prepare_monic_cubic,
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
fn authenticates_a_generic_elementary_two_presentation() {
    // x^3 - 8*x^2 - 30*x - 37 has class group C2 x C2.  Nothing in the
    // verifier recognizes these coefficients or this field.
    let mut collected = collect([-37, -30, -8, 1]);
    // Collector summaries and pivot hints carry no authority here.
    collected.complete_rank_and_surplus = false;
    collected.missing_rank = usize::MAX;
    collected.first_nonzero_hints.fill(1);
    let verified = authenticate_compact_elementary_two_presentation(
        &collected,
        CompactPresentationLimits::default(),
    )
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

    for evidence in verified.generator_orders() {
        let coordinate = verified.coordinates(evidence.factor_base_index).unwrap();
        assert_eq!(coordinate[evidence.coordinate], 1);
        assert!(
            coordinate
                .iter()
                .enumerate()
                .all(|(index, &value)| index == evidence.coordinate || value == 0)
        );
    }
}

#[test]
fn rejects_a_non_elementary_two_quotient() {
    // x^3 - 8*x^2 - 30*x - 26 has cyclic class group C3.
    let collected = collect([-26, -30, -8, 1]);
    assert!(matches!(
        authenticate_compact_elementary_two_presentation(
            &collected,
            CompactPresentationLimits::default(),
        ),
        Err(CompactPresentationError::NonElementaryTwo { .. })
    ));
}

#[test]
fn enforces_the_small_surplus_limit_before_flint_work() {
    let collected = collect([-1, -1, 0, 1]);
    let mut limits = CompactPresentationLimits::default();
    limits.maximum_surplus_rows = 1;
    assert!(matches!(
        authenticate_compact_elementary_two_presentation(&collected, limits),
        Err(CompactPresentationError::SurplusLimit { .. })
    ));
}
