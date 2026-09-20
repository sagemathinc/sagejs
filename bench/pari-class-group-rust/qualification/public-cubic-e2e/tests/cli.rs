// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use serde_json::Value;
use std::io::Write;
use std::process::{Command, Stdio};

const VALID_REQUEST: &str = r#"{
  "schema": "sagejs.rust-class-group/public-cubic-e2e-request-v1",
  "polynomialAscending": ["-1", "-1", "0", "1"],
  "proofMode": "conditional-grh",
  "resources": {
    "maximumTrialDivisor": 10000,
    "maximumIrreducibilityPrime": 257,
    "embeddingPrecisionBits": 192,
    "maximumVisitedIdeals": 10000,
    "maximumCandidates": 10000
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
fn executable_emits_evidence_but_never_success_for_a_candidate() {
    let output = run(VALID_REQUEST);
    assert_eq!(output.status.code(), Some(2));
    let receipt: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(receipt["outcome"], "incomplete");
    assert_eq!(receipt["publicComplete"], false);
    assert_eq!(receipt["preparation"]["certificateVerified"], true);
    assert_eq!(
        receipt["candidate"]["authority"],
        "presentation-candidate-only"
    );
    assert_eq!(
        receipt["firstUnavailableBoundary"],
        "candidate-presentation-to-proof-authorized-complete-class-group"
    );
}

#[test]
fn executable_rejects_answer_bearing_unknown_input() {
    let source = VALID_REQUEST.replacen("\n}", ",\n  \"expectedClassNumber\": \"1\"\n}", 1);
    let output = run(&source);
    assert_eq!(output.status.code(), Some(64));
    let receipt: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(receipt["outcome"], "rejected");
}
