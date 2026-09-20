// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Strict, answer-free JSON ingress for a certified prepared cubic.
//!
//! JSON is only a transport format.  The parsed data is untrusted until
//! [`ValidatedPreparedCubic::validate`] replays every exact field invariant.

use crate::{
    EmbeddingPrecisionState, PreparedCubicData, PreparedCubicValidationError,
    ValidatedPreparedCubic,
};
use rug::Integer;
use serde::Deserialize;
use std::fmt;

const SCHEMA: &str = "sagejs.rust-class-group.neutral-input/v1";

/// Metadata plus the replay-validated prepared cubic carried by a neutral
/// qualification input.  This deliberately excludes all class-group answers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NeutralPreparedCubicInput {
    pub input_id: String,
    pub field_id: String,
    pub field: ValidatedPreparedCubic,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PreparedCubicInputError {
    Json(String),
    WrongSchema(String),
    OracleAnswersForbidden,
    PublicPolynomialHasNoPreparedField,
    UnsupportedDegree(usize),
    InvalidShape(&'static str),
    InvalidInteger {
        path: String,
        value: String,
    },
    NonIntegralStructureConstant {
        left: usize,
        right: usize,
        coordinate: usize,
    },
    FieldPolynomialMismatch,
    Validation(PreparedCubicValidationError),
}

impl fmt::Display for PreparedCubicInputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{self:?}")
    }
}

