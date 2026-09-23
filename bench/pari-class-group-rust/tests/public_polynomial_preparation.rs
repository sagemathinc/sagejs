// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    PublicCubicPreparationError, PublicCubicPreparationLimits, prepare_monic_cubic,
    prepare_squarefree_discriminant_monic_cubic, prepared_maximal_cubic_factor_base,
};
use std::io::Write;
use std::process::{Command, Stdio};

fn integers(values: [i64; 4]) -> [Integer; 4] {
    values.map(Integer::from)
}

#[test]
fn bounded_public_route_matches_pari_2_17_4_cubic_order_differentials() {
    // These order invariants were generated independently with PARI 2.17.4.
    // They are test-only expected values, never preparation input.
    let cases = [
        (
            "h1",
            [20034, -20018, 0, 1],
            1_i64,
            32075641032116_i64,
            (3, 0),
        ),
        ("index-3", [20018, -20010, 0, 1], 3, 3559689395028, (3, 0)),
        ("unseen-complex", [1, 1, 0, 1], 1, -31, (1, 1)),
    ];
    for (name, polynomial, index, discriminant, signature) in cases {
        let prepared = prepare_monic_cubic(
            integers(polynomial),
            PublicCubicPreparationLimits::default(),
        )
        .unwrap_or_else(|error| panic!("{name}: {error}"));
        assert!(
            prepared
                .maximal_order_certificate()
                .factorization_identity_holds()
        );
        assert_eq!(
            prepared.field().equation_order_index(),
            &Integer::from(index),
            "{name}"
        );
        assert_eq!(prepared.field().data().discriminant, discriminant, "{name}");
        assert_eq!(prepared.field().data().signature, signature, "{name}");
    }
}

