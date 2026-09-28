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
fn bounded_rank_four_summary_has_a_detached_proof_and_exact_coordinates() {
    let mut service = ProductService::new();
    let polynomial = ["3754", "-1", "1"];
    let summary = call(
        &mut service,
        "rank4-summary",
        "imaginary-class-group-summary",
        json!({"polynomialAscending": polynomial}),
    );
    assert_eq!(summary["ok"], true, "{summary}");
    let presentation = &summary["result"]["result"];
    assert_eq!(presentation["classNumber"], 96);
    assert_eq!(presentation["invariantFactors"], json!([2, 2, 2, 12]));
    let generator_forms = presentation["generators"]
        .as_array()
        .unwrap()
        .iter()
        .map(|generator| {
            let form = &generator["form"];
            json!([
                form["a"].to_string(),
                form["b"].to_string(),
                form["c"].to_string()
            ])
        })
        .collect::<Vec<_>>();
    let verified = call(
        &mut service,
        "rank4-proof",
        "imaginary-verify-presentation",
        json!({
            "polynomialAscending": polynomial,
            "classNumber": 96,
            "invariantFactors": [2, 2, 2, 12],
            "generatorForms": generator_forms,
        }),
    );
    assert_eq!(verified["ok"], true, "{verified}");
    let mut forged = generator_forms.clone();
    forged[1] = forged[0].clone();
    let rejected = call(
        &mut service,
        "rank4-forgery",
        "imaginary-verify-presentation",
        json!({
            "polynomialAscending": polynomial,
            "classNumber": 96,
            "invariantFactors": [2, 2, 2, 12],
            "generatorForms": forged,
        }),
    );
    assert_eq!(rejected["ok"], false);
    assert_eq!(rejected["error"]["category"], "invalid-request");
    let coordinate = call(
        &mut service,
        "rank4-coordinate",
        "imaginary-class-coordinate",
        json!({
            "polynomialAscending": polynomial,
            "formCoefficients": generator_forms[3],
        }),
    );
    assert_eq!(coordinate["ok"], true, "{coordinate}");
    assert_eq!(coordinate["result"]["presentation"], *presentation);
    assert_eq!(coordinate["result"]["coordinates"], json!([0, 0, 0, 1]));
}

