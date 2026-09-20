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
