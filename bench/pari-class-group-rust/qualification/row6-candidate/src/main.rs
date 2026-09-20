// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Bounded, candidate-only row-6 diagnostic.
//!
//! This deliberately uses the equation order `Z[x]`, because the current
//! shared Rust boundary cannot represent row 6's index-three maximal-order
//! basis.  It must never be interpreted as a class-group result.

use rug::{Float, Integer, Rational};
use sagejs_pari_class_group_rust_experiment::{
    EmbeddingPrecisionState, PreparedCollectorLimits, PreparedCubicData,
    PreparedRealCubicEmbedding, ValidatedPreparedCubic, collect_prepared_cubic_relations,
    collect_validated_primitive_box_with_supplementary, flint_hnf_basis, flint_hnf_profile,
    build_cubic_bdf_factor_base_plan, build_cubic_belabas_friedman_plan,
    flint_bdf_factor_base_margin, flint_bf_index_enclosure, flint_compact_cubic_regulator,
    flint_incremental_hnf, flint_left_kernel, flint_small_surplus_class_order,
    flint_smith_candidate, flint_smith_class_map, flint_staged_relation_witnesses,
    modular_independent_relation_rows,
    prepared_cubic_factor_base, prepared_cubic_splitting_records,
    prepared_maximal_cubic_factor_base,
    reconstruct_rank_two_unit_lattice,
};
use std::env;
use std::time::Instant;

#[path = "../../../src/relation_cache.rs"]
mod relation_cache;
#[path = "../../../src/smooth_admission.rs"]
mod smooth_admission;

const POLYNOMIAL: [i64; 4] = [2_000_000_000_018, -2_000_000_000_010, 0, 1];
const EQUATION_ORDER_BASIS: [i64; 9] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const MAXIMAL_ORDER_BASIS_NUMERATORS: [i64; 9] = [
    3,
    0,
    0,
    0,
    3,
    0,
    -1_333_333_333_340,
    1,
    1,
];

fn maximal_order() -> ValidatedPreparedCubic {
    ValidatedPreparedCubic::validate(PreparedCubicData {
        polynomial_ascending: POLYNOMIAL.map(Integer::from),
        irreducibility_prime: 7,
        integral_basis_numerators: MAXIMAL_ORDER_BASIS_NUMERATORS.map(Integer::from),
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
                "lll": answer.timings.lll_ns,
                "archimedeanPreparation": answer.timings.archimedean_preparation_ns,
                "enumerationAndNorm": answer.timings.enumeration_and_norm_ns,
                "rationalFactorization": answer.timings.rational_factorization_ns,
                "primeValuationAndCache": answer.timings.prime_valuation_and_cache_ns,
                "totalInternal": answer.timings.total_ns,
                "totalExternal": started.elapsed().as_nanos(),
            },
        })
    );
}

fn small_norm_smith(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let total_started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order relation collection failed");
    assert!(answer.complete_rank_and_surplus, "relation lattice is incomplete");
    let rows = answer.relations.len() / answer.factor_base.catalog.ideals.len();
    let columns = answer.factor_base.catalog.ideals.len();
    eprintln!(
        "stage=relation-collection-complete rows={rows} columns={columns} elapsed_ns={}",
        answer.timings.total_ns
    );
    let smith_started = Instant::now();
    let smith = flint_smith_candidate(&answer.relations, rows, columns)
        .expect("FLINT Smith reduction failed");
    let smith_ns = smith_started.elapsed().as_nanos();
    eprintln!("stage=smith-complete elapsed_ns={smith_ns}");
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-maximal-smith-candidate-v1",
            "qualificationStatus": "smith-candidate-not-publicly-complete",
            "usesOracleAsInput": false,
            "relations": { "rows": rows, "columns": columns },
            "smith": {
                "rank": smith.rank,
                "invariantFactors": smith.invariant_factors,
                "classNumber": smith.class_number,
                "hasTransformEvidence": false,
            },
            "timingsNanoseconds": {
                "collection": answer.timings.total_ns,
                "smith": smith_ns,
                "totalExternal": total_started.elapsed().as_nanos(),
            },
        })
    );
}

fn small_norm_hnf_smith(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let total_started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order relation collection failed");
    assert!(answer.complete_rank_and_surplus, "relation lattice is incomplete");
    let rows = answer.relations.len() / answer.factor_base.catalog.ideals.len();
    let columns = answer.factor_base.catalog.ideals.len();
    eprintln!(
        "stage=relation-collection-complete rows={rows} columns={columns} elapsed_ns={}",
        answer.timings.total_ns
    );
    let hnf_started = Instant::now();
    let basis = flint_hnf_basis(&answer.relations, rows, columns)
        .expect("FLINT HNF basis reduction failed");
    let hnf_ns = hnf_started.elapsed().as_nanos();
    eprintln!("stage=hnf-basis-complete elapsed_ns={hnf_ns}");
    let smith_started = Instant::now();
    let smith = flint_smith_candidate(&basis, columns, columns)
        .expect("FLINT reduced-basis Smith reduction failed");
    let smith_ns = smith_started.elapsed().as_nanos();
    eprintln!("stage=reduced-smith-complete elapsed_ns={smith_ns}");
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-maximal-hnf-smith-candidate-v1",
            "qualificationStatus": "smith-candidate-not-publicly-complete",
            "usesOracleAsInput": false,
            "relations": { "rows": rows, "columns": columns },
            "hnfBasis": { "rows": columns, "columns": columns },
            "smith": {
                "rank": smith.rank,
                "invariantFactors": smith.invariant_factors,
                "classNumber": smith.class_number,
                "hasTransformEvidence": false,
            },
            "timingsNanoseconds": {
                "collection": answer.timings.total_ns,
                "hnfBasis": hnf_ns,
                "smith": smith_ns,
                "totalExternal": total_started.elapsed().as_nanos(),
            },
        })
    );
}

