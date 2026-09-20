// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_quadratic_boundary_qualification::{REAL_QUADRATIC_CASES, qualify_case};
use serde::Deserialize;
use std::{path::PathBuf, process::Command};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Receipt {
    schema: String,
    pari_version: String,
    cases: Vec<ReceiptCase>,
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
