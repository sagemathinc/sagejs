// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Minimal service protocol for the standalone imaginary-quadratic reactor.
//! This intentionally admits no cubic request or resident session.

use crate::imaginary::{
    BinaryQuadraticForm, CompleteImaginaryClassGroup, FormClassMapEntry, ImaginaryClassGroupError,
    compute_imaginary_class_group_from_coefficients,
    compute_imaginary_class_number_from_coefficients,
};
use serde::ser::SerializeSeq;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub const SERVICE_REQUEST_SCHEMA: &str = "sagejs.class-groups/service-request-v1";
pub const SERVICE_RESPONSE_SCHEMA: &str = "sagejs.class-groups/service-response-v1";
pub const SERVICE_ABI_VERSION: u32 = 1;
pub const MAXIMUM_REQUEST_BYTES: usize = 1 << 20;
pub const MAXIMUM_RESPONSE_BYTES: usize = 16 << 20;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ErrorCategory {
    InvalidRequest,
    UnsupportedSchema,
    CapabilityDeclined,
    ResourceExhausted,
    ComputationFailed,
}

#[derive(Debug)]
struct ServiceError {
    category: ErrorCategory,
    operation: String,
    message: String,
}

impl ServiceError {
    fn new(category: ErrorCategory, operation: &str, message: impl Into<String>) -> Self {
        Self {
            category,
            operation: operation.to_owned(),
            message: message.into(),
        }
    }

    fn receipt(self) -> Value {
        json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "outcome": "error",
            "category": self.category,
            "operation": self.operation,
            "message": self.message,
        })
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImaginaryRequest {
    schema: String,
    abi: u32,
    id: String,
    operation: String,
    polynomial_ascending: [String; 3],
    #[serde(default)]
    transport: Option<String>,
}

struct CoreRows<'a>(&'a [FormClassMapEntry]);

impl Serialize for CoreRows<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let rank = self.0.first().map_or(0, |entry| entry.coordinates.len());
        let mut output = serializer.serialize_seq(Some(self.0.len() * (2 + rank)))?;
        for entry in self.0 {
            output.serialize_element(&entry.form.a)?;
            output.serialize_element(&entry.form.b)?;
            for coordinate in &entry.coordinates {
                output.serialize_element(coordinate)?;
            }
        }
        output.end()
    }
}

struct PackedForms<'a>(&'a [BinaryQuadraticForm]);

impl Serialize for PackedForms<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut output = serializer.serialize_seq(Some(self.0.len() * 3))?;
        for form in self.0 {
            output.serialize_element(&form.a)?;
            output.serialize_element(&form.b)?;
            output.serialize_element(&form.c)?;
        }
        output.end()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackedCertificate<'a> {
    discriminant: i64,
    fundamental_squarefree_core: i64,
    squarefree_core_prime_factors: &'a [u64],
    reduction_bound_a: i64,
    reduced_forms_packed: PackedForms<'a>,
    theorem: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PackedGroup<'a> {
    schema: &'static str,
    field_id: &'static str,
    polynomial_ascending: &'a [i64; 3],
    discriminant: i64,
    class_number: usize,
    invariant_factors: &'a [u64],
    generators: &'a [crate::imaginary::ClassGenerator],
    complete_class_map_core_packed: CoreRows<'a>,
    complete_class_map_length: usize,
    certificate: PackedCertificate<'a>,
    proof_status: &'static str,
    runtime_uses_pari_or_fixture_answers: bool,
}

impl<'a> From<&'a CompleteImaginaryClassGroup> for PackedGroup<'a> {
    fn from(group: &'a CompleteImaginaryClassGroup) -> Self {
        let certificate = &group.certificate;
        Self {
            schema: group.schema,
            field_id: group.field_id,
            polynomial_ascending: &group.polynomial_ascending,
            discriminant: group.discriminant,
            class_number: group.class_number,
            invariant_factors: &group.invariant_factors,
            generators: &group.generators,
            complete_class_map_core_packed: CoreRows(&group.complete_class_map),
            complete_class_map_length: group.complete_class_map.len(),
            certificate: PackedCertificate {
                discriminant: certificate.discriminant,
                fundamental_squarefree_core: certificate.fundamental_squarefree_core,
                squarefree_core_prime_factors: &certificate.squarefree_core_prime_factors,
                reduction_bound_a: certificate.reduction_bound_a,
                reduced_forms_packed: PackedForms(&certificate.reduced_forms),
                theorem: certificate.theorem,
            },
            proof_status: group.proof_status,
            runtime_uses_pari_or_fixture_answers: group.runtime_uses_pari_or_fixture_answers,
        }
    }
}

