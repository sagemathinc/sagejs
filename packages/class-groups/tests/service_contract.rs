// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_class_groups::service::{
    ProductService, SERVICE_ABI_VERSION, SERVICE_REQUEST_SCHEMA, SERVICE_RESPONSE_SCHEMA,
};
use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Stdio};

fn call(service: &mut ProductService, id: &str, operation: &str, payload: Value) -> Value {
    let mut request = json!({
        "schema": SERVICE_REQUEST_SCHEMA,
        "abi": SERVICE_ABI_VERSION,
        "id": id,
        "operation": operation,
    });
    request
        .as_object_mut()
        .unwrap()
        .extend(payload.as_object().unwrap().clone());
    serde_json::from_slice(&service.execute_json(&serde_json::to_vec(&request).unwrap())).unwrap()
}

fn tiny_request() -> Value {
    json!({
        "schema": "sagejs.rust-class-group/public-cubic-e2e-request-v2",
        "polynomialAscending": ["-1", "-1", "0", "1"],
        "proofMode": "conditional-grh",
        "resources": {
            "maximumTrialDivisor": 10000,
            "maximumIrreducibilityPrime": 257,
            "embeddingPrecisionBits": 192,
            "maximumVisitedIdeals": 10000,
            "maximumCandidates": 100000,
            "maximumNormalFormEntries": 10000000,
            "maximumNormalFormOperations": 50000000,
            "maximumRelationExponent": 256,
            "maximumVerificationMultiplyAdds": 100000000,
            "maximumPrincipalFactorTerms": 10000000,
            "maximumCompactGenerators": 16384,
            "maximumCompactSurplusRows": 64,
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
            "maximumAnalyticThreshold": 500000
        }
    })
}

#[test]
fn imaginary_quadratic_operations_are_unconditional_and_public() {
    let mut service = ProductService::new();
    let capability = call(&mut service, "iq-cap", "capability", json!({}));
    assert_eq!(
        capability["result"]["imaginaryQuadratic"]["proofMode"],
        "unconditional"
    );

    let number = call(
        &mut service,
        "iq-number",
        "imaginary-class-number",
        json!({"polynomialAscending": ["6", "-1", "1"]}),
    );
    assert_eq!(number["ok"], true, "{number}");
    assert_eq!(number["result"]["result"]["discriminant"], -23);
    assert_eq!(number["result"]["result"]["classNumber"], 3);
    assert_eq!(
        number["result"]["result"]["proofStatus"],
        "unconditional-complete"
    );

    let group = call(
        &mut service,
        "iq-group",
        "imaginary-class-group",
        json!({"polynomialAscending": ["6", "-1", "1"]}),
    );
    assert_eq!(group["ok"], true, "{group}");
    let result = &group["result"]["result"];
    assert_eq!(result["classNumber"], 3);
    assert_eq!(result["invariantFactors"], json!([3]));
    assert_eq!(result["completeClassMap"].as_array().unwrap().len(), 3);
    assert_eq!(result["proofStatus"], "unconditional-complete");
    assert_eq!(result["runtimeUsesPariOrFixtureAnswers"], false);
    assert!(
        result["completeClassMap"]
            .as_array()
            .unwrap()
            .iter()
            .all(|entry| {
                entry["representativeIdeal"].is_object() && entry["coordinates"].is_array()
            })
    );
}

#[test]
fn imaginary_quadratic_rejections_are_typed_and_do_not_poison_service() {
    let mut service = ProductService::new();
    let invalid = call(
        &mut service,
        "bad",
        "imaginary-class-number",
        json!({
            "polynomialAscending": ["9", "0", "1"]
        }),
    );
    assert_eq!(invalid["ok"], false, "{invalid}");
    assert_eq!(invalid["error"]["category"], "invalid-request");

    let oversized = call(
        &mut service,
        "large",
        "imaginary-class-group",
        json!({
            "polynomialAscending": ["50000000003", "-1", "1"]
        }),
    );
    assert_eq!(oversized["ok"], false, "{oversized}");
    assert_eq!(oversized["error"]["category"], "resource-exhausted");

    let valid = call(
        &mut service,
        "recover",
        "imaginary-class-number",
        json!({
            "polynomialAscending": ["1", "-1", "1"]
        }),
    );
    assert_eq!(valid["ok"], true, "{valid}");
    assert_eq!(valid["result"]["result"]["classNumber"], 1);
}

