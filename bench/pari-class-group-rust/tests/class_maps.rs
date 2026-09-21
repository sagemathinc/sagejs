// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#[path = "../src/class_maps.rs"]
mod class_maps;
#[path = "../src/hnf.rs"]
mod hnf;

use class_maps::{
    ClassMapError, PresentationClassMap, PresentationZeroState, PrincipalElementWitnessState,
    RelationCoverage,
};
use hnf::{BigIntMatrix, SmithDecomposition};
use rug::Integer;

fn matrix(rows: usize, columns: usize, values: &[i128]) -> BigIntMatrix {
    BigIntMatrix::from_i128(rows, columns, values).unwrap()
}

fn identity_smith(diagonal: &[Integer]) -> (BigIntMatrix, SmithDecomposition) {
    let size = diagonal.len();
    let mut values = vec![Integer::new(); size * size];
    for (index, value) in diagonal.iter().enumerate() {
        values[index * size + index] = value.clone();
    }
    let relations = BigIntMatrix::try_new(size, size, values).unwrap();
    let identity = BigIntMatrix::identity(size).unwrap();
    let smith = SmithDecomposition {
        diagonal: relations.clone(),
        left_transform: identity.clone(),
        left_inverse: identity.clone(),
        right_transform: identity.clone(),
        right_inverse: identity,
        rank: size,
        operations: 0,
    };
    (relations, smith)
}

fn permuted_diagonal_smith(
    diagonal_by_generator: &[Integer],
) -> (BigIntMatrix, SmithDecomposition) {
    let size = diagonal_by_generator.len();
    let mut order = (0..size).collect::<Vec<_>>();
    order.sort_by(|left, right| {
        diagonal_by_generator[*left]
            .cmp(&diagonal_by_generator[*right])
            .then(left.cmp(right))
    });
    let mut relation_values = vec![Integer::new(); size * size];
    let mut diagonal_values = vec![Integer::new(); size * size];
    let mut left_values = vec![Integer::new(); size * size];
    let mut left_inverse_values = vec![Integer::new(); size * size];
    let mut right_values = vec![Integer::new(); size * size];
    let mut right_inverse_values = vec![Integer::new(); size * size];
    for generator in 0..size {
        relation_values[generator * size + generator] = diagonal_by_generator[generator].clone();
    }
    for (smith, &generator) in order.iter().enumerate() {
        diagonal_values[smith * size + smith] = diagonal_by_generator[generator].clone();
        left_values[smith * size + generator] = 1.into();
        left_inverse_values[generator * size + smith] = 1.into();
        right_values[generator * size + smith] = 1.into();
        right_inverse_values[smith * size + generator] = 1.into();
    }
    let relations = BigIntMatrix::try_new(size, size, relation_values).unwrap();
    let smith = SmithDecomposition {
        diagonal: BigIntMatrix::try_new(size, size, diagonal_values).unwrap(),
        left_transform: BigIntMatrix::try_new(size, size, left_values).unwrap(),
        left_inverse: BigIntMatrix::try_new(size, size, left_inverse_values).unwrap(),
        right_transform: BigIntMatrix::try_new(size, size, right_values).unwrap(),
        right_inverse: BigIntMatrix::try_new(size, size, right_inverse_values).unwrap(),
        rank: size,
        operations: 0,
    };
    (relations, smith)
}

#[test]
fn noncyclic_two_by_two_maps_generators_and_relations() {
    // L is deliberately nontrivial, so these generator maps exercise the
    // coordinate convention y=L*x rather than merely reducing x componentwise.
    let relations = matrix(2, 2, &[2, 0, 2, 2]);
    let diagonal = matrix(2, 2, &[2, 0, 0, 2]);
    let left = matrix(2, 2, &[1, 0, -1, 1]);
    let left_inverse = matrix(2, 2, &[1, 0, 1, 1]);
    let identity = BigIntMatrix::identity(2).unwrap();
    let smith = SmithDecomposition {
        diagonal,
        left_transform: left,
        left_inverse,
        right_transform: identity.clone(),
        right_inverse: identity,
        rank: 2,
        operations: 1,
    };
    let class_map = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    assert_eq!(class_map.invariant_factors(), &[2, 2]);
    assert_eq!(
        class_map.relation_coverage(),
        RelationCoverage::SuppliedRelationsOnly
    );
    let generators = class_map.generator_coordinate_maps().unwrap();
    assert_eq!(generators[0].values(), &[1, 1]);
    assert_eq!(generators[1].values(), &[0, 1]);
    class_map.verify_all_relations_map_to_zero().unwrap();

    let sum = class_map.add(&generators[0], &generators[1]).unwrap();
    assert_eq!(sum.values(), &[1, 0]);
    assert_eq!(class_map.add(&sum, &sum).unwrap(), class_map.zero());
}