fn mathematical_error(operation: &str, error: ImaginaryClassGroupError) -> ServiceError {
    let category = match error {
        ImaginaryClassGroupError::DiscriminantResourceLimit { .. }
        | ImaginaryClassGroupError::ReducedFormResourceLimit { .. } => {
            ErrorCategory::ResourceExhausted
        }
        ImaginaryClassGroupError::NonMonic
        | ImaginaryClassGroupError::DiscriminantOutsideI64
        | ImaginaryClassGroupError::NotImaginary
        | ImaginaryClassGroupError::NotFundamentalDiscriminant => ErrorCategory::InvalidRequest,
        _ => ErrorCategory::ComputationFailed,
    };
    ServiceError::new(category, operation, error.to_string())
}

fn coefficients(request: &ImaginaryRequest) -> Result<[i64; 3], ServiceError> {
    let values = request.polynomial_ascending.clone().map(|value| {
        value.parse::<i64>().map_err(|_| {
            ServiceError::new(
                ErrorCategory::InvalidRequest,
                &request.operation,
                "polynomial coefficients must be decimal signed 64-bit integers",
            )
        })
    });
    let values = values.into_iter().collect::<Result<Vec<_>, _>>()?;
    Ok(values.try_into().expect("three polynomial coefficients"))
}

fn envelope(id: &str, result: Result<Value, ServiceError>) -> Vec<u8> {
    let payload = match result {
        Ok(result) => json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "abi": SERVICE_ABI_VERSION,
            "id": id,
            "ok": true,
            "result": result,
        }),
        Err(error) => json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "abi": SERVICE_ABI_VERSION,
            "id": id,
            "ok": false,
            "error": error.receipt(),
        }),
    };
    bounded_response(
        id,
        serde_json::to_vec(&payload).expect("fixed response shape"),
    )
}

fn bounded_response(id: &str, bytes: Vec<u8>) -> Vec<u8> {
    if bytes.len() <= MAXIMUM_RESPONSE_BYTES {
        bytes
    } else {
        let error = ServiceError::new(
            ErrorCategory::ResourceExhausted,
            "unknown",
            "response exceeds the service byte limit",
        );
        serde_json::to_vec(&json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "abi": SERVICE_ABI_VERSION,
            "id": id,
            "ok": false,
            "error": error.receipt(),
        }))
        .expect("fixed bounded error")
    }
}

#[derive(Default)]
pub struct QuadraticService;

impl QuadraticService {
    pub fn new() -> Self {
        Self
    }

