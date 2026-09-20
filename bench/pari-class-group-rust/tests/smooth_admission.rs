#[path = "../src/smooth_admission.rs"]
mod smooth_admission;

use rug::Integer;
use smooth_admission::{
    CubicNormForm, FactorOutcome, RationalFactor, cumulative_prime_products, factor_norm,
    primes_through, word_factor_front,
};

fn h1_form() -> CubicNormForm {
    CubicNormForm::from_prepared_basis([20_034, -20_018, 0, 1], [1, 0, 0, 0, 1, 0, -13_345, 2, 1])
        .unwrap()
}

#[test]
fn h1_exact_norms_match_pari_controls() {
    let form = h1_form();
    for (coordinates, expected) in [
        ([1, 0, 0], 1_i128),
        ([0, 1, 0], -20_034),
        ([0, 0, 1], -593_570_836_937),
        ([1, 1, 0], -40_051),
        ([1, -1, 0], 17),
        ([1, 1, 1], -592_770_110_406),
        ([-1, -1, -1], 592_770_110_406),
        ([1, -1, -1], 592_502_963_814),
    ] {
        assert_eq!(form.norm(coordinates), Ok(expected));
    }
    assert_eq!(form.quotient_norm([0, 1, 0], 2), Ok(-10_017));
    assert!(form.quotient_norm([1, -1, 0], 2).is_err());
}

#[test]
fn exact_form_agrees_with_homogeneity() {
    let form = h1_form();
    for coordinates in [[2, -3, 4], [-5, 1, 2], [7, -4, -1]] {
        let doubled = coordinates.map(|value| value * 2);
        assert_eq!(
            form.norm(doubled).unwrap(),
            8 * form.norm(coordinates).unwrap()
        );
    }
}

#[test]
fn pari_word_factor_front_controls_are_reproduced() {
    let primes = primes_through(65_537);
    let products = cumulative_prime_products(&primes, 1_048_576).unwrap();
    assert_eq!(products.len(), 9);
    let (factors, residual) =
        word_factor_front(928_025_453, &primes, &products, 1_048_576, 65_537, true).unwrap();
    assert_eq!(residual, 1);
    assert_eq!(
        factors,
        vec![
            RationalFactor {
                prime: 37,
                exponent: 1
            },
            RationalFactor {
                prime: 4_793,
                exponent: 1
            },
            RationalFactor {
                prime: 5_233,
                exponent: 1
            },
        ]
    );
    let large = 1_000_003_u64 * 1_000_033;
    let (factors, residual) =
        word_factor_front(large, &primes, &products, 1_048_576, 65_537, true).unwrap();
    assert!(factors.is_empty());
    assert_eq!(residual, large);
}

#[test]
fn smoothness_gate_and_large_catalog_factorization_are_exact() {
    let primes = primes_through(65_537);
    let products = cumulative_prime_products(&primes, 1_048_576).unwrap();
    let support = Integer::from(2_u64 * 3 * 37 * 4_793 * 5_233);
    assert_eq!(
        factor_norm(928_025_453, &support, &primes, &products, 1_048_576, 65_537,).unwrap(),
        FactorOutcome::Factored(vec![
            RationalFactor {
                prime: 37,
                exponent: 1
            },
            RationalFactor {
                prime: 4_793,
                exponent: 1
            },
            RationalFactor {
                prime: 5_233,
                exponent: 1
            },
        ])
    );
    assert_eq!(
        factor_norm(17, &support, &primes, &products, 1_048_576, 65_537).unwrap(),
        FactorOutcome::Nonsmooth
    );
    let huge = 3_i128.pow(50);
    assert_eq!(
        factor_norm(huge, &support, &primes, &products, 1_048_576, 65_537).unwrap(),
        FactorOutcome::Factored(vec![RationalFactor {
            prime: 3,
            exponent: 50
        }])
    );
}

fn elementary_factorization(mut value: u64) -> Vec<RationalFactor> {
    let mut factors = Vec::new();
    let mut prime = 2_u64;
    while prime <= value / prime {
        let mut exponent = 0_u32;
        while value % prime == 0 {
            value /= prime;
            exponent += 1;
        }
        if exponent != 0 {
            factors.push(RationalFactor { prime, exponent });
        }
        prime += if prime == 2 { 1 } else { 2 };
    }
    if value != 1 {
        factors.push(RationalFactor {
            prime: value,
            exponent: 1,
        });
    }
    factors
}

#[test]
fn word_front_matches_a_broad_exact_control_corpus() {
    let primes = primes_through(65_537);
    let products = cumulative_prime_products(&primes, 1_048_576).unwrap();
    let mut controls = vec![
        1,
        2,
        12,
        3_u64.pow(20),
        2_u64.pow(60),
        101 * 103,
        101_u64.pow(5),
        251 * 257,
        617 * 619,
        1_009 * 1_013,
        928_025_453,
    ];
    controls.extend((3..200).step_by(2));
    for prime in [127_u64, 131, 251, 257, 659, 661, 673, 677, 1_009] {
        controls.extend([prime * prime, prime * prime * prime, 6 * prime * prime]);
    }
    for value in controls {
        let expected = elementary_factorization(value);
        for fast in [false, true] {
            let (actual, residual) =
                word_factor_front(value, &primes, &products, 1_048_576, 65_537, fast).unwrap();
            let mut reconstructed = residual;
            for factor in &actual {
                assert_eq!(
                    expected
                        .iter()
                        .find(|expected| expected.prime == factor.prime)
                        .map(|expected| expected.exponent),
                    Some(factor.exponent),
                    "value={value}, fast={fast}"
                );
                reconstructed *= factor.prime.pow(factor.exponent);
            }
            assert_eq!(reconstructed, value, "value={value}, fast={fast}");
            if residual == 1 {
                assert_eq!(actual, expected, "value={value}, fast={fast}");
            }
        }
    }
}
