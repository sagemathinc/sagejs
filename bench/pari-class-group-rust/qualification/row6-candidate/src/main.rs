// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Bounded, candidate-only row-6 diagnostic.
//!
//! This deliberately uses the equation order `Z[x]`, because the current
//! shared Rust boundary cannot represent row 6's index-three maximal-order
//! basis.  It must never be interpreted as a class-group result.

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    EmbeddingPrecisionState, PreparedCollectorLimits, PreparedCubicData, ValidatedPreparedCubic,
    collect_prepared_cubic_relations, collect_validated_primitive_box_with_supplementary,
    prepared_cubic_factor_base, prepared_maximal_cubic_factor_base,
};
use std::env;
use std::time::Instant;

#[path = "../../../src/relation_cache.rs"]
mod relation_cache;
#[path = "../../../src/smooth_admission.rs"]
mod smooth_admission;

const POLYNOMIAL: [i64; 4] = [2_000_000_000_018, -2_000_000_000_010, 0, 1];
const EQUATION_ORDER_BASIS: [i64; 9] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

fn maximal_order() -> ValidatedPreparedCubic {
    ValidatedPreparedCubic::validate(PreparedCubicData {
        polynomial_ascending: POLYNOMIAL.map(Integer::from),
        irreducibility_prime: 7,
        integral_basis_numerators: [
            3.into(),
            0.into(),
            0.into(),
            0.into(),
            3.into(),
            0.into(),
            (-1_333_333_333_340_i64).into(),
            1.into(),
            1.into(),
        ],
        basis_denominator: 3.into(),
        multiplication_table: [
            1.into(),
            0.into(),
            0.into(),
            0.into(),
            1.into(),
            0.into(),
            0.into(),
            0.into(),
            1.into(),
            0.into(),
            1.into(),
            0.into(),
            1_333_333_333_340_u64.into(),
            (-1).into(),
            3.into(),
            (-222_222_222_226_i64).into(),
            222_222_222_223_u64.into(),
            1.into(),
            0.into(),
            0.into(),
            1.into(),
            (-222_222_222_226_i64).into(),
            222_222_222_223_u64.into(),
            1.into(),
            98_765_432_099_456_790_123_456_u128.into(),
            (-1).into(),
            (-222_222_222_223_i64).into(),
        ],
        discriminant: 3_555_555_555_596_888_888_888_939_555_555_555_028_u128.into(),
        signature: (3, 0),
        embedding_precision: EmbeddingPrecisionState::Pending { target_bits: 192 },
        index_primes: vec![3.into()],
    })
    .expect("row-6 maximal-order fixture must validate")
}

