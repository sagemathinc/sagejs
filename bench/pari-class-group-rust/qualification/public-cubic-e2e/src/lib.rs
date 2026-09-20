// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Fail-closed public-polynomial end-to-end qualification.
//!
//! The request deliberately has no representation for a prepared field, PARI
//! data, or expected field answers.  All mathematical state starts with the
//! four public polynomial coefficients.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    PreparedCollectorLimits, PublicCubicPreparationLimits, RelationPresentation,
    class_group_candidate_invariants, collect_prepared_cubic_relations,
    prepare_squarefree_discriminant_monic_cubic,
};
use serde::{Deserialize, Serialize};

pub const REQUEST_SCHEMA: &str = "sagejs.rust-class-group/public-cubic-e2e-request-v1";
pub const RECEIPT_SCHEMA: &str = "sagejs.rust-class-group/public-cubic-e2e-receipt-v1";

/// This is the missing public-library boundary, checked after every currently
/// public stage has run.  Keep this text specific enough to be executable gap
/// evidence rather than a generic qualification disclaimer.
pub const MISSING_COMPLETE_API: &str = "the Rust library exports preparation, relation collection, and candidate Smith invariants, but exports no function that consumes a ValidatedPreparedCubic with proof/resource options and returns a proof-authorized complete class-group result with completeness evidence, generator ideals, arbitrary-ideal maps, and principal witnesses";

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
    pub squarefree_prime_factors: Vec<String>,
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
    pub authority: &'static str,
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
    pub first_unavailable_boundary: &'static str,
    pub missing_public_library_api: &'static str,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum QualificationError {
    UnsupportedSchema,
    InvalidCoefficient { index: usize, value: String },
    Preparation(String),
    RelationCollection(String),
    CandidateReduction(String),
}

/// Exercise the strongest route currently expressible entirely through the
/// class-group crate's public API.  A successful call is intentionally still
/// an incomplete receipt: candidate Smith factors are not public class-group
/// answers under either proof mode.
pub fn qualify(request: Request) -> Result<Receipt, QualificationError> {
    if request.schema != REQUEST_SCHEMA {
        return Err(QualificationError::UnsupportedSchema);
    }
    let mut coefficients: [Integer; 4] = std::array::from_fn(|_| Integer::new());
    for (index, source) in request.polynomial_ascending.iter().enumerate() {
        coefficients[index] =
            source
                .parse::<Integer>()
                .map_err(|_| QualificationError::InvalidCoefficient {
                    index,
                    value: source.clone(),
                })?;
    }

    let prepared = prepare_squarefree_discriminant_monic_cubic(
        coefficients,
        PublicCubicPreparationLimits {
            maximum_trial_divisor: request.resources.maximum_trial_divisor,
            maximum_irreducibility_prime: request.resources.maximum_irreducibility_prime,
            embedding_precision_bits: request.resources.embedding_precision_bits,
        },
    )
    .map_err(|error| QualificationError::Preparation(error.to_string()))?;

    let certificate_verified = prepared.maximal_order_certificate().verify();
    if !certificate_verified {
        return Err(QualificationError::Preparation(
            "squarefree maximal-order certificate replay failed".to_owned(),
        ));
    }
    let preparation = PreparationEvidence {
        discriminant: prepared.field().data().discriminant.to_string(),
        signature: [
            prepared.field().data().signature.0,
            prepared.field().data().signature.1,
        ],
        equation_order_index: prepared.field().equation_order_index().to_string(),
        squarefree_prime_factors: prepared
            .maximal_order_certificate()
            .prime_factors()
            .iter()
            .map(Integer::to_string)
            .collect(),
        certificate_verified,
    };

    let collected = collect_prepared_cubic_relations(
        prepared.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: request.resources.maximum_visited_ideals,
            maximum_candidates: request.resources.maximum_candidates,
        },
    )
    .map_err(|error| QualificationError::RelationCollection(format!("{error:?}")))?;
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

    let candidate = if collected.complete_rank_and_surplus {
        let presentation = RelationPresentation {
            generator_count: factor_base_size,
            relation_vectors: collected.relations,
        };
        let invariants = class_group_candidate_invariants(&presentation)
            .map_err(|error| QualificationError::CandidateReduction(format!("{error:?}")))?;
        Some(CandidateEvidence {
            invariant_factors: invariants
                .invariant_factors
                .iter()
                .map(Integer::to_string)
                .collect(),
            class_number: invariants.class_number.to_string(),
            authority: "presentation-candidate-only",
        })
    } else {
        None
    };

    Ok(Receipt {
        schema: RECEIPT_SCHEMA,
        outcome: "incomplete",
        public_complete: false,
        requested_proof: request.proof_mode,
        uses_pari_input: false,
        uses_prepared_fixture: false,
        uses_field_answers_as_input: false,
        preparation,
        relations,
        candidate,
        first_unavailable_boundary: "candidate-presentation-to-proof-authorized-complete-class-group",
        missing_public_library_api: MISSING_COMPLETE_API,
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
            },
        }
    }

    #[test]
    fn public_coefficients_reach_a_real_candidate_then_fail_closed() {
        let receipt = qualify(request(10_000)).unwrap();
        assert!(receipt.preparation.certificate_verified);
        assert_eq!(receipt.preparation.discriminant, "-23");
        assert_eq!(receipt.preparation.equation_order_index, "1");
        assert!(receipt.relations.complete_rank_and_surplus);
        let candidate = receipt.candidate.unwrap();
        assert_eq!(candidate.class_number, "1");
        assert_eq!(candidate.authority, "presentation-candidate-only");
        assert!(!receipt.public_complete);
        assert_eq!(
            receipt.first_unavailable_boundary,
            "candidate-presentation-to-proof-authorized-complete-class-group"
        );
    }

    #[test]
    fn request_shape_cannot_smuggle_preparation_or_answers() {
        let source = r#"{
            "schema":"sagejs.rust-class-group/public-cubic-e2e-request-v1",
            "polynomialAscending":["-1","-1","0","1"],
            "proofMode":"conditional-grh",
            "resources":{
                "maximumTrialDivisor":10000,
                "maximumIrreducibilityPrime":257,
                "embeddingPrecisionBits":192,
                "maximumVisitedIdeals":10000,
                "maximumCandidates":10000
            },
            "preparedField":{"discriminant":"-23"}
        }"#;
        assert!(serde_json::from_str::<Request>(source).is_err());
    }

    #[test]
    fn inadmissible_nonmaximal_power_basis_fails_before_collection() {
        let mut input = request(10_000);
        input.polynomial_ascending = ["1".into(), "-1".into(), "-2".into(), "1".into()];
        let error = qualify(input).unwrap_err();
        assert!(
            matches!(error, QualificationError::Preparation(message) if message.contains("NonSquarefreeDiscriminant"))
        );
    }
}
