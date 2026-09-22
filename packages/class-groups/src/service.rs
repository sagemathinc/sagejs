// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Fail-closed public-polynomial end-to-end qualification.
//!
//! The request deliberately has no representation for a prepared field, PARI
//! data, or expected field answers.  All mathematical state starts with the
//! four public polynomial coefficients.

use crate::{
    ArbitraryIdealReductionLimits, CompactPresentationContinuationCache, CompactPresentationLimits,
    CubicAnalyticEvidence, CubicCompletionProofMode, CubicConditionalCompletionError,
    CubicConditionalCompletionOptions, CubicPresentationCandidateLimits,
    GrhConditionalCompleteCubicClassGroup, MaximalOrderEvidenceStatus, NormalFormLimits,
    PreparedContinuationLimits, PreparedCubicRelationCollector, PreparedIdealWorkspace,
    PresentationZeroState, PrincipalElementWitnessState, PublicCubicPreparationLimits,
    VerifiedCompactPresentation, authenticate_compact_cubic_presentation_candidate_with_cache,
    authenticate_compact_presentation, authenticate_cubic_presentation_candidate,
    complete_cubic_class_group_conditionally_with_context,
    prepare_cubic_conditional_completion_context, prepare_monic_cubic,
};
use rug::Integer;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::OnceLock;
use std::time::Instant;

pub const REQUEST_SCHEMA: &str = "sagejs.rust-class-group/public-cubic-e2e-request-v2";
pub const RECEIPT_SCHEMA: &str = "sagejs.rust-class-group/public-cubic-e2e-receipt-v2";
pub const IDEAL_QUERY_REQUEST_SCHEMA: &str =
    "sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-request-v1";
pub const IDEAL_QUERY_RECEIPT_SCHEMA: &str =
    "sagejs.rust-class-group/public-cubic-arbitrary-ideal-query-receipt-v1";

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
    pub maximum_visited_ideals: u64,
    pub maximum_candidates: u64,
    pub maximum_normal_form_entries: u64,
    pub maximum_normal_form_operations: u64,
    pub maximum_relation_exponent: u32,
    pub maximum_verification_multiply_adds: u64,
    pub maximum_principal_factor_terms: u64,
    pub maximum_compact_generators: u64,
    pub maximum_compact_surplus_rows: u64,
    pub maximum_compact_saturation_minor_trials: u64,
    pub maximum_compact_dependency_entries: u64,
    pub maximum_compact_target_coefficient_bits: u64,
    pub logarithm_precision_bits: u32,
    pub replay_precision_bits: u32,
    pub analytic_precision_bits: u32,
    pub maximum_relations: u64,
    pub maximum_dependencies: u64,
    pub maximum_kernel_coefficient_bits: u64,
    pub maximum_unit_exponent_bits: u64,
    pub maximum_reconstruction_denominator_bits: u64,
    pub maximum_analytic_threshold: u64,
}

#[derive(Clone, Copy, Debug)]
struct NativeResources {
    maximum_trial_divisor: u64,
    maximum_irreducibility_prime: u32,
    embedding_precision_bits: u32,
    maximum_visited_ideals: usize,
    maximum_candidates: usize,
    maximum_normal_form_entries: usize,
    maximum_normal_form_operations: u64,
    maximum_relation_exponent: u32,
    maximum_verification_multiply_adds: u64,
    maximum_principal_factor_terms: usize,
    maximum_compact_generators: usize,
    maximum_compact_surplus_rows: usize,
    maximum_compact_saturation_minor_trials: usize,
    maximum_compact_dependency_entries: usize,
    maximum_compact_target_coefficient_bits: usize,
    logarithm_precision_bits: u32,
    replay_precision_bits: u32,
    analytic_precision_bits: u32,
    maximum_relations: usize,
    maximum_dependencies: usize,
    maximum_kernel_coefficient_bits: usize,
    maximum_unit_exponent_bits: usize,
    maximum_reconstruction_denominator_bits: usize,
    maximum_analytic_threshold: u64,
}

