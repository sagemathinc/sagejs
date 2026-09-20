// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_quadratic_boundary_qualification::{
    GENERAL_IMAGINARY_CASES, REAL_QUADRATIC_CASES, SMALL_IMAGINARY_CASES,
    compute_imaginary_class_group, compute_imaginary_class_group_from_coefficients, qualify_case,
};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QualificationOutput {
    complete_imaginary_class_groups:
        Vec<sagejs_public_quadratic_boundary_qualification::CompleteImaginaryClassGroup>,
    real_quadratic_boundaries: Vec<sagejs_public_quadratic_boundary_qualification::BoundaryReport>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    if !arguments.is_empty() {
        if arguments.len() != 3 {
            return Err("expected exactly three ascending integer coefficients".into());
        }
        let coefficients = arguments
            .iter()
            .map(|value| value.parse::<i64>())
            .collect::<Result<Vec<_>, _>>()?;
        let answer = compute_imaginary_class_group_from_coefficients([
            coefficients[0],
            coefficients[1],
            coefficients[2],
        ])?;
        println!("{}", serde_json::to_string_pretty(&answer)?);
        return Ok(());
    }
    let real_quadratic_boundaries = REAL_QUADRATIC_CASES
        .into_iter()
        .map(qualify_case)
        .collect::<Result<Vec<_>, _>>()?;
    let complete_imaginary_class_groups = SMALL_IMAGINARY_CASES
        .into_iter()
        .chain(GENERAL_IMAGINARY_CASES)
        .map(compute_imaginary_class_group)
        .collect::<Result<Vec<_>, _>>()?;
    println!(
        "{}",
        serde_json::to_string_pretty(&QualificationOutput {
            complete_imaginary_class_groups,
            real_quadratic_boundaries,
        })?
    );
    Ok(())
}
