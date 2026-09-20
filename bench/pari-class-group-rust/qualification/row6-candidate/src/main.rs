// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Bounded, candidate-only row-6 diagnostic.
//!
//! This deliberately uses the equation order `Z[x]`, because the current
//! shared Rust boundary cannot represent row 6's index-three maximal-order
//! basis.  It must never be interpreted as a class-group result.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    BruteForceOptions, PreparedCubic, collect_prepared_cubic_presentation_candidate,
    prepared_cubic_factor_base,
};
use std::env;
use std::time::Instant;

#[path = "../../../src/relation_cache.rs"]
mod relation_cache;
#[path = "../../../src/smooth_admission.rs"]
mod smooth_admission;

const POLYNOMIAL: [i64; 4] = [2_000_000_000_018, -2_000_000_000_010, 0, 1];
const EQUATION_ORDER_BASIS: [i64; 9] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

fn init_prefix(limit: usize) {
    let factor_started = Instant::now();
    let factor_base = prepared_cubic_factor_base(POLYNOMIAL, EQUATION_ORDER_BASIS);
    let factor_ns = factor_started.elapsed().as_nanos();
    let size = factor_base.ideals.len();
    let additional = 7;
    let mut cache =
        relation_cache::RelationCache::new(size, 10 * (size + additional) + 50, additional);
    let mut relation = vec![0_i64; size];
    let started = Instant::now();
    let mut complete_seen = 0_usize;
    for group in 0..factor_base.rational_primes.len() {
        if !factor_base.complete_groups[group] {
            continue;
        }
        if complete_seen == limit {
            break;
        }
        let start = factor_base.rational_offsets[group];
        let count = factor_base.rational_counts[group];
        relation.fill(0);
        for index in start..start + count {
            relation[index] = factor_base.ideals[index].ramification as i64;
        }
        cache
            .add_relation(
                &relation,
                start + 1,
                factor_base.rational_primes[group],
                0,
                0,
                false,
            )
            .expect("initial cache prefix failed");
        complete_seen += 1;
    }
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-initial-cache-prefix-v1",
            "qualificationStatus": "diagnostic-candidate-only",
            "usesOracleAsInput": false,
            "equationOrderOnly": true,
            "factorBaseSize": size,
            "completeGroupLimit": limit,
            "completeGroupsProcessed": complete_seen,
            "initialRows": cache.len(),
            "missingRank": cache.missing(),
            "timingsNanoseconds": {
                "factorBase": factor_ns,
                "cachePrefix": started.elapsed().as_nanos(),
            },
        })
    );
}

fn setup_stages() {
    let factor_started = Instant::now();
    let factor_base = prepared_cubic_factor_base(POLYNOMIAL, EQUATION_ORDER_BASIS);
    let factor_ns = factor_started.elapsed().as_nanos();
    let norm_started = Instant::now();
    let norm =
        smooth_admission::CubicNormForm::from_prepared_basis(POLYNOMIAL, EQUATION_ORDER_BASIS)
            .expect("norm form failed");
    let norm_ns = norm_started.elapsed().as_nanos();
    let prime_started = Instant::now();
    let primes = smooth_admission::primes_through(65_537);
    let prime_ns = prime_started.elapsed().as_nanos();
    let products_started = Instant::now();
    let products = smooth_admission::cumulative_prime_products(&primes, 65_537)
        .expect("prime products failed");
    let products_ns = products_started.elapsed().as_nanos();
    let factor_product_started = Instant::now();
    let factor_product =
        factor_base
            .rational_primes
            .iter()
            .fold(Integer::from(1), |mut product, prime| {
                product *= *prime;
                product
            });
    let factor_product_ns = factor_product_started.elapsed().as_nanos();
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-collector-setup-stages-v1",
            "qualificationStatus": "diagnostic-candidate-only",
            "usesOracleAsInput": false,
            "factorBaseSize": factor_base.ideals.len(),
            "primeCount": primes.len(),
            "primeProductBlocks": products.len(),
            "factorBasePrimeProductBits": factor_product.significant_bits(),
            "normAtOneOneOne": norm.norm([1, 1, 1]).expect("norm failed").to_string(),
            "timingsNanoseconds": {
                "factorBase": factor_ns,
                "normForm": norm_ns,
                "primeSieve": prime_ns,
                "primeProducts": products_ns,
                "factorBasePrimeProduct": factor_product_ns,
            },
        })
    );
}

fn gcd(mut left: i64, mut right: i64) -> i64 {
    while right != 0 {
        (left, right) = (right, left % right);
    }
    left.abs()
}

