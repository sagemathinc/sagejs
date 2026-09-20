// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Bounded, exactly replayable reduction of an integral cubic ideal.
//!
//! The archimedean cursor proposes a nonzero `alpha` in the input ideal.  No
//! floating-point decision is trusted: quotient valuations are recovered by
//! exact ideal-power containment and the result is accepted only when
//!
//! ```text
//! (alpha) = input * product_j factor_base[j]^exponents[j]
//! ```
//!
//! replays in canonical row HNF.  Equivalently,
//! `input * (alpha)^-1 = product_j factor_base[j]^(-exponents[j])`.

use rug::Integer;
use sha2::{Digest, Sha256};

use crate::class_maps::{
    ClassCoordinates, ClassMapError, PresentationClassMap, PresentationZeroState,
};
use crate::enumeration::{EnumerationError, EnumerationWorkspace};
use crate::numerical_preparation::{
    NumericalPreparationError, PreparedCubicEmbedding, prepare_cubic_ideal,
};
use crate::polynomial_preparation::{PreparedPublicCubic, RustPreparedMaximalCubic};
use crate::prepared::{EmbeddingPrecisionState, ValidatedPreparedCubic};
use crate::prepared_factor_base::{PreparedFactorBase, prepared_maximal_cubic_factor_base};
use crate::prepared_ideal::{
    CubicIdeal, DegreeOnePrimeCharacter, PreparedIdealError, PreparedIdealWorkspace,
};
use crate::prepared_input::NeutralPreparedCubicInput;

const DEGREE: usize = 3;
/// Hard implementation ceiling, applied before factor-base checks or powers.
pub const ARBITRARY_IDEAL_MAXIMUM_VALUATION: u32 = 256;
const ROW6_INPUT_ID: &str =
    "sha256:42ecf93a56de4cc7763d33c8b422e7804582278674c1a6fef41a4799a9930bd5";
const ROW6_SOURCE_SHA256: &str = "91180d1100796b514de61d0e1736521e6e55daadbda851a9f24defc8d3bb70df";
// This authenticates canonical field data, not a class-group answer.
const ROW6_FIELD_DIGEST: &str = "c1999dacb79201d1c00e1798f3a2a38eb4cdadf614147d982da2294b9f27b85a";

/// Sealed proof that class-ideal arithmetic is occurring in a maximal order.
#[derive(Clone, Copy, Debug)]
pub struct MaximalCubicOrder<'a> {
    field: &'a ValidatedPreparedCubic,
}

impl<'a> MaximalCubicOrder<'a> {
    pub fn from_rust_prepared(prepared: &'a RustPreparedMaximalCubic) -> Self {
        Self {
            field: prepared.field(),
        }
    }

    /// Enter exact ideal arithmetic from the bounded public-polynomial
    /// maximal-order proof.
    ///
    /// `PreparedPublicCubic` has no public constructor: it is issued only
    /// after exhaustive local overorder search and retains its replayable
    /// maximal-order certificate.  Keeping this conversion here prevents a
    /// bare `ValidatedPreparedCubic` from minting maximal-order authority.
    pub fn from_public_prepared(prepared: &'a PreparedPublicCubic) -> Self {
        Self {
            field: prepared.field(),
        }
    }

    pub fn field(self) -> &'a ValidatedPreparedCubic {
        self.field
    }
}

/// Explicit upstream assumption used only by the allowlisted row6 qualification.
#[derive(Clone, Copy, Debug)]
pub struct UpstreamAssumedRow6QualificationOrder<'a> {
    field: &'a ValidatedPreparedCubic,
}

impl<'a> UpstreamAssumedRow6QualificationOrder<'a> {
    pub fn from_allowlisted_neutral(
        prepared: &'a NeutralPreparedCubicInput,
    ) -> Result<Self, ArbitraryIdealReductionError> {
        let digest = canonical_field_digest(&prepared.maximal_order_seal.field);
        if prepared.input_id != ROW6_INPUT_ID
            || prepared.source_sha256 != ROW6_SOURCE_SHA256
            || digest != ROW6_FIELD_DIGEST
        {
            return Err(ArbitraryIdealReductionError::UnauthenticatedNeutralInput {
                field_digest: digest,
            });
        }
        Ok(Self {
            field: &prepared.maximal_order_seal.field,
        })
    }