fn small_norm_square_hnf_profile(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let total_started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order relation collection failed");
    assert!(answer.complete_rank_and_surplus, "relation lattice is incomplete");
    let columns = answer.factor_base.catalog.ideals.len();
    let rows = answer.relations.len() / columns;
    let selection_started = Instant::now();
    let (square, source_rows) = modular_independent_relation_rows(
        &answer.relations,
        &answer.first_nonzero_hints,
        columns,
    )
    .expect("modularly independent row selection failed");
    let selection_ns = selection_started.elapsed().as_nanos();
    let hnf_started = Instant::now();
    let profile = flint_hnf_profile(&square, columns).expect("square FLINT HNF profile failed");
    let hnf_ns = hnf_started.elapsed().as_nanos();
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-square-hnf-profile-v1",
            "qualificationStatus": "diagnostic-not-publicly-complete",
            "usesOracleAsInput": false,
            "relations": { "rows": rows, "columns": columns },
            "squareStartingBasis": {
                "rows": source_rows.len(),
                "sourceRowIndicesZeroBased": source_rows,
                "selectionModulus": 27449,
                "maximumHnfEntryBits": profile.maximum_entry_bits,
                "determinantBits": profile.determinant_bits,
            },
            "timingsNanoseconds": {
                "collection": answer.timings.total_ns,
                "squareSelection": selection_ns,
                "squareHnf": hnf_ns,
                "totalExternal": total_started.elapsed().as_nanos(),
            },
        })
    );
}

fn small_norm_incremental_hnf(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let total_started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order relation collection failed");
    assert!(answer.complete_rank_and_surplus, "relation lattice is incomplete");
    let columns = answer.factor_base.catalog.ideals.len();
    let rows = answer.relations.len() / columns;
    let selection_started = Instant::now();
    let (square, source_rows) = modular_independent_relation_rows(
        &answer.relations,
        &answer.first_nonzero_hints,
        columns,
    )
    .expect("modularly independent row selection failed");
    let mut selected = vec![false; rows];
    for source_row in source_rows.iter().copied() {
        selected[source_row] = true;
    }
    let mut remaining = Vec::with_capacity((rows - columns) * columns);
    for (row, relation) in answer.relations.chunks_exact(columns).enumerate() {
        if !selected[row] {
            remaining.extend_from_slice(relation);
        }
    }
    let selection_ns = selection_started.elapsed().as_nanos();
    let hnf_started = Instant::now();
    let incremental = flint_incremental_hnf(&square, &remaining, columns)
        .expect("incremental FLINT HNF failed");
    let hnf_external_ns = hnf_started.elapsed().as_nanos();
    let map_started = Instant::now();
    let map = flint_smith_class_map(&incremental.basis, columns)
        .expect("Smith class-map construction failed");
    let map_ns = map_started.elapsed().as_nanos();
    assert!(map.annihilates(&answer.relations, rows));
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-incremental-hnf-class-map-v1",
            "qualificationStatus": "class-map-candidate-not-publicly-complete",
            "usesOracleAsInput": false,
            "relations": {
                "rows": rows,
                "columns": columns,
                "squareRows": source_rows.len(),
                "saturationRows": rows - source_rows.len(),
                "allMapToZero": true,
            },
            "hnf": {
                "initialMaximumEntryBits": incremental.initial_profile.maximum_entry_bits,
                "initialDeterminantBits": incremental.initial_profile.determinant_bits,
                "finalMaximumEntryBits": incremental.final_profile.maximum_entry_bits,
                "finalDeterminantBits": incremental.final_profile.determinant_bits,
            },
            "group": {
                "invariantFactors": map.invariant_factors,
                "classNumber": map.invariant_factors.iter().product::<i64>(),
            },
            "timingsNanoseconds": {
                "collection": answer.timings.total_ns,
                "squareSelection": selection_ns,
                "squareDeterminantInternal": incremental.determinant_ns,
                "initialHnfInternal": incremental.initial_hnf_ns,
                "modularSaturationInternal": incremental.saturation_ns,
                "incrementalHnfExternal": hnf_external_ns,
                "smithClassMap": map_ns,
                "totalExternal": total_started.elapsed().as_nanos(),
            },
        })
    );
}

