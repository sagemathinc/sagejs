use sagejs_pari_class_group_rust_experiment::{
    ArbitraryIdealReductionCertificate, ArbitraryIdealReductionError,
    ArbitraryIdealReductionLimits, MaximalCubicOrder, PreparedCubicEmbedding, PreparedFactorBase,
    PreparedIdealWorkspace, PublicCubicPreparationLimits, UpstreamAssumedRow6QualificationOrder,
    ValidatedPreparedCubic,
    parse_neutral_prepared_cubic_json, prepare_squarefree_discriminant_monic_cubic,
    prepared_maximal_cubic_factor_base, reduce_arbitrary_cubic_ideal,
    reduce_upstream_assumed_arbitrary_cubic_ideal, replay_arbitrary_ideal_reduction,
    replay_upstream_assumed_arbitrary_ideal_reduction,
};

fn reduce(
    order: MaximalCubicOrder<'_>,
    field: &ValidatedPreparedCubic,
    base: &PreparedFactorBase,
    ideal_index: usize,
) -> ArbitraryIdealReductionCertificate {
    let embedding = PreparedCubicEmbedding::from_validated(field, 320).expect("embedding");
    let mut workspace = PreparedIdealWorkspace::new();
    let limits = ArbitraryIdealReductionLimits::default();
    let certificate = reduce_arbitrary_cubic_ideal(
        order,
        &base.exact_ideals[ideal_index],
        base,
        &embedding,
        limits,
        &mut workspace,
    )
    .expect("bounded reduction");
    replay_arbitrary_ideal_reduction(
        order,
        &base.exact_ideals[ideal_index],
        base,
        &certificate,
        limits,
        &mut workspace,
    )
    .expect("exact replay");
    certificate
}

fn reduce_upstream_assumed(
    order: UpstreamAssumedRow6QualificationOrder<'_>,
    field: &ValidatedPreparedCubic,
    base: &PreparedFactorBase,
    ideal_index: usize,
) -> ArbitraryIdealReductionCertificate {
    let embedding = PreparedCubicEmbedding::from_validated(field, 320).expect("embedding");
    let mut workspace = PreparedIdealWorkspace::new();
    let limits = ArbitraryIdealReductionLimits::default();
    let certificate = reduce_upstream_assumed_arbitrary_cubic_ideal(
        order,
        &base.exact_ideals[ideal_index],
        base,
        &embedding,
        limits,
        &mut workspace,
    )
    .expect("bounded reduction");
    replay_upstream_assumed_arbitrary_ideal_reduction(
        order,
        &base.exact_ideals[ideal_index],
        base,
        &certificate,
        limits,
        &mut workspace,
    )
    .expect("exact replay");
    certificate
}

fn sparse(certificate: &ArbitraryIdealReductionCertificate) -> Vec<(usize, u32)> {
    certificate
        .quotient_exponents
        .iter()
        .copied()
        .enumerate()
        .filter(|(_, exponent)| *exponent != 0)
        .collect()
}

fn main() {
    let row6_prepared = parse_neutral_prepared_cubic_json(include_str!(
        "../../row6-candidate/inputs/row6-neutral-prepared-field.json"
    ))
    .expect("row6 neutral input");
    let row6_order =
        UpstreamAssumedRow6QualificationOrder::from_allowlisted_neutral(&row6_prepared)
            .expect("authenticated row6 qualification input");
    let row6 = row6_order.field();
    let row6_base = prepared_maximal_cubic_factor_base(row6).expect("row6 factor base");
    let row6_group = row6_base.catalog.rational_primes.binary_search(&3).unwrap();
    let row6_index = row6_base.catalog.rational_offsets[row6_group];
    let row6_certificate =
        reduce_upstream_assumed(row6_order, row6, &row6_base, row6_index);
    assert!(!sparse(&row6_certificate).is_empty());

    let limits = ArbitraryIdealReductionLimits::default();
    let mut workspace = PreparedIdealWorkspace::new();
    let mut counterfeit_element = row6_certificate.clone();
    counterfeit_element.element[0] += 1;
    assert_eq!(
        replay_upstream_assumed_arbitrary_ideal_reduction(
            row6_order,
            &row6_base.exact_ideals[row6_index],
            &row6_base,
            &counterfeit_element,
            limits,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::CertificateMismatch)
    );
    let mut counterfeit_exponent = row6_certificate.clone();
    counterfeit_exponent.quotient_exponents[row6_index] += 1;
    assert_eq!(
        replay_upstream_assumed_arbitrary_ideal_reduction(
            row6_order,
            &row6_base.exact_ideals[row6_index],
            &row6_base,
            &counterfeit_exponent,
            limits,
            &mut workspace,
        ),
        Err(ArbitraryIdealReductionError::CertificateMismatch)
    );

    let small_prepared = prepare_squarefree_discriminant_monic_cubic(
        [1.into(), (-1).into(), 0.into(), 1.into()],
        PublicCubicPreparationLimits::default(),
    )
    .expect("small maximal cubic");
    let small_order = MaximalCubicOrder::from_rust_prepared(&small_prepared);
    let small = small_order.field();
    let small_base = prepared_maximal_cubic_factor_base(small).expect("small factor base");
    let small_certificate = reduce(small_order, small, &small_base, 0);

    println!(
        "row6 element={:?} sparse={:?} candidates={} trials={}",
        row6_certificate.element,
        sparse(&row6_certificate),
        row6_certificate.statistics.primitive_candidates,
        row6_certificate.statistics.cursor_trials,
    );
    println!(
        "small element={:?} sparse={:?} candidates={} trials={}",
        small_certificate.element,
        sparse(&small_certificate),
        small_certificate.statistics.primitive_candidates,
        small_certificate.statistics.cursor_trials,
    );
    println!("counterfeit_element=rejected counterfeit_exponent=rejected");
    println!("qualification=passed");
}
