// Copyright (C) The PARI group and Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_principal_relation_lift_qualification::{LiftError, QualifiedPresentation};
use serde_json::{Value, json};
use std::fs;
use std::process::ExitCode;

fn read_json(path: &str) -> Result<Value, String> {
    let text = fs::read_to_string(path).map_err(|error| format!("{path}: {error}"))?;
    serde_json::from_str(&text).map_err(|error| format!("{path}: {error}"))
}

fn run() -> Result<Value, LiftError> {
    let arguments = std::env::args().collect::<Vec<_>>();
    if arguments.len() != 4 {
        return Err(LiftError::Malformed(
            "usage: principal-relation-lift PREPARED CERTIFICATE FACTOR_BASE_INDEX".into(),
        ));
    }
    let prepared = read_json(&arguments[1]).map_err(LiftError::Malformed)?;
    let certificate = read_json(&arguments[2]).map_err(LiftError::Malformed)?;
    let factor_base_index = arguments[3]
        .parse::<usize>()
        .map_err(|_| LiftError::Malformed("factor-base index is not a usize".into()))?;
    let presentation = QualifiedPresentation::from_documents(&prepared, &certificate)?;
    let lift = presentation.lift_factor_base_row(factor_base_index)?;
    Ok(json!({
        "schema": "sagejs.rust-class-group/principal-relation-lift-v1",
        "qualificationStatus": "independently-replayed-exact-relation-lift",
        "factorBaseIndexZeroBased": lift.factor_base_index,
        "relationShape": {
            "columns": presentation.factor_base_size(),
        },
        "classResidues": presentation.class_residues(factor_base_index).unwrap(),
        "nonzeroCoefficientCount": lift.coefficients.len(),
        "coefficients": lift.coefficients.iter().map(|term| json!({
            "relationIndexZeroBased": term.relation_index,
            "coefficient": term.coefficient.to_string(),
        })).collect::<Vec<_>>(),
        "verified": {"relationCombinationEqualsRequestedFactorBaseRow": true},
    }))
}

fn main() -> ExitCode {
    match run() {
        Ok(result) => {
            println!("{}", serde_json::to_string_pretty(&result).unwrap());
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}