fn small_norm_order_witnesses(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let total_started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order relation collection failed");
    assert!(answer.complete_rank_and_surplus, "relation lattice is incomplete");
    let columns = answer.factor_base.catalog.ideals.len();
    let rows = answer.relations.len() / columns;
    let (square, source_rows) = modular_independent_relation_rows(
        &answer.relations,
        &answer.first_nonzero_hints,
        columns,
    )
    .expect("modularly independent row selection failed");
    let mut selected = vec![false; rows];
    for source_row in source_rows.iter().copied() {
        selected[source_row] = true;
    }
    let mut remaining = Vec::with_capacity((rows - columns) * columns);
    let mut ordered_source_rows = source_rows.clone();
    for (row, relation) in answer.relations.chunks_exact(columns).enumerate() {
        if !selected[row] {
            remaining.extend_from_slice(relation);
            ordered_source_rows.push(row);
        }
    }
    let incremental = flint_incremental_hnf(&square, &remaining, columns)
        .expect("incremental FLINT HNF failed");
    let map = flint_smith_class_map(&incremental.basis, columns)
        .expect("Smith class-map construction failed");
    let mut generators = Vec::with_capacity(map.invariant_factors.len());
    for coordinate in 0..map.invariant_factors.len() {
        let generator = (0..columns)
            .find(|generator| {
                map.coordinates(*generator)
                    .is_some_and(|values| {
                        values.iter().enumerate().all(|(index, value)| {
                            *value == if index == coordinate { 1 } else { 0 }
                        })
                    })
            })
            .expect("class map has no factor-base generator for an invariant coordinate");
        generators.push(generator);
    }
    let mut targets = vec![0_i64; generators.len() * columns];
    for (target, generator) in generators.iter().copied().enumerate() {
        targets[target * columns + generator] = map.invariant_factors[target];
    }
    let witness_started = Instant::now();
    let witnesses = flint_staged_relation_witnesses(&square, &remaining, columns, &targets)
        .expect("exact staged relation witness construction failed");
    let witness_external_ns = witness_started.elapsed().as_nanos();

    let mut sparse_witnesses = Vec::with_capacity(witnesses.target_count);
    for target in 0..witnesses.target_count {
        let mut sparse = Vec::new();
        for (ordered_relation, relation) in ordered_source_rows.iter().copied().enumerate() {
            let coefficient = &witnesses.coefficients[target * rows + ordered_relation];
            if coefficient != &0 {
                sparse.push(serde_json::json!({
                    "relationIndexZeroBased": relation,
                    "coefficient": coefficient.to_string(),
                    "principalGeneratorIntegralBasisCoordinates": answer.generators
                        [relation * 3..relation * 3 + 3]
                        .iter()
                        .map(Integer::to_string)
                        .collect::<Vec<_>>(),
                }));
            }
        }
        for column in 0..columns {
            let mut replayed = Integer::from(0);
            for (ordered_relation, relation) in ordered_source_rows.iter().copied().enumerate() {
                replayed += &witnesses.coefficients[target * rows + ordered_relation]
                    * answer.relations[relation * columns + column];
            }
            assert_eq!(replayed, targets[target * columns + column]);
        }
        sparse_witnesses.push(serde_json::json!({
            "invariantCoordinate": target,
            "factorBaseGeneratorIndexZeroBased": generators[target],
            "order": map.invariant_factors[target],
            "nonzeroCoefficientCount": witnesses.nonzero_counts[target],
            "coefficients": sparse,
        }));
    }
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-order-relation-witnesses-v1",
            "qualificationStatus": "exact-compact-principal-order-witnesses-not-complete",
            "usesOracleAsInput": false,
            "relations": { "rows": rows, "columns": columns },
            "group": {
                "invariantFactors": map.invariant_factors,
                "classNumber": map.invariant_factors.iter().product::<i64>(),
            },
            "witnesses": {
                "allReplayExactly": true,
                "principalElementEncoding": "product-of-collected-integral-basis-elements-to-signed-powers-v1",
                "maximumCoefficientBits": witnesses.maximum_coefficient_bits,
                "targets": sparse_witnesses,
            },
            "timingsNanoseconds": {
                "collection": answer.timings.total_ns,
                "incrementalHnf": incremental.determinant_ns
                    + incremental.initial_hnf_ns
                    + incremental.saturation_ns,
                "initialHnfInternal": witnesses.initial_hnf_ns,
                "saturationTransformInternal": witnesses.hnf_ns,
                "targetSolveInternal": witnesses.solve_ns,
                "squareSolveInternal": witnesses.square_solve_ns,
                "witnessExternal": witness_external_ns,
                "totalExternal": total_started.elapsed().as_nanos(),
            },
        })
    );
}

