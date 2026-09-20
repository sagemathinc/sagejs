use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    ARBITRARY_IDEAL_MAXIMUM_VALUATION, ArbitraryIdealReductionCertificate,
    ArbitraryIdealReductionError, ArbitraryIdealReductionLimits, AuthenticatedPresentationClassMap,
    BigIntMatrix, CubicIdeal, DegreeOnePrimeCharacter, ExactNormalFormWorkspace, MaximalCubicOrder,
    MaximalOrderEvidenceStatus, NeutralPreparedCubicInput, NormalFormLimits,
    PreparedCubicEmbedding, PreparedFactorBase, PreparedIdealWorkspace, PresentationClassMap,
    PresentationZeroState, PrincipalElementWitnessState, PrincipalRelationWitness,
    PublicCubicPreparationLimits, RustPreparedMaximalCubic, UpstreamAssumedRow6QualificationOrder,
    ValidatedPreparedCubic, authenticate_presentation_class_map,
    authenticate_upstream_assumed_row6_presentation_class_map, map_arbitrary_cubic_ideal_class,
    map_upstream_assumed_arbitrary_cubic_ideal_class, parse_neutral_prepared_cubic_json,
    prepare_squarefree_discriminant_monic_cubic, prepared_maximal_cubic_factor_base,
    reduce_arbitrary_cubic_ideal, reduce_upstream_assumed_arbitrary_cubic_ideal,
    replay_arbitrary_cubic_ideal_class_map, replay_arbitrary_ideal_reduction,
    replay_upstream_assumed_arbitrary_cubic_ideal_class_map,
    replay_upstream_assumed_arbitrary_ideal_reduction,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};

const ROW6_INPUT_ID_FOR_TEST: &str =
    "sha256:42ecf93a56de4cc7763d33c8b422e7804582278674c1a6fef41a4799a9930bd5";