    pub fn execute_json(&mut self, bytes: &[u8]) -> Vec<u8> {
        if bytes.is_empty() || bytes.len() > MAXIMUM_REQUEST_BYTES {
            return envelope(
                "unknown",
                Err(ServiceError::new(
                    ErrorCategory::InvalidRequest,
                    "unknown",
                    "request byte length is outside the service limit",
                )),
            );
        }
        let value: Value = match serde_json::from_slice(bytes) {
            Ok(value) => value,
            Err(error) => {
                return envelope(
                    "unknown",
                    Err(ServiceError::new(
                        ErrorCategory::InvalidRequest,
                        "unknown",
                        format!("invalid JSON: {error}"),
                    )),
                );
            }
        };
        let valid_id = value
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.len() <= 128);
        let id = valid_id.unwrap_or("unknown").to_owned();
        let operation = value
            .get("operation")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        if value.get("schema").and_then(Value::as_str) != Some(SERVICE_REQUEST_SCHEMA)
            || value.get("abi").and_then(Value::as_u64) != Some(u64::from(SERVICE_ABI_VERSION))
        {
            return envelope(
                &id,
                Err(ServiceError::new(
                    ErrorCategory::UnsupportedSchema,
                    &operation,
                    "unsupported service schema or ABI",
                )),
            );
        }
        if valid_id.is_none() {
            return envelope(
                &id,
                Err(ServiceError::new(
                    ErrorCategory::InvalidRequest,
                    &operation,
                    "request id must be a nonempty bounded string",
                )),
            );
        }
        if operation == "capability" {
            if value.as_object().map_or(true, |fields| fields.len() != 4) {
                return envelope(
                    &id,
                    Err(ServiceError::new(
                        ErrorCategory::InvalidRequest,
                        &operation,
                        "capability accepts only schema, ABI, id, and operation",
                    )),
                );
            }
            return envelope(
                &id,
                Ok(json!({
                    "schema": SERVICE_RESPONSE_SCHEMA,
                    "outcome": "available",
                    "operation": "capability",
                    "abi": SERVICE_ABI_VERSION,
                    "mathematicalScope": "fundamental-imaginary-quadratic-unconditional",
                    "maximumResidentSessions": 0,
                    "proofModes": ["unconditional"],
                    "imaginaryQuadratic": {
                        "proofMode": "unconditional",
                        "maximumAbsoluteDiscriminant": 200_000_000_000_u64,
                        "operations": ["imaginary-class-number", "imaginary-class-group"],
                        "transports": ["core-v2"],
                    },
                    "operations": ["capability", "imaginary-class-number", "imaginary-class-group"],
                })),
            );
        }
        if operation != "imaginary-class-number" && operation != "imaginary-class-group" {
            return envelope(
                &id,
                Err(ServiceError::new(
                    ErrorCategory::CapabilityDeclined,
                    &operation,
                    "unsupported service operation",
                )),
            );
        }
        let request: ImaginaryRequest = match serde_json::from_value(value) {
            Ok(request) => request,
            Err(error) => {
                return envelope(
                    &id,
                    Err(ServiceError::new(
                        ErrorCategory::InvalidRequest,
                        &operation,
                        error.to_string(),
                    )),
                );
            }
        };
        debug_assert_eq!(request.schema, SERVICE_REQUEST_SCHEMA);
        debug_assert_eq!(request.abi, SERVICE_ABI_VERSION);
        debug_assert_eq!(request.id, id);
        debug_assert_eq!(request.operation, operation);
        if (operation == "imaginary-class-group"
            && request.transport.as_deref() != Some("core-v2")
            && request.transport.is_some())
            || (operation == "imaginary-class-number" && request.transport.is_some())
        {
            return envelope(
                &id,
                Err(ServiceError::new(
                    ErrorCategory::InvalidRequest,
                    &operation,
                    "unsupported imaginary class-group transport",
                )),
            );
        }
        let coefficients = match coefficients(&request) {
            Ok(coefficients) => coefficients,
            Err(error) => return envelope(&id, Err(error)),
        };
        if operation == "imaginary-class-number" {
            let result = compute_imaginary_class_number_from_coefficients(coefficients)
                .map_err(|error| mathematical_error(&operation, error))
                .map(|result| {
                    json!({
                        "schema": SERVICE_RESPONSE_SCHEMA,
                        "outcome": "complete",
                        "operation": operation,
                        "result": result,
                    })
                });
            return envelope(&id, result);
        }
        let result = match compute_imaginary_class_group_from_coefficients(coefficients) {
            Ok(result) => result,
            Err(error) => return envelope(&id, Err(mathematical_error(&operation, error))),
        };
        if request.transport.as_deref() == Some("core-v2") {
            let response = json!({
                "schema": SERVICE_RESPONSE_SCHEMA,
                "outcome": "complete",
                "operation": operation,
                "result": PackedGroup::from(&result),
            });
            envelope(&id, Ok(response))
        } else {
            let response = json!({
                "schema": SERVICE_RESPONSE_SCHEMA,
                "outcome": "complete",
                "operation": operation,
                "result": result,
            });
            envelope(&id, Ok(response))
        }
    }
}
