// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Fail-closed public-polynomial end-to-end qualification.
//!
//! The request deliberately has no representation for a prepared field, PARI
//! data, or expected field answers.  All mathematical state starts with the
//! four public polynomial coefficients.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    CompactPresentationContinuationCache, CompactPresentationLimits, CubicAnalyticEvidence,
    CubicCompletionProofMode, CubicConditionalCompletionError, CubicConditionalCompletionOptions,
    CubicPresentationCandidateLimits, NormalFormLimits, PreparedContinuationLimits,
    PreparedCubicRelationCollector, PublicCubicPreparationLimits,
    authenticate_compact_cubic_presentation_candidate_with_cache,
    authenticate_cubic_presentation_candidate,
    complete_cubic_class_group_conditionally_with_context,
    prepare_cubic_conditional_completion_context, prepare_monic_cubic,
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

#[derive(Clone, Copy, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CompletionPrecisionLevelEvidence {
    pub logarithm_precision_bits: u32,
    pub replay_precision_bits: u32,
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
    pub requested_logarithm_precision_bits: u32,
    pub requested_replay_precision_bits: u32,
    pub attempted_precision_levels: Vec<CompletionPrecisionLevelEvidence>,
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

/// Redacted evidence that a single deterministic collector was advanced.
///
/// Failed mathematical candidates are intentionally absent. The outcome only
/// records whether the sealed completion boundary requested more relations.
#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContinuationAttemptEvidence {
    pub supplementary_target: usize,
    pub relation_count: usize,
    pub candidate_authentication_route: &'static str,
    pub visited_ideals: usize,
    pub cursor_trials: usize,
    pub primitive_nonscalar_candidates: usize,
    pub smooth_candidates: usize,
    pub relation_collection_nanoseconds: u128,
    pub candidate_authentication_nanoseconds: u128,
    pub unit_and_analytic_completion_nanoseconds: u128,
    pub outcome_category: &'static str,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub continuation_attempts: Option<Vec<ContinuationAttemptEvidence>>,
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum CandidateAuthenticationRoute {
    DenseSmith,
    CompactSmallSurplus,
}

// Dense Smith remains the simplest route for genuinely small presentations,
// but its transform work loses decisively to the compact small-nullity route
// well before the hard normal-form resource ceiling. This is a route-choice
// threshold, not an execution limit: dense authentication may still consume
// the caller's full bounded budget when compact authentication is structurally
// unavailable (notably during large-surplus analytic continuation).
const DENSE_SMITH_PREFERRED_MULTIPLY_ADDS: u64 = 1_000_000;

fn dense_verification_multiply_adds(generators: usize, relations: usize) -> Option<u64> {
    let g = u64::try_from(generators).ok()?;
    let r = u64::try_from(relations).ok()?;
    let cube = |value: u64| {
        value
            .checked_mul(value)
            .and_then(|square| square.checked_mul(value))
    };
    let g3 = cube(g)?;
    let r3 = cube(r)?;
    let g2r = g.checked_mul(g)?.checked_mul(r)?;
    let gr2 = g.checked_mul(r)?.checked_mul(r)?;
    // This is the same conservative work bound enforced by the dense
    // authenticator: one complete Smith verification, generator-order replay,
    // and relation-image replay. The class-map constructor consumes the
    // reducer's verified result instead of repeating the cubic matrix proof.
    g2r.checked_add(gr2)
        .and_then(|value| value.checked_add(g3.checked_mul(2)?))
        .and_then(|value| value.checked_add(r3.checked_mul(2)?))
        .and_then(|value| value.checked_add(g2r.checked_mul(2)?))
}

