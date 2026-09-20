// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_quadratic_boundary_qualification::{REAL_QUADRATIC_CASES, qualify_case};
use sagejs_public_quadratic_boundary_qualification::{
    SMALL_IMAGINARY_CASES, compute_imaginary_class_group, verify_imaginary_class_group,
};
use serde::Deserialize;
use std::{path::PathBuf, process::Command};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Receipt {
    schema: String,
    pari_version: String,
    cases: Vec<ReceiptCase>,
}

#[test]
fn complete_imaginary_groups_match_authenticated_pari() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let control = manifest.join("../pari-control/build/pari-control");
    assert!(
        control.is_file(),
        "authenticated PARI control missing; run ../pari-control/build.py"
    );
    let receipt: Receipt = serde_json::from_str(include_str!(
        "../receipts/pari-2.17.4-small-imaginary-groups.json"
    ))
    .unwrap();
    assert_eq!(
        receipt.schema,
        "sagejs.rust-class-group/small-imaginary-pari-differential-v1"
    );
    assert_eq!(receipt.pari_version, "2.17.4");

    for input in SMALL_IMAGINARY_CASES {
        let answer = compute_imaginary_class_group(input).unwrap();
        verify_imaginary_class_group(input, &answer).unwrap();
        let expected = receipt
            .cases
            .iter()
            .find(|case| case.field_id == input.id)
            .unwrap();
        let [constant, linear, _] = input.polynomial_ascending;
        let expression = format!("x^2+({linear})*x+({constant})");
        let output = Command::new(&control)
            .args(["public-call", &expression, input.id, "1"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let pari: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(pari["detail"]["degree"], "2");
        assert_eq!(pari["detail"]["discriminant"], expected.discriminant);
        assert_eq!(pari["detail"]["signature"][0], expected.signature[0]);
        assert_eq!(pari["detail"]["signature"][1], expected.signature[1]);
        assert_eq!(pari["result"]["classNumber"], expected.class_number);
        assert_eq!(
            pari["result"]["invariantFactors"],
            serde_json::to_value(&expected.invariant_factors).unwrap()
        );
        assert_eq!(answer.discriminant.to_string(), expected.discriminant);
        assert_eq!(answer.class_number.to_string(), expected.class_number);
        assert_eq!(
            answer
                .invariant_factors
                .iter()
                .map(u8::to_string)
                .collect::<Vec<_>>(),
            expected.invariant_factors
        );
        assert_eq!(answer.proof_status, "unconditional-complete");
        assert!(!answer.runtime_uses_pari_or_fixture_answers);
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReceiptCase {
    field_id: String,
    discriminant: String,
    signature: [String; 2],
    class_number: String,
    invariant_factors: Vec<String>,
}

#[test]
fn public_preparation_matches_authenticated_pari_and_records_unavailable_answers() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let control = manifest.join("../pari-control/build/pari-control");
    assert!(
        control.is_file(),
        "authenticated PARI control missing; run ../pari-control/build.py"
    );
    let receipt: Receipt =
        serde_json::from_str(include_str!("../receipts/pari-2.17.4-real-quadratics.json")).unwrap();
    assert_eq!(
        receipt.schema,
        "sagejs.rust-class-group/public-quadratic-pari-differential-v1"
    );
    assert_eq!(receipt.pari_version, "2.17.4");

    for input in REAL_QUADRATIC_CASES {
        let report = qualify_case(input).unwrap();
        let expected = receipt
            .cases
            .iter()
            .find(|case| case.field_id == input.id)
            .unwrap();
        let [constant, linear, _] = input.polynomial_ascending;
        let expression = format!("x^2+({linear})*x+({constant})");
        let output = Command::new(&control)
            .args(["public-call", &expression, input.id, "1"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let pari: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(pari["detail"]["degree"], "2");
        assert_eq!(pari["detail"]["discriminant"], expected.discriminant);
        assert_eq!(pari["detail"]["signature"][0], expected.signature[0]);
        assert_eq!(pari["detail"]["signature"][1], expected.signature[1]);
        assert_eq!(pari["result"]["classNumber"], expected.class_number);
        assert_eq!(
            pari["result"]["invariantFactors"],
            serde_json::to_value(&expected.invariant_factors).unwrap()
        );
        assert_eq!(report.discriminant, expected.discriminant);
        assert_eq!(report.signature, [2, 0]);
        assert!(report.maximal_order_certificate_verified);
        assert_eq!(report.status, "unsupported-before-class-group-engine");
    }
}
