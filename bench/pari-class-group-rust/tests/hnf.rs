// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

// Keep this qualification lane independent of the evolving public library
// exports.  Remove this path inclusion when the integration lane exports HNF.
#[path = "../src/hnf.rs"]
mod hnf;

use hnf::{
    BigIntMatrix, ExactNormalFormWorkspace, NormalFormError, NormalFormLimits, UpdateStrategy,
};
use rug::Integer;

fn default_workspace() -> ExactNormalFormWorkspace {
    ExactNormalFormWorkspace::new(NormalFormLimits {
        max_entries: 100_000,
        max_operations: 1_000_000,
    })
}

#[test]
fn rectangular_hnf_has_exact_two_sided_witness() {
    let input = BigIntMatrix::from_i128(2, 3, &[2, 4, 4, 6, 6, 12]).unwrap();
    let answer = default_workspace().row_hnf(&input).unwrap();
    assert_eq!(answer.rank(), 2);
    assert_eq!(answer.pivot_columns, vec![0, 1]);
    assert_eq!(answer.hnf.values(), &[2, 4, 4, 0, 6, 0]);
    answer.verify(&input).unwrap();
}

#[test]
fn rectangular_smith_matches_independent_sympy_pari_controls() {
    // These expected diagonals agree with SymPy's smith_normal_form over ZZ
    // and PARI matsnf for the same row-major matrices.
    let cases: &[(usize, usize, &[i128], &[i128])] = &[
        (2, 3, &[2, 4, 4, 6, 6, 12], &[2, 6]),
        (3, 2, &[1, 2, 3, 4, 5, 6], &[1, 2]),
        (2, 2, &[4, 6, 3, 9], &[1, 18]),
        (2, 3, &[0, 0, 0, 0, 0, 0], &[]),
    ];
    let mut workspace = default_workspace();
    for (rows, columns, values, expected) in cases {
        let input = BigIntMatrix::from_i128(*rows, *columns, values).unwrap();
        let answer = workspace.smith(&input).unwrap();
        assert_eq!(
            answer.invariant_factors(),
            expected
                .iter()
                .copied()
                .map(Integer::from)
                .collect::<Vec<_>>()
        );
        answer.verify(&input).unwrap();
    }
}

#[test]
fn forced_large_intermediates_remain_exact() {
    let huge = Integer::from_str_radix(
        "100000000000000000000000000000000000000000000000000000000000000000000000000019",
        10,
    )
    .unwrap();
    let input = BigIntMatrix::try_new(
        2,
        3,
        vec![
            huge.clone(),
            Integer::from(&huge * &huge),
            Integer::from(&huge + 1),
            Integer::from(&huge - 1),
            Integer::from(&huge * 2),
            Integer::from(&huge * &huge) + 7,
        ],
    )
    .unwrap();
    let mut workspace = default_workspace();
    let hnf = workspace.row_hnf(&input).unwrap();
    hnf.verify(&input).unwrap();
    let smith = workspace.smith(&input).unwrap();
    smith.verify(&input).unwrap();
    assert_eq!(smith.invariant_factors()[0], 1);
}

#[test]
fn append_api_is_an_explicit_exact_recomputation_fallback() {
    let first = BigIntMatrix::from_i128(2, 3, &[2, 4, 4, 6, 6, 12]).unwrap();
    let extra = BigIntMatrix::from_i128(1, 3, &[4, 10, 8]).unwrap();
    let combined = BigIntMatrix::from_i128(3, 3, &[2, 4, 4, 6, 6, 12, 4, 10, 8]).unwrap();
    let mut workspace = default_workspace();
    let appended = workspace.append_rows_and_recompute(&first, &extra).unwrap();
    let direct = workspace.row_hnf(&combined).unwrap();
    assert_eq!(appended.hnf, direct.hnf);
    assert_eq!(
        appended.update_strategy,
        UpdateStrategy::BoundedFullRecomputation
    );
    appended.verify(&combined).unwrap();
}

#[test]
fn workspace_reuses_allocations_and_errors_are_typed() {
    let input = BigIntMatrix::from_i128(2, 2, &[4, 6, 3, 9]).unwrap();
    let mut workspace = default_workspace();
    workspace.row_hnf(&input).unwrap();
    let before = workspace.capacities();
    workspace.row_hnf(&input).unwrap();
    let after = workspace.capacities();
    assert_eq!(before, after);

    assert_eq!(
        BigIntMatrix::from_i128(2, 2, &[1, 2, 3]),
        Err(NormalFormError::DimensionMismatch {
            expected: 4,
            actual: 3,
        })
    );
    assert_eq!(
        BigIntMatrix::zeros(usize::MAX, 2),
        Err(NormalFormError::DimensionOverflow {
            rows: usize::MAX,
            columns: 2,
        })
    );
    assert_eq!(
        input.get(2, 0),
        Err(NormalFormError::IndexOutOfBounds {
            row: 2,
            column: 0,
            dimensions: (2, 2),
        })
    );
    let mut capacity_limited = ExactNormalFormWorkspace::new(NormalFormLimits {
        max_entries: 3,
        max_operations: 100,
    });
    assert_eq!(
        capacity_limited.row_hnf(&input),
        Err(NormalFormError::CapacityExceeded {
            required: 4,
            limit: 3,
        })
    );
    let mut operation_limited = ExactNormalFormWorkspace::new(NormalFormLimits {
        max_entries: 100,
        max_operations: 0,
    });
    assert_eq!(
        operation_limited.row_hnf(&input),
        Err(NormalFormError::OperationLimitExceeded { limit: 0 })
    );
}

#[test]
fn zero_width_and_zero_height_matrices_do_not_panic() {
    let mut workspace = default_workspace();
    for input in [
        BigIntMatrix::try_new(0, 3, vec![]).unwrap(),
        BigIntMatrix::try_new(3, 0, vec![]).unwrap(),
        BigIntMatrix::try_new(0, 0, vec![]).unwrap(),
    ] {
        workspace.row_hnf(&input).unwrap().verify(&input).unwrap();
        workspace.smith(&input).unwrap().verify(&input).unwrap();
    }
}

#[test]
fn deterministic_small_matrix_sweep_preserves_all_witnesses() {
    // A dependency-free deterministic sweep catches sign, zero, rank, and
    // rectangular corner cases.  The independent expected-value controls
    // above ensure this does not merely test the witnesses against themselves.
    let mut state = 0x4d59_5df4_d0f3_3173_u64;
    let mut workspace = default_workspace();
    for rows in 1..=5 {
        for columns in 1..=5 {
            for _case in 0..40 {
                let mut values = Vec::with_capacity(rows * columns);
                for _ in 0..rows * columns {
                    state = state
                        .wrapping_mul(6_364_136_223_846_793_005)
                        .wrapping_add(1_442_695_040_888_963_407);
                    values.push(i128::from(((state >> 32) % 41) as i32 - 20));
                }
                let input = BigIntMatrix::from_i128(rows, columns, &values).unwrap();
                workspace.row_hnf(&input).unwrap().verify(&input).unwrap();
                workspace.smith(&input).unwrap().verify(&input).unwrap();
            }
        }
    }
}