#[test]
fn compact_trivial_quotient_has_the_unique_zero_dimensional_map() {
    // An independently authenticated class-number-one presentation has no
    // nontrivial invariant factors and therefore no coordinate-table entries,
    // regardless of how many factor-base generators it has.
    let relations = matrix(2, 3, &[1, -2, 7, 3, 0, -5]);
    let class_map = PresentationClassMap::from_verified_generator_coordinates(
        Vec::new(),
        Vec::new(),
        relations,
    )
    .unwrap();

    assert!(class_map.invariant_factors().is_empty());
    assert_eq!(class_map.generator_count(), 2);
    assert_eq!(class_map.relation_count(), 3);
    assert!(class_map.zero().values().is_empty());
    assert_eq!(
        class_map
            .coordinates(&[Integer::from(19), Integer::from(-23)])
            .unwrap(),
        class_map.zero()
    );
    assert!(
        class_map
            .generator_coordinate_maps()
            .unwrap()
            .iter()
            .all(|coordinates| coordinates.is_zero())
    );
    class_map.verify_all_relations_map_to_zero().unwrap();
}

#[test]
fn compact_trivial_quotient_rejects_nonempty_coordinate_storage() {
    let relations = matrix(2, 1, &[1, 0]);
    assert_eq!(
        PresentationClassMap::from_verified_generator_coordinates(
            Vec::new(),
            vec![Integer::from(0)],
            relations,
        ),
        Err(ClassMapError::CoordinateDimension {
            expected: 0,
            actual: 1,
        })
    );
}

#[test]
fn cyclic_six_has_homomorphic_addition_and_principality_state() {
    let (relations, smith) = identity_smith(&[Integer::from(6)]);
    let class_map = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    let two = class_map.coordinates(&[Integer::from(2)]).unwrap();
    let five = class_map.coordinates(&[Integer::from(-1)]).unwrap();
    let one = class_map.coordinates(&[Integer::from(1)]).unwrap();
    assert_eq!(two.values(), &[2]);
    assert_eq!(five.values(), &[5]);
    assert_eq!(class_map.add(&two, &five).unwrap().values(), &[1]);
    assert_eq!(class_map.add(&two, &five).unwrap(), one);
    assert_eq!(class_map.negate(&five).unwrap().values(), &[1]);

    assert!(matches!(
        class_map
            .presentation_zero_state(&[Integer::from(5)])
            .unwrap(),
        PresentationZeroState::NonzeroInCurrentPresentation { .. }
    ));
    match class_map
        .presentation_zero_state(&[Integer::from(18)])
        .unwrap()
    {
        PresentationZeroState::ZeroByVerifiedRelations {
            relation_combination,
            principal_element,
        } => {
            assert_eq!(relation_combination.coefficients(), &[3]);
            assert_eq!(
                principal_element,
                PrincipalElementWitnessState::NeedsRelationPrincipalElements {
                    relation_indices: vec![0]
                }
            );
        }
        state => panic!("unexpected state: {state:?}"),
    }
}

#[test]
fn dimension_and_relation_index_failures_are_typed() {
    let (relations, smith) = identity_smith(&[Integer::from(6)]);
    let class_map = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    assert_eq!(
        class_map.coordinates(&[]),
        Err(ClassMapError::ExponentDimension {
            expected: 1,
            actual: 0
        })
    );
    assert_eq!(
        class_map.verify_relation_maps_to_zero(1),
        Err(ClassMapError::RelationIndexOutOfBounds {
            index: 1,
            relations: 1
        })
    );
    assert!(matches!(
        class_map
            .presentation_zero_state(&[Integer::from(0)])
            .unwrap(),
        PresentationZeroState::ZeroByVerifiedRelations {
            principal_element: PrincipalElementWitnessState::Identity,
            ..
        }
    ));
}

#[test]
fn random_relation_combinations_map_to_zero_and_reconstruct() {
    let (relations, smith) = identity_smith(&[Integer::from(2), Integer::from(6)]);
    let class_map = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    let mut state = 0x4d59_5df4_d0f3_3173_u64;
    for _ in 0..200 {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        let first = i128::from((state >> 16) as i32);
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        let second = i128::from((state >> 16) as i32);
        let exponents = [Integer::from(2 * first), Integer::from(6 * second)];
        match class_map.presentation_zero_state(&exponents).unwrap() {
            PresentationZeroState::ZeroByVerifiedRelations {
                relation_combination,
                ..
            } => assert_eq!(
                relation_combination.coefficients(),
                &[Integer::from(first), Integer::from(second)]
            ),
            state => panic!("relation combination was not zero: {state:?}"),
        }
    }
}

#[test]
fn corrupt_smith_transforms_are_rejected() {
    let relations = matrix(1, 1, &[6]);
    let identity = matrix(1, 1, &[1]);
    let corrupt = matrix(1, 1, &[2]);
    let smith = SmithDecomposition {
        diagonal: relations.clone(),
        left_transform: corrupt,
        left_inverse: identity.clone(),
        right_transform: identity.clone(),
        right_inverse: identity,
        rank: 1,
        operations: 0,
    };
    assert!(matches!(
        PresentationClassMap::from_verified_smith(relations, smith),
        Err(ClassMapError::NormalForm(_))
    ));
}