#[test]
fn capability_and_errors_have_stable_typed_envelopes() {
    let mut service = ProductService::new();
    let capability = call(&mut service, "1", "capability", json!({}));
    assert_eq!(capability["schema"], SERVICE_RESPONSE_SCHEMA);
    assert_eq!(capability["abi"], SERVICE_ABI_VERSION);
    assert_eq!(capability["id"], "1");
    assert_eq!(capability["ok"], true);
    assert_eq!(capability["result"]["operation"], "capability");

    let malformed: Value = serde_json::from_slice(&service.execute_json(b"not-json")).unwrap();
    assert_eq!(malformed["ok"], false);
    assert_eq!(malformed["error"]["category"], "invalid-request");

    let declined = call(&mut service, "2", "not-an-operation", json!({}));
    assert_eq!(declined["ok"], false);
    assert_eq!(declined["error"]["category"], "capability-declined");
}

#[test]
fn resource_rejection_does_not_poison_the_resident_service() {
    let mut service = ProductService::new();
    let mut starved = tiny_request();
    starved["resources"]["maximumRelations"] = json!(1);
    let rejected = call(
        &mut service,
        "starved-open",
        "open",
        json!({"request": starved}),
    );
    assert_eq!(rejected["ok"], false, "{rejected}");
    assert_eq!(rejected["error"]["category"], "resource-exhausted");
    assert!(
        rejected["error"]["message"]
            .as_str()
            .unwrap()
            .contains("ContinuationBudgetExceeded")
    );

    let recovered = call(
        &mut service,
        "valid-open",
        "open",
        json!({"request": tiny_request()}),
    );
    assert_eq!(recovered["ok"], true, "{recovered}");
    assert_eq!(recovered["result"]["generation"], "1");
    assert_eq!(recovered["result"]["handle"], "4294967297");
}

#[test]
fn resident_completion_publication_query_and_close_are_generation_bound() {
    let mut service = ProductService::new();
    let opened = call(
        &mut service,
        "open-1",
        "open",
        json!({"request": tiny_request()}),
    );
    assert_eq!(opened["ok"], true, "{opened}");
    let handle = opened["result"]["handle"].as_str().unwrap();
    let generation = opened["result"]["generation"].as_str().unwrap();
    assert!(
        opened["result"]["completion"]
            .get("stageTimingsNanoseconds")
            .is_none()
    );

    let summary = call(
        &mut service,
        "summary-1",
        "summary",
        json!({"generation": generation, "handle": handle}),
    );
    assert_eq!(summary["ok"], true, "{summary}");
    assert_eq!(
        summary["result"]["schema"],
        "sagejs.class-groups/compact-summary-v1"
    );
    assert_eq!(summary["result"]["classNumber"], "1");
    assert_eq!(summary["result"]["basisDenominator"], "1");
    assert_eq!(
        summary["result"]["integralBasisNumerators"],
        json!(["1", "0", "0", "0", "1", "0", "0", "0", "1"])
    );
    assert!(summary["result"].get("factorBase").is_none());
    assert!(serde_json::to_vec(&summary).unwrap().len() < 16_384);

    let publication = call(
        &mut service,
        "publication-1",
        "publication",
        json!({"generation": generation, "handle": handle}),
    );
    assert_eq!(publication["ok"], true, "{publication}");
    assert_eq!(
        publication["result"]["publication"]["status"],
        "detached-replay-required-before-publication"
    );

    let query = call(
        &mut service,
        "query-1",
        "query",
        json!({
            "generation": generation,
            "handle": handle,
            "idealIntegralBasisRows": [["1","0","0"],["0","1","0"],["0","0","1"]],
            "resources": {
                "embeddingPrecisionBits": 192,
                "maximumCandidates": 10000,
                "maximumValuation": 64
            }
        }),
    );
    assert_eq!(query["ok"], true, "{query}");
    assert_eq!(query["result"]["certificate"]["presentationZero"], true);

    let closed = call(
        &mut service,
        "close-1",
        "close",
        json!({"generation": generation, "handle": handle}),
    );
    assert_eq!(closed["ok"], true);
    let stale = call(
        &mut service,
        "stale-1",
        "publication",
        json!({"generation": generation, "handle": handle}),
    );
    assert_eq!(stale["ok"], false);
    assert_eq!(stale["error"]["category"], "unknown-handle");
}

#[test]
fn native_json_lines_service_recovers_after_a_malformed_request() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_class-group-service"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let capability = json!({
        "schema": SERVICE_REQUEST_SCHEMA,
        "abi": SERVICE_ABI_VERSION,
        "id": "after-malformed",
        "operation": "capability",
    });
    let mut stdin = child.stdin.take().unwrap();
    writeln!(stdin, "not-json").unwrap();
    writeln!(stdin, "{capability}").unwrap();
    drop(stdin);
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    let lines = String::from_utf8(output.stdout).unwrap();
    let responses = lines
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 2);
    assert_eq!(responses[0]["ok"], false);
    assert_eq!(responses[1]["ok"], true);
    assert_eq!(responses[1]["id"], "after-malformed");
}
