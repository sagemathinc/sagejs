// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    PublicCubicPreparationError, PublicCubicPreparationLimits,
    prepare_squarefree_discriminant_monic_cubic, prepared_maximal_cubic_factor_base,
};

fn integers(values: [i64; 4]) -> [Integer; 4] {
    values.map(Integer::from)
}

#[test]
fn public_polynomial_reaches_exact_maximal_order_factor_base_without_a_fixture() {
    let prepared = prepare_squarefree_discriminant_monic_cubic(
        integers([-1, -1, 0, 1]),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    assert!(prepared.maximal_order_certificate().verify());
    assert_eq!(prepared.field().data().discriminant, -23);
    assert_eq!(prepared.field().data().signature, (1, 1));
    assert_eq!(prepared.field().equation_order_index(), &Integer::from(1));

    // This is the first real class-group-engine consumer of the prepared
    // maximal order.  Its successful construction proves this is not merely a
    // disconnected polynomial metadata parser.
    let factor_base = prepared_maximal_cubic_factor_base(prepared.field()).unwrap();
    assert!(!factor_base.catalog.ideals.is_empty());
    assert_eq!(factor_base.catalog.rational_offsets[0], 0);
}

#[test]
fn public_polynomial_route_fails_closed_outside_its_maximality_theorem() {
    let result = prepare_squarefree_discriminant_monic_cubic(
        integers([1, -1, -2, 1]),
        PublicCubicPreparationLimits::default(),
    );
    assert_eq!(
        result,
        Err(PublicCubicPreparationError::NonSquarefreeDiscriminant {
            repeated_prime: Integer::from(7),
        })
    );
}
