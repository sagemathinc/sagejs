// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_class_groups::reactor::execute_for_test;
use sagejs_class_groups::service::{ProductService, SERVICE_ABI_VERSION, SERVICE_REQUEST_SCHEMA};
use serde_json::{Value, json};

#[test]
fn reactor_uses_the_same_product_service_protocol_and_state() {
    let mut service = ProductService::new();
    let request = serde_json::to_vec(&json!({
        "schema": SERVICE_REQUEST_SCHEMA,
        "abi": SERVICE_ABI_VERSION,
        "id": "reactor-capability",
        "operation": "capability",
    }))
    .unwrap();
    let first: Value = serde_json::from_slice(&execute_for_test(&mut service, &request)).unwrap();
    let second: Value = serde_json::from_slice(&execute_for_test(&mut service, &request)).unwrap();
    assert_eq!(first, second);
    assert_eq!(first["ok"], true);
    assert_eq!(first["result"]["abi"], SERVICE_ABI_VERSION);
}