#[test]
fn coefficients_larger_than_machine_words_remain_exact() {
    let modulus: Integer = "1361129467683753853853498429727072845875".parse().unwrap();
    let coefficient: Integer = "87112285931760246646623899502532662132737".parse().unwrap();
    let (relations, smith) = identity_smith(std::slice::from_ref(&modulus));
    let class_map = PresentationClassMap::from_verified_smith(relations, smith).unwrap();

    let exponent = Integer::from(&modulus * &coefficient);
    match class_map
        .presentation_zero_state(std::slice::from_ref(&exponent))
        .unwrap()
    {
        PresentationZeroState::ZeroByVerifiedRelations {
            relation_combination,
            ..
        } => assert_eq!(relation_combination.coefficients(), &[coefficient]),
        state => panic!("large exact relation was not zero: {state:?}"),
    }
    assert_eq!(
        class_map
            .coordinates(&[Integer::from(&exponent + 7)])
            .unwrap()
            .values(),
        &[7]
    );
}

#[test]
fn compact_diagonal_map_matches_dense_verified_smith_and_binds_order() {
    let (relations, smith) = identity_smith(&[1.into(), 1.into(), 3.into()]);
    let dense = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    let compact =
        PresentationClassMap::from_verified_diagonal_relations(vec![1.into(), 3.into(), 1.into()])
            .unwrap();
    let dense_exponents = [Integer::from(4), Integer::from(-5), Integer::from(7)];
    let compact_exponents = [Integer::from(4), Integer::from(7), Integer::from(-5)];
    assert_eq!(
        dense.coordinates(&dense_exponents).unwrap().values(),
        compact.coordinates(&compact_exponents).unwrap().values()
    );
    assert_eq!(
        compact.coordinates(&compact_exponents).unwrap().values(),
        &[1]
    );
    assert_ne!(dense.binding_sha256(), compact.binding_sha256());
    assert!(matches!(
        compact
            .presentation_zero_state(&[0.into(), 6.into(), 0.into()])
            .unwrap(),
        PresentationZeroState::ZeroByVerifiedRelations {
            relation_combination,
            ..
        } if relation_combination.coefficients() == [0, 2, 0]
    ));
}

#[test]
fn coordinates_are_bound_to_the_exact_presentation() {
    let (relations, smith) = identity_smith(&[Integer::from(6)]);
    let six = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    let (relations, smith) = identity_smith(&[Integer::from(5)]);
    let five = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    let from_six = six.coordinates(&[Integer::from(1)]).unwrap();
    let from_five = five.coordinates(&[Integer::from(1)]).unwrap();
    assert_eq!(
        six.add(&from_six, &from_five),
        Err(ClassMapError::CoordinatePresentationMismatch)
    );
    assert_eq!(
        six.negate(&from_five),
        Err(ClassMapError::CoordinatePresentationMismatch)
    );
}

#[test]
fn compact_and_dense_maps_agree_under_random_permutations_and_large_signs() {
    let mut random = 0x4d59_5df4_d0f3_3173_u64;
    for size in 1..=8 {
        for _ in 0..24 {
            let mut diagonal = (0..size)
                .map(|index| Integer::from(1_u32 << index.min(7)))
                .collect::<Vec<_>>();
            for index in (1..size).rev() {
                random = random
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                diagonal.swap(index, (random as usize) % (index + 1));
            }
            let (relations, smith) = permuted_diagonal_smith(&diagonal);
            let dense = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
            let compact =
                PresentationClassMap::from_verified_diagonal_relations(diagonal.clone()).unwrap();

            for generator in 0..size {
                let mut basis = vec![Integer::new(); size];
                basis[generator] = 1.into();
                assert_eq!(
                    dense.coordinates(&basis).unwrap().values(),
                    compact.coordinates(&basis).unwrap().values()
                );
            }

            let mut exponents = Vec::with_capacity(size);
            for generator in 0..size {
                random = random
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                let magnitude = Integer::from(random) << (80 + generator);
                exponents.push(if generator % 2 == 0 {
                    magnitude
                } else {
                    -magnitude
                });
            }
            assert_eq!(
                dense.coordinates(&exponents).unwrap().values(),
                compact.coordinates(&exponents).unwrap().values()
            );

            let relation_multiple = diagonal
                .iter()
                .enumerate()
                .map(|(index, value)| Integer::from(value * Integer::from(index as i64 - 3)))
                .collect::<Vec<_>>();
            for map in [&dense, &compact] {
                assert!(matches!(
                    map.presentation_zero_state(&relation_multiple).unwrap(),
                    PresentationZeroState::ZeroByVerifiedRelations { .. }
                ));
                assert!(matches!(
                    map.presentation_zero_state(&vec![Integer::new(); size])
                        .unwrap(),
                    PresentationZeroState::ZeroByVerifiedRelations {
                        principal_element: PrincipalElementWitnessState::Identity,
                        ..
                    }
                ));
            }
        }
    }
}

#[test]
fn compact_diagonal_map_rejects_non_smith_divisibility() {
    assert!(matches!(
        PresentationClassMap::from_verified_diagonal_relations(vec![2.into(), 3.into()]),
        Err(ClassMapError::NormalForm(_))
    ));
}