fn select_candidate_authentication_route(
    generators: usize,
    relations: usize,
    resources: &Resources,
) -> CandidateAuthenticationRoute {
    let dense_entries_fit = resources.maximum_normal_form_operations > 0
        && generators
            .checked_mul(relations)
            .is_some_and(|entries| entries <= resources.maximum_normal_form_entries);
    let dense_work = dense_verification_multiply_adds(generators, relations);
    let dense_verification_fits =
        dense_work.is_some_and(|work| work <= resources.maximum_verification_multiply_adds);
    let dense_preference_limit = resources
        .maximum_normal_form_operations
        .min(DENSE_SMITH_PREFERRED_MULTIPLY_ADDS);
    let dense_is_preferred =
        dense_entries_fit && dense_work.is_some_and(|work| work <= dense_preference_limit);

    let compact_limits_are_nonzero = resources.maximum_compact_generators > 0
        && resources.maximum_compact_surplus_rows > 0
        && resources.maximum_compact_saturation_minor_trials > 0
        && resources.maximum_compact_dependency_entries > 0
        && resources.maximum_compact_target_coefficient_bits > 0;
    let compact_shape_fits = compact_limits_are_nonzero
        && relations
            .checked_sub(generators)
            .filter(|surplus| *surplus > 0 && *surplus <= resources.maximum_compact_surplus_rows)
            .and_then(|surplus| surplus.checked_mul(relations))
            .is_some_and(|dependency_entries| {
                generators <= resources.maximum_compact_generators
                    && dependency_entries <= resources.maximum_compact_dependency_entries
            });
    if compact_shape_fits && !dense_is_preferred {
        CandidateAuthenticationRoute::CompactSmallSurplus
    } else if dense_entries_fit && dense_verification_fits {
        CandidateAuthenticationRoute::DenseSmith
    } else if compact_shape_fits {
        CandidateAuthenticationRoute::CompactSmallSurplus
    } else {
        // Both authenticators fail closed before expensive work. Retain the
        // general dense route when the compact small-surplus shape contract is
        // unavailable, so shape alone never changes group semantics.
        CandidateAuthenticationRoute::DenseSmith
    }
}

fn next_supplementary_target(current: usize) -> Option<usize> {
    // Every failed analytic-isolation attempt already performs complete exact
    // candidate authentication and unit reconstruction. Retained collection
    // state makes modest over-collection much cheaper than repeating those
    // stages one or two relations later, so grow geometrically from the
    // mandatory seven-row surplus. This schedule is field- and answer-free.
    current.checked_mul(2)
}

fn initial_supplementary_target(maximum_dependencies: usize) -> usize {
    // A seven-row candidate is the smallest admitted presentation, but the
    // authentication and analytic-completion passes are much more expensive
    // than collecting the next seven rows. Start at fourteen whenever the
    // caller's explicit budget permits it. Retain seven for smaller budgets so
    // this performance policy does not silently narrow the public resource
    // contract.
    if maximum_dependencies >= 14 { 14 } else { 7 }
}

