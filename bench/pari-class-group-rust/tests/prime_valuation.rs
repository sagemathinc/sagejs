#[path = "../src/factor_base.rs"]
mod factor_base;
#[path = "../src/prime_valuation.rs"]
mod prime_valuation;
#[path = "../src/relation_cache.rs"]
mod relation_cache;

use factor_base::prepared_cubic_factor_base;
use prime_valuation::{
    PrimeValuationError, PrimeValuationWorkspace, RationalPrimePower, refine_element_factorization,
    refine_quotient_factorization, sparse_relation,
};
use serde::Deserialize;

fn h1_factor_base() -> factor_base::FactorBase {
    prepared_cubic_factor_base([20_034, -20_018, 0, 1], [1, 0, 0, 0, 1, 0, -13_345, 2, 1])
}

fn factor_over_base(mut value: u64, base: &factor_base::FactorBase) -> Vec<RationalPrimePower> {
    let mut answer = Vec::new();
    for prime in &base.rational_primes {
        let prime_u64 = *prime as u64;
        let mut exponent = 0;
        while value % prime_u64 == 0 {
            value /= prime_u64;
            exponent += 1;
        }
        if exponent != 0 {
            answer.push(RationalPrimePower {
                prime: *prime,
                exponent,
            });
        }
    }
    assert_eq!(value, 1, "trace norm must be factor-base smooth");
    answer
}

#[test]
fn small_h1_elements_refine_to_expected_prime_ideals() {
    let base = h1_factor_base();
    let mut relation = vec![0_i64; base.ideals.len()];
    let mut workspace = PrimeValuationWorkspace::new();

    refine_element_factorization(
        &base,
        [1, 1, 0],
        &[RationalPrimePower {
            prime: 11,
            exponent: 2,
        }],
        &mut relation,
        &mut workspace,
    )
    .unwrap();
    assert_eq!(sparse_relation(&relation), vec![(6, 2)]);

    refine_element_factorization(
        &base,
        [-329, 2, 0],
        &[
            RationalPrimePower {
                prime: 7,
                exponent: 1,
            },
            RationalPrimePower {
                prime: 13,
                exponent: 1,
            },
            RationalPrimePower {
                prime: 313,
                exponent: 1,
            },
        ],
        &mut relation,
        &mut workspace,
    )
    .unwrap();
    assert_eq!(sparse_relation(&relation), vec![(4, 1), (8, 1), (64, 1)]);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Trace {
    oracle_only: Oracle,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Oracle {
    accepted_smooth_candidates: Vec<Accepted>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Accepted {
    candidate_generator_coordinates: [i64; 3],
    admission_diagnostic: [i64; 3],
    factorgen_indices: Vec<usize>,
    factorgen_exponents: Vec<i64>,
    raw_relation: Vec<i64>,
    packet_id: usize,
}

#[test]
fn all_96_authenticated_h1_admissions_match_exactly() {
    let path = std::env::var("SAGEJS_H1_COLLECTOR_TRACE")
        .unwrap_or_else(|_| "/tmp/h1-rust-collector-trace.json".to_owned());
    if !std::path::Path::new(&path).exists() {
        eprintln!("skipping optional collector trace oracle: {path} is absent");
        return;
    }
    let trace: Trace = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(trace.oracle_only.accepted_smooth_candidates.len(), 96);
    let base = h1_factor_base();
    let mut relation = vec![0_i64; base.ideals.len()];
    let mut workspace = PrimeValuationWorkspace::new();

    for (sequence, event) in trace
        .oracle_only
        .accepted_smooth_candidates
        .iter()
        .enumerate()
    {
        let norm = event.admission_diagnostic[0].unsigned_abs();
        let factors = factor_over_base(norm, &base);
        refine_quotient_factorization(
            &base,
            event.candidate_generator_coordinates,
            &factors,
            Some((event.packet_id, 1)),
            &mut relation,
            &mut workspace,
        )
        .unwrap_or_else(|error| panic!("admission {sequence}: {error:?}"));
        let sparse = sparse_relation(&relation);
        assert_eq!(
            sparse.iter().map(|(index, _)| *index).collect::<Vec<_>>(),
            event.factorgen_indices,
            "indices for admission {sequence}"
        );
        assert_eq!(
            sparse
                .iter()
                .map(|(_, exponent)| *exponent)
                .collect::<Vec<_>>(),
            event.factorgen_exponents,
            "exponents for admission {sequence}"
        );

        // `rawRelation` is observed inside `set_fact`, after the surrounding
        // collector has appended its distinguished packet ideal.  Undo that
        // separate smooth-relation step to compare the valuation boundary.
        let mut expected_raw = relation.clone();
        expected_raw[event.packet_id - 1] += 1;
        assert_eq!(expected_raw, event.raw_relation, "admission {sequence}");
    }
}

#[test]
fn incomplete_or_invalid_rational_factorization_is_rejected() {
    let base = h1_factor_base();
    let mut relation = vec![0_i64; base.ideals.len()];
    let mut workspace = PrimeValuationWorkspace::new();
    assert_eq!(
        refine_element_factorization(
            &base,
            [1, 1, 0],
            &[RationalPrimePower {
                prime: 11,
                exponent: 1,
            }],
            &mut relation,
            &mut workspace,
        ),
        Err(PrimeValuationError::IncompletePrimeIdealFactorization {
            prime: 11,
            norm_valuation: 1,
            accounted_valuation: 2,
        })
    );
    assert_eq!(
        refine_element_factorization(
            &base,
            [1, 1, 0],
            &[RationalPrimePower {
                prime: 19,
                exponent: 1,
            }],
            &mut relation,
            &mut workspace,
        ),
        Err(PrimeValuationError::PrimeMissingFromFactorBase(19))
    );
}
