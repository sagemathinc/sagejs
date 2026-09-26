use sagejs_imaginary_quadratic_core::{reactor::execute_for_test, service::QuadraticService};
use serde_json::{Value, json};

fn call(service: &mut QuadraticService, request: Value) -> Value {
    serde_json::from_slice(&execute_for_test(
        service,
        &serde_json::to_vec(&request).unwrap(),
    ))
    .unwrap()
}

fn request(operation: &str, polynomial: [&str; 3]) -> Value {
    json!({
        "schema": "sagejs.class-groups/service-request-v1",
        "abi": 1,
        "id": "quadratic-test",
        "operation": operation,
        "polynomialAscending": polynomial,
    })
}

#[test]
fn exposes_only_the_bounded_quadratic_capability() {
    let mut service = QuadraticService::new();
    let capability = call(
        &mut service,
        json!({
            "schema": "sagejs.class-groups/service-request-v1",
            "abi": 1,
            "id": "quadratic-test",
            "operation": "capability",
        }),
    );
    assert_eq!(capability["ok"], true);
    assert_eq!(
        capability["result"]["imaginaryQuadratic"]["proofMode"],
        "unconditional"
    );
    assert_eq!(
        capability["result"]["imaginaryQuadratic"]["transports"],
        json!(["core-v2"])
    );
    assert_eq!(
        capability["result"]["operations"],
        json!([
            "capability",
            "imaginary-class-number",
            "imaginary-class-group"
        ])
    );
    let cubic = call(&mut service, request("open", ["1", "0", "1"]));
    assert_eq!(cubic["ok"], false);
    assert_eq!(cubic["error"]["category"], "capability-declined");
}

#[test]
fn computes_full_and_core_maps_with_the_same_exact_answer() {
    let mut service = QuadraticService::new();
    let polynomial = ["6", "-1", "1"]; // D=-23, class group C3.
    let scalar = call(&mut service, request("imaginary-class-number", polynomial));
    let full = call(&mut service, request("imaginary-class-group", polynomial));
    let mut packed_request = request("imaginary-class-group", polynomial);
    packed_request["transport"] = json!("core-v2");
    let packed = call(&mut service, packed_request);
    for response in [&scalar, &full, &packed] {
        assert_eq!(response["ok"], true);
        assert_eq!(response["result"]["result"]["discriminant"], -23);
        assert_eq!(response["result"]["result"]["classNumber"], 3);
        assert_eq!(
            response["result"]["result"]["proofStatus"],
            "unconditional-complete"
        );
    }
    assert_eq!(full["result"]["result"]["invariantFactors"], json!([3]));
    assert_eq!(packed["result"]["result"]["invariantFactors"], json!([3]));
    assert_eq!(
        full["result"]["result"]["completeClassMap"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        packed["result"]["result"]["completeClassMapCorePacked"]
            .as_array()
            .unwrap()
            .len(),
        9
    );
    assert_eq!(
        packed["result"]["result"]["certificate"]["reducedFormsPacked"]
            .as_array()
            .unwrap()
            .len(),
        9
    );
    assert!(packed["result"]["result"].get("completeClassMap").is_none());
}

#[test]
fn rejects_nonfundamental_and_malformed_requests() {
    let mut service = QuadraticService::new();
    let nonfundamental = call(
        &mut service,
        request("imaginary-class-group", ["4", "0", "1"]),
    );
    assert_eq!(nonfundamental["ok"], false);
    assert_eq!(nonfundamental["error"]["category"], "invalid-request");
    let mut unsupported_transport = request("imaginary-class-group", ["6", "-1", "1"]);
    unsupported_transport["transport"] = json!("unknown");
    assert_eq!(
        call(&mut service, unsupported_transport)["error"]["category"],
        "invalid-request"
    );
    let bad_abi = json!({
        "schema": "sagejs.class-groups/service-request-v1",
        "abi": 2,
        "id": "quadratic-test",
        "operation": "imaginary-class-number",
        "polynomialAscending": ["6", "-1", "1"],
    });
    assert_eq!(
        call(&mut service, bad_abi)["error"]["category"],
        "unsupported-schema"
    );
}

#[test]
fn frozen_panel_packed_rows_reconstruct_the_full_exact_map() {
    let panel: Value = serde_json::from_str(include_str!(
        "../../../bench/pari-class-group-rust/qualification/public-quadratic-boundary/benchmark/panel-v2.json"
    ))
    .unwrap();
    let mut service = QuadraticService::new();
    for field in panel["fields"].as_array().unwrap() {
        let coefficients = field["polynomialAscending"]
            .as_array()
            .unwrap()
            .iter()
            .map(|coefficient| coefficient.as_i64().unwrap().to_string())
            .collect::<Vec<_>>();
        let coefficients: [String; 3] = coefficients.try_into().unwrap();
        let ordinary_request = json!({
            "schema": "sagejs.class-groups/service-request-v1",
            "abi": 1,
            "id": "frozen-full",
            "operation": "imaginary-class-group",
            "polynomialAscending": coefficients,
        });
        let mut packed_request = ordinary_request.clone();
        packed_request["id"] = json!("frozen-packed");
        packed_request["transport"] = json!("core-v2");
        let full = call(&mut service, ordinary_request);
        let packed = call(&mut service, packed_request);
        assert_eq!(full["ok"], true, "{}", field["id"]);
        assert_eq!(packed["ok"], true, "{}", field["id"]);
        let full = &full["result"]["result"];
        let packed = &packed["result"]["result"];
        assert_eq!(full["classNumber"], field["expected"]["classNumber"]);
        assert_eq!(packed["classNumber"], field["expected"]["classNumber"]);
        assert_eq!(
            full["invariantFactors"],
            field["expected"]["invariantFactors"]
        );
        assert_eq!(
            packed["invariantFactors"],
            field["expected"]["invariantFactors"]
        );
        assert_eq!(full["generators"], packed["generators"]);
        let full_rows = full["completeClassMap"].as_array().unwrap();
        let packed_rows = packed["completeClassMapCorePacked"].as_array().unwrap();
        let packed_forms = packed["certificate"]["reducedFormsPacked"]
            .as_array()
            .unwrap();
        let rank = field["expected"]["invariantFactors"]
            .as_array()
            .unwrap()
            .len();
        assert_eq!(packed_rows.len(), full_rows.len() * (rank + 2));
        assert_eq!(packed_forms.len(), full_rows.len() * 3);
        for (index, row) in full_rows.iter().enumerate() {
            let offset = index * (rank + 2);
            let form_offset = index * 3;
            assert_eq!(packed_rows[offset], row["form"]["a"]);
            assert_eq!(packed_rows[offset + 1], row["form"]["b"]);
            assert_eq!(
                &packed_rows[(offset + 2)..(offset + 2 + rank)],
                row["coordinates"].as_array().unwrap()
            );
            assert_eq!(packed_forms[form_offset], row["form"]["a"]);
            assert_eq!(packed_forms[form_offset + 1], row["form"]["b"]);
            assert_eq!(packed_forms[form_offset + 2], row["form"]["c"]);
        }
    }
}