const ROW6_AUTHORITY_SHA256: &str =
    "42fb95f3b8c42c2cd59071d679b18d25b5c1ea9f0b53ded83865cd922d056b43";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorityFixture {
    schema: String,
    source_input_id: String,
    source_artifact_sha256: String,
    compact_certificate_sha256: String,
    invariant_factors: Vec<i64>,
    generator_major_coordinates: Vec<Vec<i64>>,
    factor_base_catalog: Vec<AuthorityCatalogEntry>,
    relation_records: Vec<AuthorityRelation>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorityCatalogEntry {
    factor_base_index_zero_based: usize,
    generator: [i64; 3],
    hnf: [i64; 9],
    norm: i64,
    prime: i64,
    ramification: usize,
    residue_degree: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorityRelation {
    integral_basis_coordinates: [String; 3],
    prime_ideal_factors: Vec<AuthorityRelationFactor>,
    relation_index_zero_based: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AuthorityRelationFactor {
    exponent: u32,
    factor_base_index_zero_based: usize,
}

#[derive(Clone, Copy)]
enum TestOrder<'a> {
    Proved(MaximalCubicOrder<'a>),
    Assumed(UpstreamAssumedRow6QualificationOrder<'a>),
}

impl TestOrder<'_> {
    fn reduce(
        self,
        input: &CubicIdeal,
        base: &PreparedFactorBase,
        embedding: &PreparedCubicEmbedding,
        limits: ArbitraryIdealReductionLimits,
        workspace: &mut PreparedIdealWorkspace,
    ) -> Result<ArbitraryIdealReductionCertificate, ArbitraryIdealReductionError> {
        match self {
            Self::Proved(order) => {
                reduce_arbitrary_cubic_ideal(order, input, base, embedding, limits, workspace)
            }
            Self::Assumed(order) => reduce_upstream_assumed_arbitrary_cubic_ideal(
                order, input, base, embedding, limits, workspace,
            ),
        }
    }

    fn replay(
        self,
        input: &CubicIdeal,
        base: &PreparedFactorBase,
        certificate: &ArbitraryIdealReductionCertificate,
        limits: ArbitraryIdealReductionLimits,
        workspace: &mut PreparedIdealWorkspace,
    ) -> Result<(), ArbitraryIdealReductionError> {
        match self {
            Self::Proved(order) => {
                replay_arbitrary_ideal_reduction(order, input, base, certificate, limits, workspace)
            }
            Self::Assumed(order) => replay_upstream_assumed_arbitrary_ideal_reduction(
                order,
                input,
                base,
                certificate,
                limits,
                workspace,
            ),
        }
    }
}

fn row6_input() -> NeutralPreparedCubicInput {
    parse_neutral_prepared_cubic_json(include_str!(
        "../qualification/row6-candidate/inputs/row6-neutral-prepared-field.json"
    ))
    .unwrap()
}

fn row6_presentation_fixture(
    base: &PreparedFactorBase,
) -> (PresentationClassMap, Vec<PrincipalRelationWitness>) {
    let source = include_bytes!(
        "../qualification/arbitrary-ideal-reduction/evidence/row6-map-authority.json"
    );
    assert_eq!(
        format!("{:x}", Sha256::digest(source)),
        ROW6_AUTHORITY_SHA256
    );
    let fixture: AuthorityFixture = serde_json::from_slice(source).unwrap();
    assert_eq!(
        fixture.schema,
        "sagejs.rust-class-group/arbitrary-ideal-map-authority-v1"
    );
    assert_eq!(fixture.source_input_id, ROW6_INPUT_ID_FOR_TEST);
    assert_eq!(
        fixture.source_artifact_sha256,
        "99a848722b9dfd13d938a036a20fce9152caf601bfd37c8927f211d3d3b8ea8e"
    );
    assert_eq!(
        fixture.compact_certificate_sha256,
        "ce85dcbcfdae9e73f6fe789f8712c463765295c7f41749c0d6950f53127cfaf2"
    );
    assert_eq!(fixture.factor_base_catalog.len(), base.catalog.ideals.len());
    for (index, (actual, expected)) in base
        .catalog
        .ideals
        .iter()
        .zip(&fixture.factor_base_catalog)
        .enumerate()
    {
        assert_eq!(expected.factor_base_index_zero_based, index);
        assert_eq!(expected.generator, actual.generator);
        assert_eq!(expected.hnf, actual.hnf);
        assert_eq!(expected.norm, actual.norm);
        assert_eq!(expected.prime, actual.prime);
        assert_eq!(expected.ramification, actual.ramification);
        assert_eq!(expected.residue_degree, actual.residue_degree);
    }
    let generators = base.exact_ideals.len();
    let relations = fixture.relation_records.len();
    let mut relation_values = vec![Integer::new(); generators * relations];
    let mut witnesses = Vec::with_capacity(relations);
    for (index, record) in fixture.relation_records.into_iter().enumerate() {
        assert_eq!(record.relation_index_zero_based, index);
        let mut exponents = vec![0_u32; generators];
        for factor in record.prime_ideal_factors {
            assert!(factor.exponent != 0);
            assert_eq!(exponents[factor.factor_base_index_zero_based], 0);
            exponents[factor.factor_base_index_zero_based] = factor.exponent;
            relation_values[factor.factor_base_index_zero_based * relations + index] =
                Integer::from(factor.exponent);
        }
        witnesses.push(PrincipalRelationWitness {
            exponents,
            principal_element: record
                .integral_basis_coordinates
                .map(|value| value.parse::<Integer>().unwrap()),
        });
    }
    assert_eq!(fixture.generator_major_coordinates.len(), generators);
    let coordinate_width = fixture.invariant_factors.len();
    let coordinates = fixture
        .generator_major_coordinates
        .into_iter()
        .flat_map(|row| {
            assert_eq!(row.len(), coordinate_width);
            row.into_iter().map(Integer::from)
        })
        .collect();
    let presentation = PresentationClassMap::from_verified_generator_coordinates(
        fixture
            .invariant_factors
            .into_iter()
            .map(Integer::from)
            .collect(),
        coordinates,
        BigIntMatrix::try_new(generators, relations, relation_values).unwrap(),
    )
    .unwrap();
    (presentation, witnesses)
}

#[test]
fn row6_authority_fixture_is_closed_and_confined_to_qualification() {
    let source = include_bytes!(
        "../qualification/arbitrary-ideal-reduction/evidence/row6-map-authority.json"
    );
    let mut value: serde_json::Value = serde_json::from_slice(source).unwrap();
    value
        .as_object_mut()
        .unwrap()
        .insert("classNumber".into(), serde_json::json!(4));
    assert!(serde_json::from_value::<AuthorityFixture>(value).is_err());

    // The genuine answer-bearing fixture is test/qualification evidence only;
    // production code contains neither its bytes nor its identity.
    let production = include_str!("../src/arbitrary_ideal_reduction.rs");
    assert!(!production.contains(ROW6_AUTHORITY_SHA256));
    assert!(!production.contains("row6-map-authority.json"));
}

fn small_cubic() -> RustPreparedMaximalCubic {
    prepare_squarefree_discriminant_monic_cubic(
        [1.into(), (-1).into(), 0.into(), 1.into()],
        PublicCubicPreparationLimits::default(),
    )
    .unwrap()
}

fn authenticated_small_presentation(
    order: MaximalCubicOrder<'_>,
    base: &PreparedFactorBase,
    workspace: &mut PreparedIdealWorkspace,
) -> AuthenticatedPresentationClassMap {
    let field = order.field();
    let embedding = PreparedCubicEmbedding::from_validated(field, 320).unwrap();
    let limits = ArbitraryIdealReductionLimits::default();
    let generators = base.exact_ideals.len();
    let mut relation_values = vec![Integer::new(); generators * generators];
    let mut witnesses = Vec::with_capacity(generators);
    for column in 0..generators {
        let certificate = reduce_arbitrary_cubic_ideal(
            order,
            &base.exact_ideals[column],
            base,
            &embedding,
            limits,
            workspace,
        )
        .unwrap();
        let mut exponents = certificate.quotient_exponents;
        exponents[column] += 1;
        for (row, exponent) in exponents.iter().enumerate() {
            relation_values[row * generators + column] = Integer::from(*exponent);
        }
        witnesses.push(PrincipalRelationWitness {
            exponents,
            principal_element: certificate.element,
        });
    }
    let relations = BigIntMatrix::try_new(generators, generators, relation_values).unwrap();
    let mut normal_forms = ExactNormalFormWorkspace::new(NormalFormLimits::default());
    let smith = normal_forms.smith(&relations).unwrap();
    let presentation = PresentationClassMap::from_verified_smith(relations, smith).unwrap();
    authenticate_presentation_class_map(order, base, presentation, &witnesses, workspace).unwrap()
}

fn first_nonunit_prime(
    field: &ValidatedPreparedCubic,
) -> (
    sagejs_pari_class_group_rust_experiment::PreparedFactorBase,
    CubicIdeal,
) {
    let base = prepared_maximal_cubic_factor_base(field).unwrap();
    let ideal = base.exact_ideals[0].clone();
    assert!(ideal.norm() > 1);
    (base, ideal)
}

fn reduce_and_replay(
    order: TestOrder<'_>,
    field: &ValidatedPreparedCubic,
    input: &CubicIdeal,
    require_nonzero: bool,
) -> ArbitraryIdealReductionCertificate {
    let base = prepared_maximal_cubic_factor_base(field).unwrap();
    let embedding = PreparedCubicEmbedding::from_validated(field, 320).unwrap();
    let mut workspace = PreparedIdealWorkspace::new();
    let limits = ArbitraryIdealReductionLimits {
        maximum_candidates: 2_000,
        maximum_valuation: 64,
    };
    let certificate = order
        .reduce(input, &base, &embedding, limits, &mut workspace)
        .unwrap();
    if require_nonzero {
        assert!(
            certificate
                .quotient_exponents
                .iter()
                .any(|value| *value != 0)
        );
    }
    order
        .replay(input, &base, &certificate, limits, &mut workspace)
        .unwrap();

    let mut counterfeit_element = certificate.clone();
    counterfeit_element.element[0] += 1;
    assert_eq!(
        order.replay(input, &base, &counterfeit_element, limits, &mut workspace),
        Err(ArbitraryIdealReductionError::CertificateMismatch)
    );

    let mut counterfeit_exponent = certificate.clone();
    counterfeit_exponent.quotient_exponents[0] += 1;
    assert_eq!(
        order.replay(input, &base, &counterfeit_exponent, limits, &mut workspace),
        Err(ArbitraryIdealReductionError::CertificateMismatch)
    );
    certificate
}

#[test]
fn row6_index_prime_ideal_reduces_with_exact_replay() {
    let prepared = row6_input();
    let order = UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&prepared).unwrap();
    let field = order.field();
    let base = prepared_maximal_cubic_factor_base(&field).unwrap();
    let index = base
        .catalog
        .rational_primes
        .binary_search(&3)
        .map(|group| base.catalog.rational_offsets[group])
        .unwrap();
    let raw_kernel = DegreeOnePrimeCharacter::validate(field, 3, [1, 1, 1])
        .unwrap()
        .kernel();
    let mut workspace = PreparedIdealWorkspace::new();
    let canonical_kernel = workspace.from_generators(raw_kernel.basis_rows()).unwrap();
    assert_ne!(raw_kernel, canonical_kernel);
    assert_eq!(canonical_kernel.norm(), raw_kernel.norm());
    let certificate = reduce_and_replay(TestOrder::Assumed(order), field, &raw_kernel, true);
    assert_eq!(
        certificate.element,
        [Integer::from(3), Integer::new(), Integer::new()]
    );
    assert_eq!(certificate.quotient_exponents[index], 2);
    let handoff = certificate.signed_class_handoff();
    assert_eq!(
        handoff.maximal_order_evidence,
        MaximalOrderEvidenceStatus::UpstreamAssumedAllowlistedRow6
    );
    assert_eq!(handoff.exponents[index], -2);
    let (presentation, witnesses) = row6_presentation_fixture(&base);
    assert_eq!(presentation.invariant_factors(), &[2, 2]);
    assert!(matches!(
        authenticate_upstream_assumed_row6_presentation_class_map(
            order,
            &base,
            presentation.clone(),
            &[],
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::MissingPrincipalRelationWitnesses)
    ));
    let mut alien_witnesses = witnesses.clone();
    alien_witnesses[0].principal_element[0] += 1;
    assert!(matches!(
        authenticate_upstream_assumed_row6_presentation_class_map(
            order,
            &base,
            presentation.clone(),
            &alien_witnesses,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::PrincipalRelationWitnessMismatch { index: 0 })
    ));
    let mut hostile_witnesses = witnesses.clone();
    hostile_witnesses[0].exponents[0] = u32::MAX;
    let mut malformed_base = base.clone();
    malformed_base.catalog.ideals[0].hnf[0] += 1;
    assert!(matches!(
        authenticate_upstream_assumed_row6_presentation_class_map(
            order,
            &malformed_base,
            presentation.clone(),
            &hostile_witnesses,
            &mut workspace,
        ),
        Err(
            ArbitraryIdealReductionError::PrincipalRelationWitnessExponentLimit {
                relation: 0,
                factor: 0,
                exponent: u32::MAX,
                limit: ARBITRARY_IDEAL_MAXIMUM_VALUATION,
            }
        )
    ));
    let authority = authenticate_upstream_assumed_row6_presentation_class_map(
        order,
        &base,
        presentation,
        &witnesses,
        &mut workspace,
    )
    .unwrap();

    let mapped_index = 4;
    let mapped_input = base.exact_ideals[mapped_index].clone();
    let mapped_reduction =
        reduce_and_replay(TestOrder::Assumed(order), field, &mapped_input, false);
    let limits = ArbitraryIdealReductionLimits::default();
    let mapped = map_upstream_assumed_arbitrary_cubic_ideal_class(
        order,
        &mapped_input,
        &base,
        &mapped_reduction,
        &authority,
        limits,
        &mut workspace,
    )
    .unwrap();
    assert_eq!(mapped.coordinates.values(), &[1, 1]);
    assert!(matches!(
        mapped.presentation_zero_state,
        PresentationZeroState::NonzeroInCurrentPresentation { .. }
    ));
    let quotient = mapped_reduction
        .quotient_exponents
        .iter()
        .copied()
        .map(Integer::from)
        .collect::<Vec<_>>();
    assert_eq!(
        mapped.coordinates,
        authority
            .presentation()
            .negate(&authority.presentation().coordinates(&quotient).unwrap())
            .unwrap()
    );
    replay_upstream_assumed_arbitrary_cubic_ideal_class_map(
        order,
        &mapped_input,
        &base,
        &mapped_reduction,
        &authority,
        &mapped,
        limits,
        &mut workspace,
    )
    .unwrap();

    let mut counterfeit_field_binding = mapped.clone();
    counterfeit_field_binding.field_sha256[0] ^= 1;
    assert_eq!(
        replay_upstream_assumed_arbitrary_cubic_ideal_class_map(
            order,
            &mapped_input,
            &base,
            &mapped_reduction,
            &authority,
            &counterfeit_field_binding,
            limits,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::ClassMapCertificateMismatch)
    );
    let mut counterfeit_catalog_binding = mapped.clone();
    counterfeit_catalog_binding.factor_base_sha256[0] ^= 1;
    assert_eq!(
        replay_upstream_assumed_arbitrary_cubic_ideal_class_map(
            order,
            &mapped_input,
            &base,
            &mapped_reduction,
            &authority,
            &counterfeit_catalog_binding,
            limits,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::ClassMapCertificateMismatch)
    );
    let mut counterfeit_witness_binding = mapped.clone();
    counterfeit_witness_binding.principal_witnesses_sha256[0] ^= 1;
    assert_eq!(
        replay_upstream_assumed_arbitrary_cubic_ideal_class_map(
            order,
            &mapped_input,
            &base,
            &mapped_reduction,
            &authority,
            &counterfeit_witness_binding,
            limits,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::ClassMapCertificateMismatch)
    );
    let mut alien_catalog = base.clone();
    alien_catalog.exact_ideals.swap(index, index + 1);
    assert_eq!(
        replay_upstream_assumed_arbitrary_cubic_ideal_class_map(
            order,
            &mapped_input,
            &alien_catalog,
            &mapped_reduction,
            &authority,
            &mapped,
            limits,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::FactorBaseShape)
    );
    let mut counterfeit_evidence = certificate.clone();
    counterfeit_evidence.maximal_order_evidence =
        MaximalOrderEvidenceStatus::RustProvedSquarefreeDiscriminant;
    assert_eq!(
        replay_upstream_assumed_arbitrary_ideal_reduction(
            order,
            &raw_kernel,
            &base,
            &counterfeit_evidence,
            ArbitraryIdealReductionLimits::default(),
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::CertificateMismatch)
    );
    assert_eq!(
        certificate
            .quotient_exponents
            .iter()
            .filter(|exponent| **exponent != 0)
            .count(),
        1
    );
}

#[test]
fn neutral_maximal_order_capability_is_allowlisted_and_explicitly_assumed() {
    let neutral = row6_input();
    let order = UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&neutral).unwrap();
    assert_eq!(order.field(), neutral.field());

    let source =
        include_str!("../qualification/row6-candidate/inputs/row6-neutral-prepared-field.json")
            .replacen(
                ROW6_INPUT_ID_FOR_TEST,
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                1,
            );
    let self_asserted = parse_neutral_prepared_cubic_json(&source).unwrap();
    assert!(matches!(
        UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&self_asserted),
        Err(ArbitraryIdealReductionError::UnauthenticatedNeutralInput { .. })
    ));

    // This is the valid equation order Z[cuberoot(10)]. It has discriminant
    // -2700 and index 3 in the maximal order (10 is 1 modulo 9), so the
    // neutral document's self-asserted maximality is known to be false.
    let nonmaximal = include_str!(
        "../qualification/row6-candidate/inputs/complex-cubic-minus-23-neutral-prepared-field.json"
    )
    .replace(r#"["1", "-1", "0", "1"]"#, r#"["-10", "0", "0", "1"]"#)
    .replace(r#""discriminant": "-23""#, r#""discriminant": "-2700""#)
    .replace(r#""irreducibilityPrime": 2"#, r#""irreducibilityPrime": 7"#)
    .replace(
        r#"[{"numerator":"-1","denominator":"1"},{"numerator":"1","denominator":"1"},{"numerator":"0","denominator":"1"}]"#,
        r#"[{"numerator":"10","denominator":"1"},{"numerator":"0","denominator":"1"},{"numerator":"0","denominator":"1"}]"#,
    )
    .replace(
        r#"[{"numerator":"0","denominator":"1"},{"numerator":"-1","denominator":"1"},{"numerator":"1","denominator":"1"}]"#,
        r#"[{"numerator":"0","denominator":"1"},{"numerator":"10","denominator":"1"},{"numerator":"0","denominator":"1"}]"#,
    );
    let nonmaximal = parse_neutral_prepared_cubic_json(&nonmaximal).unwrap();
    assert_eq!(nonmaximal.field().data().discriminant, -2700);
    assert!(matches!(
        UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&nonmaximal),
        Err(ArbitraryIdealReductionError::UnauthenticatedNeutralInput { .. })
    ));
}

#[test]
fn arbitrary_split_prime_product_preserves_allocation_and_reports_signed_vector() {
    let prepared = row6_input();
    let order = UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&prepared).unwrap();
    let field = order.field();
    let base = prepared_maximal_cubic_factor_base(field).unwrap();
    let group = (0..base.catalog.rational_primes.len())
        .find(|group| {
            base.catalog.complete_groups[*group] && base.catalog.rational_counts[*group] >= 2
        })
        .expect("small cubic has a complete split rational prime");
    let first = base.catalog.rational_offsets[group];
    let second = first + 1;
    let mut workspace = PreparedIdealWorkspace::new();
    let second_square = workspace
        .multiply(
            field,
            &base.exact_ideals[second],
            &base.exact_ideals[second],
        )
        .unwrap();
    let input = workspace
        .multiply(field, &base.exact_ideals[first], &second_square)
        .unwrap();
    let embedding = PreparedCubicEmbedding::from_validated(field, 320).unwrap();
    let limits = ArbitraryIdealReductionLimits::default();
    let certificate = reduce_upstream_assumed_arbitrary_cubic_ideal(
        order,
        &input,
        &base,
        &embedding,
        limits,
        &mut workspace,
    )
    .unwrap();
    replay_upstream_assumed_arbitrary_ideal_reduction(
        order,
        &input,
        &base,
        &certificate,
        limits,
        &mut workspace,
    )
    .unwrap();
    assert_eq!(
        certificate.signed_class_handoff().exponents,
        certificate
            .quotient_exponents
            .iter()
            .map(|exponent| -i64::from(*exponent))
            .collect::<Vec<_>>()
    );
    // A complete split group is allocated prime-by-prime, not collapsed to
    // one rational-prime exponent.
    assert!(
        certificate.quotient_exponents[first..first + 2]
            .iter()
            .any(|exponent| *exponent != 0)
    );
    let mut swapped = base.clone();
    swapped.exact_ideals.swap(first, second);
    assert_eq!(
        replay_upstream_assumed_arbitrary_ideal_reduction(
            order,
            &input,
            &swapped,
            &certificate,
            limits,
            &mut workspace
        ),
        Err(ArbitraryIdealReductionError::FactorBaseShape)
    );
    let mut reordered = base.clone();
    reordered.exact_ideals.swap(first, second);
    reordered.catalog.ideals.swap(first, second);
    assert_eq!(
        replay_upstream_assumed_arbitrary_ideal_reduction(
            order,
            &input,
            &reordered,
            &certificate,
            limits,
            &mut workspace
        ),
        Err(ArbitraryIdealReductionError::FactorBaseShape)
    );
    let mut wrong_generator = base.clone();
    wrong_generator.catalog.ideals[0].generator[0] += 1;
    assert_eq!(
        replay_upstream_assumed_arbitrary_ideal_reduction(
            order,
            &input,
            &wrong_generator,
            &certificate,
            limits,
            &mut workspace
        ),
        Err(ArbitraryIdealReductionError::FactorBaseShape)
    );
}

#[test]
fn replay_rejects_resource_and_factor_base_counterfeits_before_powering() {
    let prepared = small_cubic();
    let order = MaximalCubicOrder::from_rust_prepared(&prepared);
    let field = order.field();
    let (base, ideal) = first_nonunit_prime(field);
    let certificate = reduce_and_replay(TestOrder::Proved(order), field, &ideal, false);
    let limits = ArbitraryIdealReductionLimits::default();
    let mut workspace = PreparedIdealWorkspace::new();

    let mut huge = certificate.clone();
    huge.quotient_exponents[0] = u32::MAX;
    let mut hostile_base = base.clone();
    hostile_base.catalog.ideals[0].hnf[0] += 1;
    assert_eq!(
        replay_arbitrary_ideal_reduction(
            order,
            &ideal,
            &hostile_base,
            &huge,
            limits,
            &mut workspace
        ),
        Err(ArbitraryIdealReductionError::CertificateExponentLimit {
            index: 0,
            exponent: u32::MAX,
            limit: limits.maximum_valuation,
        })
    );

    let mut wrong_width = certificate.clone();
    wrong_width.quotient_exponents.pop();
    assert_eq!(
        replay_arbitrary_ideal_reduction(
            order,
            &ideal,
            &base,
            &wrong_width,
            limits,
            &mut workspace
        ),
        Err(ArbitraryIdealReductionError::CertificateWidth)
    );

    let mut zero = certificate.clone();
    zero.element = std::array::from_fn(|_| Integer::new());
    assert_eq!(
        replay_arbitrary_ideal_reduction(order, &ideal, &base, &zero, limits, &mut workspace),
        Err(ArbitraryIdealReductionError::CertificateMismatch)
    );
    assert_eq!(
        replay_arbitrary_ideal_reduction(
            order,
            &ideal,
            &base,
            &certificate,
            ArbitraryIdealReductionLimits {
                maximum_candidates: 1,
                maximum_valuation: 0,
            },
            &mut workspace
        ),
        Err(ArbitraryIdealReductionError::InvalidLimits)
    );
    let unbounded = ArbitraryIdealReductionLimits {
        maximum_candidates: usize::MAX,
        maximum_valuation: u32::MAX,
    };
    assert_eq!(
        replay_arbitrary_ideal_reduction(
            order,
            &ideal,
            &hostile_base,
            &certificate,
            unbounded,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::InvalidLimits)
    );
    let embedding = PreparedCubicEmbedding::from_validated(field, 320).unwrap();
    assert_eq!(
        reduce_arbitrary_cubic_ideal(
            order,
            &ideal,
            &hostile_base,
            &embedding,
            unbounded,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::InvalidLimits)
    );
    assert_eq!(ARBITRARY_IDEAL_MAXIMUM_VALUATION, 256);

    let mut malformed = base.clone();
    malformed.catalog.ideals[0].hnf[0] += 1;
    assert_eq!(
        replay_arbitrary_ideal_reduction(
            order,
            &ideal,
            &malformed,
            &certificate,
            limits,
            &mut workspace
        ),
        Err(ArbitraryIdealReductionError::FactorBaseShape)
    );
}

#[test]
fn small_cubic_prime_ideal_reduces_with_exact_replay() {
    let prepared = small_cubic();
    let order = MaximalCubicOrder::from_rust_prepared(&prepared);
    let field = order.field();
    let (base, ideal) = first_nonunit_prime(field);
    let certificate = reduce_and_replay(TestOrder::Proved(order), field, &ideal, false);
    let limits = ArbitraryIdealReductionLimits::default();
    let mut workspace = PreparedIdealWorkspace::new();
    let authority = authenticated_small_presentation(order, &base, &mut workspace);
    let mapped = map_arbitrary_cubic_ideal_class(
        order,
        &ideal,
        &base,
        &certificate,
        &authority,
        limits,
        &mut workspace,
    )
    .unwrap();
    assert!(mapped.coordinates.is_zero());
    assert!(matches!(
        mapped.presentation_zero_state,
        PresentationZeroState::ZeroByVerifiedRelations {
            principal_element: PrincipalElementWitnessState::Identity,
            ..
        }
    ));
    replay_arbitrary_cubic_ideal_class_map(
        order,
        &ideal,
        &base,
        &certificate,
        &authority,
        &mapped,
        limits,
        &mut workspace,
    )
    .unwrap();
}

#[test]
fn production_context_rejects_external_coordinate_tables() {
    let prepared = small_cubic();
    let order = MaximalCubicOrder::from_rust_prepared(&prepared);
    let field = order.field();
    let base = prepared_maximal_cubic_factor_base(field).unwrap();
    let generators = base.exact_ideals.len();
    let relations = BigIntMatrix::try_new(generators, 1, vec![Integer::new(); generators]).unwrap();
    let presentation = PresentationClassMap::from_verified_generator_coordinates(
        vec![Integer::from(2)],
        vec![Integer::new(); generators],
        relations,
    )
    .unwrap();
    let witness = PrincipalRelationWitness {
        exponents: vec![0; generators],
        principal_element: [Integer::from(1), Integer::new(), Integer::new()],
    };
    let mut workspace = PreparedIdealWorkspace::new();
    assert!(matches!(
        authenticate_presentation_class_map(order, &base, presentation, &[witness], &mut workspace,),
        Err(ArbitraryIdealReductionError::QualificationCoordinateMapInProductionContext)
    ));
}

#[test]
fn exhaustion_and_nonideal_inputs_fail_closed() {
    let prepared = small_cubic();
    let order = MaximalCubicOrder::from_rust_prepared(&prepared);
    let field = order.field();
    let (base, ideal) = first_nonunit_prime(field);
    let embedding = PreparedCubicEmbedding::from_validated(field, 320).unwrap();
    let mut workspace = PreparedIdealWorkspace::new();
    assert!(matches!(
        reduce_arbitrary_cubic_ideal(
            order,
            &ideal,
            &base,
            &embedding,
            ArbitraryIdealReductionLimits {
                maximum_candidates: 0,
                maximum_valuation: 1,
            },
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::Exhausted(
            sagejs_pari_class_group_rust_experiment::ArbitraryIdealReductionStatistics {
                primitive_candidates: 0,
                ..
            }
        ))
    ));

    let counterfeit = workspace
        .from_generators(&[
            [2.into(), 0.into(), 0.into()],
            [0.into(), 1.into(), 0.into()],
            [0.into(), 0.into(), 1.into()],
        ])
        .unwrap();
    assert_eq!(
        reduce_arbitrary_cubic_ideal(
            order,
            &counterfeit,
            &base,
            &embedding,
            ArbitraryIdealReductionLimits::default(),
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::InputIsNotAnIdeal)
    );
}
