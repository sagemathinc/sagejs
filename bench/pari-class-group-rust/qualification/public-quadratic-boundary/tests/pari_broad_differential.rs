// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_quadratic_boundary_qualification::compute_imaginary_class_group_from_coefficients;
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::process::Command;

fn squarefree(mut value: u64) -> bool {
    let mut prime = 2;
    while prime <= value / prime {
        if value.is_multiple_of(prime * prime) {
            return false;
        }
        while value.is_multiple_of(prime) {
            value /= prime;
        }
        prime += if prime == 2 { 1 } else { 2 };
    }
    true
}

fn fundamental(discriminant: i64) -> bool {
    if discriminant.rem_euclid(4) == 1 {
        squarefree(discriminant.unsigned_abs())
    } else if discriminant.rem_euclid(4) == 0 {
        let core = discriminant / 4;
        matches!(core.rem_euclid(4), 2 | 3) && squarefree(core.unsigned_abs())
    } else {
        false
    }
}

fn polynomial(discriminant: i64) -> [i64; 3] {
    if discriminant.rem_euclid(4) == 1 {
        [(1 - discriminant) / 4, -1, 1]
    } else {
        [-discriminant / 4, 0, 1]
    }
}

fn compare_with_pari(control: &PathBuf, discriminant: i64, ordinal: usize) {
    let coefficients = polynomial(discriminant);
    let rust = compute_imaginary_class_group_from_coefficients(coefficients).unwrap();
    let [constant, linear, _] = coefficients;
    let expression = format!("x^2+({linear})*x+({constant})");
    let field_id = format!("broad-imaginary-{ordinal}");
    let output = Command::new(control)
        .args(["public-call", &expression, &field_id, "1"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "PARI failed for D={discriminant}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let pari: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(pari["detail"]["discriminant"], discriminant.to_string());
    assert_eq!(pari["result"]["classNumber"], rust.class_number.to_string());
    assert_eq!(
        pari["result"]["invariantFactors"],
        serde_json::to_value(
            rust.invariant_factors
                .iter()
                .map(u64::to_string)
                .collect::<Vec<_>>()
        )
        .unwrap(),
        "invariant mismatch for D={discriminant}"
    );
}

#[test]
#[ignore = "authenticated 3,357-field PARI differential campaign"]
fn exhaustive_small_and_frozen_large_imaginary_corpus_matches_pari() {
    let control =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../pari-control/build/pari-control");
    assert!(control.is_file());

    let small = (3_i64..=10_000)
        .map(|absolute| -absolute)
        .filter(|discriminant| fundamental(*discriminant))
        .collect::<Vec<_>>();
    assert_eq!(small.len(), 3_043);

    let mut large = BTreeSet::from([-9_013_587_i64, -9_999_991, -8_173_415]);
    let mut state = 20_260_920_u64;
    while large.len() < 314 {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        let absolute = 10_001 + state % (9_999_991 - 10_000);
        let discriminant = -(absolute as i64);
        if fundamental(discriminant) {
            large.insert(discriminant);
        }
    }

    for (ordinal, discriminant) in small.into_iter().chain(large).enumerate() {
        compare_with_pari(&control, discriminant, ordinal);
    }
}