#[test]
fn bounded_public_route_prepares_row6_without_oracle_state() {
    let prepared = prepare_monic_cubic(
        integers([2_000_000_000_018, -2_000_000_000_010, 0, 1]),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    assert_eq!(prepared.field().equation_order_index(), &Integer::from(3));
    assert_eq!(
        prepared.field().data().discriminant,
        "3555555555596888888888939555555555028"
            .parse::<Integer>()
            .unwrap()
    );
    assert_eq!(prepared.field().data().signature, (3, 0));
    assert_eq!(prepared.field().data().index_primes, [Integer::from(3)]);
}

#[test]
fn hostile_public_inputs_and_overorder_work_fail_closed() {
    let hostile = [
        Integer::from(1),
        -(Integer::from(1) << 256_u32),
        Integer::from(0),
        Integer::from(1),
    ];
    let constrained = PublicCubicPreparationLimits {
        maximum_trial_divisor: 2,
        maximum_overorder_prime: 2,
        maximum_overorder_candidates: 1,
        ..PublicCubicPreparationLimits::default()
    };
    assert!(prepare_monic_cubic(hostile, constrained).is_err());

    let index_three = prepare_monic_cubic(
        integers([20018, -20010, 0, 1]),
        PublicCubicPreparationLimits {
            maximum_overorder_prime: 2,
            ..PublicCubicPreparationLimits::default()
        },
    );
    assert!(matches!(
        index_three,
        Err(PublicCubicPreparationError::MaximalOrderProofLimit { .. })
    ));

    assert_eq!(
        prepare_monic_cubic(
            integers([20018, -20010, 0, 1]),
            PublicCubicPreparationLimits {
                maximum_overorder_candidates: 1,
                ..PublicCubicPreparationLimits::default()
            },
        ),
        Err(PublicCubicPreparationError::MaximalOrderProofLimit {
            prime: Integer::from(2),
            required_candidates: Some(7),
        })
    );
}

#[test]
fn direct_p_power_overorders_do_not_stop_at_index_p_fixed_points() {
    // PARI 2.17.4 differentials which defeated the former index-p chain.
    for (polynomial, index, discriminant) in [
        ([-178, 87, -99, 1], 27_i64, -812843_i64),
        ([200, -28, -56, 1], 72_i64, 28473_i64),
    ] {
        let prepared = prepare_monic_cubic(
            integers(polynomial),
            PublicCubicPreparationLimits::default(),
        )
        .unwrap();
        assert_eq!(
            prepared.field().equation_order_index(),
            &Integer::from(index)
        );
        assert_eq!(prepared.field().data().discriminant, discriminant);
        assert!(
            prepared
                .maximal_order_certificate()
                .verify(prepared.field(), PublicCubicPreparationLimits::default())
        );
    }
}

#[test]
fn pathological_trial_bound_is_rejected_before_factoring_a_wide_prime_discriminant() {
    let polynomial = integers([30_094_581, 86_890_901, 0, 1]);
    let prepared =
        prepare_monic_cubic(polynomial.clone(), PublicCubicPreparationLimits::default()).unwrap();
    assert_eq!(prepared.field().equation_order_index(), &Integer::from(1));
    assert_eq!(
        prepared.field().data().discriminant,
        "-2624115201593059542680951".parse::<Integer>().unwrap()
    );
    assert!(
        prepared
            .maximal_order_certificate()
            .verify(prepared.field(), PublicCubicPreparationLimits::default())
    );

    let result = prepare_monic_cubic(
        polynomial,
        PublicCubicPreparationLimits {
            maximum_trial_divisor: u64::MAX,
            ..PublicCubicPreparationLimits::default()
        },
    );
    assert_eq!(result, Err(PublicCubicPreparationError::InvalidLimits));
}

#[test]
fn deterministic_random_panel_matches_pari_2_17_4_when_explicitly_available() {
    let Ok(gp) = std::env::var("PARI_GP_2_17_4") else {
        return;
    };
    // This is the mandated follow-up to the seed-4815162342 audit where the
    // removed index-p fixed-point implementation accepted 16 of 1,996
    // irreducible inputs with wrong maximal-order discriminants.
    let mut state = 4_815_162_342_u64;
    let mut panel = Vec::new();
    let mut script = String::new();
    for index in 0..2_000 {
        let mut coefficients = [0_i64; 3];
        for coefficient in &mut coefficients {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            *coefficient = ((state >> 32) % 2_001) as i64 - 1_000;
        }
        let polynomial = [coefficients[0], coefficients[1], coefficients[2], 1];
        panel.push(polynomial);
        script.push_str(&format!(
            "f=Polrev([{},{},{},1]);if(polisirreducible(f),d=nfdisc(f);print(\"{}:\",d,\":\",sqrtint(abs(poldisc(f)/d))),print(\"{}:reducible\"));\n",
            polynomial[0], polynomial[1], polynomial[2], index, index
        ));
    }
    let mut child = Command::new(gp)
        .args(["-fq"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("PARI_GP_2_17_4 must name an executable");
    // GP starts producing one line per input immediately. Feed its stdin on a
    // separate thread so a full stdout pipe cannot deadlock the parent while
    // it is still writing the remainder of this deliberately large panel.
    let mut stdin = child.stdin.take().unwrap();
    let writer = std::thread::spawn(move || stdin.write_all(script.as_bytes()));
    let output = child.wait_with_output().unwrap();
    writer.join().unwrap().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    let limits = PublicCubicPreparationLimits {
        maximum_overorder_prime: 10_000,
        maximum_overorder_candidates: 20_000_000,
        ..PublicCubicPreparationLimits::default()
    };
    let mut compared = 0;
    for line in stdout.lines() {
        let parts: Vec<_> = line.trim().split(':').collect();
        let index: usize = parts[0].parse().unwrap();
        if parts[1] == "reducible" {
            continue;
        }
        let expected_discriminant: Integer = parts[1].parse().unwrap();
        let expected_index: Integer = parts[2].parse().unwrap();
        let prepared = prepare_monic_cubic(integers(panel[index]), limits).unwrap();
        assert_eq!(prepared.field().data().discriminant, expected_discriminant);
        assert_eq!(prepared.field().equation_order_index(), &expected_index);
        compared += 1;
    }
    assert!(compared >= 1_900, "unexpectedly sparse irreducible panel");
}

#[test]
fn public_polynomial_reaches_exact_maximal_order_factor_base_without_a_fixture() {
    let prepared = prepare_squarefree_discriminant_monic_cubic(
        integers([-1, -1, 0, 1]),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    assert!(prepared.maximal_order_certificate().verify());
    assert_eq!(prepared.field().data().discriminant, -23);
    assert_eq!(prepared.field().data().signature, (1, 1));
    assert_eq!(prepared.field().equation_order_index(), &Integer::from(1));

    // This is the first real class-group-engine consumer of the prepared
    // maximal order.  Its successful construction proves this is not merely a
    // disconnected polynomial metadata parser.
    let factor_base = prepared_maximal_cubic_factor_base(prepared.field()).unwrap();
    assert!(!factor_base.catalog.ideals.is_empty());
    assert_eq!(factor_base.catalog.rational_offsets[0], 0);
}

#[test]
fn public_polynomial_route_fails_closed_outside_its_maximality_theorem() {
    let result = prepare_squarefree_discriminant_monic_cubic(
        integers([1, -1, -2, 1]),
        PublicCubicPreparationLimits::default(),
    );
    assert_eq!(
        result,
        Err(PublicCubicPreparationError::NonSquarefreeDiscriminant {
            repeated_prime: Integer::from(7),
        })
    );
}