impl Resources {
    fn native(&self) -> Result<NativeResources, QualificationError> {
        let size = |name: &str, value: u64| {
            usize::try_from(value).map_err(|_| {
                QualificationError::Preparation(format!(
                    "resource {name} does not fit the target address width"
                ))
            })
        };
        Ok(NativeResources {
            maximum_trial_divisor: self.maximum_trial_divisor,
            maximum_irreducibility_prime: self.maximum_irreducibility_prime,
            embedding_precision_bits: self.embedding_precision_bits,
            maximum_visited_ideals: size("maximumVisitedIdeals", self.maximum_visited_ideals)?,
            maximum_candidates: size("maximumCandidates", self.maximum_candidates)?,
            maximum_normal_form_entries: size(
                "maximumNormalFormEntries",
                self.maximum_normal_form_entries,
            )?,
            maximum_normal_form_operations: self.maximum_normal_form_operations,
            maximum_relation_exponent: self.maximum_relation_exponent,
            maximum_verification_multiply_adds: self.maximum_verification_multiply_adds,
            maximum_principal_factor_terms: size(
                "maximumPrincipalFactorTerms",
                self.maximum_principal_factor_terms,
            )?,
            maximum_compact_generators: size(
                "maximumCompactGenerators",
                self.maximum_compact_generators,
            )?,
            maximum_compact_surplus_rows: size(
                "maximumCompactSurplusRows",
                self.maximum_compact_surplus_rows,
            )?,
            maximum_compact_saturation_minor_trials: size(
                "maximumCompactSaturationMinorTrials",
                self.maximum_compact_saturation_minor_trials,
            )?,
            maximum_compact_dependency_entries: size(
                "maximumCompactDependencyEntries",
                self.maximum_compact_dependency_entries,
            )?,
            maximum_compact_target_coefficient_bits: size(
                "maximumCompactTargetCoefficientBits",
                self.maximum_compact_target_coefficient_bits,
            )?,
            logarithm_precision_bits: self.logarithm_precision_bits,
            replay_precision_bits: self.replay_precision_bits,
            analytic_precision_bits: self.analytic_precision_bits,
            maximum_relations: size("maximumRelations", self.maximum_relations)?,
            maximum_dependencies: size("maximumDependencies", self.maximum_dependencies)?,
            maximum_kernel_coefficient_bits: size(
                "maximumKernelCoefficientBits",
                self.maximum_kernel_coefficient_bits,
            )?,
            maximum_unit_exponent_bits: size(
                "maximumUnitExponentBits",
                self.maximum_unit_exponent_bits,
            )?,
            maximum_reconstruction_denominator_bits: size(
                "maximumReconstructionDenominatorBits",
                self.maximum_reconstruction_denominator_bits,
            )?,
            maximum_analytic_threshold: self.maximum_analytic_threshold,
        })
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub schema: String,
    pub polynomial_ascending: [String; 4],
    pub proof_mode: ProofMode,
    pub resources: Resources,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdealQueryResources {
    pub embedding_precision_bits: u32,
    pub maximum_candidates: u64,
    pub maximum_valuation: u32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdealQueryRequest {
    pub schema: String,
    pub completion_request: Request,
    /// Three full-rank lattice rows in the authenticated integral basis.
    pub ideal_integral_basis_rows: [[String; 3]; 3],
    pub resources: IdealQueryResources,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SparseQuotientExponent {
    pub factor_base_index_zero_based: usize,
    pub exponent: String,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SparseSignedExponent {
    pub index_zero_based: usize,
    pub exponent: String,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CompactPrincipalRelationFactor {
    pub relation_index_zero_based: usize,
    pub exponent: String,
    pub principal_element_integral_basis_coordinates: [String; 3],
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IdealQueryCertificateReceipt {
    pub maximal_order_evidence: &'static str,
    pub factor_base_size: usize,
    pub principal_element_integral_basis_coordinates: [String; 3],
    pub quotient_factor_base_exponents: Vec<SparseQuotientExponent>,
    pub class_coordinates: Vec<String>,
    /// The canonical representative is the product of the published class
    /// generator lifts to these powers. Its class coordinates are exactly
    /// `class_coordinates`.
    pub canonical_representative_factor_base_exponents: Vec<SparseSignedExponent>,
    /// Compact exact generator for `input / canonical_representative`.
    /// If relation `j` has authenticated principal generator `beta_j`, then
    /// this represents `reduction_element * product beta_j^exponent[j]`.
    pub principal_witness_relation_factors: Vec<CompactPrincipalRelationFactor>,
    pub presentation_zero: bool,
    pub cursor_trials: usize,
    pub primitive_candidates: usize,
    pub smooth_quotient_norms: usize,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IdealQueryReceipt {
    pub schema: &'static str,
    pub outcome: &'static str,
    pub polynomial_ascending: [String; 4],
    pub completion: Receipt,
    pub queried_ideal_integral_basis_rows: [[String; 3]; 3],
    pub certificate: IdealQueryCertificateReceipt,
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
    IdealQuery(String),
}

pub struct QualifiedCubic {
    pub receipt: Receipt,
    completed: GrhConditionalCompleteCubicClassGroup,
    compact_replay_limits: CompactPresentationLimits,
    compact_replay: OnceLock<VerifiedCompactPresentation>,
}

fn integer_strings(values: impl IntoIterator<Item = impl ToString>) -> Vec<String> {
    values.into_iter().map(|value| value.to_string()).collect()
}

fn sparse_integer_vector(values: &[Integer]) -> Vec<Value> {
    values
        .iter()
        .enumerate()
        .filter(|(_, value)| *value != &0)
        .map(|(index, value)| json!({ "indexZeroBased": index, "value": value.to_string() }))
        .collect()
}

fn dyadic_interval(value: &crate::FlintDyadicInterval) -> Value {
    json!({
        "lower": value.lower.to_string(),
        "upper": value.upper.to_string(),
        "binaryExponent": value.binary_exponent,
    })
}

fn hexadecimal(bytes: &[u8]) -> String {
    bytes.iter().map(|value| format!("{value:02x}")).collect()
}

impl QualifiedCubic {
    /// Return a detached, bounded, lossless publication candidate.
    ///
    /// This bundle is deliberately more detailed than the public summary and
    /// less privileged than the live sealed value. It carries the exact sparse
    /// relations, ideal lattices, class map, unit combinations, and analytic
    /// plans needed by an independent Sage.js adapter. Publication as an
    /// `IdealClassGroup` remains forbidden until that adapter replays it.
    pub fn publication_bundle(&self) -> Result<Value, QualificationError> {
        let completed = &self.completed;
        let prepared = completed.prepared();
        let field = prepared.field();
        let field_data = field.data();
        let certificate = prepared.maximal_order_certificate();
        let presentation = completed.presentation();
        let collected = presentation.collected();
        let factor_base = collected.factor_base();
        let class_map = presentation.class_map();
        let coordinate_rows = class_map
            .presentation()
            .generator_coordinate_maps()
            .map_err(|error| QualificationError::IdealQuery(format!("{error:?}")))?;
        let factor_base_entries = factor_base
            .catalog
            .ideals
            .iter()
            .zip(&factor_base.exact_ideals)
            .enumerate()
            .map(|(index, (descriptor, ideal))| {
                json!({
                    "indexZeroBased": index,
                    "prime": descriptor.prime.to_string(),
                    "ramification": descriptor.ramification,
                    "residueDegree": descriptor.residue_degree,
                    "norm": descriptor.norm.to_string(),
                    "generator": integer_strings(descriptor.generator),
                    "hnf": integer_strings(descriptor.hnf),
                    "integralBasisRows": ideal.basis_rows().iter().map(|row|
                        integer_strings(row.iter())
                    ).collect::<Vec<_>>(),
                    "classCoordinates": integer_strings(
                        coordinate_rows[index].values().iter()
                    ),
                })
            })
            .collect::<Vec<_>>();
        let principal_relations = presentation
            .principal_relations()
            .iter()
            .enumerate()
            .map(|(index, witness)| {
                json!({
                    "relationIndexZeroBased": index,
                    "principalElementIntegralBasisCoordinates": integer_strings(
                        witness.principal_element.iter()
                    ),
                    "primeIdealFactors": witness.exponents.iter().enumerate()
                        .filter(|(_, exponent)| **exponent != 0)
                        .map(|(factor_base_index_zero_based, exponent)| json!({
                            "factorBaseIndexZeroBased": factor_base_index_zero_based,
                            "exponent": exponent.to_string(),
                        })).collect::<Vec<_>>(),
                })
            })
            .collect::<Vec<_>>();
        let generator_orders = presentation
            .generator_orders()
            .iter()
            .map(|evidence| {
                json!({
                    "coordinateZeroBased": evidence.smith_position,
                    "invariantFactor": evidence.invariant_factor.to_string(),
                    "factorBaseLift": sparse_integer_vector(&evidence.factor_base_exponents),
                    "orderRelationCombination": sparse_integer_vector(
                        &evidence.relation_coefficients
                    ),
                })
            })
            .collect::<Vec<_>>();
        let units = completed.units();
        let analytic = completed.analytic();
        let bf_enclosure = analytic.bf_enclosure();
        let lattice_index_evidence = match presentation.compact_lattice_certificate() {
            Some(certificate) => json!({
                "method": "compact-small-surplus",
                "squareRowIndicesZeroBased": certificate.square_rows,
                "surplusRowIndicesZeroBased": certificate.surplus_rows,
                "squareDeterminant": certificate.square_determinant.to_string(),
                "projectedDependencyDeterminant": certificate
                    .projected_dependency_determinant
                    .to_string(),
                "dependencySaturation": {
                    "criterion": "gcd-of-exhibited-maximal-dependency-minors-is-one",
                    "selectedMinors": certificate.saturation_minors.iter().map(|minor| json!({
                        "relationRowIndicesZeroBased": minor.relation_row_indices,
                        "determinant": minor.determinant.to_string(),
                    })).collect::<Vec<_>>(),
                },
            }),
            None => json!({ "method": "detached-dense-recompute" }),
        };
        Ok(json!({
            "schema": "sagejs.rust-class-group/public-cubic-publication-candidate-v2",
            "status": "detached-replay-required-before-publication",
            "proofMode": "conditional-grh",
            "field": {
                "polynomialAscending": integer_strings(
                    field_data.polynomial_ascending.iter()
                ),
                "irreducibilityPrime": field_data.irreducibility_prime,
                "integralBasisNumerators": integer_strings(
                    field_data.integral_basis_numerators.iter()
                ),
                "basisDenominator": field_data.basis_denominator.to_string(),
                "multiplicationTable": integer_strings(
                    field_data.multiplication_table.iter()
                ),
                "discriminant": field_data.discriminant.to_string(),
                "signature": [field_data.signature.0, field_data.signature.1],
                "equationOrderIndex": field.equation_order_index().to_string(),
                "bindingSha256": hexadecimal(class_map.field_sha256()),
            },
            "maximalOrderCertificate": {
                "equationDiscriminant": certificate.equation_discriminant().to_string(),
                "factorization": certificate.factorization().iter().map(|(prime, exponent)|
                    json!({ "prime": prime.to_string(), "exponent": exponent })
                ).collect::<Vec<_>>(),
                "localCertificates": certificate.local_certificates().iter().map(|item| json!({
                    "prime": item.prime.to_string(),
                    "maximumIndexExponent": item.maximum_index_exponent,
                    "selectedIndexExponent": item.selected_index_exponent,
                    "enumeratedSuperlattices": item.enumerated_superlattices.to_string(),
                })).collect::<Vec<_>>(),
            },
            "presentation": {
                "invariantFactors": integer_strings(completed.invariant_factors().iter()),
                "classNumber": completed.class_number().to_string(),
                "bindingSha256": hexadecimal(
                    &class_map.presentation().binding_sha256()
                ),
                "principalWitnessesSha256": hexadecimal(
                    class_map.principal_witnesses_sha256()
                ),
                "factorBasePolicy": {
                    "relationBound": factor_base.catalog.relation_bound,
                    "checkingBound": factor_base.catalog.checking_bound,
                    "hypothesis": CubicAnalyticEvidence::FACTOR_BASE_HYPOTHESIS,
                },
                "factorBase": factor_base_entries,
                "principalRelations": principal_relations,
                "generatorOrders": generator_orders,
                "relationDependencies": completed.dependency_lattice().iter().map(|row|
                    sparse_integer_vector(row)
                ).collect::<Vec<_>>(),
                "latticeIndexEvidence": lattice_index_evidence,
            },
            "units": {
                "rootsOfUnity": {
                    "order": "2",
                    "generatorIntegralBasisCoordinates": ["-1", "0", "0"],
                    "exhaustionTheorem": "odd-degree-number-fields-have-only-plus-or-minus-one-roots-of-unity",
                },
                "fundamentalUnits": units.fundamental_units().iter().map(|unit| json!({
                    "relationExponents": sparse_integer_vector(unit.relation_exponents()),
                })).collect::<Vec<_>>(),
                "selectedBasisIndex": units.selected_basis_index().to_string(),
                "commonDenominator": units.common_denominator().to_string(),
                "regulator": dyadic_interval(units.regulator()),
            },
            "analyticCompletion": {
                "classUnitHypothesis": CubicAnalyticEvidence::CLASS_UNIT_HYPOTHESIS,
                "factorBaseHypothesis": CubicAnalyticEvidence::FACTOR_BASE_HYPOTHESIS,
                "bfPlan": {
                    "threshold": analytic.bf_plan().threshold.to_string(),
                    "rawTerms": analytic.bf_plan().raw_terms,
                    "terms": analytic.bf_plan().terms,
                },
                "bfEnclosure": {
                    "zetaLogResidue": dyadic_interval(&bf_enclosure.zeta_log_residue),
                    "tailBound": dyadic_interval(&bf_enclosure.tail_bound),
                    "index": dyadic_interval(&bf_enclosure.index),
                },
                "bdfPlan": {
                    "bound": analytic.bdf_plan().bound.to_string(),
                    "rawTerms": analytic.bdf_plan().raw_terms,
                    "terms": analytic.bdf_plan().terms,
                },
                "bdfMargin": dyadic_interval(analytic.bdf_margin()),
                "precision": {
                    "requestedLogarithmPrecisionBits": completed.precision()
                        .requested_logarithm_precision_bits(),
                    "requestedReplayPrecisionBits": completed.precision()
                        .requested_replay_precision_bits(),
                    "attemptedLevels": completed.precision().attempted_levels().iter()
                        .map(|level| json!({
                            "logarithmPrecisionBits": level.logarithm_precision_bits,
                            "replayPrecisionBits": level.replay_precision_bits,
                        })).collect::<Vec<_>>(),
                },
            },
        }))
    }
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
// unavailable (notably during large-surplus analytic continuation). Alternating
// CPU-pinned measurements bracket the crossover: compact authentication is
// faster for a 7-by-21 presentation (25,382 estimated multiply-adds), while it
// is slower for a 4-by-17 presentation (11,926 estimated multiply-adds).
const DENSE_SMITH_PREFERRED_MULTIPLY_ADDS: u64 = 20_000;

fn compact_limits(resources: &NativeResources) -> CompactPresentationLimits {
    CompactPresentationLimits {
        maximum_generators: resources.maximum_compact_generators,
        maximum_surplus_rows: resources.maximum_compact_surplus_rows,
        maximum_saturation_minor_trials: resources.maximum_compact_saturation_minor_trials,
        maximum_dependency_entries: resources.maximum_compact_dependency_entries,
        maximum_invariant_factors: resources.maximum_compact_generators,
        maximum_map_entries: resources.maximum_normal_form_entries,
        maximum_map_coefficient_bits: resources.maximum_compact_target_coefficient_bits,
        maximum_general_smith_bytes: resources
            .maximum_normal_form_entries
            .checked_mul(std::mem::size_of::<i64>())
            .unwrap_or(usize::MAX),
        maximum_general_smith_transform_work: resources.maximum_verification_multiply_adds,
        maximum_verification_multiply_adds: resources.maximum_verification_multiply_adds,
        maximum_target_coefficient_bits: resources.maximum_compact_target_coefficient_bits,
    }
}

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
    resources: &NativeResources,
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
    resources: &NativeResources,
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

/// Exercise the coefficient-only route and retain its sealed query state.
pub fn qualify_with_state(request: Request) -> Result<QualifiedCubic, QualificationError> {
    let total_start = Instant::now();
    if request.schema != REQUEST_SCHEMA {
        return Err(QualificationError::UnsupportedSchema);
    }
    let resources = request.resources.native()?;
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
        maximum_trial_divisor: resources.maximum_trial_divisor,
        maximum_irreducibility_prime: resources.maximum_irreducibility_prime,
        embedding_precision_bits: resources.embedding_precision_bits,
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
            maximum_visited_ideals: resources.maximum_visited_ideals,
            maximum_candidates: resources.maximum_candidates,
            maximum_relations: resources.maximum_relations,
            maximum_dependencies: resources.maximum_dependencies,
        },
    )
    .map_err(|error| QualificationError::RelationCollection(format!("{error:?}")))?;
    let collector_initialization_ns = collection_start.elapsed().as_nanos();
    let mut relation_collection_ns = collector_initialization_ns;
    let candidate_limits = CubicPresentationCandidateLimits {
        normal_form: NormalFormLimits {
            max_entries: resources.maximum_normal_form_entries,
            max_operations: resources.maximum_normal_form_operations,
        },
        maximum_relation_exponent: resources.maximum_relation_exponent,
        maximum_verification_multiply_adds: resources.maximum_verification_multiply_adds,
        maximum_principal_factor_terms: resources.maximum_principal_factor_terms,
    };
    let completion_options = || CubicConditionalCompletionOptions {
        proof_mode: match request.proof_mode {
            ProofMode::ConditionalGrh => CubicCompletionProofMode::GrhConditional,
            ProofMode::Unconditional => CubicCompletionProofMode::Unconditional,
        },
        logarithm_precision_bits: resources.logarithm_precision_bits,
        replay_precision_bits: resources.replay_precision_bits,
        analytic_precision_bits: resources.analytic_precision_bits,
        maximum_relations: resources.maximum_relations,
        maximum_dependencies: resources.maximum_dependencies,
        maximum_kernel_coefficient_bits: resources.maximum_kernel_coefficient_bits,
        maximum_unit_exponent_bits: resources.maximum_unit_exponent_bits,
        maximum_reconstruction_denominator_bits: resources.maximum_reconstruction_denominator_bits,
        maximum_analytic_threshold: resources.maximum_analytic_threshold,
    };

    let mut attempts = Vec::new();
    let mut final_relations = None;
    let mut final_candidate = None;
    let mut final_completion = None;
    let mut final_completed = None;
    let mut candidate_authentication_ns = 0_u128;
    let mut completion_ns = 0_u128;
    let mut completion_context = None;
    let mut compact_continuation_cache: Option<CompactPresentationContinuationCache> = None;
    let mut supplementary_target = initial_supplementary_target(resources.maximum_dependencies);
    loop {
        if supplementary_target > resources.maximum_dependencies {
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
        let factor_base_size = collected.factor_base().catalog.ideals.len();
        let relation_count = if factor_base_size == 0 {
            0
        } else {
            collected.relations().len() / factor_base_size
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

        let route =
            select_candidate_authentication_route(factor_base_size, relation_count, &resources);
        let attempt_prepared = prepared.clone();
        let started = Instant::now();
        let (authenticated, authority) =
            if route == CandidateAuthenticationRoute::CompactSmallSurplus {
                let (authenticated, cache) =
                    authenticate_compact_cubic_presentation_candidate_with_cache(
                        &attempt_prepared,
                        collected,
                        candidate_limits,
                        compact_limits(&resources),
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
                final_completed = Some(completed);
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
        if next_target > resources.maximum_dependencies
            || next_relation_count > resources.maximum_relations
            || !candidate_authentication_route_fits(
                factor_base_size,
                next_relation_count,
                &resources,
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

    let receipt = Receipt {
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
    };
    let compact_replay_limits = compact_limits(&resources);
    Ok(QualifiedCubic {
        receipt,
        completed: final_completed.expect("a final receipt retains its sealed result"),
        compact_replay_limits,
        compact_replay: OnceLock::new(),
    })
}

/// Exercise the coefficient-only route through conditional completion.
pub fn qualify(request: Request) -> Result<Receipt, QualificationError> {
    qualify_with_state(request).map(|qualified| qualified.receipt)
}

impl QualifiedCubic {
    /// Query one ideal without recomputing the completed field state.
    pub fn query_integral_ideal(
        &self,
        source_rows: &[[String; 3]; 3],
        resources: IdealQueryResources,
    ) -> Result<([[String; 3]; 3], IdealQueryCertificateReceipt), QualificationError> {
        if resources.maximum_candidates == 0 || resources.maximum_valuation == 0 {
            return Err(QualificationError::IdealQuery(
                "arbitrary-ideal resource limits must be positive".to_owned(),
            ));
        }
        let maximum_candidates = usize::try_from(resources.maximum_candidates).map_err(|_| {
            QualificationError::IdealQuery(
                "maximumCandidates does not fit the target address width".to_owned(),
            )
        })?;
        let mut rows: [[Integer; 3]; 3] =
            std::array::from_fn(|_| std::array::from_fn(|_| Integer::new()));
        for (row_index, source_row) in source_rows.iter().enumerate() {
            for (column_index, source) in source_row.iter().enumerate() {
                if source.len() > 1_234 {
                    return Err(QualificationError::IdealQuery(format!(
                        "ideal entry ({row_index}, {column_index}) exceeds 1234 bytes"
                    )));
                }
                rows[row_index][column_index] = source.parse::<Integer>().map_err(|_| {
                    QualificationError::IdealQuery(format!(
                        "ideal entry ({row_index}, {column_index}) is not an integer"
                    ))
                })?;
            }
        }
        let mut workspace = PreparedIdealWorkspace::new();
        let ideal = workspace
            .from_integral_ideal_basis(self.completed.prepared().field(), &rows)
            .map_err(|error| QualificationError::IdealQuery(format!("{error:?}")))?;
        let limits = ArbitraryIdealReductionLimits {
            maximum_candidates,
            maximum_valuation: resources.maximum_valuation,
        };
        let certificate = self
            .completed
            .ideal_class_certificate(
                &ideal,
                resources.embedding_precision_bits,
                limits,
                &mut workspace,
            )
            .map_err(|error| QualificationError::IdealQuery(format!("{error:?}")))?;
        self.completed
            .replay_ideal_class_certificate(&ideal, &certificate, limits, &mut workspace)
            .map_err(|error| QualificationError::IdealQuery(format!("{error:?}")))?;
        let factor_base_size = certificate.reduction.quotient_exponents.len();

        // Choose the canonical representative attached to the published Smith
        // generators: coordinate c_i is lifted by the authenticated preimage
        // of the i-th nontrivial invariant-factor generator.  Since
        // (alpha) = input * P^q, the vector q + lift(c) is a verified relation
        // combination.  Thus
        //
        // input / P^lift(c) = (alpha * product beta_j^(-a_j)),
        //
        // where A*a = q + lift(c) and (beta_j) is relation column j.
        let presentation = self.completed.presentation();
        let coordinates = certificate.class_map.coordinates.values();
        let generator_orders = presentation.generator_orders();
        if generator_orders.len() != coordinates.len()
            || generator_orders
                .iter()
                .zip(self.completed.invariant_factors())
                .any(|(order, invariant)| &order.invariant_factor != invariant)
        {
            return Err(QualificationError::IdealQuery(
                "canonical class-generator lifts do not match the sealed invariants".to_owned(),
            ));
        }
        let mut representative = vec![Integer::new(); factor_base_size];
        for (coordinate, order) in coordinates.iter().zip(generator_orders) {
            if order.factor_base_exponents.len() != factor_base_size {
                return Err(QualificationError::IdealQuery(
                    "canonical class-generator lift has the wrong factor-base width".to_owned(),
                ));
            }
            for (target, lift) in representative.iter_mut().zip(&order.factor_base_exponents) {
                *target += Integer::from(coordinate * lift);
            }
        }
        let relation_target = certificate
            .reduction
            .quotient_exponents
            .iter()
            .zip(&representative)
            .map(|(quotient, lift)| Integer::from(Integer::from(*quotient) + lift))
            .collect::<Vec<_>>();
        let relation_coefficients = match presentation
            .class_map()
            .presentation()
            .presentation_zero_state(&relation_target)
        {
            Ok(PresentationZeroState::ZeroByVerifiedRelations {
                relation_combination,
                principal_element:
                    PrincipalElementWitnessState::Identity
                    | PrincipalElementWitnessState::NeedsRelationPrincipalElements { .. },
            }) => relation_combination.coefficients().to_vec(),
            Err(crate::ClassMapError::RelationCombinationUnavailable) => {
                // Compact maps intentionally discard their live solver. Lazily
                // rebuild it once per resident field from the sealed transcript
                // under the original explicit bounds. Every solve still
                // independently replays its answer before returning it.
                if self.compact_replay.get().is_none() {
                    let compact = authenticate_compact_presentation(
                        presentation.collected(),
                        self.compact_replay_limits,
                    )
                    .map_err(|error| QualificationError::IdealQuery(format!("{error:?}")))?;
                    let _ = self.compact_replay.set(compact);
                }
                self.compact_replay
                    .get()
                    .expect("the compact replay solver was initialized")
                    .solver_data()
                    .solve_targets(&relation_target)
                    .map_err(|error| QualificationError::IdealQuery(format!("{error:?}")))?
            }
            Ok(_) => {
                return Err(QualificationError::IdealQuery(
                    "canonical representative does not match the queried class".to_owned(),
                ));
            }
            Err(error) => return Err(QualificationError::IdealQuery(format!("{error:?}"))),
        };
        if relation_coefficients.len() != presentation.principal_relations().len() {
            return Err(QualificationError::IdealQuery(
                "principal witness has the wrong relation width".to_owned(),
            ));
        }
        let coefficient_bit_limit = self.compact_replay_limits.maximum_target_coefficient_bits;
        if representative
            .iter()
            .chain(&relation_coefficients)
            .any(|value| {
                usize::try_from(value.significant_bits()).unwrap_or(usize::MAX)
                    > coefficient_bit_limit
            })
        {
            return Err(QualificationError::IdealQuery(
                "principal witness exceeds the configured coefficient bit limit".to_owned(),
            ));
        }
        let canonical_representative_factor_base_exponents = representative
            .iter()
            .enumerate()
            .filter(|(_, exponent)| *exponent != &0)
            .map(|(index_zero_based, exponent)| SparseSignedExponent {
                index_zero_based,
                exponent: exponent.to_string(),
            })
            .collect();
        let principal_witness_relation_factors = relation_coefficients
            .iter()
            .enumerate()
            .filter(|(_, coefficient)| *coefficient != &0)
            .map(
                |(relation_index_zero_based, coefficient)| CompactPrincipalRelationFactor {
                    relation_index_zero_based,
                    exponent: Integer::from(-coefficient).to_string(),
                    principal_element_integral_basis_coordinates: presentation
                        .principal_relations()[relation_index_zero_based]
                        .principal_element
                        .clone()
                        .map(|coordinate| coordinate.to_string()),
                },
            )
            .collect();

        let quotient_factor_base_exponents = certificate
            .reduction
            .quotient_exponents
            .iter()
            .enumerate()
            .filter(|(_, exponent)| **exponent != 0)
            .map(
                |(factor_base_index_zero_based, exponent)| SparseQuotientExponent {
                    factor_base_index_zero_based,
                    exponent: exponent.to_string(),
                },
            )
            .collect();
        let maximal_order_evidence = match certificate.reduction.maximal_order_evidence {
            MaximalOrderEvidenceStatus::RustProvedSquarefreeDiscriminant => {
                "rust-proved-maximal-order"
            }
            MaximalOrderEvidenceStatus::UpstreamAssumedAllowlistedRow6 => {
                "upstream-assumed-allowlisted-row6"
            }
        };
        let presentation_zero = match certificate.class_map.presentation_zero_state {
            PresentationZeroState::ZeroByVerifiedRelations { .. } => true,
            PresentationZeroState::NonzeroInCurrentPresentation { .. } => false,
        };
        let statistics = certificate.reduction.statistics.clone();
        Ok((
            ideal
                .basis_rows()
                .clone()
                .map(|row| row.map(|value| value.to_string())),
            IdealQueryCertificateReceipt {
                maximal_order_evidence,
                factor_base_size,
                principal_element_integral_basis_coordinates: certificate
                    .reduction
                    .element
                    .map(|value| value.to_string()),
                quotient_factor_base_exponents,
                class_coordinates: certificate
                    .class_map
                    .coordinates
                    .values()
                    .iter()
                    .map(Integer::to_string)
                    .collect(),
                canonical_representative_factor_base_exponents,
                principal_witness_relation_factors,
                presentation_zero,
                cursor_trials: statistics.cursor_trials,
                primitive_candidates: statistics.primitive_candidates,
                smooth_quotient_norms: statistics.smooth_quotient_norms,
            },
        ))
    }
}

/// Complete a public cubic and answer one exact integral-ideal class query.
///
/// This one-shot qualification API deliberately serializes canonical integers
/// rather than leaking GMP/Rust layouts. Product adapters may retain
/// `QualifiedCubic` and call the same sealed method repeatedly; the one-shot
/// envelope proves that both native JSON and Wasm can transport the complete
/// mathematical query without host callbacks.
pub fn qualify_ideal_query(
    request: IdealQueryRequest,
) -> Result<IdealQueryReceipt, QualificationError> {
    if request.schema != IDEAL_QUERY_REQUEST_SCHEMA {
        return Err(QualificationError::UnsupportedSchema);
    }
    let polynomial_ascending = request.completion_request.polynomial_ascending.clone();
    let qualified = qualify_with_state(request.completion_request)?;
    let (queried_ideal_integral_basis_rows, certificate) =
        qualified.query_integral_ideal(&request.ideal_integral_basis_rows, request.resources)?;
    Ok(IdealQueryReceipt {
        schema: IDEAL_QUERY_RECEIPT_SCHEMA,
        outcome: "complete-conditional-grh-ideal-class",
        polynomial_ascending,
        completion: qualified.receipt,
        queried_ideal_integral_basis_rows,
        certificate,
    })
}

/// Versioned product protocol shared by the native JSON-lines service and the
/// WebAssembly reactor.  The mathematical request schemas above remain
/// independently versioned so a host can reject either boundary precisely.
pub const SERVICE_REQUEST_SCHEMA: &str = "sagejs.class-groups/service-request-v1";
pub const SERVICE_RESPONSE_SCHEMA: &str = "sagejs.class-groups/service-response-v1";
pub const SERVICE_ABI_VERSION: u32 = 1;
pub const MAXIMUM_REQUEST_BYTES: usize = 1 << 20;
pub const MAXIMUM_RESPONSE_BYTES: usize = 16 << 20;
pub const MAXIMUM_RESIDENT_SESSIONS: usize = 4;

#[derive(Clone, Copy, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ServiceErrorCategory {
    InvalidRequest,
    UnsupportedSchema,
    CapabilityDeclined,
    CapacityExhausted,
    ResourceExhausted,
    ComputationFailed,
    UnknownHandle,
    SerializationFailed,
}

#[derive(Clone, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceErrorReceipt {
    pub schema: &'static str,
    pub outcome: &'static str,
    pub category: ServiceErrorCategory,
    pub operation: String,
    pub message: String,
}

#[derive(Debug)]
struct ServiceError {
    category: ServiceErrorCategory,
    operation: String,
    message: String,
}

impl ServiceError {
    fn new(
        category: ServiceErrorCategory,
        operation: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            category,
            operation: operation.into(),
            message: message.into(),
        }
    }

    fn receipt(self) -> ServiceErrorReceipt {
        ServiceErrorReceipt {
            schema: SERVICE_RESPONSE_SCHEMA,
            outcome: "error",
            category: self.category,
            operation: self.operation,
            message: self.message,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ComputeServiceRequest {
    schema: String,
    abi: u32,
    id: String,
    operation: String,
    request: Request,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HandleServiceRequest {
    schema: String,
    abi: u32,
    id: String,
    operation: String,
    generation: String,
    handle: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct QueryServiceRequest {
    schema: String,
    abi: u32,
    id: String,
    operation: String,
    generation: String,
    handle: String,
    ideal_integral_basis_rows: [[String; 3]; 3],
    resources: IdealQueryResources,
}

struct ResidentSession {
    polynomial_ascending: [String; 4],
    qualified: QualifiedCubic,
}

/// A bounded, deterministic resident store. Handles combine a monotonically
/// increasing slot generation with a one-based slot number, so a handle can
/// never silently name a later field after close and reuse.
pub struct ProductService {
    slots: [Option<ResidentSession>; MAXIMUM_RESIDENT_SESSIONS],
    generations: [u32; MAXIMUM_RESIDENT_SESSIONS],
}

impl Default for ProductService {
    fn default() -> Self {
        Self::new()
    }
}

impl ProductService {
    pub fn new() -> Self {
        Self {
            slots: std::array::from_fn(|_| None),
            generations: [1; MAXIMUM_RESIDENT_SESSIONS],
        }
    }

    fn encode_handle(&self, slot: usize) -> u64 {
        (u64::from(self.generations[slot]) << 32) | (slot as u64 + 1)
    }

    fn parse_handle(operation: &str, text: &str) -> Result<u64, ServiceError> {
        text.parse::<u64>().map_err(|_| {
            ServiceError::new(
                ServiceErrorCategory::InvalidRequest,
                operation,
                "handle must be a canonical unsigned decimal integer",
            )
        })
    }

    fn parse_generation(operation: &str, text: &str) -> Result<u32, ServiceError> {
        text.parse::<u32>().map_err(|_| {
            ServiceError::new(
                ServiceErrorCategory::InvalidRequest,
                operation,
                "generation must be a canonical unsigned decimal integer",
            )
        })
    }

    fn resolve_handle(
        &self,
        operation: &str,
        generation_binding: u32,
        handle: u64,
    ) -> Result<usize, ServiceError> {
        let low = handle as u32;
        let generation = (handle >> 32) as u32;
        let slot = usize::try_from(low)
            .ok()
            .and_then(|value| value.checked_sub(1))
            .filter(|slot| *slot < MAXIMUM_RESIDENT_SESSIONS)
            .ok_or_else(|| {
                ServiceError::new(
                    ServiceErrorCategory::UnknownHandle,
                    operation,
                    "unknown, closed, or stale resident handle",
                )
            })?;
        if generation_binding != generation
            || generation == 0
            || generation != self.generations[slot]
            || self.slots[slot].is_none()
        {
            return Err(ServiceError::new(
                ServiceErrorCategory::UnknownHandle,
                operation,
                "unknown, closed, or stale resident handle",
            ));
        }
        Ok(slot)
    }

    fn stable_receipt(receipt: &Receipt) -> Result<Value, ServiceError> {
        let mut value = serde_json::to_value(receipt).map_err(|error| {
            ServiceError::new(
                ServiceErrorCategory::SerializationFailed,
                "completion",
                error.to_string(),
            )
        })?;
        if let Some(object) = value.as_object_mut() {
            // Timings are diagnostics, not authority-bearing mathematical
            // evidence, and would make identical product requests differ.
            object.remove("stageTimingsNanoseconds");
            if let Some(Value::Array(attempts)) = object.get_mut("continuationAttempts") {
                for attempt in attempts {
                    if let Some(attempt) = attempt.as_object_mut() {
                        attempt.remove("relationCollectionNanoseconds");
                        attempt.remove("candidateAuthenticationNanoseconds");
                        attempt.remove("unitAndAnalyticCompletionNanoseconds");
                    }
                }
            }
        }
        Ok(value)
    }

    fn qualify_error(operation: &str, error: QualificationError) -> ServiceError {
        let category = match error {
            QualificationError::UnsupportedSchema => ServiceErrorCategory::UnsupportedSchema,
            QualificationError::InvalidCoefficient { .. } => ServiceErrorCategory::InvalidRequest,
            QualificationError::RelationCollection(ref message)
                if message.contains("limit") || message.contains("exhaust") =>
            {
                ServiceErrorCategory::ResourceExhausted
            }
            QualificationError::Completion(ref message)
                if message.contains("limit") || message.contains("exhaust") =>
            {
                ServiceErrorCategory::ResourceExhausted
            }
            _ => ServiceErrorCategory::ComputationFailed,
        };
        ServiceError::new(category, operation, format!("{error:?}"))
    }

    fn open(&mut self, request: Request) -> Result<Value, ServiceError> {
        let slot = self.slots.iter().position(Option::is_none).ok_or_else(|| {
            ServiceError::new(
                ServiceErrorCategory::CapacityExhausted,
                "open",
                "resident session capacity exhausted",
            )
        })?;
        let polynomial_ascending = request.polynomial_ascending.clone();
        let qualified =
            qualify_with_state(request).map_err(|error| Self::qualify_error("open", error))?;
        let completion = Self::stable_receipt(&qualified.receipt)?;
        self.slots[slot] = Some(ResidentSession {
            polynomial_ascending,
            qualified,
        });
        Ok(json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "outcome": "open",
            "operation": "open",
            "handle": self.encode_handle(slot).to_string(),
            "generation": self.generations[slot].to_string(),
            "maximumResidentSessions": MAXIMUM_RESIDENT_SESSIONS as u32,
            "completion": completion,
        }))
    }

    fn query(
        &self,
        generation_text: &str,
        handle_text: &str,
        rows: &[[String; 3]; 3],
        resources: IdealQueryResources,
    ) -> Result<Value, ServiceError> {
        let handle = Self::parse_handle("query", handle_text)?;
        let generation = Self::parse_generation("query", generation_text)?;
        let slot = self.resolve_handle("query", generation, handle)?;
        let session = self.slots[slot].as_ref().expect("resolved live slot");
        let (queried_ideal_integral_basis_rows, certificate) = session
            .qualified
            .query_integral_ideal(rows, resources)
            .map_err(|error| Self::qualify_error("query", error))?;
        Ok(json!({
            "schema": IDEAL_QUERY_RECEIPT_SCHEMA,
            "outcome": "complete-conditional-grh-ideal-class",
            "polynomialAscending": session.polynomial_ascending,
            "completion": Self::stable_receipt(&session.qualified.receipt)?,
            "queriedIdealIntegralBasisRows": queried_ideal_integral_basis_rows,
            "certificate": certificate,
        }))
    }

    fn publication(&self, generation_text: &str, handle_text: &str) -> Result<Value, ServiceError> {
        let handle = Self::parse_handle("publication", handle_text)?;
        let generation = Self::parse_generation("publication", generation_text)?;
        let slot = self.resolve_handle("publication", generation, handle)?;
        let bundle = self.slots[slot]
            .as_ref()
            .expect("resolved live slot")
            .qualified
            .publication_bundle()
            .map_err(|error| Self::qualify_error("publication", error))?;
        Ok(json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "outcome": "complete",
            "operation": "publication",
            "handle": handle_text,
            "publication": bundle,
        }))
    }

    fn close(&mut self, generation_text: &str, handle_text: &str) -> Result<Value, ServiceError> {
        let handle = Self::parse_handle("close", handle_text)?;
        let generation = Self::parse_generation("close", generation_text)?;
        let slot = self.resolve_handle("close", generation, handle)?;
        self.slots[slot] = None;
        self.generations[slot] = self.generations[slot].checked_add(1).ok_or_else(|| {
            ServiceError::new(
                ServiceErrorCategory::CapacityExhausted,
                "close",
                "resident handle generation space exhausted",
            )
        })?;
        Ok(json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "outcome": "closed",
            "operation": "close",
            "handle": handle_text,
        }))
    }

    fn capabilities() -> Value {
        json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "outcome": "available",
            "operation": "capability",
            "abi": SERVICE_ABI_VERSION,
            "mathematicalScope": "absolute-monic-cubic-conditional-grh",
            "maximumResidentSessions": MAXIMUM_RESIDENT_SESSIONS as u32,
            "proofModes": ["conditional-grh"],
            "operations": ["capability", "open", "query", "publication", "close"],
        })
    }

    fn execute_value(&mut self, value: Value) -> Result<Value, ServiceError> {
        let operation = value
            .get("operation")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_owned();
        if value.get("schema").and_then(Value::as_str) != Some(SERVICE_REQUEST_SCHEMA) {
            return Err(ServiceError::new(
                ServiceErrorCategory::UnsupportedSchema,
                operation,
                "unsupported service request schema",
            ));
        }
        if value.get("abi").and_then(Value::as_u64) != Some(u64::from(SERVICE_ABI_VERSION)) {
            return Err(ServiceError::new(
                ServiceErrorCategory::UnsupportedSchema,
                operation,
                "unsupported service ABI version",
            ));
        }
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ServiceError::new(
                    ServiceErrorCategory::InvalidRequest,
                    &operation,
                    "request id must be a string",
                )
            })?
            .to_owned();
        if id.is_empty() || id.len() > 128 {
            return Err(ServiceError::new(
                ServiceErrorCategory::InvalidRequest,
                &operation,
                "request id byte length must be between 1 and 128",
            ));
        }
        match operation.as_str() {
            "capability" => {
                let object = value.as_object().expect("parsed JSON value");
                if object.len() != 4 {
                    return Err(ServiceError::new(
                        ServiceErrorCategory::InvalidRequest,
                        operation,
                        "capability accepts only schema, ABI, id, and operation",
                    ));
                }
                Ok(Self::capabilities())
            }
            "open" => {
                let request: ComputeServiceRequest =
                    serde_json::from_value(value).map_err(|error| {
                        ServiceError::new(
                            ServiceErrorCategory::InvalidRequest,
                            &operation,
                            error.to_string(),
                        )
                    })?;
                debug_assert_eq!(request.schema, SERVICE_REQUEST_SCHEMA);
                debug_assert_eq!(request.abi, SERVICE_ABI_VERSION);
                debug_assert_eq!(request.id, id);
                debug_assert_eq!(request.operation, operation);
                self.open(request.request)
            }
            "query" => {
                let request: QueryServiceRequest =
                    serde_json::from_value(value).map_err(|error| {
                        ServiceError::new(
                            ServiceErrorCategory::InvalidRequest,
                            "query",
                            error.to_string(),
                        )
                    })?;
                debug_assert_eq!(request.schema, SERVICE_REQUEST_SCHEMA);
                debug_assert_eq!(request.abi, SERVICE_ABI_VERSION);
                debug_assert_eq!(request.id, id);
                debug_assert_eq!(request.operation, "query");
                self.query(
                    &request.generation,
                    &request.handle,
                    &request.ideal_integral_basis_rows,
                    request.resources,
                )
            }
            "publication" | "close" => {
                let request: HandleServiceRequest =
                    serde_json::from_value(value).map_err(|error| {
                        ServiceError::new(
                            ServiceErrorCategory::InvalidRequest,
                            &operation,
                            error.to_string(),
                        )
                    })?;
                debug_assert_eq!(request.schema, SERVICE_REQUEST_SCHEMA);
                debug_assert_eq!(request.abi, SERVICE_ABI_VERSION);
                debug_assert_eq!(request.id, id);
                debug_assert_eq!(request.operation, operation);
                if operation == "publication" {
                    self.publication(&request.generation, &request.handle)
                } else {
                    self.close(&request.generation, &request.handle)
                }
            }
            _ => Err(ServiceError::new(
                ServiceErrorCategory::CapabilityDeclined,
                operation,
                "unsupported service operation",
            )),
        }
    }

    /// Execute exactly one bounded request. Errors are returned as typed JSON
    /// receipts; malformed input never mutates resident state.
    pub fn execute_json(&mut self, bytes: &[u8]) -> Vec<u8> {
        if bytes.is_empty() || bytes.len() > MAXIMUM_REQUEST_BYTES {
            return serialize_service_result(
                "unknown",
                Err(ServiceError::new(
                    ServiceErrorCategory::InvalidRequest,
                    "unknown",
                    "request byte length is outside the service limit",
                )),
            );
        }
        let value: Value = match serde_json::from_slice(bytes) {
            Ok(value) => value,
            Err(error) => {
                return serialize_service_result(
                    "unknown",
                    Err(ServiceError::new(
                        ServiceErrorCategory::InvalidRequest,
                        "unknown",
                        format!("invalid JSON: {error}"),
                    )),
                );
            }
        };
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.len() <= 128)
            .unwrap_or("unknown")
            .to_owned();
        serialize_service_result(&id, self.execute_value(value))
    }
}

fn serialize_service_result(id: &str, result: Result<Value, ServiceError>) -> Vec<u8> {
    let value = match result {
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
    let bytes = serde_json::to_vec(&value).unwrap_or_else(|_| {
        br#"{"schema":"sagejs.class-groups/service-response-v1","outcome":"error","category":"serialization-failed","operation":"unknown","message":"could not serialize service response"}"#.to_vec()
    });
    if bytes.len() <= MAXIMUM_RESPONSE_BYTES {
        bytes
    } else {
        let error = ServiceError::new(
            ServiceErrorCategory::ResourceExhausted,
            "unknown",
            "response exceeds the service byte limit",
        )
        .receipt();
        serde_json::to_vec(&json!({
            "schema": SERVICE_RESPONSE_SCHEMA,
            "abi": SERVICE_ABI_VERSION,
            "id": id,
            "ok": false,
            "error": error,
        }))
        .expect("fixed bounded error receipt")
    }
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
                maximum_candidates: maximum_candidates as u64,
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
    fn public_integral_ideal_query_serializes_a_nonzero_class() {
        let mut completion_request = request(100_000);
        completion_request.polynomial_ascending =
            ["-29".into(), "-30".into(), "-8".into(), "1".into()];
        let qualified = qualify_with_state(completion_request.clone()).unwrap();
        assert_eq!(qualified.completed.invariant_factors(), &[Integer::from(2)]);
        let publication = qualified.publication_bundle().unwrap();
        assert_eq!(
            publication["schema"],
            "sagejs.rust-class-group/public-cubic-publication-candidate-v2"
        );
        assert_eq!(
            publication["status"],
            "detached-replay-required-before-publication"
        );
        assert_eq!(
            publication["presentation"]["invariantFactors"],
            json!(["2"])
        );
        assert_eq!(
            publication["units"]["fundamentalUnits"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(
            publication["presentation"]["principalRelations"]
                .as_array()
                .is_some_and(|relations| !relations.is_empty())
        );
        let factor_base = qualified.completed.presentation().collected().factor_base();
        let nontrivial = factor_base
            .exact_ideals
            .iter()
            .enumerate()
            .find(|(index, _)| {
                let mut exponents = vec![Integer::new(); factor_base.exact_ideals.len()];
                exponents[*index] = Integer::from(1);
                !qualified
                    .completed
                    .presentation()
                    .class_map()
                    .presentation()
                    .coordinates(&exponents)
                    .unwrap()
                    .is_zero()
            })
            .map(|(_, ideal)| ideal)
            .unwrap();
        let ideal_integral_basis_rows = nontrivial
            .basis_rows()
            .clone()
            .map(|row| row.map(|entry| entry.to_string()));
        let (_, resident_certificate) = qualified
            .query_integral_ideal(
                &ideal_integral_basis_rows,
                IdealQueryResources {
                    embedding_precision_bits: 320,
                    maximum_candidates: 2_000,
                    maximum_valuation: 64,
                },
            )
            .unwrap();
        assert_eq!(resident_certificate.class_coordinates, ["1"]);
        let replays_principal_witness = |certificate: &IdealQueryCertificateReceipt| {
            let presentation = qualified.completed.presentation();
            let width = presentation.collected().factor_base().exact_ideals.len();
            let mut relation_target = vec![Integer::new(); width];
            for term in &certificate.quotient_factor_base_exponents {
                relation_target[term.factor_base_index_zero_based] +=
                    term.exponent.parse::<Integer>().unwrap();
            }
            for term in &certificate.canonical_representative_factor_base_exponents {
                relation_target[term.index_zero_based] += term.exponent.parse::<Integer>().unwrap();
            }
            for term in &certificate.principal_witness_relation_factors {
                let power = term.exponent.parse::<Integer>().unwrap();
                let relation = &presentation.principal_relations()[term.relation_index_zero_based];
                assert_eq!(
                    term.principal_element_integral_basis_coordinates,
                    relation
                        .principal_element
                        .clone()
                        .map(|coordinate| coordinate.to_string())
                );
                for (target, exponent) in relation_target.iter_mut().zip(&relation.exponents) {
                    *target += Integer::from(&power * *exponent);
                }
            }
            relation_target.iter().all(|value| value == &0)
        };
        assert!(replays_principal_witness(&resident_certificate));
        let mut mutated_witness = resident_certificate.clone();
        if let Some(term) = mutated_witness
            .canonical_representative_factor_base_exponents
            .first_mut()
        {
            term.exponent =
                Integer::from(term.exponent.parse::<Integer>().unwrap() + 1).to_string();
        } else {
            mutated_witness
                .canonical_representative_factor_base_exponents
                .push(SparseSignedExponent {
                    index_zero_based: 0,
                    exponent: "1".to_owned(),
                });
        }
        assert!(!replays_principal_witness(&mutated_witness));
        let receipt = qualify_ideal_query(IdealQueryRequest {
            schema: IDEAL_QUERY_REQUEST_SCHEMA.to_owned(),
            completion_request,
            ideal_integral_basis_rows,
            resources: IdealQueryResources {
                embedding_precision_bits: 320,
                maximum_candidates: 2_000,
                maximum_valuation: 64,
            },
        })
        .unwrap();
        assert_eq!(receipt.schema, IDEAL_QUERY_RECEIPT_SCHEMA);
        assert_eq!(receipt.certificate.class_coordinates, ["1"]);
        assert!(!receipt.certificate.presentation_zero);
        assert!(
            !receipt
                .certificate
                .quotient_factor_base_exponents
                .is_empty()
        );
    }

    #[test]
    fn route_selector_brackets_the_measured_dense_compact_crossover() {
        let input = request(10_000);
        assert_eq!(dense_verification_multiply_adds(4, 17), Some(11_926));
        assert_eq!(
            select_candidate_authentication_route(4, 17, &input.resources.native().unwrap()),
            CandidateAuthenticationRoute::DenseSmith,
        );
        assert_eq!(dense_verification_multiply_adds(7, 21), Some(25_382));
        assert_eq!(
            select_candidate_authentication_route(7, 21, &input.resources.native().unwrap()),
            CandidateAuthenticationRoute::CompactSmallSurplus,
        );
    }

    #[test]
    fn route_selector_uses_compact_for_the_opened_failure_shape() {
        let input = request(10_000);
        assert_eq!(dense_verification_multiply_adds(217, 224), Some(85_447_474),);
        assert_eq!(
            select_candidate_authentication_route(217, 224, &input.resources.native().unwrap()),
            CandidateAuthenticationRoute::CompactSmallSurplus,
        );
        assert_eq!(
            dense_verification_multiply_adds(230, 237),
            Some(101_488_876),
        );
        assert_eq!(
            select_candidate_authentication_route(230, 237, &input.resources.native().unwrap()),
            CandidateAuthenticationRoute::CompactSmallSurplus,
        );
    }

    #[test]
    fn route_selector_does_not_use_compact_for_an_inadmissible_surplus_shape() {
        let mut input = request(10_000);
        input.resources.maximum_compact_surplus_rows = 32;
        assert_eq!(
            select_candidate_authentication_route(192, 225, &input.resources.native().unwrap()),
            CandidateAuthenticationRoute::DenseSmith,
        );
    }

    #[test]
    fn route_selector_admits_the_measured_54_surplus_shape() {
        let input = request(10_000);
        assert_eq!(input.resources.maximum_compact_surplus_rows, 64);
        assert_eq!(
            select_candidate_authentication_route(26, 80, &input.resources.native().unwrap()),
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
            &input.resources.native().unwrap()
        ));
        input.resources.maximum_compact_saturation_minor_trials = 0;
        assert!(!candidate_authentication_route_fits(
            230,
            237,
            &input.resources.native().unwrap()
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
        let candidate = receipt.candidate.as_ref().unwrap();
        let completion = receipt.completion.as_ref().unwrap();
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
        let qualified = qualify_with_state(input).unwrap();
        let receipt = &qualified.receipt;
        assert!(receipt.public_complete);
        assert_eq!(receipt.continuation_attempts, None);
        assert_eq!(receipt.preparation.equation_order_index, "3");
        assert_eq!(receipt.relations.factor_base_size, 1_130);
        assert_eq!(receipt.relations.relation_count, 1_144);
        let candidate = receipt.candidate.as_ref().unwrap();
        assert_eq!(candidate.invariant_factors, ["2", "2"]);
        assert_eq!(candidate.class_number, "4");
        assert_eq!(
            candidate.authority,
            "authenticated-collector-sealed-compact-mixed-invariant-presentation"
        );
        let completion = receipt.completion.as_ref().unwrap();
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

        let factor_base = qualified.completed.presentation().collected().factor_base();
        let queried = factor_base
            .exact_ideals
            .iter()
            .enumerate()
            .find(|(index, _)| {
                let mut exponents = vec![Integer::new(); factor_base.exact_ideals.len()];
                exponents[*index] = Integer::from(1);
                !qualified
                    .completed
                    .presentation()
                    .class_map()
                    .presentation()
                    .coordinates(&exponents)
                    .unwrap()
                    .is_zero()
            })
            .map(|(_, ideal)| {
                ideal
                    .basis_rows()
                    .clone()
                    .map(|row| row.map(|entry| entry.to_string()))
            })
            .unwrap();
        let (_, witness) = qualified
            .query_integral_ideal(
                &queried,
                IdealQueryResources {
                    embedding_precision_bits: 320,
                    maximum_candidates: 2_000,
                    maximum_valuation: 64,
                },
            )
            .unwrap();
        assert!(!witness.class_coordinates.iter().all(|value| value == "0"));
        assert!(qualified.compact_replay.get().is_some());
    }
}