#[test]
fn imaginary_quadratic_operations_are_unconditional_and_public() {
    let mut service = ProductService::new();
    let capability = call(&mut service, "iq-cap", "capability", json!({}));
    assert_eq!(
        capability["result"]["imaginaryQuadratic"]["proofMode"],
        "unconditional"
    );
    assert_eq!(
        capability["result"]["imaginaryQuadratic"]["transports"],
        json!(["core-v3", "core-v2"])
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

    let packed = call(
        &mut service,
        "iq-group-packed",
        "imaginary-class-group",
        json!({"polynomialAscending": ["6", "-1", "1"], "transport": "core-v2"}),
    );
    assert_eq!(packed["ok"], true, "{packed}");
    let mut expected = result.clone();
    let entries = expected["completeClassMap"].as_array().unwrap().clone();
    let mut core_rows = Vec::new();
    for entry in &entries {
        core_rows.push(entry["form"]["a"].clone());
        core_rows.push(entry["form"]["b"].clone());
        core_rows.extend(entry["coordinates"].as_array().unwrap().iter().cloned());
    }
    expected.as_object_mut().unwrap().remove("completeClassMap");
    expected["completeClassMapCorePacked"] = json!(core_rows);
    expected["completeClassMapLength"] = json!(entries.len());
    let forms = expected["certificate"]["reducedForms"]
        .as_array()
        .unwrap()
        .clone();
    let mut packed_forms = Vec::new();
    for form in &forms {
        packed_forms.extend([form["a"].clone(), form["b"].clone(), form["c"].clone()]);
    }
    expected["certificate"]
        .as_object_mut()
        .unwrap()
        .remove("reducedForms");
    expected["certificate"]["reducedFormsPacked"] = json!(packed_forms);
    assert_eq!(packed["result"]["result"], expected);

    let derived = call(
        &mut service,
        "iq-group-derived",
        "imaginary-class-group",
        json!({"polynomialAscending": ["6", "-1", "1"], "transport": "core-v3"}),
    );
    assert_eq!(derived["ok"], true, "{derived}");
    let mut expected_derived = expected.clone();
    expected_derived["certificate"]
        .as_object_mut()
        .unwrap()
        .remove("reducedFormsPacked");
    expected_derived["certificate"]["reducedFormsFromCoreMap"] = json!(true);
    assert_eq!(derived["result"]["result"], expected_derived);

    let literal_unknown_id = call(
        &mut service,
        "unknown",
        "imaginary-class-group",
        json!({"polynomialAscending": ["6", "-1", "1"], "transport": "core-v2"}),
    );
    assert_eq!(literal_unknown_id["ok"], true);
    assert_eq!(literal_unknown_id["id"], "unknown");

    let unsupported_transport = call(
        &mut service,
        "iq-group-bad-transport",
        "imaginary-class-group",
        json!({"polynomialAscending": ["6", "-1", "1"], "transport": "unknown"}),
    );
    assert_eq!(unsupported_transport["ok"], false);
    assert_eq!(
        unsupported_transport["error"]["category"],
        "invalid-request"
    );
}

#[test]
fn imaginary_presentation_omits_the_map_but_retains_exact_coordinate_queries() {
    let mut service = ProductService::new();
    let polynomial = json!(["3750000079", "-1", "1"]);
    let summary = call(
        &mut service,
        "iq-summary",
        "imaginary-class-group-summary",
        json!({"polynomialAscending": polynomial}),
    );
    assert_eq!(summary["ok"], true, "{summary}");
    let presentation = &summary["result"]["result"];
    assert_eq!(
        presentation["schema"],
        "sagejs.class-groups/imaginary-generator-presentation-v1"
    );
    assert_eq!(presentation["discriminant"], -15_000_000_315_i64);
    assert_eq!(presentation["classNumber"], 33_768);
    assert_eq!(presentation["invariantFactors"], json!([2, 16_884]));
    assert_eq!(presentation["proofStatus"], "unconditional-complete");
    assert_eq!(presentation["runtimeUsesPariOrFixtureAnswers"], false);
    assert_eq!(
        presentation["certificate"]["reducedFormsFromExactCount"],
        true
    );
    assert!(presentation.get("completeClassMap").is_none());
    assert!(presentation.get("completeClassMapCorePacked").is_none());
    assert!(presentation["certificate"].get("reducedForms").is_none());
    assert!(serde_json::to_vec(&summary).unwrap().len() < 3_000);

    let generator_forms = presentation["generators"]
        .as_array()
        .unwrap()
        .iter()
        .map(|generator| {
            let form = &generator["form"];
            json!([
                form["a"].to_string(),
                form["b"].to_string(),
                form["c"].to_string()
            ])
        })
        .collect::<Vec<_>>();
    let verified = call(
        &mut service,
        "iq-verify",
        "imaginary-verify-presentation",
        json!({
            "polynomialAscending": polynomial,
            "classNumber": presentation["classNumber"],
            "invariantFactors": presentation["invariantFactors"],
            "generatorForms": generator_forms,
        }),
    );
    assert_eq!(verified["ok"], true, "{verified}");
    assert_eq!(verified["result"]["outcome"], "verified");
    let forged = call(
        &mut service,
        "iq-forged",
        "imaginary-verify-presentation",
        json!({
            "polynomialAscending": polynomial,
            "classNumber": presentation["classNumber"],
            "invariantFactors": presentation["invariantFactors"],
            "generatorForms": [["1", "1", "3750000079"], generator_forms[1]],
        }),
    );
    assert_eq!(forged["ok"], false);
    assert_eq!(forged["error"]["category"], "invalid-request");

    let generator = &presentation["generators"][0];
    let form = &generator["form"];
    let coordinates = call(
        &mut service,
        "iq-coordinate",
        "imaginary-class-coordinate",
        json!({
            "polynomialAscending": polynomial,
            "formCoefficients": [
                form["a"].to_string(),
                form["b"].to_string(),
                form["c"].to_string(),
            ],
        }),
    );
    assert_eq!(coordinates["ok"], true, "{coordinates}");
    assert_eq!(coordinates["result"]["presentation"], *presentation);
    assert_eq!(coordinates["result"]["coordinates"], json!([1, 0]));
    assert_eq!(coordinates["result"]["form"], *form);
    assert_eq!(
        coordinates["result"]["representativeIdeal"],
        generator["representativeIdeal"]
    );

    let nonreduced = call(
        &mut service,
        "iq-nonreduced",
        "imaginary-class-coordinate",
        json!({
            "polynomialAscending": polynomial,
            "formCoefficients": ["2", "0", "1"],
        }),
    );
    assert_eq!(nonreduced["ok"], false);
    assert_eq!(nonreduced["error"]["category"], "invalid-request");

    let higher_rank = call(
        &mut service,
        "iq-higher-rank",
        "imaginary-class-group-summary",
        json!({"polynomialAscending": ["105", "0", "1"]}),
    );
    assert_eq!(higher_rank["ok"], true, "{higher_rank}");
    assert_eq!(higher_rank["result"]["result"]["invariantFactors"], json!([2, 2, 2]));
    let eager = call(
        &mut service,
        "iq-higher-rank-eager",
        "imaginary-class-group",
        json!({"polynomialAscending": ["105", "0", "1"]}),
    );
    assert_eq!(eager["ok"], true);
    assert_eq!(eager["result"]["result"]["classNumber"], 8);
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
