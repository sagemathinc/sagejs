// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

const VALID_REQUEST: &str = r#"{
  "schema": "sagejs.rust-class-group/public-cubic-e2e-request-v2",
  "polynomialAscending": ["-1", "-1", "0", "1"],
  "proofMode": "conditional-grh",
  "resources": {
    "maximumTrialDivisor": 10000,
    "maximumIrreducibilityPrime": 257,
    "embeddingPrecisionBits": 192,
    "maximumVisitedIdeals": 10000,
    "maximumCandidates": 10000,
    "maximumNormalFormEntries": 10000000,
    "maximumNormalFormOperations": 50000000,
    "maximumRelationExponent": 256,
    "maximumVerificationMultiplyAdds": 100000000,
    "maximumPrincipalFactorTerms": 10000000,
    "maximumCompactGenerators": 16384,
    "maximumCompactSurplusRows": 32,
    "maximumCompactSaturationMinorTrials": 32768,
    "maximumCompactDependencyEntries": 1000000,
    "maximumCompactTargetCoefficientBits": 1000000,
    "logarithmPrecisionBits": 1024,
    "replayPrecisionBits": 512,
    "analyticPrecisionBits": 256,
    "maximumRelations": 10000,
    "maximumDependencies": 1000,
    "maximumKernelCoefficientBits": 4080,
    "maximumUnitExponentBits": 8192,
    "maximumReconstructionDenominatorBits": 4096,
    "maximumAnalyticThreshold": 23994
  }
}"#;

fn run(source: &str) -> std::process::Output {
    let mut child = Command::new(env!(
        "CARGO_BIN_EXE_sagejs-public-cubic-class-group-e2e-qualification"
    ))
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .spawn()
    .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(source.as_bytes())
        .unwrap();
    child.wait_with_output().unwrap()
}

#[test]
fn executable_emits_a_conditionally_complete_result() {
    let output = run(VALID_REQUEST);
    assert_eq!(output.status.code(), Some(0));
    let receipt: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(receipt["outcome"], "complete-conditional-grh");
    assert_eq!(receipt["publicComplete"], true);
    assert_eq!(receipt["preparation"]["certificateVerified"], true);
    assert_eq!(
        receipt["candidate"]["authority"],
        "authenticated-supplied-principal-relations-candidate-only"
    );
    assert!(
        receipt["candidate"]["authenticatedPrincipalRelations"]
            .as_u64()
            .unwrap()
            > 0
    );
    assert_eq!(receipt["completion"]["classNumber"], "1");
    assert_eq!(receipt["completion"]["sealedEvidenceVerified"], true);
    assert_eq!(
        receipt["completion"]["arbitraryIdealClassMapRetained"],
        true
    );
    assert!(receipt.get("firstUnavailableBoundary").is_none());
}

#[test]
fn executable_rejects_answer_bearing_unknown_input() {
    let source = VALID_REQUEST.replacen("\n}", ",\n  \"expectedClassNumber\": \"1\"\n}", 1);
    let output = run(&source);
    assert_eq!(output.status.code(), Some(64));
    let receipt: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(receipt["outcome"], "rejected");
}

#[test]
fn executable_transports_a_nontrivial_integral_ideal_class_certificate() {
    let mut completion: Value = serde_json::from_str(VALID_REQUEST).unwrap();
    completion["polynomialAscending"] = serde_json::json!(["-29", "-30", "-8", "1"]);
    completion["resources"]["maximumCandidates"] = serde_json::json!(100_000);
    let source = serde_json::json!({
        "schema": "sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-request-v1",
        "completionRequest": completion,
        "idealIntegralBasisRows": [["1", "0", "2"], ["0", "1", "2"], ["0", "0", "3"]],
        "resources": {
            "embeddingPrecisionBits": 320,
            "maximumCandidates": 2_000,
            "maximumValuation": 64
        }
    });
    let output = run(&serde_json::to_string(&source).unwrap());
    assert_eq!(output.status.code(), Some(0));
    let receipt: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        receipt["schema"],
        "sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1"
    );
    assert_eq!(receipt["completion"]["completion"]["classNumber"], "2");
    assert_eq!(
        receipt["certificate"]["classCoordinates"],
        serde_json::json!(["1"])
    );
    assert_eq!(receipt["certificate"]["presentationZero"], false);
    assert!(
        receipt["certificate"]["quotientFactorBaseExponents"]
            .as_array()
            .is_some_and(|terms| !terms.is_empty())
    );
}