fn init_prefix(limit: usize) {
    let field = maximal_order();
    let factor_started = Instant::now();
    let factor_base =
        prepared_maximal_cubic_factor_base(&field).expect("maximal-order factor base failed");
    let factor_ns = factor_started.elapsed().as_nanos();
    let size = factor_base.catalog.ideals.len();
    let additional = 7;
    let mut cache =
        relation_cache::RelationCache::new(size, 10 * (size + additional) + 50, additional);
    let mut relation = vec![0_i64; size];
    let started = Instant::now();
    let mut complete_seen = 0_usize;
    for group in 0..factor_base.catalog.rational_primes.len() {
        if !factor_base.catalog.complete_groups[group] {
            continue;
        }
        if complete_seen == limit {
            break;
        }
        let start = factor_base.catalog.rational_offsets[group];
        let count = factor_base.catalog.rational_counts[group];
        relation.fill(0);
        for index in start..start + count {
            relation[index] = factor_base.catalog.ideals[index].ramification as i64;
        }
        cache
            .add_relation(
                &relation,
                start + 1,
                factor_base.catalog.rational_primes[group],
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
            "equationOrderOnly": false,
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
    let field = maximal_order();
    let factor_started = Instant::now();
    let factor_base =
        prepared_maximal_cubic_factor_base(&field).expect("maximal-order factor base failed");
    let factor_ns = factor_started.elapsed().as_nanos();
    let norm_started = Instant::now();
    let norm_at_one = field.norm(&[1.into(), 1.into(), 1.into()]);
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
            .catalog
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
            "factorBaseSize": factor_base.catalog.ideals.len(),
            "primeCount": primes.len(),
            "primeProductBlocks": products.len(),
            "factorBasePrimeProductBits": factor_product.significant_bits(),
            "normAtOneOneOne": norm_at_one.to_string(),
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

fn small_norm_prefix(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order small-norm prefix failed");
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-maximal-small-norm-prefix-v1",
            "qualificationStatus": "diagnostic-candidate-only",
            "usesOracleAsInput": false,
            "limits": {
                "maximumVisitedIdeals": maximum_ideals,
                "maximumCandidates": maximum_candidates,
            },
            "factorBase": {
                "idealCount": answer.factor_base.catalog.ideals.len(),
                "relationBound": answer.factor_base.catalog.relation_bound,
            },
            "relations": {
                "rows": answer.relations.len() / answer.factor_base.catalog.ideals.len(),
                "missingRank": answer.missing_rank,
                "completeRankAndSurplus": answer.complete_rank_and_surplus,
            },
            "counters": {
                "visitedIdeals": answer.counters.visited_ideals,
                "cursorTrials": answer.counters.cursor_trials,
                "primitiveNonscalarCandidates": answer.counters.primitive_nonscalar_candidates,
                "smoothCandidates": answer.counters.smooth_candidates,
                "appendedRelations": answer.counters.appended_relations,
                "positiveCacheStatuses": answer.counters.positive_cache_statuses,
                "randomIdeals": answer.counters.random_ideals,
                "randomSearchIdeals": answer.counters.random_search_ideals,
            },
            "timingsNanoseconds": {
                "factorBase": answer.timings.factor_base_ns,
                "initialCache": answer.timings.initial_cache_ns,
                "catalogSetup": answer.timings.catalog_setup_ns,
                "numericalPreparation": answer.timings.numerical_preparation_ns,
                "enumerationAndNorm": answer.timings.enumeration_and_norm_ns,
                "rationalFactorization": answer.timings.rational_factorization_ns,
                "primeValuationAndCache": answer.timings.prime_valuation_and_cache_ns,
                "totalInternal": answer.timings.total_ns,
                "totalExternal": started.elapsed().as_nanos(),
            },
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
    if arguments.first().is_some_and(|value| value == "small-norm") {
        small_norm_prefix(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm IDEALS CANDIDATES")
                .parse()
                .expect("candidates must be an integer"),
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

    let field = maximal_order();
    let factor_started = Instant::now();
    let factor_base =
        prepared_maximal_cubic_factor_base(&field).expect("maximal-order factor base failed");
    let factor_ns = factor_started.elapsed().as_nanos();
    eprintln!(
        "stage=factor-base-complete elapsed_ns={factor_ns} ideals={}",
        factor_base.catalog.ideals.len()
    );

    let collection_started = Instant::now();
    let answer = collect_validated_primitive_box_with_supplementary(&field, radius, supplementary)
        .expect("maximal-order coefficient-box diagnostic failed");
    let collection_ns = collection_started.elapsed().as_nanos();

    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-maximal-order-candidate-diagnostic-v1",
            "qualificationStatus": "diagnostic-candidate-only",
            "mathematicalBoundary": "validated-maximal-order-prepared-field",
            "linksPari": false,
            "usesOracleAsInput": false,
            "polynomialAscending": POLYNOMIAL.map(|value| value.to_string()),
            "basis": {
                "numeratorRows": field.data().integral_basis_numerators.iter().map(ToString::to_string).collect::<Vec<_>>(),
                "denominator": field.data().basis_denominator.to_string(),
                "equationOrderIndex": field.equation_order_index().to_string(),
            },
            "controls": {
                "maximumRadius": radius,
                "supplementaryRelations": supplementary,
            },
            "factorBase": {
                "relationBound": factor_base.catalog.relation_bound,
                "checkingBound": factor_base.catalog.checking_bound,
                "idealCount": factor_base.catalog.ideals.len(),
                "rationalPrimeCount": factor_base.catalog.rational_primes.len(),
            },
            "relations": {
                "rows": answer.cache.len(),
                "generatorCount": answer.factor_base.catalog.ideals.len(),
                "missingRank": answer.cache.missing(),
                "fullRankObserved": answer.cache.missing() == 0,
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