    pub fn field(self) -> &'a ValidatedPreparedCubic {
        self.field
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MaximalOrderEvidenceStatus {
    RustProvedSquarefreeDiscriminant,
    UpstreamAssumedAllowlistedRow6,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SignedClassHandoff {
    pub maximal_order_evidence: MaximalOrderEvidenceStatus,
    pub exponents: Vec<i64>,
}

/// Consumer-replayed class coordinates bound to one exact factor-base order
/// and one verified presentation map.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArbitraryIdealClassMapCertificate {
    pub maximal_order_evidence: MaximalOrderEvidenceStatus,
    pub factor_base_sha256: [u8; 32],
    pub presentation_sha256: [u8; 32],
    /// Binds the exact principal elements replayed when the presentation
    /// authority was minted, not merely the abstract relation matrix.
    pub principal_witnesses_sha256: [u8; 32],
    pub signed_handoff: SignedClassHandoff,
    pub coordinates: ClassCoordinates,
    pub presentation_zero_state: PresentationZeroState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PrincipalRelationWitness {
    pub exponents: Vec<u32>,
    pub principal_element: [Integer; DEGREE],
}

/// Sealed binding between an exact prepared factor-base order, a verified
/// presentation map, and exact principal-ideal witnesses for every relation.
#[derive(Clone, Debug)]
pub struct AuthenticatedPresentationClassMap {
    presentation: PresentationClassMap,
    maximal_order_evidence: MaximalOrderEvidenceStatus,
    factor_base_sha256: [u8; 32],
    principal_witnesses_sha256: [u8; 32],
}

impl AuthenticatedPresentationClassMap {
    pub fn presentation(&self) -> &PresentationClassMap {
        &self.presentation
    }

    pub fn principal_witnesses_sha256(&self) -> &[u8; 32] {
        &self.principal_witnesses_sha256
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArbitraryIdealReductionLimits {
    /// Maximum primitive lattice elements whose quotient norms may be tested.
    pub maximum_candidates: usize,
    /// Maximum admitted valuation of either the input ideal or a candidate.
    pub maximum_valuation: u32,
}

impl Default for ArbitraryIdealReductionLimits {
    fn default() -> Self {
        Self {
            maximum_candidates: 2_000,
            maximum_valuation: 64,
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ArbitraryIdealReductionStatistics {
    pub cursor_trials: usize,
    pub primitive_candidates: usize,
    pub smooth_quotient_norms: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArbitraryIdealReductionCertificate {
    /// Integral-basis coordinates of the certified nonzero `alpha`.
    pub element: [Integer; DEGREE],
    /// Nonnegative exponents in `(alpha) = input * product P_j^exponents[j]`.
    pub quotient_exponents: Vec<u32>,
    pub maximal_order_evidence: MaximalOrderEvidenceStatus,
    pub statistics: ArbitraryIdealReductionStatistics,
}

impl ArbitraryIdealReductionCertificate {
    /// Signed factor-base handoff satisfying `class(input) = -quotient`.
    pub fn signed_class_handoff(&self) -> SignedClassHandoff {
        SignedClassHandoff {
            maximal_order_evidence: self.maximal_order_evidence,
            exponents: self
                .quotient_exponents
                .iter()
                .map(|exponent| -i64::from(*exponent))
                .collect(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ArbitraryIdealReductionError {
    InvalidLimits,
    UnauthenticatedNeutralInput {
        field_digest: String,
    },
    FactorBaseShape,
    InputIsNotAnIdeal,
    NonintegralNormQuotient,
    ValuationLimitExceeded {
        required: u32,
        limit: u32,
    },
    QuotientValuationMismatch {
        prime: i64,
        expected: u32,
        actual: u32,
    },
    CertificateWidth,
    CertificateMismatch,
    ClassMapFactorBaseWidth {
        factor_base: usize,
        presentation: usize,
    },
    ClassMapCertificateMismatch,
    MissingPrincipalRelationWitnesses,
    QualificationCoordinateMapInProductionContext,
    PrincipalRelationWitnessMismatch {
        index: usize,
    },
    PrincipalRelationWitnessExponentLimit {
        relation: usize,
        factor: usize,
        exponent: u32,
        limit: u32,
    },
    CertificateExponentLimit {
        index: usize,
        exponent: u32,
        limit: u32,
    },
    Exhausted(ArbitraryIdealReductionStatistics),
    Enumeration(EnumerationError),
    Numerical(NumericalPreparationError),
    Ideal(PreparedIdealError),
    ClassMap(ClassMapError),
}

impl From<EnumerationError> for ArbitraryIdealReductionError {
    fn from(value: EnumerationError) -> Self {
        Self::Enumeration(value)
    }
}

impl From<NumericalPreparationError> for ArbitraryIdealReductionError {
    fn from(value: NumericalPreparationError) -> Self {
        Self::Numerical(value)
    }
}

impl From<PreparedIdealError> for ArbitraryIdealReductionError {
    fn from(value: PreparedIdealError) -> Self {
        Self::Ideal(value)
    }
}

impl From<ClassMapError> for ArbitraryIdealReductionError {
    fn from(value: ClassMapError) -> Self {
        Self::ClassMap(value)
    }
}

/// Search the authenticated small-norm lattice of an arbitrary integral ideal.
///
/// Exhausting either the exact candidate budget or the finite cursor returns
/// [`ArbitraryIdealReductionError::Exhausted`]; no partial certificate is
/// published.
pub fn reduce_arbitrary_cubic_ideal(
    order: MaximalCubicOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    embedding: &PreparedCubicEmbedding,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<ArbitraryIdealReductionCertificate, ArbitraryIdealReductionError> {
    reduce_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::RustProvedSquarefreeDiscriminant,
        input,
        factor_base,
        embedding,
        limits,
        workspace,
    )
}

pub fn reduce_upstream_assumed_arbitrary_cubic_ideal(
    order: UpstreamAssumedRow6QualificationOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    embedding: &PreparedCubicEmbedding,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<ArbitraryIdealReductionCertificate, ArbitraryIdealReductionError> {
    reduce_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::UpstreamAssumedAllowlistedRow6,
        input,
        factor_base,
        embedding,
        limits,
        workspace,
    )
}

fn reduce_with_context(
    field: &ValidatedPreparedCubic,
    evidence: MaximalOrderEvidenceStatus,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    embedding: &PreparedCubicEmbedding,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<ArbitraryIdealReductionCertificate, ArbitraryIdealReductionError> {
    if limits.maximum_valuation == 0 || limits.maximum_valuation > ARBITRARY_IDEAL_MAXIMUM_VALUATION
    {
        return Err(ArbitraryIdealReductionError::InvalidLimits);
    }
    validate_factor_base(field, factor_base, workspace)?;
    let input = canonical_validated_ideal(field, input, workspace)?;

    let prepared = prepare_cubic_ideal(embedding, &input)?;
    let mut enumeration = EnumerationWorkspace::new(DEGREE);
    enumeration.reset(&prepared.q, &prepared.v)?;
    let mut statistics = ArbitraryIdealReductionStatistics::default();

    while statistics.primitive_candidates < limits.maximum_candidates
        && enumeration.next(prepared.bound, false)?
    {
        let coordinates = &enumeration.coordinates()[1..=DEGREE];
        if coordinates.iter().all(|value| *value == 0) || gcd_coordinates(coordinates) != 1 {
            continue;
        }
        statistics.primitive_candidates += 1;
        let element: [Integer; DEGREE] = std::array::from_fn(|row| {
            let mut value = Integer::new();
            for column in 0..DEGREE {
                value += &prepared.ideal[(row, column)] * coordinates[column];
            }
            value
        });
        let norm = field.norm(&element).abs();
        if norm == 0 {
            continue;
        }
        let input_norm = input.norm();
        let remainder = norm.clone() % &input_norm;
        if remainder != 0 {
            return Err(ArbitraryIdealReductionError::NonintegralNormQuotient);
        }
        let quotient_norm = norm / &input_norm;
        let Some(rational_factors) = factor_over_catalog(&quotient_norm, factor_base) else {
            continue;
        };
        statistics.smooth_quotient_norms += 1;
        let exponents = quotient_exponents(
            field,
            &input,
            &element,
            &rational_factors,
            factor_base,
            limits.maximum_valuation,
            workspace,
        )?;
        statistics.cursor_trials = enumeration.trials();
        let certificate = ArbitraryIdealReductionCertificate {
            element,
            quotient_exponents: exponents,
            maximal_order_evidence: evidence,
            statistics: statistics.clone(),
        };
        replay_with_context(
            field,
            evidence,
            &input,
            factor_base,
            &certificate,
            limits,
            workspace,
        )?;
        return Ok(certificate);
    }
    statistics.cursor_trials = enumeration.trials();
    Err(ArbitraryIdealReductionError::Exhausted(statistics))
}

/// Independently replay a reduction certificate with exact ideal arithmetic.
pub fn replay_arbitrary_ideal_reduction(
    order: MaximalCubicOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    certificate: &ArbitraryIdealReductionCertificate,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<(), ArbitraryIdealReductionError> {
    replay_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::RustProvedSquarefreeDiscriminant,
        input,
        factor_base,
        certificate,
        limits,
        workspace,
    )
}

pub fn replay_upstream_assumed_arbitrary_ideal_reduction(
    order: UpstreamAssumedRow6QualificationOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    certificate: &ArbitraryIdealReductionCertificate,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<(), ArbitraryIdealReductionError> {
    replay_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::UpstreamAssumedAllowlistedRow6,
        input,
        factor_base,
        certificate,
        limits,
        workspace,
    )
}

pub fn authenticate_presentation_class_map(
    order: MaximalCubicOrder<'_>,
    factor_base: &PreparedFactorBase,
    presentation: PresentationClassMap,
    witnesses: &[PrincipalRelationWitness],
    workspace: &mut PreparedIdealWorkspace,
) -> Result<AuthenticatedPresentationClassMap, ArbitraryIdealReductionError> {
    authenticate_presentation_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::RustProvedSquarefreeDiscriminant,
        factor_base,
        presentation,
        witnesses,
        workspace,
    )
}

pub fn authenticate_upstream_assumed_row6_presentation_class_map(
    order: UpstreamAssumedRow6QualificationOrder<'_>,
    factor_base: &PreparedFactorBase,
    presentation: PresentationClassMap,
    witnesses: &[PrincipalRelationWitness],
    workspace: &mut PreparedIdealWorkspace,
) -> Result<AuthenticatedPresentationClassMap, ArbitraryIdealReductionError> {
    authenticate_presentation_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::UpstreamAssumedAllowlistedRow6,
        factor_base,
        presentation,
        witnesses,
        workspace,
    )
}

fn authenticate_presentation_with_context(
    field: &ValidatedPreparedCubic,
    evidence: MaximalOrderEvidenceStatus,
    factor_base: &PreparedFactorBase,
    presentation: PresentationClassMap,
    witnesses: &[PrincipalRelationWitness],
    workspace: &mut PreparedIdealWorkspace,
) -> Result<AuthenticatedPresentationClassMap, ArbitraryIdealReductionError> {
    // This is deliberately the first operation. Witnesses are public input,
    // and neither malformed presentation/base data nor a later relation
    // mismatch may allow an attacker-controlled exponent to reach ideal_pow.
    if let Some((relation, factor, exponent)) =
        witnesses
            .iter()
            .enumerate()
            .find_map(|(relation, witness)| {
                witness
                    .exponents
                    .iter()
                    .copied()
                    .enumerate()
                    .find(|(_, exponent)| *exponent > ARBITRARY_IDEAL_MAXIMUM_VALUATION)
                    .map(|(factor, exponent)| (relation, factor, exponent))
            })
    {
        return Err(
            ArbitraryIdealReductionError::PrincipalRelationWitnessExponentLimit {
                relation,
                factor,
                exponent,
                limit: ARBITRARY_IDEAL_MAXIMUM_VALUATION,
            },
        );
    }
    if evidence == MaximalOrderEvidenceStatus::RustProvedSquarefreeDiscriminant
        && presentation.uses_external_generator_coordinates()
    {
        // An externally retained coordinate table is qualification evidence,
        // not a Smith proof derived by this Rust process. Production maximal-
        // order contexts accept only the exact Smith-backed constructors.
        return Err(ArbitraryIdealReductionError::QualificationCoordinateMapInProductionContext);
    }
    validate_factor_base(field, factor_base, workspace)?;
    if presentation.generator_count() != factor_base.exact_ideals.len() {
        return Err(ArbitraryIdealReductionError::ClassMapFactorBaseWidth {
            factor_base: factor_base.exact_ideals.len(),
            presentation: presentation.generator_count(),
        });
    }
    if witnesses.is_empty() || witnesses.len() != presentation.relation_count() {
        return Err(ArbitraryIdealReductionError::MissingPrincipalRelationWitnesses);
    }
    let mut witness_hasher = Sha256::new();
    witness_hasher.update(b"sagejs.principal-relation-witnesses/v1\0");
    witness_hasher.update((witnesses.len() as u64).to_le_bytes());
    for (index, witness) in witnesses.iter().enumerate() {
        let relation = presentation.relation_vector(index)?;
        if witness.exponents.len() != relation.len()
            || witness
                .exponents
                .iter()
                .zip(&relation)
                .any(|(expected, actual)| actual != expected)
            || witness.principal_element.iter().all(|value| value == &0)
        {
            return Err(ArbitraryIdealReductionError::PrincipalRelationWitnessMismatch { index });
        }
        let mut product = CubicIdeal::unit();
        for (prime, exponent) in factor_base.exact_ideals.iter().zip(&witness.exponents) {
            witness_hasher.update(exponent.to_le_bytes());
            if *exponent != 0 {
                let power = ideal_pow(field, prime, *exponent, workspace)?;
                product = workspace.multiply(field, &product, &power)?;
            }
        }
        for coordinate in &witness.principal_element {
            let bytes = coordinate.to_string();
            witness_hasher.update((bytes.len() as u64).to_le_bytes());
            witness_hasher.update(bytes.as_bytes());
        }
        let principal = principal_ideal(field, &witness.principal_element, workspace)?;
        if product != principal {
            return Err(ArbitraryIdealReductionError::PrincipalRelationWitnessMismatch { index });
        }
    }
    presentation.verify_all_relations_map_to_zero()?;
    Ok(AuthenticatedPresentationClassMap {
        presentation,
        maximal_order_evidence: evidence,
        factor_base_sha256: factor_base_binding_sha256(factor_base),
        principal_witnesses_sha256: witness_hasher.finalize().into(),
    })
}

/// Replay an arbitrary-ideal certificate and map its signed factor-base vector
/// through a verified relation presentation.
pub fn map_arbitrary_cubic_ideal_class(
    order: MaximalCubicOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    reduction: &ArbitraryIdealReductionCertificate,
    authority: &AuthenticatedPresentationClassMap,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<ArbitraryIdealClassMapCertificate, ArbitraryIdealReductionError> {
    map_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::RustProvedSquarefreeDiscriminant,
        input,
        factor_base,
        reduction,
        authority,
        limits,
        workspace,
    )
}

pub fn map_upstream_assumed_arbitrary_cubic_ideal_class(
    order: UpstreamAssumedRow6QualificationOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    reduction: &ArbitraryIdealReductionCertificate,
    authority: &AuthenticatedPresentationClassMap,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<ArbitraryIdealClassMapCertificate, ArbitraryIdealReductionError> {
    map_with_context(
        order.field(),
        MaximalOrderEvidenceStatus::UpstreamAssumedAllowlistedRow6,
        input,
        factor_base,
        reduction,
        authority,
        limits,
        workspace,
    )
}

/// Recompute exact reduction replay, presentation coordinates, and
/// principality state, then compare every binding carried by `claimed`.
pub fn replay_arbitrary_cubic_ideal_class_map(
    order: MaximalCubicOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    reduction: &ArbitraryIdealReductionCertificate,
    authority: &AuthenticatedPresentationClassMap,
    claimed: &ArbitraryIdealClassMapCertificate,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<(), ArbitraryIdealReductionError> {
    let replayed = map_arbitrary_cubic_ideal_class(
        order,
        input,
        factor_base,
        reduction,
        authority,
        limits,
        workspace,
    )?;
    if &replayed != claimed {
        return Err(ArbitraryIdealReductionError::ClassMapCertificateMismatch);
    }
    Ok(())
}

pub fn replay_upstream_assumed_arbitrary_cubic_ideal_class_map(
    order: UpstreamAssumedRow6QualificationOrder<'_>,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    reduction: &ArbitraryIdealReductionCertificate,
    authority: &AuthenticatedPresentationClassMap,
    claimed: &ArbitraryIdealClassMapCertificate,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<(), ArbitraryIdealReductionError> {
    let replayed = map_upstream_assumed_arbitrary_cubic_ideal_class(
        order,
        input,
        factor_base,
        reduction,
        authority,
        limits,
        workspace,
    )?;
    if &replayed != claimed {
        return Err(ArbitraryIdealReductionError::ClassMapCertificateMismatch);
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn map_with_context(
    field: &ValidatedPreparedCubic,
    evidence: MaximalOrderEvidenceStatus,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    reduction: &ArbitraryIdealReductionCertificate,
    authority: &AuthenticatedPresentationClassMap,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<ArbitraryIdealClassMapCertificate, ArbitraryIdealReductionError> {
    replay_with_context(
        field,
        evidence,
        input,
        factor_base,
        reduction,
        limits,
        workspace,
    )?;
    if authority.maximal_order_evidence != evidence
        || authority.factor_base_sha256 != factor_base_binding_sha256(factor_base)
    {
        return Err(ArbitraryIdealReductionError::ClassMapCertificateMismatch);
    }
    let presentation = &authority.presentation;
    if presentation.generator_count() != factor_base.exact_ideals.len() {
        return Err(ArbitraryIdealReductionError::ClassMapFactorBaseWidth {
            factor_base: factor_base.exact_ideals.len(),
            presentation: presentation.generator_count(),
        });
    }
    let signed_handoff = reduction.signed_class_handoff();
    let exponents = signed_handoff
        .exponents
        .iter()
        .copied()
        .map(Integer::from)
        .collect::<Vec<_>>();
    let coordinates = presentation.coordinates(&exponents)?;
    let presentation_zero_state = presentation.presentation_zero_state(&exponents)?;
    Ok(ArbitraryIdealClassMapCertificate {
        maximal_order_evidence: evidence,
        factor_base_sha256: factor_base_binding_sha256(factor_base),
        presentation_sha256: presentation.binding_sha256(),
        principal_witnesses_sha256: authority.principal_witnesses_sha256,
        signed_handoff,
        coordinates,
        presentation_zero_state,
    })
}

fn replay_with_context(
    field: &ValidatedPreparedCubic,
    evidence: MaximalOrderEvidenceStatus,
    input: &CubicIdeal,
    factor_base: &PreparedFactorBase,
    certificate: &ArbitraryIdealReductionCertificate,
    limits: ArbitraryIdealReductionLimits,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<(), ArbitraryIdealReductionError> {
    if limits.maximum_valuation == 0 || limits.maximum_valuation > ARBITRARY_IDEAL_MAXIMUM_VALUATION
    {
        return Err(ArbitraryIdealReductionError::InvalidLimits);
    }
    if certificate.quotient_exponents.len() != factor_base.exact_ideals.len() {
        return Err(ArbitraryIdealReductionError::CertificateWidth);
    }
    if let Some((index, exponent)) = certificate
        .quotient_exponents
        .iter()
        .copied()
        .enumerate()
        .find(|(_, exponent)| *exponent > limits.maximum_valuation)
    {
        return Err(ArbitraryIdealReductionError::CertificateExponentLimit {
            index,
            exponent,
            limit: limits.maximum_valuation,
        });
    }
    if certificate.element.iter().all(|value| value == &0) {
        return Err(ArbitraryIdealReductionError::CertificateMismatch);
    }
    if certificate.maximal_order_evidence != evidence {
        return Err(ArbitraryIdealReductionError::CertificateMismatch);
    }
    validate_factor_base(field, factor_base, workspace)?;
    let input = canonical_validated_ideal(field, input, workspace)?;
    let mut expected_norm = input.norm();
    for (descriptor, exponent) in factor_base
        .catalog
        .ideals
        .iter()
        .zip(&certificate.quotient_exponents)
    {
        expected_norm *= integer_pow(Integer::from(descriptor.norm), *exponent);
    }
    if field.norm(&certificate.element).abs() != expected_norm {
        return Err(ArbitraryIdealReductionError::CertificateMismatch);
    }
    let mut right = input;
    for (prime, exponent) in factor_base
        .exact_ideals
        .iter()
        .zip(&certificate.quotient_exponents)
    {
        if *exponent != 0 {
            let power = ideal_pow(field, prime, *exponent, workspace)?;
            right = workspace.multiply(field, &right, &power)?;
        }
    }
    let principal = principal_ideal(field, &certificate.element, workspace)?;
    if right != principal {
        return Err(ArbitraryIdealReductionError::CertificateMismatch);
    }
    Ok(())
}

fn validate_factor_base(
    field: &ValidatedPreparedCubic,
    factor_base: &PreparedFactorBase,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<(), ArbitraryIdealReductionError> {
    let catalog = &factor_base.catalog;
    if factor_base.exact_ideals.len() != catalog.ideals.len()
        || catalog.rational_primes.len() != catalog.rational_offsets.len()
        || catalog.rational_primes.len() != catalog.rational_counts.len()
        || catalog.rational_primes.len() != catalog.complete_groups.len()
        || catalog.rational_primes.iter().any(|prime| *prime < 2)
        || catalog
            .rational_primes
            .windows(2)
            .any(|pair| pair[0] >= pair[1])
    {
        return Err(ArbitraryIdealReductionError::FactorBaseShape);
    }
    let authenticated = prepared_maximal_cubic_factor_base(field)
        .map_err(|_| ArbitraryIdealReductionError::FactorBaseShape)?;
    if authenticated.catalog != factor_base.catalog
        || authenticated.exact_ideals != factor_base.exact_ideals
    {
        return Err(ArbitraryIdealReductionError::FactorBaseShape);
    }
    let mut expected_offset = 0_usize;
    for group in 0..catalog.rational_primes.len() {
        let prime = catalog.rational_primes[group];
        let offset = catalog.rational_offsets[group];
        let count = catalog.rational_counts[group];
        let Some(end) = offset.checked_add(count) else {
            return Err(ArbitraryIdealReductionError::FactorBaseShape);
        };
        if count == 0 || offset != expected_offset || end > catalog.ideals.len() {
            return Err(ArbitraryIdealReductionError::FactorBaseShape);
        }
        if catalog.ideals[offset..end].windows(2).any(|pair| {
            (pair[0].residue_degree, pair[0].generator)
                >= (pair[1].residue_degree, pair[1].generator)
        }) {
            return Err(ArbitraryIdealReductionError::FactorBaseShape);
        }
        for index in offset..end {
            let descriptor = &catalog.ideals[index];
            if descriptor.prime != prime
                || descriptor.ramification == 0
                || !(1..=DEGREE).contains(&descriptor.residue_degree)
                || descriptor.tau != [0; DEGREE * DEGREE]
            {
                return Err(ArbitraryIdealReductionError::FactorBaseShape);
            }
            let mut expected_norm = Integer::from(1);
            for _ in 0..descriptor.residue_degree {
                expected_norm *= prime;
            }
            // Prime-ideal norms in a cubic factor base fit in signed words.
            if descriptor.norm <= 0
                || Integer::from(descriptor.norm) != expected_norm
                || factor_base.exact_ideals[index].norm() != descriptor.norm
            {
                return Err(ArbitraryIdealReductionError::FactorBaseShape);
            }
            let exact_rows = factor_base.exact_ideals[index].basis_rows();
            let mut published_hnf = [0_i64; DEGREE * DEGREE];
            for cell in 0..published_hnf.len() {
                published_hnf[cell] = exact_rows[cell / DEGREE][cell % DEGREE]
                    .to_i64()
                    .ok_or(ArbitraryIdealReductionError::FactorBaseShape)?;
            }
            if descriptor.hnf != published_hnf {
                return Err(ArbitraryIdealReductionError::FactorBaseShape);
            }
            let generator = descriptor.generator.map(Integer::from);
            let canonical_exact = workspace.from_generators(exact_rows)?;
            let is_index_prime = field
                .data()
                .index_primes
                .iter()
                .any(|index_prime| index_prime == &prime);
            if is_index_prime {
                let rational_prime = u32::try_from(prime)
                    .map_err(|_| ArbitraryIdealReductionError::FactorBaseShape)?;
                if rational_prime > 257 {
                    return Err(ArbitraryIdealReductionError::FactorBaseShape);
                }
                let Some(first_image) = descriptor.generator[0]
                    .checked_neg()
                    .and_then(|value| u32::try_from(value).ok())
                    .filter(|value| *value < rational_prime)
                else {
                    return Err(ArbitraryIdealReductionError::FactorBaseShape);
                };
                if descriptor.generator[1..] != [1, 0]
                    || !(0..rational_prime).any(|second_image| {
                        DegreeOnePrimeCharacter::validate(
                            field,
                            rational_prime,
                            [1, first_image, second_image],
                        )
                        .ok()
                        .and_then(|character| {
                            workspace
                                .from_generators(character.kernel().basis_rows())
                                .ok()
                        })
                        .is_some_and(|kernel| kernel == canonical_exact)
                    })
                {
                    return Err(ArbitraryIdealReductionError::FactorBaseShape);
                }
            } else {
                let reconstructed = workspace.prime_from_generator(
                    field,
                    u32::try_from(prime)
                        .map_err(|_| ArbitraryIdealReductionError::FactorBaseShape)?,
                    &generator,
                )?;
                if reconstructed != canonical_exact {
                    return Err(ArbitraryIdealReductionError::FactorBaseShape);
                }
            }
        }
        expected_offset = end;
    }
    if expected_offset != catalog.ideals.len() {
        return Err(ArbitraryIdealReductionError::FactorBaseShape);
    }
    Ok(())
}

fn canonical_validated_ideal(
    field: &ValidatedPreparedCubic,
    ideal: &CubicIdeal,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<CubicIdeal, ArbitraryIdealReductionError> {
    if ideal.norm() == 0 {
        return Err(ArbitraryIdealReductionError::InputIsNotAnIdeal);
    }
    for generator in ideal.basis_rows() {
        for basis_index in 0..DEGREE {
            let basis = std::array::from_fn(|index| Integer::from(u8::from(index == basis_index)));
            let product = field.multiply_coordinates(generator, &basis);
            if !ideal.contains(&product)? {
                return Err(ArbitraryIdealReductionError::InputIsNotAnIdeal);
            }
        }
    }
    Ok(workspace.from_generators(ideal.basis_rows())?)
}

fn factor_over_catalog(
    value: &Integer,
    factor_base: &PreparedFactorBase,
) -> Option<Vec<(i64, u32)>> {
    let mut remaining = value.clone();
    let mut answer = Vec::new();
    for &prime in &factor_base.catalog.rational_primes {
        let mut exponent = 0_u32;
        while remaining.clone() % prime == 0 {
            remaining /= prime;
            exponent = exponent.checked_add(1)?;
        }
        if exponent != 0 {
            answer.push((prime, exponent));
        }
    }
    (remaining == 1).then_some(answer)
}

#[allow(clippy::too_many_arguments)]
fn quotient_exponents(
    field: &ValidatedPreparedCubic,
    input: &CubicIdeal,
    element: &[Integer; DEGREE],
    rational_factors: &[(i64, u32)],
    factor_base: &PreparedFactorBase,
    limit: u32,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<Vec<u32>, ArbitraryIdealReductionError> {
    let mut answer = vec![0_u32; factor_base.exact_ideals.len()];
    let input_norm = input.norm();
    for &(prime, quotient_norm_exponent) in rational_factors {
        let group = factor_base
            .catalog
            .rational_primes
            .binary_search(&prime)
            .map_err(|_| ArbitraryIdealReductionError::FactorBaseShape)?;
        if !factor_base.catalog.complete_groups[group] {
            return Err(ArbitraryIdealReductionError::QuotientValuationMismatch {
                prime,
                expected: quotient_norm_exponent,
                actual: 0,
            });
        }
        let input_norm_exponent = integer_valuation(&input_norm, prime);
        let offset = factor_base.catalog.rational_offsets[group];
        let count = factor_base.catalog.rational_counts[group];
        let mut accounted = 0_u32;
        for index in offset..offset + count {
            let residue_degree = u32::try_from(factor_base.catalog.ideals[index].residue_degree)
                .map_err(|_| ArbitraryIdealReductionError::FactorBaseShape)?;
            let input_cap = input_norm_exponent / residue_degree;
            let element_cap = input_cap
                .checked_add(quotient_norm_exponent / residue_degree)
                .ok_or(ArbitraryIdealReductionError::ValuationLimitExceeded {
                    required: u32::MAX,
                    limit,
                })?;
            if element_cap > limit {
                return Err(ArbitraryIdealReductionError::ValuationLimitExceeded {
                    required: element_cap,
                    limit,
                });
            }
            let input_valuation = ideal_valuation(
                field,
                input,
                &factor_base.exact_ideals[index],
                input_cap,
                workspace,
            )?;
            let element_valuation = workspace.valuation_capped_by_norm(
                field,
                &factor_base.exact_ideals[index],
                element,
                element_cap,
            )?;
            let quotient = element_valuation.checked_sub(input_valuation).ok_or(
                ArbitraryIdealReductionError::QuotientValuationMismatch {
                    prime,
                    expected: quotient_norm_exponent,
                    actual: accounted,
                },
            )?;
            answer[index] = quotient;
            accounted = accounted
                .checked_add(
                    residue_degree
                        .checked_mul(quotient)
                        .ok_or(ArbitraryIdealReductionError::FactorBaseShape)?,
                )
                .ok_or(ArbitraryIdealReductionError::FactorBaseShape)?;
        }
        if accounted != quotient_norm_exponent {
            return Err(ArbitraryIdealReductionError::QuotientValuationMismatch {
                prime,
                expected: quotient_norm_exponent,
                actual: accounted,
            });
        }
    }
    Ok(answer)
}

fn ideal_valuation(
    field: &ValidatedPreparedCubic,
    ideal: &CubicIdeal,
    prime: &CubicIdeal,
    cap: u32,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<u32, PreparedIdealError> {
    if cap == 0 {
        return Ok(0);
    }
    let mut power = prime.clone();
    for valuation in 0..cap {
        let mut contained = true;
        for generator in ideal.basis_rows() {
            if !power.contains(generator)? {
                contained = false;
                break;
            }
        }
        if !contained {
            return Ok(valuation);
        }
        if valuation + 1 == cap {
            return Ok(cap);
        }
        power = workspace.multiply(field, &power, prime)?;
    }
    unreachable!()
}

fn principal_ideal(
    field: &ValidatedPreparedCubic,
    element: &[Integer; DEGREE],
    workspace: &mut PreparedIdealWorkspace,
) -> Result<CubicIdeal, PreparedIdealError> {
    let generators: [[Integer; DEGREE]; DEGREE] = std::array::from_fn(|index| {
        let basis = std::array::from_fn(|coordinate| Integer::from(u8::from(index == coordinate)));
        field.multiply_coordinates(element, &basis)
    });
    workspace.from_generators(&generators)
}

fn ideal_pow(
    field: &ValidatedPreparedCubic,
    ideal: &CubicIdeal,
    mut exponent: u32,
    workspace: &mut PreparedIdealWorkspace,
) -> Result<CubicIdeal, PreparedIdealError> {
    let mut answer = CubicIdeal::unit();
    let mut power = ideal.clone();
    while exponent != 0 {
        if exponent & 1 != 0 {
            answer = workspace.multiply(field, &answer, &power)?;
        }
        exponent >>= 1;
        if exponent != 0 {
            power = workspace.multiply(field, &power, &power)?;
        }
    }
    Ok(answer)
}

fn integer_pow(mut base: Integer, mut exponent: u32) -> Integer {
    let mut answer = Integer::from(1);
    while exponent != 0 {
        if exponent & 1 != 0 {
            answer *= &base;
        }
        exponent >>= 1;
        if exponent != 0 {
            base.square_mut();
        }
    }
    answer
}

fn factor_base_binding_sha256(factor_base: &PreparedFactorBase) -> [u8; 32] {
    fn usize_value(hasher: &mut Sha256, value: usize) {
        hasher.update((value as u64).to_le_bytes());
    }
    fn i64_value(hasher: &mut Sha256, value: i64) {
        hasher.update(value.to_le_bytes());
    }
    fn integer(hasher: &mut Sha256, value: &Integer) {
        let bytes = value.to_string();
        usize_value(hasher, bytes.len());
        hasher.update(bytes.as_bytes());
    }

    let catalog = &factor_base.catalog;
    let mut hasher = Sha256::new();
    hasher.update(b"sagejs.prepared-cubic-factor-base/v1\0");
    usize_value(&mut hasher, catalog.relation_bound);
    usize_value(&mut hasher, catalog.checking_bound);
    usize_value(&mut hasher, catalog.ideals.len());
    for (descriptor, ideal) in catalog.ideals.iter().zip(&factor_base.exact_ideals) {
        i64_value(&mut hasher, descriptor.prime);
        usize_value(&mut hasher, descriptor.ramification);
        usize_value(&mut hasher, descriptor.residue_degree);
        for value in descriptor.generator {
            i64_value(&mut hasher, value);
        }
        for value in descriptor.tau {
            i64_value(&mut hasher, value);
        }
        for value in descriptor.hnf {
            i64_value(&mut hasher, value);
        }
        i64_value(&mut hasher, descriptor.norm);
        for row in ideal.basis_rows() {
            for value in row {
                integer(&mut hasher, value);
            }
        }
    }
    usize_value(&mut hasher, catalog.rational_primes.len());
    for &value in &catalog.rational_primes {
        i64_value(&mut hasher, value);
    }
    for &value in &catalog.rational_offsets {
        usize_value(&mut hasher, value);
    }
    for &value in &catalog.rational_counts {
        usize_value(&mut hasher, value);
    }
    hasher.update(
        catalog
            .complete_groups
            .iter()
            .map(|value| u8::from(*value))
            .collect::<Vec<_>>(),
    );
    hasher.finalize().into()
}

fn canonical_field_digest(field: &ValidatedPreparedCubic) -> String {
    fn bytes(hasher: &mut Sha256, value: &[u8]) {
        hasher.update((value.len() as u64).to_le_bytes());
        hasher.update(value);
    }
    fn integer(hasher: &mut Sha256, value: &Integer) {
        bytes(hasher, value.to_string().as_bytes());
    }

    let data = field.data();
    let mut hasher = Sha256::new();
    hasher.update(b"sagejs.maximal-cubic-field-data/v1\0");
    for value in &data.polynomial_ascending {
        integer(&mut hasher, value);
    }
    hasher.update(data.irreducibility_prime.to_le_bytes());
    for value in &data.integral_basis_numerators {
        integer(&mut hasher, value);
    }
    integer(&mut hasher, &data.basis_denominator);
    for value in &data.multiplication_table {
        integer(&mut hasher, value);
    }
    integer(&mut hasher, &data.discriminant);
    hasher.update([data.signature.0, data.signature.1]);
    match &data.embedding_precision {
        EmbeddingPrecisionState::Pending { target_bits } => {
            hasher.update([0]);
            hasher.update(target_bits.to_le_bytes());
        }
        EmbeddingPrecisionState::Certified {
            target_bits,
            working_bits,
            certified_bits,
        } => {
            hasher.update([1]);
            hasher.update(target_bits.to_le_bytes());
            hasher.update(working_bits.to_le_bytes());
            hasher.update(certified_bits.to_le_bytes());
        }
    }
    hasher.update((data.index_primes.len() as u64).to_le_bytes());
    for value in &data.index_primes {
        integer(&mut hasher, value);
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn integer_valuation(value: &Integer, prime: i64) -> u32 {
    let mut remaining = value.clone();
    let mut exponent = 0;
    while remaining.clone() % prime == 0 {
        remaining /= prime;
        exponent += 1;
    }
    exponent
}

fn gcd_coordinates(values: &[i64]) -> u64 {
    values.iter().copied().fold(0, |mut left, right| {
        let mut right = right.unsigned_abs();
        while right != 0 {
            (left, right) = (right, left % right);
        }
        left
    })
}