fn admission_prefix(radius: i64) {
    let factor_base = prepared_cubic_factor_base(POLYNOMIAL, EQUATION_ORDER_BASIS);
    let norm =
        smooth_admission::CubicNormForm::from_prepared_basis(POLYNOMIAL, EQUATION_ORDER_BASIS)
            .expect("norm form failed");
    let primes = smooth_admission::primes_through(65_537);
    let products = smooth_admission::cumulative_prime_products(&primes, 65_537)
        .expect("prime products failed");
    let factor_product =
        factor_base
            .rational_primes
            .iter()
            .fold(Integer::from(1), |mut product, prime| {
                product *= *prime;
                product
            });
    let started = Instant::now();
    let mut visited = 0_u64;
    let mut primitive_canonical = 0_u64;
    let mut factored = 0_u64;
    let mut factored_witnesses = Vec::new();
    let mut nonsmooth = 0_u64;
    let mut unresolved = 0_u64;
    for z in -radius..=radius {
        for y in -radius..=radius {
            for x in -radius..=radius {
                if ![x, y, z].iter().any(|value| value.abs() == radius) || (y == 0 && z == 0) {
                    continue;
                }
                visited += 1;
                if gcd(gcd(x, y), z) != 1
                    || [x, y, z]
                        .iter()
                        .rev()
                        .find(|value| **value != 0)
                        .is_none_or(|value| *value < 0)
                {
                    continue;
                }
                primitive_canonical += 1;
                match smooth_admission::factor_norm(
                    norm.norm([x, y, z]).expect("norm failed"),
                    &factor_product,
                    &primes,
                    &products,
                    65_537,
                    65_537,
                )
                .expect("factorization failed")
                {
                    smooth_admission::FactorOutcome::Factored(factors) => {
                        factored += 1;
                        factored_witnesses.push(serde_json::json!({
                            "coordinates": [x, y, z],
                            "factors": factors.iter().map(|factor| serde_json::json!({
                                "prime": factor.prime,
                                "exponent": factor.exponent,
                            })).collect::<Vec<_>>(),
                        }));
                    }
                    smooth_admission::FactorOutcome::Nonsmooth => nonsmooth += 1,
                    smooth_admission::FactorOutcome::Unresolved(_) => unresolved += 1,
                }
            }
        }
    }
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-rational-admission-prefix-v1",
            "qualificationStatus": "diagnostic-candidate-only",
            "usesOracleAsInput": false,
            "equationOrderOnly": true,
            "radius": radius,
            "visited": visited,
            "primitiveCanonical": primitive_canonical,
            "factored": factored,
            "factoredWitnesses": factored_witnesses,
            "nonsmooth": nonsmooth,
            "unresolved": unresolved,
            "elapsedNanoseconds": started.elapsed().as_nanos(),
        })
    );
}

fn main() {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments
        .first()
        .is_some_and(|value| value == "init-prefix")
    {
        init_prefix(
            arguments
                .get(1)
                .expect("usage: row6-candidate init-prefix GROUPS")
                .parse()
                .expect("groups must be an integer"),
        );
        return;
    }
    if arguments
        .first()
        .is_some_and(|value| value == "setup-stages")
    {
        setup_stages();
        return;
    }
    if arguments.first().is_some_and(|value| value == "admission") {
        admission_prefix(
            arguments
                .get(1)
                .expect("usage: row6-candidate admission RADIUS")
                .parse()
                .expect("radius must be an integer"),
        );
        return;
    }
    let radius = arguments
        .first()
        .expect("usage: row6-candidate RADIUS [SUPPLEMENTARY]")
        .parse::<i64>()
        .expect("radius must be an integer");
    let supplementary = arguments
        .get(1)
        .map(|value| {
            value
                .parse::<usize>()
                .expect("supplementary must be an integer")
        })
        .unwrap_or(7);
    assert!(radius > 0);

    let factor_started = Instant::now();
    let factor_base = prepared_cubic_factor_base(POLYNOMIAL, EQUATION_ORDER_BASIS);
    let factor_ns = factor_started.elapsed().as_nanos();
    eprintln!(
        "stage=factor-base-complete elapsed_ns={factor_ns} ideals={}",
        factor_base.ideals.len()
    );

    let collection_started = Instant::now();
    let answer = collect_prepared_cubic_presentation_candidate(
        PreparedCubic {
            polynomial_ascending: POLYNOMIAL,
            integral_basis_row_major: EQUATION_ORDER_BASIS,
        },
        BruteForceOptions {
            maximum_radius: radius,
            supplementary_relations: supplementary,
        },
    )
    .expect("coefficient-box diagnostic failed");
    let collection_ns = collection_started.elapsed().as_nanos();

    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-coefficient-box-candidate-diagnostic-v1",
            "qualificationStatus": "diagnostic-candidate-only",
            "mathematicalBoundary": "equation-order-only-not-maximal-order",
            "linksPari": false,
            "usesOracleAsInput": false,
            "polynomialAscending": POLYNOMIAL.map(|value| value.to_string()),
            "basis": {
                "rowMajor": EQUATION_ORDER_BASIS,
                "determinant": 1,
                "knownLimitation": "the genuine maximal-order basis has denominator 3 and is not representable by the current unimodular-i64 PreparedCubic boundary"
            },
            "controls": {
                "maximumRadius": radius,
                "supplementaryRelations": supplementary,
            },
            "factorBase": {
                "relationBound": factor_base.relation_bound,
                "checkingBound": factor_base.checking_bound,
                "idealCount": factor_base.ideals.len(),
                "rationalPrimeCount": factor_base.rational_primes.len(),
            },
            "relations": {
                "rows": answer.presentation.relation_count(),
                "generatorCount": answer.presentation.generator_count,
                "fullRankObserved": answer.statistics.independent as usize == answer.presentation.generator_count,
            },
            "statistics": {
                "visited": answer.statistics.visited,
                "primitiveNonscalar": answer.statistics.primitive_nonscalar,
                "smoothNorms": answer.statistics.smooth_norms,
                "factorBaseSmooth": answer.statistics.factor_base_smooth,
                "appended": answer.statistics.appended,
                "independent": answer.statistics.independent,
                "duplicate": answer.statistics.duplicate,
                "maximumRadiusReached": answer.statistics.maximum_radius,
            },
            "timingsNanoseconds": {
                "standaloneFactorBase": factor_ns,
                "collectionIncludingRepeatedFactorBase": collection_ns,
            },
        })
    );
}
