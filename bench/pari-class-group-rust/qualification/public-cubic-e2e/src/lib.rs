// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Fail-closed public-polynomial end-to-end qualification.
//!
//! The request deliberately has no representation for a prepared field, PARI
//! data, or expected field answers.  All mathematical state starts with the
//! four public polynomial coefficients.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    CompactPresentationLimits, CubicAnalyticEvidence, CubicCompletionProofMode,
    CubicConditionalCompletionOptions, CubicPresentationCandidateLimits, NormalFormLimits,
    PreparedCollectorLimits, PublicCubicPreparationLimits,
    authenticate_compact_cubic_presentation_candidate, authenticate_cubic_presentation_candidate,
    collect_prepared_cubic_relations, complete_cubic_class_group_conditionally,
    prepare_monic_cubic,
};
use serde::{Deserialize, Serialize};
use std::time::Instant;

pub const REQUEST_SCHEMA: &str = "sagejs.rust-class-group/public-cubic-e2e-request-v2";
pub const RECEIPT_SCHEMA: &str = "sagejs.rust-class-group/public-cubic-e2e-receipt-v2";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ProofMode {
    ConditionalGrh,
    Unconditional,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Resources {
    pub maximum_trial_divisor: u64,
    pub maximum_irreducibility_prime: u32,
    pub embedding_precision_bits: u32,
    pub maximum_visited_ideals: usize,
    pub maximum_candidates: usize,
    pub maximum_normal_form_entries: usize,
    pub maximum_normal_form_operations: u64,
    pub maximum_relation_exponent: u32,
    pub maximum_verification_multiply_adds: u64,
    pub maximum_principal_factor_terms: usize,
    pub maximum_compact_generators: usize,
    pub maximum_compact_surplus_rows: usize,
    pub maximum_compact_saturation_minor_trials: usize,
    pub maximum_compact_dependency_entries: usize,
    pub maximum_compact_target_coefficient_bits: usize,
    pub logarithm_precision_bits: u32,
    pub replay_precision_bits: u32,
    pub analytic_precision_bits: u32,
    pub maximum_relations: usize,
    pub maximum_dependencies: usize,
    pub maximum_kernel_coefficient_bits: usize,
    pub maximum_unit_exponent_bits: usize,
    pub maximum_reconstruction_denominator_bits: usize,
    pub maximum_analytic_threshold: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub schema: String,
    pub polynomial_ascending: [String; 4],
    pub proof_mode: ProofMode,
    pub resources: Resources,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreparationEvidence {
    pub discriminant: String,
    pub signature: [u8; 2],
    pub equation_order_index: String,
    pub discriminant_prime_factors: Vec<String>,
    pub certificate_verified: bool,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelationEvidence {
    pub factor_base_size: usize,
    pub relation_count: usize,
    pub complete_rank_and_surplus: bool,
    pub missing_rank: usize,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CandidateEvidence {
    pub invariant_factors: Vec<String>,
    pub class_number: String,
    pub authenticated_principal_relations: usize,
    pub generator_order_witnesses: usize,
    pub authority: &'static str,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CompletionEvidence {
    pub proof: &'static str,
    pub class_number: String,
    pub invariant_factors: Vec<String>,
    pub unit_rank: usize,
    pub bf_threshold: u64,
    pub class_unit_hypothesis: &'static str,
    pub factor_base_hypothesis: &'static str,
    pub sealed_evidence_verified: bool,
    pub arbitrary_ideal_class_map_retained: bool,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StageTimingsNanoseconds {
    pub public_input_and_preparation: u128,
    pub relation_collection: u128,
    pub candidate_authentication: u128,
    pub unit_and_analytic_completion: u128,
    pub total_to_sealed_result: u128,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub schema: &'static str,
    pub outcome: &'static str,
    pub public_complete: bool,
    pub requested_proof: ProofMode,
    pub uses_pari_input: bool,
    pub uses_prepared_fixture: bool,
    pub uses_field_answers_as_input: bool,
    pub preparation: PreparationEvidence,
    pub relations: RelationEvidence,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidate: Option<CandidateEvidence>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion: Option<CompletionEvidence>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_unavailable_boundary: Option<&'static str>,
    pub stage_timings_nanoseconds: StageTimingsNanoseconds,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QualificationError {
    UnsupportedSchema,
    InvalidCoefficient { index: usize, value: String },
    Preparation(String),
    RelationCollection(String),
    CandidateAuthentication(String),
    Completion(String),
}

/// Exercise the coefficient-only route through conditional completion.
pub fn qualify(request: Request) -> Result<Receipt, QualificationError> {
    let total_start = Instant::now();
    if request.schema != REQUEST_SCHEMA {
        return Err(QualificationError::UnsupportedSchema);
    }
    let mut coefficients: [Integer; 4] = std::array::from_fn(|_| Integer::new());
    for (index, source) in request.polynomial_ascending.iter().enumerate() {
        if source.len() > 128 {
            return Err(QualificationError::InvalidCoefficient {
                index,
                value: "<coefficient text exceeds 128 bytes>".to_owned(),
            });
        }
        coefficients[index] =
            source
                .parse::<Integer>()
                .map_err(|_| QualificationError::InvalidCoefficient {
                    index,
                    value: source.clone(),
                })?;
    }

    let preparation_limits = PublicCubicPreparationLimits {
        maximum_trial_divisor: request.resources.maximum_trial_divisor,
        maximum_irreducibility_prime: request.resources.maximum_irreducibility_prime,
        embedding_precision_bits: request.resources.embedding_precision_bits,
        ..PublicCubicPreparationLimits::default()
    };
    let prepared = prepare_monic_cubic(coefficients, preparation_limits)
        .map_err(|error| QualificationError::Preparation(error.to_string()))?;

    let certificate_verified = prepared
        .maximal_order_certificate()
        .verify(prepared.field(), preparation_limits);
    if !certificate_verified {
        return Err(QualificationError::Preparation(
            "maximal-order discriminant factorization replay failed".to_owned(),
        ));
    }
    let preparation_ns = total_start.elapsed().as_nanos();
    let preparation = PreparationEvidence {
        discriminant: prepared.field().data().discriminant.to_string(),
        signature: [
            prepared.field().data().signature.0,
            prepared.field().data().signature.1,
        ],
        equation_order_index: prepared.field().equation_order_index().to_string(),
        discriminant_prime_factors: prepared
            .maximal_order_certificate()
            .factorization()
            .iter()
            .map(|(prime, _)| prime.to_string())
            .collect(),
        certificate_verified,
    };

    let collection_start = Instant::now();
    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: request.resources.maximum_visited_ideals,
            maximum_candidates: request.resources.maximum_candidates,
        },
    )
    .map_err(|error| QualificationError::RelationCollection(format!("{error:?}")))?;
    let relation_collection_ns = collection_start.elapsed().as_nanos();
    let factor_base_size = collected.factor_base.catalog.ideals.len();
    let relation_count = if factor_base_size == 0 {
        0
    } else {
        collected.relations.len() / factor_base_size
    };
    let relations = RelationEvidence {
        factor_base_size,
        relation_count,
        complete_rank_and_surplus: collected.complete_rank_and_surplus,
        missing_rank: collected.missing_rank,
    };

    let candidate_start = Instant::now();
    let (
        candidate_evidence,
        completion,
        candidate_authentication_ns,
        completion_ns,
        total_to_sealed_result,
    ) = if collected.complete_rank_and_surplus {
        let candidate_limits = CubicPresentationCandidateLimits {
            normal_form: NormalFormLimits {
                max_entries: request.resources.maximum_normal_form_entries,
                max_operations: request.resources.maximum_normal_form_operations,
            },
            maximum_relation_exponent: request.resources.maximum_relation_exponent,
            maximum_verification_multiply_adds: request
                .resources
                .maximum_verification_multiply_adds,
            maximum_principal_factor_terms: request.resources.maximum_principal_factor_terms,
        };
        // Dense Smith transforms remain the most general route for modest
        // presentations. Large small-surplus elementary-2 presentations use
        // the exact compact quotient proof, avoiding quadratic-size
        // transforms while retaining the same authenticated result type.
        let (authenticated, authority) = if factor_base_size > 256 {
            (
                authenticate_compact_cubic_presentation_candidate(
                    &prepared,
                    collected,
                    candidate_limits,
                    CompactPresentationLimits {
                        maximum_generators: request.resources.maximum_compact_generators,
                        maximum_surplus_rows: request.resources.maximum_compact_surplus_rows,
                        maximum_saturation_minor_trials: request
                            .resources
                            .maximum_compact_saturation_minor_trials,
                        maximum_dependency_entries: request
                            .resources
                            .maximum_compact_dependency_entries,
                        maximum_target_coefficient_bits: request
                            .resources
                            .maximum_compact_target_coefficient_bits,
                    },
                )
                .map_err(|error| {
                    QualificationError::CandidateAuthentication(format!("{error:?}"))
                })?,
                "authenticated-collector-sealed-compact-elementary-two-presentation",
            )
        } else {
            (
                authenticate_cubic_presentation_candidate(&prepared, collected, candidate_limits)
                    .map_err(|error| {
                    QualificationError::CandidateAuthentication(format!("{error:?}"))
                })?,
                "authenticated-supplied-principal-relations-candidate-only",
            )
        };
        let candidate_authentication_ns = candidate_start.elapsed().as_nanos();
        let candidate_evidence = CandidateEvidence {
            invariant_factors: authenticated
                .invariant_factors()
                .iter()
                .map(Integer::to_string)
                .collect(),
            class_number: authenticated.class_number_candidate().to_string(),
            authenticated_principal_relations: authenticated.principal_relations().len(),
            generator_order_witnesses: authenticated.generator_orders().len(),
            authority,
        };
        let options = CubicConditionalCompletionOptions {
            proof_mode: match request.proof_mode {
                ProofMode::ConditionalGrh => CubicCompletionProofMode::GrhConditional,
                ProofMode::Unconditional => CubicCompletionProofMode::Unconditional,
            },
            logarithm_precision_bits: request.resources.logarithm_precision_bits,
            replay_precision_bits: request.resources.replay_precision_bits,
            analytic_precision_bits: request.resources.analytic_precision_bits,
            maximum_relations: request.resources.maximum_relations,
            maximum_dependencies: request.resources.maximum_dependencies,
            maximum_kernel_coefficient_bits: request.resources.maximum_kernel_coefficient_bits,
            maximum_unit_exponent_bits: request.resources.maximum_unit_exponent_bits,
            maximum_reconstruction_denominator_bits: request
                .resources
                .maximum_reconstruction_denominator_bits,
            maximum_analytic_threshold: request.resources.maximum_analytic_threshold,
        };
        let completion_start = Instant::now();
        let completed = complete_cubic_class_group_conditionally(prepared, authenticated, options)
            .map_err(|error| QualificationError::Completion(format!("{error:?}")))?;
        let completion_ns = completion_start.elapsed().as_nanos();
        let total_to_sealed_result = total_start.elapsed().as_nanos();
        let sealed_evidence_verified = completed.verify_sealed_evidence();
        if !sealed_evidence_verified {
            return Err(QualificationError::Completion(
                "sealed evidence invariant failed after construction".to_owned(),
            ));
        }
        let completion = CompletionEvidence {
            proof: "conditional-grh",
            class_number: completed.class_number().to_string(),
            invariant_factors: completed
                .invariant_factors()
                .iter()
                .map(Integer::to_string)
                .collect(),
            unit_rank: completed.units().fundamental_units().len(),
            bf_threshold: completed.analytic().bf_threshold(),
            class_unit_hypothesis: CubicAnalyticEvidence::CLASS_UNIT_HYPOTHESIS,
            factor_base_hypothesis: CubicAnalyticEvidence::FACTOR_BASE_HYPOTHESIS,
            sealed_evidence_verified,
            arbitrary_ideal_class_map_retained: true,
        };
        (
            Some(candidate_evidence),
            Some(completion),
            candidate_authentication_ns,
            completion_ns,
            total_to_sealed_result,
        )
    } else {
        (
            None,
            None,
            candidate_start.elapsed().as_nanos(),
            0,
            total_start.elapsed().as_nanos(),
        )
    };

    let public_complete = completion.is_some();

    Ok(Receipt {
        schema: RECEIPT_SCHEMA,
        outcome: if public_complete {
            "complete-conditional-grh"
        } else {
            "incomplete"
        },
        public_complete,
        requested_proof: request.proof_mode,
        uses_pari_input: false,
        uses_prepared_fixture: false,
        uses_field_answers_as_input: false,
        preparation,
        relations,
        candidate: candidate_evidence,
        completion,
        first_unavailable_boundary: (!public_complete).then_some("relation-collection"),
        stage_timings_nanoseconds: StageTimingsNanoseconds {
            public_input_and_preparation: preparation_ns,
            relation_collection: relation_collection_ns,
            candidate_authentication: candidate_authentication_ns,
            unit_and_analytic_completion: completion_ns,
            total_to_sealed_result,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(maximum_candidates: usize) -> Request {
        Request {
            schema: REQUEST_SCHEMA.to_owned(),
            polynomial_ascending: ["-1".into(), "-1".into(), "0".into(), "1".into()],
            proof_mode: ProofMode::ConditionalGrh,
            resources: Resources {
                maximum_trial_divisor: 10_000,
                maximum_irreducibility_prime: 257,
                embedding_precision_bits: 192,
                maximum_visited_ideals: 10_000,
                maximum_candidates,
                maximum_normal_form_entries: 10_000_000,
                maximum_normal_form_operations: 50_000_000,
                maximum_relation_exponent: 256,
                maximum_verification_multiply_adds: 100_000_000,
                maximum_principal_factor_terms: 10_000_000,
                maximum_compact_generators: 16_384,
                maximum_compact_surplus_rows: 32,
                maximum_compact_saturation_minor_trials: 32_768,
                maximum_compact_dependency_entries: 1_000_000,
                maximum_compact_target_coefficient_bits: 1_000_000,
                logarithm_precision_bits: 1_024,
                replay_precision_bits: 512,
                analytic_precision_bits: 256,
                maximum_relations: 10_000,
                maximum_dependencies: 1_000,
                maximum_kernel_coefficient_bits: 4_080,
                maximum_unit_exponent_bits: 8_192,
                maximum_reconstruction_denominator_bits: 4_096,
                maximum_analytic_threshold: 23_994,
            },
        }
    }

    #[test]
    fn public_coefficients_reach_a_conditionally_complete_result() {
        let receipt = qualify(request(10_000)).unwrap();
        assert!(receipt.preparation.certificate_verified);
        assert_eq!(receipt.preparation.discriminant, "-23");
        assert_eq!(receipt.preparation.equation_order_index, "1");
        assert!(receipt.relations.complete_rank_and_surplus);
        let candidate = receipt.candidate.unwrap();
        assert_eq!(candidate.class_number, "1");
        assert_eq!(
            candidate.authority,
            "authenticated-supplied-principal-relations-candidate-only"
        );
        assert!(candidate.authenticated_principal_relations > 0);
        assert_eq!(candidate.generator_order_witnesses, 0);
        assert!(receipt.public_complete);
        assert_eq!(receipt.outcome, "complete-conditional-grh");
        let completion = receipt.completion.unwrap();
        assert_eq!(completion.class_number, "1");
        assert_eq!(completion.unit_rank, 1);
        assert!(completion.sealed_evidence_verified);
        assert!(completion.arbitrary_ideal_class_map_retained);
        assert_eq!(receipt.first_unavailable_boundary, None);
    }

    #[test]
    fn request_shape_cannot_smuggle_preparation_or_answers() {
        let source = r#"{
            "schema":"sagejs.rust-class-group/public-cubic-e2e-request-v2",
            "polynomialAscending":["-1","-1","0","1"],
            "proofMode":"conditional-grh",
            "resources":{
                "maximumTrialDivisor":10000,
                "maximumIrreducibilityPrime":257,
                "embeddingPrecisionBits":192,
                "maximumVisitedIdeals":10000,
                "maximumCandidates":10000,
                "maximumNormalFormEntries":10000000,
                "maximumNormalFormOperations":50000000
            },
            "preparedField":{"discriminant":"-23"}
        }"#;
        assert!(serde_json::from_str::<Request>(source).is_err());
    }

    #[test]
    fn repeated_discriminant_is_accepted_only_after_complete_local_exhaustion() {
        let mut input = request(10_000);
        input.polynomial_ascending = ["1".into(), "-1".into(), "-2".into(), "1".into()];
        let receipt = qualify(input).unwrap();
        assert_eq!(receipt.preparation.discriminant, "49");
        assert_eq!(receipt.preparation.equation_order_index, "1");
        assert!(receipt.preparation.certificate_verified);
    }

    #[test]
    fn nontrivial_class_group_retains_generator_and_map_evidence() {
        let mut input = request(100_000);
        input.polynomial_ascending = ["-29".into(), "-30".into(), "-8".into(), "1".into()];
        let receipt = qualify(input).unwrap();
        assert!(receipt.public_complete);
        let candidate = receipt.candidate.unwrap();
        let completion = receipt.completion.unwrap();
        assert_eq!(candidate.class_number, "2");
        assert_eq!(candidate.invariant_factors, ["2"]);
        assert_eq!(candidate.generator_order_witnesses, 1);
        assert_eq!(completion.class_number, "2");
        assert_eq!(completion.invariant_factors, ["2"]);
        assert!(completion.arbitrary_ideal_class_map_retained);
    }

    #[test]
    fn open_cubic_panel_reaches_exact_nontrivial_group_structures() {
        let cases = [
            ([-26, -30, -8, 1], "3", &["3"][..]),
            ([-37, -30, -8, 1], "4", &["2", "2"][..]),
            ([-34, -30, -8, 1], "6", &["6"][..]),
        ];
        for (coefficients, expected_order, expected_invariants) in cases {
            let mut input = request(100_000);
            input.polynomial_ascending = coefficients.map(|value| value.to_string());
            let receipt = qualify(input).unwrap();
            assert!(receipt.public_complete);
            assert!(receipt.preparation.certificate_verified);
            let candidate = receipt.candidate.unwrap();
            let completion = receipt.completion.unwrap();
            assert_eq!(candidate.class_number, expected_order);
            assert_eq!(candidate.invariant_factors, expected_invariants);
            assert_eq!(completion.class_number, expected_order);
            assert_eq!(completion.invariant_factors, expected_invariants);
            assert!(completion.sealed_evidence_verified);
            assert!(completion.arbitrary_ideal_class_map_retained);
        }
    }

    #[test]
    fn row6_reaches_the_sealed_public_boundary_through_the_compact_route() {
        let mut input = request(1_000_000);
        input.polynomial_ascending = [
            "2000000000018".into(),
            "-2000000000010".into(),
            "0".into(),
            "1".into(),
        ];
        input.resources.logarithm_precision_bits = 4_096;
        input.resources.replay_precision_bits = 2_048;
        input.resources.analytic_precision_bits = 512;
        let receipt = qualify(input).unwrap();
        assert!(receipt.public_complete);
        assert_eq!(receipt.preparation.equation_order_index, "3");
        assert_eq!(receipt.relations.factor_base_size, 1_130);
        assert_eq!(receipt.relations.relation_count, 1_137);
        let candidate = receipt.candidate.unwrap();
        assert_eq!(candidate.invariant_factors, ["2", "2"]);
        assert_eq!(candidate.class_number, "4");
        assert_eq!(
            candidate.authority,
            "authenticated-collector-sealed-compact-elementary-two-presentation"
        );
        let completion = receipt.completion.unwrap();
        assert_eq!(completion.class_number, "4");
        assert_eq!(completion.unit_rank, 2);
        assert!(completion.sealed_evidence_verified);
    }
}
