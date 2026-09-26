// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    EmbeddingPrecisionState, PreparedCubicData, PublicCubicPreparationLimits,
    ValidatedPreparedCubic, prepare_monic_cubic, prepared_cubic_splitting_records_range,
    prepared_maximal_cubic_factor_base,
};

fn prepared_polynomial(coefficients: [i64; 4]) -> ValidatedPreparedCubic {
    prepare_monic_cubic(
        coefficients.map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap()
    .into_field()
}

fn scaled_plastic_constant_field() -> ValidatedPreparedCubic {
    // alpha = 23*beta with beta^3 - beta - 1 = 0.  The latter has
    // squarefree discriminant -23, so [1,beta,beta^2] is maximal.
    ValidatedPreparedCubic::validate(PreparedCubicData {
        polynomial_ascending: [(-12_167).into(), (-529).into(), 0.into(), 1.into()],
        irreducibility_prime: 2,
        integral_basis_numerators: [
            529.into(),
            0.into(),
            0.into(),
            0.into(),
            23.into(),
            0.into(),
            0.into(),
            0.into(),
            1.into(),
        ],
        basis_denominator: 529.into(),
        multiplication_table: [
            1.into(),
            0.into(),
            0.into(),
            0.into(),
            1.into(),
            0.into(),
            0.into(),
            0.into(),
            1.into(),
            0.into(),
            1.into(),
            0.into(),
            0.into(),
            0.into(),
            1.into(),
            1.into(),
            1.into(),
            0.into(),
            0.into(),
            0.into(),
            1.into(),
            1.into(),
            1.into(),
            0.into(),
            0.into(),
            1.into(),
            1.into(),
        ],
        discriminant: (-23).into(),
        signature: (1, 1),
        embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 192 },
        index_primes: vec![23.into()],
    })
    .unwrap()
}

fn index_prime_pattern(field: &ValidatedPreparedCubic, prime: usize) -> Vec<(usize, usize)> {
    prepared_cubic_splitting_records_range(field, prime, prime + 1)
        .unwrap()
        .into_iter()
        .next()
        .unwrap()
        .factors
}

#[test]
fn finite_algebra_decomposition_covers_the_index_prime_counterexamples() {
    let inert = prepared_polynomial([-8, -4, 0, 1]);
    assert_eq!(inert.data().index_primes, [Integer::from(2)]);
    assert_eq!(index_prime_pattern(&inert, 2), [(1, 3)]);

    let linear_quadratic = prepared_polynomial([-125, -25, 0, 1]);
    assert_eq!(linear_quadratic.data().index_primes, [Integer::from(5)]);
    assert_eq!(index_prime_pattern(&linear_quadratic, 5), [(1, 1), (1, 2)]);

    let partially_ramified = scaled_plastic_constant_field();
    assert_eq!(partially_ramified.data().index_primes, [Integer::from(23)]);
    assert_eq!(
        index_prime_pattern(&partially_ramified, 23),
        [(1, 1), (2, 1)]
    );
}

#[test]
fn factor_base_filters_index_prime_residue_degrees_soundly() {
    let inert = prepared_polynomial([-8, -4, 0, 1]);
    let base = prepared_maximal_cubic_factor_base(&inert).unwrap();
    assert!(!base.catalog.rational_primes.contains(&2));
    assert!(
        base.catalog
            .ideals
            .iter()
            .all(|ideal| ideal.residue_degree < 3)
    );

    let mixed = prepared_polynomial([-125, -25, 0, 1]);
    let base = prepared_maximal_cubic_factor_base(&mixed).unwrap();
    let group = base
        .catalog
        .rational_primes
        .iter()
        .position(|prime| *prime == 5)
        .unwrap();
    let offset = base.catalog.rational_offsets[group];
    assert_eq!(base.catalog.rational_counts[group], 1);
    assert_eq!(base.catalog.ideals[offset].residue_degree, 1);
    assert!(!base.catalog.complete_groups[group]);
}
