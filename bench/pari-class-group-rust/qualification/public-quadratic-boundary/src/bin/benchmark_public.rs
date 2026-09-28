// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use sagejs_public_quadratic_boundary_qualification::{
    compute_imaginary_class_group_from_coefficients,
    compute_imaginary_class_number_from_coefficients,
};
use serde::Serialize;
use std::hint::black_box;
use std::time::Instant;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    schema: &'static str,
    boundary_label: &'static str,
    polynomial_ascending: [i64; 3],
    kernel_nanoseconds: u128,
    computations: usize,
    result: Projection,
    proof_status: &'static str,
    runtime_uses_pari_or_fixture_answers: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Projection {
    discriminant: i64,
    class_number: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    invariant_factors: Option<Vec<u64>>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let class_number_only = if arguments.first().map(String::as_str) == Some("--class-number") {
        arguments.remove(0);
        true
    } else {
        false
    };
    let computations = if arguments.first().map(String::as_str) == Some("--batch") {
        if arguments.len() < 2 {
            return Err("--batch requires a positive computation count".into());
        }
        let count = arguments[1].parse::<usize>()?;
        if count == 0 {
            return Err("--batch count must be positive".into());
        }
        arguments.drain(0..2);
        count
    } else {
        1
    };
    let coefficients = arguments
        .into_iter()
        .map(|value| value.parse::<i64>())
        .collect::<Result<Vec<_>, _>>()?;
    let polynomial_ascending: [i64; 3] = coefficients.try_into().map_err(|values: Vec<i64>| {
        format!(
            "expected exactly three ascending i64 coefficients, received {}",
            values.len()
        )
    })?;

    let start = Instant::now();
    if class_number_only {
        let mut result = None;
        for _ in 0..computations {
            let computed =
                compute_imaginary_class_number_from_coefficients(black_box(polynomial_ascending))?;
            black_box(&computed);
            if let Some(first) = &result {
                if first != &computed {
                    return Err("repeated answer-free computations disagreed".into());
                }
            } else {
                result = Some(computed);
            }
        }
        let kernel_nanoseconds = start.elapsed().as_nanos();
        let result = result.expect("positive computation count");
        let sample = Sample {
            schema: "sagejs.public-quadratic/benchmark-sample-v1",
            boundary_label: "public-coefficients-to-unconditional-class-number-v1",
            polynomial_ascending,
            kernel_nanoseconds,
            computations,
            result: Projection {
                discriminant: result.discriminant,
                class_number: result.class_number,
                invariant_factors: None,
            },
            proof_status: result.proof_status,
            runtime_uses_pari_or_fixture_answers: false,
        };
        println!("{}", serde_json::to_string(&sample)?);
        return Ok(());
    }
    let mut result = None;
    for _ in 0..computations {
        let computed =
            compute_imaginary_class_group_from_coefficients(black_box(polynomial_ascending))?;
        black_box(&computed);
        if let Some(first) = &result {
            if first != &computed {
                return Err("repeated answer-free computations disagreed".into());
            }
        } else {
            result = Some(computed);
        }
    }
    let kernel_nanoseconds = start.elapsed().as_nanos();
    let result = result.expect("positive computation count");
    let sample = Sample {
        schema: "sagejs.public-quadratic/benchmark-sample-v1",
        boundary_label: "public-coefficients-to-verified-complete-class-group-v1",
        polynomial_ascending,
        kernel_nanoseconds,
        computations,
        result: Projection {
            discriminant: result.discriminant,
            class_number: result.class_number,
            invariant_factors: Some(result.invariant_factors),
        },
        proof_status: result.proof_status,
        runtime_uses_pari_or_fixture_answers: result.runtime_uses_pari_or_fixture_answers,
    };
    println!("{}", serde_json::to_string(&sample)?);
    Ok(())
}