fn candidate_authentication_route_fits(
    generators: usize,
    relations: usize,
    resources: &Resources,
) -> bool {
    let dense_fits = generators
        .checked_mul(relations)
        .filter(|_| resources.maximum_normal_form_operations > 0)
        .is_some_and(|entries| entries <= resources.maximum_normal_form_entries)
        && dense_verification_multiply_adds(generators, relations)
            .is_some_and(|work| work <= resources.maximum_verification_multiply_adds);
    let compact_limits_are_nonzero = resources.maximum_compact_generators > 0
        && resources.maximum_compact_surplus_rows > 0
        && resources.maximum_compact_saturation_minor_trials > 0
        && resources.maximum_compact_dependency_entries > 0
        && resources.maximum_compact_target_coefficient_bits > 0;
    let compact_fits = compact_limits_are_nonzero
        && relations
            .checked_sub(generators)
            .filter(|surplus| *surplus > 0 && *surplus <= resources.maximum_compact_surplus_rows)
            .and_then(|surplus| surplus.checked_mul(relations))
            .is_some_and(|dependency_entries| {
                generators <= resources.maximum_compact_generators
                    && dependency_entries <= resources.maximum_compact_dependency_entries
            });
    dense_fits || compact_fits
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
    let mut collector = PreparedCubicRelationCollector::new(
        prepared.field(),
        PreparedContinuationLimits {
            maximum_visited_ideals: request.resources.maximum_visited_ideals,
            maximum_candidates: request.resources.maximum_candidates,
            maximum_relations: request.resources.maximum_relations,
            maximum_dependencies: request.resources.maximum_dependencies,
        },
    )
    .map_err(|error| QualificationError::RelationCollection(format!("{error:?}")))?;
    let collector_initialization_ns = collection_start.elapsed().as_nanos();
    let mut relation_collection_ns = collector_initialization_ns;
    let candidate_limits = CubicPresentationCandidateLimits {
        normal_form: NormalFormLimits {
            max_entries: request.resources.maximum_normal_form_entries,
            max_operations: request.resources.maximum_normal_form_operations,
        },
        maximum_relation_exponent: request.resources.maximum_relation_exponent,
        maximum_verification_multiply_adds: request.resources.maximum_verification_multiply_adds,
        maximum_principal_factor_terms: request.resources.maximum_principal_factor_terms,
    };
    let completion_options = || CubicConditionalCompletionOptions {
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

    let mut attempts = Vec::new();
    let mut final_relations = None;
    let mut final_candidate = None;
    let mut final_completion = None;
    let mut candidate_authentication_ns = 0_u128;
    let mut completion_ns = 0_u128;
    let mut completion_context = None;
    let mut compact_continuation_cache: Option<CompactPresentationContinuationCache> = None;
    let mut supplementary_target =
        initial_supplementary_target(request.resources.maximum_dependencies);
    loop {
        if supplementary_target > request.resources.maximum_dependencies {
            break;
        }
        let started = Instant::now();
        let collected = collector
            .advance_to_supplementary(supplementary_target)
            .map_err(|error| QualificationError::RelationCollection(format!("{error:?}")))?;
        let advance_ns = started.elapsed().as_nanos();
        relation_collection_ns += advance_ns;
        let attempt_relation_collection_ns = advance_ns
            + if attempts.is_empty() {
                collector_initialization_ns
            } else {
                0
            };
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
        let counters = collected.counters.clone();
        if !relations.complete_rank_and_surplus {
            return Err(QualificationError::RelationCollection(
                "cumulative relation-collection resource ceiling exhausted".to_owned(),
            ));
        }

        let route = select_candidate_authentication_route(
            factor_base_size,
            relation_count,
            &request.resources,
        );
        let attempt_prepared = prepared.clone();
        let started = Instant::now();
        let (authenticated, authority) =
            if route == CandidateAuthenticationRoute::CompactSmallSurplus {
                let (authenticated, cache) =
                    authenticate_compact_cubic_presentation_candidate_with_cache(
                        &attempt_prepared,
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
                            maximum_invariant_factors: request.resources.maximum_compact_generators,
                            maximum_map_entries: request.resources.maximum_normal_form_entries,
                            maximum_map_coefficient_bits: request
                                .resources
                                .maximum_compact_target_coefficient_bits,
                            maximum_general_smith_bytes: request
                                .resources
                                .maximum_normal_form_entries
                                .checked_mul(std::mem::size_of::<i64>())
                                .unwrap_or(usize::MAX),
                            maximum_general_smith_transform_work: request
                                .resources
                                .maximum_verification_multiply_adds,
                            maximum_verification_multiply_adds: request
                                .resources
                                .maximum_verification_multiply_adds,
                            maximum_target_coefficient_bits: request
                                .resources
                                .maximum_compact_target_coefficient_bits,
                        },
                        compact_continuation_cache.take(),
                    )
                    .map_err(|error| {
                        QualificationError::CandidateAuthentication(format!("{error:?}"))
                    })?;
                compact_continuation_cache = Some(cache);
                (
                    authenticated,
                    "authenticated-collector-sealed-compact-mixed-invariant-presentation",
                )
            } else {
                compact_continuation_cache = None;
                (
                    authenticate_cubic_presentation_candidate(
                        &attempt_prepared,
                        collected,
                        candidate_limits,
                    )
                    .map_err(|error| {
                        QualificationError::CandidateAuthentication(format!("{error:?}"))
                    })?,
                    "authenticated-supplied-principal-relations-candidate-only",
                )
            };
        let attempt_candidate_authentication_ns = started.elapsed().as_nanos();
        candidate_authentication_ns += attempt_candidate_authentication_ns;
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

        let started = Instant::now();
        let options = completion_options();
        let completion_result = if let Some(context) = completion_context.as_mut() {
            complete_cubic_class_group_conditionally_with_context(
                attempt_prepared,
                authenticated,
                options,
                context,
            )
        } else {
            match prepare_cubic_conditional_completion_context(
                &attempt_prepared,
                &authenticated,
                options,
            ) {
                Ok(context) => {
                    completion_context = Some(context);
                    complete_cubic_class_group_conditionally_with_context(
                        attempt_prepared,
                        authenticated,
                        options,
                        completion_context
                            .as_mut()
                            .expect("context was just stored"),
                    )
                }
                Err(error) => Err(error),
            }
        };
        let attempt_completion_ns = started.elapsed().as_nanos();
        completion_ns += attempt_completion_ns;
        let authentication_route = match route {
            CandidateAuthenticationRoute::DenseSmith => "dense-smith",
            CandidateAuthenticationRoute::CompactSmallSurplus => "compact-small-surplus",
        };
        match completion_result {
            Ok(completed) => {
                let sealed_evidence_verified = completed.verify_sealed_evidence();
                if !sealed_evidence_verified {
                    return Err(QualificationError::Completion(
                        "sealed evidence invariant failed after construction".to_owned(),
                    ));
                }
                attempts.push(ContinuationAttemptEvidence {
                    supplementary_target,
                    relation_count,
                    candidate_authentication_route: authentication_route,
                    visited_ideals: counters.visited_ideals,
                    cursor_trials: counters.cursor_trials,
                    primitive_nonscalar_candidates: counters.primitive_nonscalar_candidates,
                    smooth_candidates: counters.smooth_candidates,
                    relation_collection_nanoseconds: attempt_relation_collection_ns,
                    candidate_authentication_nanoseconds: attempt_candidate_authentication_ns,
                    unit_and_analytic_completion_nanoseconds: attempt_completion_ns,
                    outcome_category: "sealed",
                });
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
                    requested_logarithm_precision_bits: completed
                        .precision()
                        .requested_logarithm_precision_bits(),
                    requested_replay_precision_bits: completed
                        .precision()
                        .requested_replay_precision_bits(),
                    attempted_precision_levels: completed
                        .precision()
                        .attempted_levels()
                        .iter()
                        .map(|level| CompletionPrecisionLevelEvidence {
                            logarithm_precision_bits: level.logarithm_precision_bits,
                            replay_precision_bits: level.replay_precision_bits,
                        })
                        .collect(),
                    sealed_evidence_verified,
                    arbitrary_ideal_class_map_retained: true,
                };
                final_relations = Some(relations);
                final_candidate = Some(candidate_evidence);
                final_completion = Some(completion);
                break;
            }
            Err(CubicConditionalCompletionError::AnalyticIndexNotIsolated { .. }) => {
                attempts.push(ContinuationAttemptEvidence {
                    supplementary_target,
                    relation_count,
                    candidate_authentication_route: authentication_route,
                    visited_ideals: counters.visited_ideals,
                    cursor_trials: counters.cursor_trials,
                    primitive_nonscalar_candidates: counters.primitive_nonscalar_candidates,
                    smooth_candidates: counters.smooth_candidates,
                    relation_collection_nanoseconds: attempt_relation_collection_ns,
                    candidate_authentication_nanoseconds: attempt_candidate_authentication_ns,
                    unit_and_analytic_completion_nanoseconds: attempt_completion_ns,
                    outcome_category: "analytic-index-not-isolated",
                });
            }
            Err(error) => {
                return Err(QualificationError::Completion(format!("{error:?}")));
            }
        }
        let Some(next_target) = next_supplementary_target(supplementary_target) else {
            break;
        };
        let Some(next_relation_count) = factor_base_size.checked_add(next_target) else {
            break;
        };
        if next_target > request.resources.maximum_dependencies
            || next_relation_count > request.resources.maximum_relations
            || !candidate_authentication_route_fits(
                factor_base_size,
                next_relation_count,
                &request.resources,
            )
        {
            break;
        }
        supplementary_target = next_target;
    }

    let relations = final_relations.ok_or_else(|| {
        QualificationError::Completion(
            "analytic index remained nontrivial within the authenticated continuation resources"
                .to_owned(),
        )
    })?;
    let candidate_evidence = final_candidate;
    let completion = final_completion;
    let total_to_sealed_result = total_start.elapsed().as_nanos();
    let public_complete = true;

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
        continuation_attempts: (attempts.len() > 1).then_some(attempts),
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
                maximum_compact_surplus_rows: 64,
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
    fn route_selector_keeps_only_low_work_presentations_dense() {
        let input = request(10_000);
        assert_eq!(
            select_candidate_authentication_route(16, 23, &input.resources),
            CandidateAuthenticationRoute::DenseSmith,
        );
        assert!(
            dense_verification_multiply_adds(64, 71)
                .is_some_and(|work| work > DENSE_SMITH_PREFERRED_MULTIPLY_ADDS)
        );
        assert_eq!(
            select_candidate_authentication_route(64, 71, &input.resources),
            CandidateAuthenticationRoute::CompactSmallSurplus,
        );
    }

    #[test]
    fn route_selector_uses_compact_for_the_opened_failure_shape() {
        let input = request(10_000);
        assert_eq!(dense_verification_multiply_adds(217, 224), Some(85_447_474),);
        assert_eq!(
            select_candidate_authentication_route(217, 224, &input.resources),
            CandidateAuthenticationRoute::CompactSmallSurplus,
        );
        assert_eq!(
            dense_verification_multiply_adds(230, 237),
            Some(101_488_876),
        );
        assert_eq!(
            select_candidate_authentication_route(230, 237, &input.resources),
            CandidateAuthenticationRoute::CompactSmallSurplus,
        );
    }

    #[test]
    fn route_selector_does_not_use_compact_for_an_inadmissible_surplus_shape() {
        let mut input = request(10_000);
        input.resources.maximum_compact_surplus_rows = 32;
        assert_eq!(
            select_candidate_authentication_route(192, 225, &input.resources),
            CandidateAuthenticationRoute::DenseSmith,
        );
    }

    #[test]
    fn route_selector_admits_the_measured_54_surplus_shape() {
        let input = request(10_000);
        assert_eq!(input.resources.maximum_compact_surplus_rows, 64);
        assert_eq!(
            select_candidate_authentication_route(26, 80, &input.resources),
            CandidateAuthenticationRoute::CompactSmallSurplus,
        );
    }

    #[test]
    fn continuation_schedule_grows_geometrically_without_field_feedback() {
        assert_eq!(initial_supplementary_target(13), 7);
        assert_eq!(initial_supplementary_target(14), 14);
        let mut targets = vec![initial_supplementary_target(1_000)];
        while targets.len() < 7 {
            targets.push(next_supplementary_target(*targets.last().unwrap()).unwrap());
        }
        assert_eq!(targets, vec![14, 28, 56, 112, 224, 448, 896]);
    }

    #[test]
    fn continuation_preflight_requires_a_complete_compact_resource_contract() {
        let mut input = request(10_000);
        input.resources.maximum_verification_multiply_adds = 1;
        assert!(candidate_authentication_route_fits(
            230,
            237,
            &input.resources
        ));
        input.resources.maximum_compact_saturation_minor_trials = 0;
        assert!(!candidate_authentication_route_fits(
            230,
            237,
            &input.resources
        ));
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
        assert_eq!(completion.requested_logarithm_precision_bits, 1_024);
        assert_eq!(completion.requested_replay_precision_bits, 512);
        assert_eq!(
            completion.attempted_precision_levels,
            [CompletionPrecisionLevelEvidence {
                logarithm_precision_bits: 1_024,
                replay_precision_bits: 512,
            }]
        );
        assert!(completion.sealed_evidence_verified);
        assert!(completion.arbitrary_ideal_class_map_retained);
        assert_eq!(receipt.first_unavailable_boundary, None);
        assert_eq!(receipt.continuation_attempts, None);
    }

    #[test]
    fn opened_analytic_index_case_seals_through_bounded_public_continuation() {
        let mut input = request(1_000_000);
        input.polynomial_ascending = ["-295".into(), "304".into(), "-13".into(), "1".into()];
        input.resources.logarithm_precision_bits = 4_096;
        input.resources.replay_precision_bits = 2_048;
        input.resources.analytic_precision_bits = 512;
        let receipt = qualify(input).unwrap();
        assert!(receipt.public_complete);
        assert_eq!(receipt.relations.relation_count, 55);
        let attempts = receipt.continuation_attempts.unwrap();
        assert_eq!(
            attempts
                .iter()
                .map(|attempt| attempt.supplementary_target)
                .collect::<Vec<_>>(),
            [14, 28]
        );
        assert!(
            attempts[..attempts.len() - 1]
                .iter()
                .all(|attempt| attempt.outcome_category == "analytic-index-not-isolated")
        );
        assert_eq!(attempts.last().unwrap().outcome_category, "sealed");
        assert_eq!(
            attempts
                .iter()
                .map(|attempt| attempt.relation_collection_nanoseconds)
                .sum::<u128>(),
            receipt.stage_timings_nanoseconds.relation_collection,
        );
        assert_eq!(
            attempts
                .iter()
                .map(|attempt| attempt.candidate_authentication_nanoseconds)
                .sum::<u128>(),
            receipt.stage_timings_nanoseconds.candidate_authentication,
        );
        assert_eq!(
            attempts
                .iter()
                .map(|attempt| attempt.unit_and_analytic_completion_nanoseconds)
                .sum::<u128>(),
            receipt
                .stage_timings_nanoseconds
                .unit_and_analytic_completion,
        );
        assert!(attempts.iter().all(|attempt| matches!(
            attempt.candidate_authentication_route,
            "dense-smith" | "compact-small-surplus"
        )));
        for pair in attempts.windows(2) {
            assert!(pair[1].relation_count > pair[0].relation_count);
            assert!(pair[1].visited_ideals >= pair[0].visited_ideals);
            assert!(pair[1].cursor_trials >= pair[0].cursor_trials);
            assert!(
                pair[1].primitive_nonscalar_candidates >= pair[0].primitive_nonscalar_candidates
            );
            assert!(pair[1].smooth_candidates >= pair[0].smooth_candidates);
        }
    }

    #[test]
    fn continuation_schedule_exhaustion_fails_closed() {
        let mut input = request(1_000_000);
        input.polynomial_ascending = ["-295".into(), "304".into(), "-13".into(), "1".into()];
        input.resources.logarithm_precision_bits = 4_096;
        input.resources.replay_precision_bits = 2_048;
        input.resources.analytic_precision_bits = 512;
        input.resources.maximum_dependencies = 12;
        assert!(matches!(
            qualify(input),
            Err(QualificationError::Completion(message))
                if message.contains("authenticated continuation resources")
        ));
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
            assert_eq!(receipt.continuation_attempts, None);
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
        input.resources.logarithm_precision_bits = 8_192;
        input.resources.replay_precision_bits = 4_096;
        input.resources.analytic_precision_bits = 512;
        let receipt = qualify(input).unwrap();
        assert!(receipt.public_complete);
        assert_eq!(receipt.continuation_attempts, None);
        assert_eq!(receipt.preparation.equation_order_index, "3");
        assert_eq!(receipt.relations.factor_base_size, 1_130);
        assert_eq!(receipt.relations.relation_count, 1_144);
        let candidate = receipt.candidate.unwrap();
        assert_eq!(candidate.invariant_factors, ["2", "2"]);
        assert_eq!(candidate.class_number, "4");
        assert_eq!(
            candidate.authority,
            "authenticated-collector-sealed-compact-mixed-invariant-presentation"
        );
        let completion = receipt.completion.unwrap();
        assert_eq!(completion.class_number, "4");
        assert_eq!(completion.attempted_precision_levels.len(), 2);
        assert_eq!(
            completion.attempted_precision_levels[1],
            CompletionPrecisionLevelEvidence {
                logarithm_precision_bits: 8_192,
                replay_precision_bits: 4_096,
            }
        );
        assert_eq!(completion.unit_rank, 2);
        assert!(completion.sealed_evidence_verified);
    }
}
