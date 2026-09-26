// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_principal_relation_lift_qualification::{LiftError, QualifiedPresentation};
use serde_json::{Value, json};

fn document(variable: &str) -> Value {
    let path = std::env::var(variable).unwrap_or_else(|_| panic!("{variable} is not set"));
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read {path}: {error}"));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("invalid JSON in {path}: {error}"))
}

#[test]
#[ignore = "requires generated real row6 prepared evidence and compact certificate"]
fn actual_row6_principal_and_nonprincipal_rows() {
    let prepared = document("SAGEJS_ROW6_PREPARED_V2");
    let certificate = document("SAGEJS_ROW6_COMPACT_CERTIFICATE");
    assert_eq!(
        prepared["relations"],
        json!({"rows": 1137, "columns": 1130})
    );
    assert_eq!(certificate["invariantFactors"], json!(["2", "2"]));

    let presentation = QualifiedPresentation::from_documents(&prepared, &certificate).unwrap();
    let lift = presentation.lift_factor_base_row(0).unwrap();
    assert_eq!(lift.coefficients.len(), 873);
    assert!(presentation.verify_lift(&lift));
    assert!(matches!(
        presentation.lift_factor_base_row(4),
        Err(LiftError::NonPrincipal {
            factor_base_index: 4,
            residues,
        }) if residues == [1, 1]
    ));

    let mut counterfeit = certificate;
    counterfeit["relationDependencies"][0]["terms"][0]["coefficient"] = json!("1");
    counterfeit["relationDependencies"][0]["terms"][1]["coefficient"] = json!("1");
    assert!(matches!(
        QualifiedPresentation::from_documents(&prepared, &counterfeit),
        Err(LiftError::Counterfeit(_))
    ));
}