fn small_norm_unit_kernel(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let total_started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order relation collection failed");
    assert!(answer.complete_rank_and_surplus, "relation lattice is incomplete");
    let columns = answer.factor_base.catalog.ideals.len();
    let rows = answer.relations.len() / columns;
    let presentation_started = Instant::now();
    let (square, source_rows) = modular_independent_relation_rows(
        &answer.relations,
        &answer.first_nonzero_hints,
        columns,
    )
    .expect("modularly independent row selection failed");
    let mut selected = vec![false; rows];
    for source_row in source_rows {
        selected[source_row] = true;
    }
    let mut remaining = Vec::with_capacity((rows - columns) * columns);
    for (row, relation) in answer.relations.chunks_exact(columns).enumerate() {
        if !selected[row] {
            remaining.extend_from_slice(relation);
        }
    }
    let class_order = flint_small_surplus_class_order(&square, &remaining, columns)
        .expect("exact small-surplus class-order computation failed");
    assert_eq!(class_order.class_order, 4);
    assert_eq!(class_order.two_rank, 2);
    assert!(
        class_order.annihilates(&answer.relations, rows),
        "mod-2 class map does not annihilate the relation lattice"
    );
    let first_class_generator = (0..columns)
        .find(|&generator| class_order.coordinates(generator) != Some(&[0, 0]))
        .expect("class map has no nonzero generator");
    let first_coordinates = class_order
        .coordinates(first_class_generator)
        .expect("missing first class-generator coordinates")
        .to_vec();
    let second_class_generator = (first_class_generator + 1..columns)
        .chain(0..first_class_generator)
        .find(|&generator| {
            let coordinates = class_order.coordinates(generator).unwrap();
            coordinates != [0, 0] && coordinates != first_coordinates
        })
        .expect("class map has no independent second generator");
    let class_generator_indices = [first_class_generator, second_class_generator];
    let invariant_factors = [2_i64, 2_i64];
    let presentation_ns = presentation_started.elapsed().as_nanos();
    let kernel_started = Instant::now();
    let kernel = flint_left_kernel(&answer.relations, rows, columns)
        .expect("exact saturated left-kernel construction failed");
    let kernel_external_ns = kernel_started.elapsed().as_nanos();
    assert_eq!(kernel.rank, rows - columns);
    let logarithms_started = Instant::now();
    // The HNF-derived basis change can involve about 800-bit coefficients,
    // multiplying source logarithms of roughly 320 bits before severe
    // cancellation.  Keep a wide guard margin so the independently flattened
    // compact-unit replay remains meaningful.
    const LOG_PRECISION: u32 = 4096;
    let embedding = PreparedRealCubicEmbedding::from_validated(&field, LOG_PRECISION)
        .expect("high-precision real embeddings failed");
    let mut relation_logs = Vec::with_capacity(rows);
    for coordinates in answer.generators.chunks_exact(3) {
        let element = [
            coordinates[0].clone(),
            coordinates[1].clone(),
            coordinates[2].clone(),
        ];
        relation_logs.push(
            embedding
                .logarithmic_embedding(&element)
                .expect("a relation generator has a zero real embedding"),
        );
    }
    let mut unit_logs = Vec::with_capacity(kernel.rank);
    let mut maximum_product_formula_residual = Float::with_val(LOG_PRECISION, 0);
    for dependency in 0..kernel.rank {
        let mut logs: [Float; 3] =
            std::array::from_fn(|_| Float::with_val(LOG_PRECISION, 0));
        for relation in 0..rows {
            let coefficient = &kernel.coefficients[dependency * rows + relation];
            if coefficient == &0 {
                continue;
            }
            for embedding_index in 0..3 {
                let mut term = relation_logs[relation][embedding_index].clone();
                term *= coefficient;
                logs[embedding_index] += term;
            }
        }
        let mut residual = logs[0].clone();
        residual += &logs[1];
        residual += &logs[2];
        residual.abs_mut();
        if residual > maximum_product_formula_residual {
            maximum_product_formula_residual = residual;
        }
        unit_logs.push(logs);
    }
    let mut pair_determinants = Vec::new();
    let mut smallest_nonzero_determinant: Option<Float> = None;
    for left in 0..kernel.rank {
        for right in left + 1..kernel.rank {
            let mut determinant = unit_logs[left][0].clone();
            determinant *= &unit_logs[right][1];
            let mut cross = unit_logs[left][1].clone();
            cross *= &unit_logs[right][0];
            determinant -= cross;
            determinant.abs_mut();
            if !determinant.is_zero()
                && smallest_nonzero_determinant
                    .as_ref()
                    .is_none_or(|smallest| &determinant < smallest)
            {
                smallest_nonzero_determinant = Some(determinant.clone());
            }
            pair_determinants.push(serde_json::json!({
                "leftDependency": left,
                "rightDependency": right,
                "absoluteMinorApproximation": format!("{determinant:.300e}"),
            }));
        }
    }
    let logarithms_ns = logarithms_started.elapsed().as_nanos();
    let reconstruction_started = Instant::now();
    // The current diagnostic does not yet have an analytic denominator bound.
    // Use a deliberately generous bound derived only from the exact kernel
    // coefficient size, then record it prominently in the receipt.
    let reconstruction_bound = Integer::from(1) << (kernel.maximum_coefficient_bits + 16);
    let lattice = reconstruct_rank_two_unit_lattice(&unit_logs, &reconstruction_bound)
        .expect("rank-two unit-lattice reconstruction failed");
    let reduced_precision_logs = unit_logs
        .iter()
        .map(|row| std::array::from_fn(|index| Float::with_val(2048, &row[index])))
        .collect::<Vec<_>>();
    let reduced_precision_lattice =
        reconstruct_rank_two_unit_lattice(&reduced_precision_logs, &reconstruction_bound)
            .expect("reduced-precision unit-lattice reconstruction failed");
    assert_eq!(
        lattice.rational_coordinates,
        reduced_precision_lattice.rational_coordinates
    );
    assert_eq!(
        lattice.common_denominator,
        reduced_precision_lattice.common_denominator
    );
    assert_eq!(
        lattice.selected_basis_index,
        reduced_precision_lattice.selected_basis_index
    );
    let mut fundamental_units = Vec::with_capacity(2);
    let mut fundamental_logs = Vec::with_capacity(2);
    let mut fundamental_exponents = Vec::with_capacity(2 * rows);
    for basis in 0..2 {
        let mut coefficients = vec![Integer::from(0); rows];
        for dependency in 0..kernel.rank {
            let multiplier = &lattice.generator_combinations[basis][dependency];
            if multiplier == &0 {
                continue;
            }
            for relation in 0..rows {
                coefficients[relation] +=
                    multiplier * &kernel.coefficients[dependency * rows + relation];
            }
        }
        for column in 0..columns {
            let mut replayed = Integer::from(0);
            for relation in 0..rows {
                replayed += &coefficients[relation]
                    * answer.relations[relation * columns + column];
            }
            assert_eq!(replayed, 0);
        }
        fundamental_exponents.extend(coefficients.iter().cloned());
        let mut logs: [Float; 3] =
            std::array::from_fn(|_| Float::with_val(LOG_PRECISION, 0));
        let mut factors = Vec::new();
        for relation in 0..rows {
            if coefficients[relation] == 0 {
                continue;
            }
            for embedding_index in 0..3 {
                let mut term = relation_logs[relation][embedding_index].clone();
                term *= &coefficients[relation];
                logs[embedding_index] += term;
            }
            factors.push(serde_json::json!({
                "relationIndexZeroBased": relation,
                "exponent": coefficients[relation].to_string(),
                "integralBasisCoordinates": answer.generators
                    [relation * 3..relation * 3 + 3]
                    .iter()
                    .map(Integer::to_string)
                    .collect::<Vec<_>>(),
            }));
        }
        fundamental_units.push(serde_json::json!({
            "basisIndex": basis,
            "allRelationCoordinatesReplayExactly": true,
            "nonzeroCoefficientCount": factors.len(),
            "dependencyCombination": lattice.generator_combinations[basis]
                .iter()
                .map(Integer::to_string)
                .collect::<Vec<_>>(),
            "logAbsEmbeddingsApproximation": logs
                .iter()
                .map(|value| format!("{value:.300e}"))
                .collect::<Vec<_>>(),
            "factors": factors,
        }));
        fundamental_logs.push(logs);
    }
    let mut replayed_regulator = fundamental_logs[0][0].clone();
    replayed_regulator *= &fundamental_logs[1][1];
    let mut cross = fundamental_logs[0][1].clone();
    cross *= &fundamental_logs[1][0];
    replayed_regulator -= cross;
    replayed_regulator.abs_mut();
    let rigorous_regulator = flint_compact_cubic_regulator(
        POLYNOMIAL,
        MAXIMAL_ORDER_BASIS_NUMERATORS,
        3,
        &answer.generators,
        &fundamental_exponents,
        LOG_PRECISION,
    )
    .expect("Arb compact-unit regulator enclosure failed");
    let dyadic_endpoint = |mantissa: &Integer, binary_exponent: i64| {
        if binary_exponent >= 0 {
            Rational::from(mantissa << binary_exponent as u32)
        } else {
            Rational::from((
                mantissa.clone(),
                Integer::from(1) << (-binary_exponent) as u32,
            ))
        }
    };
    let replayed_exact_binary = replayed_regulator
        .to_rational()
        .expect("the replayed regulator must be finite");
    let mpfr_replay_contained = dyadic_endpoint(
        &rigorous_regulator.lower,
        rigorous_regulator.binary_exponent,
    ) <= replayed_exact_binary
        && replayed_exact_binary
            <= dyadic_endpoint(
                &rigorous_regulator.upper,
                rigorous_regulator.binary_exponent,
            );
    const BF_THRESHOLD: u64 = 23_994;
    const BF_PRECISION: u32 = 512;
    let analytic_started = Instant::now();
    let splitting = prepared_cubic_splitting_records(&field, BF_THRESHOLD as usize)
        .expect("exact maximal-order splitting stream failed");
    let bdf_bound = u64::try_from(answer.factor_base.catalog.relation_bound)
        .expect("factor-base bound is outside u64")
        + 1;
    let bdf_plan = build_cubic_bdf_factor_base_plan(bdf_bound, &splitting)
        .expect("BDF factor-base plan failed");
    let bdf_margin = flint_bdf_factor_base_margin(
        &bdf_plan.terms,
        bdf_bound,
        &field.data().discriminant,
        3,
        3,
        BF_PRECISION,
    )
    .expect("rigorous BDF factor-base enclosure failed");
    let bdf_margin_lower = dyadic_endpoint(&bdf_margin.lower, bdf_margin.binary_exponent);
    assert!(
        bdf_margin_lower > 0,
        "BDF inequality did not certify the retained factor base"
    );
    let bf_plan = build_cubic_belabas_friedman_plan(BF_THRESHOLD, &splitting)
        .expect("Belabas--Friedman prime-power plan failed");
    let bf = flint_bf_index_enclosure(
        &bf_plan.terms,
        BF_THRESHOLD,
        &field.data().discriminant,
        class_order
            .class_order
            .to_u64()
            .expect("class order is outside u64"),
        2,
        (3, 0),
        &rigorous_regulator,
        BF_PRECISION,
    )
    .expect("rigorous Belabas--Friedman index enclosure failed");
    let tail_upper = dyadic_endpoint(&bf.tail_bound.upper, bf.tail_bound.binary_exponent);
    assert!(tail_upper < Rational::from((1, 4)));
    let index_lower = dyadic_endpoint(&bf.index.lower, bf.index.binary_exponent);
    let index_upper = dyadic_endpoint(&bf.index.upper, bf.index.binary_exponent);
    let unique_positive_integer_one = index_lower > 0
        && index_lower <= 1
        && index_upper >= 1
        && index_upper < 2;
    assert!(
        unique_positive_integer_one,
        "analytic enclosure did not isolate the positive integral index one"
    );
    let analytic_ns = analytic_started.elapsed().as_nanos();
    let reconstruction_ns = reconstruction_started.elapsed().as_nanos();
    let mut compact_units = Vec::with_capacity(kernel.rank);
    for dependency in 0..kernel.rank {
        let mut factors = Vec::new();
        for relation in 0..rows {
            let coefficient = &kernel.coefficients[dependency * rows + relation];
            if coefficient != &0 {
                factors.push(serde_json::json!({
                    "relationIndexZeroBased": relation,
                    "exponent": coefficient.to_string(),
                    "integralBasisCoordinates": answer.generators
                        [relation * 3..relation * 3 + 3]
                        .iter()
                        .map(Integer::to_string)
                        .collect::<Vec<_>>(),
                }));
            }
        }
        for column in 0..columns {
            let mut replayed = Integer::from(0);
            for relation in 0..rows {
                replayed += &kernel.coefficients[dependency * rows + relation]
                    * answer.relations[relation * columns + column];
            }
            assert_eq!(replayed, 0);
        }
        compact_units.push(serde_json::json!({
            "dependencyIndex": dependency,
            "nonzeroCoefficientCount": kernel.nonzero_counts[dependency],
            "logAbsEmbeddingsApproximation": unit_logs[dependency]
                .iter()
                .map(|value| format!("{value:.300e}"))
                .collect::<Vec<_>>(),
            "factors": factors,
        }));
    }
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-saturated-relation-kernel-v1",
            "qualificationStatus": "grh-conditional-class-unit-index-one",
            "usesOracleAsInput": false,
            "relations": { "rows": rows, "columns": columns },
            "relationCollectionProfile": {
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
                    "lll": answer.timings.lll_ns,
                    "archimedeanPreparation": answer.timings.archimedean_preparation_ns,
                    "enumerationAndNorm": answer.timings.enumeration_and_norm_ns,
                    "rationalFactorization": answer.timings.rational_factorization_ns,
                    "primeValuationAndCache": answer.timings.prime_valuation_and_cache_ns,
                    "totalInternal": answer.timings.total_ns,
                },
            },
            "classMap": {
                "group": "C2 x C2",
                "construction": "right-nullspace-of-the-complete-relation-matrix-modulo-two",
                "isExactBecauseCertifiedOrderEqualsFour": true,
                "allRelationsMapToZero": true,
                "generatorMajorCoordinates": class_order.generator_coordinates
                    .chunks_exact(class_order.two_rank)
                    .collect::<Vec<_>>(),
                "selectedGeneratorIndicesZeroBased": class_generator_indices,
                "selectedGeneratorPrimeIdeals": class_generator_indices.map(|index| {
                    let ideal = &answer.factor_base.catalog.ideals[index];
                    serde_json::json!({
                        "prime": ideal.prime,
                        "ramification": ideal.ramification,
                        "residueDegree": ideal.residue_degree,
                        "norm": ideal.norm,
                        "generator": ideal.generator,
                        "hnf": ideal.hnf,
                    })
                }),
            },
            "kernel": {
                "rank": kernel.rank,
                "isSaturated": true,
                "allReplayExactly": true,
                "maximumCoefficientBits": kernel.maximum_coefficient_bits,
                "unitEncoding": "product-of-collected-integral-basis-elements-to-signed-powers-v1",
                "logPrecisionBits": LOG_PRECISION,
                "maximumProductFormulaResidualApproximation": maximum_product_formula_residual
                    .to_string(),
                "smallestNonzeroTwoByTwoMinorApproximation": smallest_nonzero_determinant
                    .map(|value| format!("{value:.300e}")),
                "pairDeterminants": pair_determinants,
                "compactUnits": compact_units,
            },
            "reconstructedUnitLattice": {
                "certificationStatus": "exact-compact-units-and-grh-conditional-analytic-index-one",
                "rationalReconstructionStableAtBits": [2048, LOG_PRECISION],
                "maximumDenominator": reconstruction_bound.to_string(),
                "coordinateBasisDependencyIndices": lattice.coordinate_basis_indices,
                "rationalCoordinates": lattice.rational_coordinates.iter().map(|coordinate| {
                    coordinate.iter().map(|value| serde_json::json!({
                        "numerator": value.numer().to_string(),
                        "denominator": value.denom().to_string(),
                    })).collect::<Vec<_>>()
                }).collect::<Vec<_>>(),
                "commonDenominator": lattice.common_denominator.to_string(),
                "selectedBasisIndex": lattice.selected_basis_index.to_string(),
                "regulatorApproximation": format!("{:.300e}", lattice.regulator_approximation),
                "independentlyReplayedRegulatorApproximation": format!("{replayed_regulator:.300e}"),
                "rigorousArbRegulatorEnclosure": {
                    "encoding": "closed-dyadic-interval-v1",
                    "lowerMantissa": rigorous_regulator.lower.to_string(),
                    "upperMantissa": rigorous_regulator.upper.to_string(),
                    "binaryExponent": rigorous_regulator.binary_exponent,
                    "precisionBits": LOG_PRECISION,
                    "containsIndependentMpfrReplay": mpfr_replay_contained,
                    "authority": "directed-arb-evaluation-from-exact-compact-units",
                },
                "fundamentalCompactUnits": fundamental_units,
            },
            "analyticCompletion": {
                "hypothesis": "GRH-for-the-Dedekind-zeta-residue-bound",
                "formula": "Belabas--Friedman-Theorem-1",
                "threshold": BF_THRESHOLD,
                "precisionBits": BF_PRECISION,
                "rationalPrimeCount": splitting.len(),
                "rawPrimePowerTerms": bf_plan.raw_terms,
                "aggregatedPrimePowerTerms": bf_plan.terms.len(),
                "rootsOfUnity": 2,
                "rootsOfUnityJustification": "a totally real cubic field has only plus-or-minus-one",
                "factorBaseGeneration": {
                    "hypothesis": "GRH-for-all-unramified-Hecke-L-functions-of-class-group-characters",
                    "theorem": "Belabas--Diaz-y-Diaz--Friedman-strict-inequality",
                    "boundExclusive": bdf_bound,
                    "retainedNormBoundInclusive": answer.factor_base.catalog.relation_bound,
                    "rawPrimeIdealPowerTerms": bdf_plan.raw_terms,
                    "aggregatedPrimeIdealPowerTerms": bdf_plan.terms.len(),
                    "strictMarginEnclosure": {
                        "lowerMantissa": bdf_margin.lower.to_string(),
                        "upperMantissa": bdf_margin.upper.to_string(),
                        "binaryExponent": bdf_margin.binary_exponent,
                        "lowerStrictlyPositive": true,
                    },
                    "conclusion": "retained-factor-base-generates-the-full-class-group",
                },
                "candidateClassNumber": class_order.class_order.to_string(),
                "candidateInvariantFactors": invariant_factors,
                "zetaLogResidueEnclosure": {
                    "lowerMantissa": bf.zeta_log_residue.lower.to_string(),
                    "upperMantissa": bf.zeta_log_residue.upper.to_string(),
                    "binaryExponent": bf.zeta_log_residue.binary_exponent,
                },
                "tailBoundEnclosure": {
                    "lowerMantissa": bf.tail_bound.lower.to_string(),
                    "upperMantissa": bf.tail_bound.upper.to_string(),
                    "binaryExponent": bf.tail_bound.binary_exponent,
                    "upperStrictlyBelowOneQuarter": true,
                },
                "classUnitIndexEnclosure": {
                    "lowerMantissa": bf.index.lower.to_string(),
                    "upperMantissa": bf.index.upper.to_string(),
                    "binaryExponent": bf.index.binary_exponent,
                    "uniquePositiveInteger": 1,
                },
                "conclusion": "candidate-class-index-times-candidate-unit-index-equals-one",
            },
            "timingsNanoseconds": {
                "collection": answer.timings.total_ns,
                "presentationClassOrder": presentation_ns,
                "presentationSquareDeterminant": class_order.determinant_ns,
                "presentationSurplusCoordinateSolve": class_order.solve_ns,
                "presentationSurplusKernel": class_order.kernel_ns,
                "kernelInternal": kernel.kernel_ns,
                "kernelExternal": kernel_external_ns,
                "logarithmicEmbedding": logarithms_ns,
                "unitLatticeReconstructionAndReplay": reconstruction_ns,
                "analyticCompletion": analytic_ns,
                "totalExternal": total_started.elapsed().as_nanos(),
            },
        })
    );
}