impl std::error::Error for PreparedCubicInputError {}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    schema: String,
    input_id: String,
    field_id: String,
    field: Field,
    preparation: Preparation,
    request: Request,
    randomness: serde_json::Value,
    contains_oracle_answers: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Field {
    variable: String,
    coefficients_ascending: Vec<String>,
    degree: usize,
    monic: bool,
    irreducible: bool,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum Preparation {
    PublicPolynomial,
    #[serde(rename_all = "camelCase")]
    NeutralPreparedField {
        authority: String,
        maximal_order_certified: bool,
        basis_numerators_row_major: Vec<String>,
        basis_denominator: String,
        discriminant: String,
        signature: Signature,
        multiplication_table: Vec<Vec<Vec<ExactRational>>>,
        irreducibility_prime: u32,
        index_primes: Vec<String>,
        source_sha256: String,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Signature {
    real_places: u8,
    complex_pairs: u8,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ExactRational {
    numerator: String,
    denominator: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    proof: String,
    output: String,
    map_policy: String,
    unit_policy: String,
    limits: Limits,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Limits {
    wall_milliseconds: String,
    memory_bytes: String,
    relation_candidates: String,
    precision_bits: u32,
    continuation_passes: usize,
}

fn integer(path: impl Into<String>, value: &str) -> Result<Integer, PreparedCubicInputError> {
    let canonical = value == "0"
        || value
            .strip_prefix('-')
            .is_some_and(|magnitude| !magnitude.is_empty() && !magnitude.starts_with('0'))
        || (!value.starts_with('0') && value.bytes().all(|byte| byte.is_ascii_digit()));
    if !canonical
        || !value
            .trim_start_matches('-')
            .bytes()
            .all(|byte| byte.is_ascii_digit())
    {
        return Err(PreparedCubicInputError::InvalidInteger {
            path: path.into(),
            value: value.to_owned(),
        });
    }
    value
        .parse::<Integer>()
        .map_err(|_| PreparedCubicInputError::InvalidInteger {
            path: path.into(),
            value: value.to_owned(),
        })
}

fn exact_array<const N: usize>(
    path: &'static str,
    values: Vec<String>,
) -> Result<[Integer; N], PreparedCubicInputError> {
    if values.len() != N {
        return Err(PreparedCubicInputError::InvalidShape(path));
    }
    let parsed = values
        .iter()
        .enumerate()
        .map(|(index, value)| integer(format!("{path}[{index}]"), value))
        .collect::<Result<Vec<_>, _>>()?;
    parsed
        .try_into()
        .map_err(|_| PreparedCubicInputError::InvalidShape(path))
}

/// Parse a neutral qualification input and replay-validate its prepared cubic.
pub fn parse_neutral_prepared_cubic_json(
    source: &str,
) -> Result<NeutralPreparedCubicInput, PreparedCubicInputError> {
    let document: Document = serde_json::from_str(source)
        .map_err(|error| PreparedCubicInputError::Json(error.to_string()))?;
    if document.schema != SCHEMA {
        return Err(PreparedCubicInputError::WrongSchema(document.schema));
    }
    if document.contains_oracle_answers {
        return Err(PreparedCubicInputError::OracleAnswersForbidden);
    }
    if document.field.degree != 3 || document.field.coefficients_ascending.len() != 4 {
        return Err(PreparedCubicInputError::UnsupportedDegree(
            document.field.degree,
        ));
    }
    if !document.field.monic || !document.field.irreducible || document.field.variable.is_empty() {
        return Err(PreparedCubicInputError::InvalidShape("field"));
    }
    let polynomial = exact_array::<4>(
        "field.coefficientsAscending",
        document.field.coefficients_ascending,
    )?;
    let Preparation::NeutralPreparedField {
        authority,
        maximal_order_certified,
        basis_numerators_row_major,
        basis_denominator,
        discriminant,
        signature,
        multiplication_table,
        irreducibility_prime,
        index_primes,
        source_sha256,
    } = document.preparation
    else {
        return Err(PreparedCubicInputError::PublicPolynomialHasNoPreparedField);
    };
    if !maximal_order_certified
        || !matches!(
            authority.as_str(),
            "independent-oracle" | "sagejs-certified-preparation"
        )
        || source_sha256.len() != 64
    {
        return Err(PreparedCubicInputError::InvalidShape(
            "preparation metadata",
        ));
    }
    let basis = exact_array::<9>(
        "preparation.basisNumeratorsRowMajor",
        basis_numerators_row_major,
    )?;
    if multiplication_table.len() != 3
        || multiplication_table.iter().any(|row| row.len() != 3)
        || multiplication_table
            .iter()
            .flatten()
            .any(|row| row.len() != 3)
    {
        return Err(PreparedCubicInputError::InvalidShape(
            "preparation.multiplicationTable",
        ));
    }
    let mut table = Vec::with_capacity(27);
    for (left, right_rows) in multiplication_table.iter().enumerate() {
        for (right, coordinates) in right_rows.iter().enumerate() {
            for (coordinate, value) in coordinates.iter().enumerate() {
                if value.denominator != "1" {
                    return Err(PreparedCubicInputError::NonIntegralStructureConstant {
                        left,
                        right,
                        coordinate,
                    });
                }
                table.push(integer(
                    format!("preparation.multiplicationTable[{left}][{right}][{coordinate}]"),
                    &value.numerator,
                )?);
            }
        }
    }
    let multiplication_table: [Integer; 27] = table
        .try_into()
        .map_err(|_| PreparedCubicInputError::InvalidShape("preparation.multiplicationTable"))?;
    let index_primes = index_primes
        .iter()
        .enumerate()
        .map(|(index, value)| integer(format!("preparation.indexPrimes[{index}]"), value))
        .collect::<Result<Vec<_>, _>>()?;
    // Touch the complete request/randomness envelope so these cannot become an
    // unnoticed second input channel.  Their detailed policy is schema-owned.
    let _policy = (
        document.request.proof,
        document.request.output,
        document.request.map_policy,
        document.request.unit_policy,
        document.request.limits.wall_milliseconds,
        document.request.limits.memory_bytes,
        document.request.limits.relation_candidates,
        document.request.limits.continuation_passes,
        document.randomness,
    );
    let data = PreparedCubicData {
        polynomial_ascending: polynomial.clone(),
        irreducibility_prime,
        integral_basis_numerators: basis,
        basis_denominator: integer("preparation.basisDenominator", &basis_denominator)?,
        multiplication_table,
        discriminant: integer("preparation.discriminant", &discriminant)?,
        signature: (signature.real_places, signature.complex_pairs),
        embedding_precision: EmbeddingPrecisionState::Pending {
            target_bits: document.request.limits.precision_bits,
        },
        index_primes,
    };
    if data.polynomial_ascending != polynomial {
        return Err(PreparedCubicInputError::FieldPolynomialMismatch);
    }
    let field =
        ValidatedPreparedCubic::validate(data).map_err(PreparedCubicInputError::Validation)?;
    Ok(NeutralPreparedCubicInput {
        input_id: document.input_id,
        field_id: document.field_id,
        field,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROW6: &str =
        include_str!("../qualification/row6-candidate/inputs/row6-neutral-prepared-field.json");

    #[test]
    fn accepts_and_replays_row6() {
        let parsed = parse_neutral_prepared_cubic_json(ROW6).unwrap();
        assert_eq!(
            parsed.field_id,
            "row6-x3-minus-2000000000010x-plus-2000000000018"
        );
        assert_eq!(parsed.field.equation_order_index(), &3);
    }

    #[test]
    fn rejects_nonintegral_structure_constant() {
        let source = ROW6.replacen(
            r#""numerator": "1", "denominator": "1""#,
            r#""numerator": "1", "denominator": "2""#,
            1,
        );
        assert!(matches!(
            parse_neutral_prepared_cubic_json(&source),
            Err(PreparedCubicInputError::NonIntegralStructureConstant { .. })
        ));
    }

    #[test]
    fn rejects_tampered_discriminant_during_exact_replay() {
        let source = ROW6.replace(
            "3555555555596888888888939555555555028",
            "3555555555596888888888939555555555029",
        );
        assert!(matches!(
            parse_neutral_prepared_cubic_json(&source),
            Err(PreparedCubicInputError::Validation(
                PreparedCubicValidationError::DiscriminantMismatch { .. }
            ))
        ));
    }
}