fn small_norm_class_map(maximum_ideals: usize, maximum_candidates: usize) {
    let field = maximal_order();
    let total_started = Instant::now();
    let answer = collect_prepared_cubic_relations(
        &field,
        PreparedCollectorLimits {
            maximum_visited_ideals: maximum_ideals,
            maximum_candidates,
        },
    )
    .expect("maximal-order relation collection failed");
    assert!(answer.complete_rank_and_surplus, "relation lattice is incomplete");
    let rows = answer.relations.len() / answer.factor_base.catalog.ideals.len();
    let columns = answer.factor_base.catalog.ideals.len();
    eprintln!(
        "stage=relation-collection-complete rows={rows} columns={columns} elapsed_ns={}",
        answer.timings.total_ns
    );
    let hnf_started = Instant::now();
    let basis = flint_hnf_basis(&answer.relations, rows, columns)
        .expect("FLINT HNF basis reduction failed");
    let hnf_ns = hnf_started.elapsed().as_nanos();
    eprintln!("stage=hnf-basis-complete elapsed_ns={hnf_ns}");
    let map_started = Instant::now();
    let map = flint_smith_class_map(&basis, columns)
        .expect("FLINT Smith class-map construction failed");
    let map_ns = map_started.elapsed().as_nanos();
    assert!(
        map.annihilates(&answer.relations, rows),
        "a collected relation survived the Smith quotient map"
    );
    eprintln!("stage=smith-class-map-complete elapsed_ns={map_ns}");
    let class_number = map.invariant_factors.iter().product::<i64>();
    assert!(
        map.invariant_factors.iter().all(|factor| *factor == 2),
        "the row-6 compact receipt currently specifies binary coordinates"
    );
    let mut packed = vec![0_u8; map.generator_coordinates.len().div_ceil(8)];
    for (index, coordinate) in map.generator_coordinates.iter().copied().enumerate() {
        assert!((0..=1).contains(&coordinate));
        packed[index / 8] |= (coordinate as u8) << (index % 8);
    }
    let packed_hex = packed
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    println!(
        "{}",
        serde_json::json!({
            "schema": "sagejs.rust-class-group/row6-maximal-class-map-candidate-v1",
            "qualificationStatus": "class-map-candidate-not-publicly-complete",
            "usesOracleAsInput": false,
            "relations": { "rows": rows, "columns": columns, "allMapToZero": true },
            "hnfBasis": { "rows": columns, "columns": columns },
            "group": {
                "invariantFactors": map.invariant_factors,
                "classNumber": class_number,
                "factorBaseGeneratorCoordinates": {
                    "encoding": "generator-major-lsb-first-binary-v1",
                    "coordinateCount": map.generator_coordinates.len(),
                    "packedHex": packed_hex,
                },
            },
            "timingsNanoseconds": {
                "collection": answer.timings.total_ns,
                "hnfBasis": hnf_ns,
                "smithClassMap": map_ns,
                "totalExternal": total_started.elapsed().as_nanos(),
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
    if arguments
        .first()
        .is_some_and(|value| value == "small-norm-smith")
    {
        small_norm_smith(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm-smith IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm-smith IDEALS CANDIDATES")
                .parse()
                .expect("candidates must be an integer"),
        );
        return;
    }
    if arguments
        .first()
        .is_some_and(|value| value == "small-norm-hnf-smith")
    {
        small_norm_hnf_smith(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm-hnf-smith IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm-hnf-smith IDEALS CANDIDATES")
                .parse()
                .expect("candidates must be an integer"),
        );
        return;
    }
    if arguments
        .first()
        .is_some_and(|value| value == "small-norm-class-map")
    {
        small_norm_class_map(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm-class-map IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm-class-map IDEALS CANDIDATES")
                .parse()
                .expect("candidates must be an integer"),
        );
        return;
    }
    if arguments
        .first()
        .is_some_and(|value| value == "small-norm-square-hnf-profile")
    {
        small_norm_square_hnf_profile(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm-square-hnf-profile IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm-square-hnf-profile IDEALS CANDIDATES")
                .parse()
                .expect("candidates must be an integer"),
        );
        return;
    }
    if arguments
        .first()
        .is_some_and(|value| value == "small-norm-incremental-hnf")
    {
        small_norm_incremental_hnf(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm-incremental-hnf IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm-incremental-hnf IDEALS CANDIDATES")
                .parse()
                .expect("candidates must be an integer"),
        );
        return;
    }
    if arguments
        .first()
        .is_some_and(|value| value == "small-norm-order-witnesses")
    {
        small_norm_order_witnesses(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm-order-witnesses IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm-order-witnesses IDEALS CANDIDATES")
                .parse()
                .expect("candidates must be an integer"),
        );
        return;
    }
    if arguments
        .first()
        .is_some_and(|value| value == "small-norm-unit-kernel")
    {
        small_norm_unit_kernel(
            arguments
                .get(1)
                .expect("usage: row6-candidate small-norm-unit-kernel IDEALS CANDIDATES")
                .parse()
                .expect("ideals must be an integer"),
            arguments
                .get(2)
                .expect("usage: row6-candidate small-norm-unit-kernel IDEALS CANDIDATES")
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
