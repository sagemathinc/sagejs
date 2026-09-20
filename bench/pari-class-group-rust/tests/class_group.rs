// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

// The production binary will wire this module after its standalone collector
// milestone.  These path modules let the new component be exercised without
// changing that shared entry point in this parallel lane.
#[path = "../src/class_group.rs"]
mod class_group;
#[path = "../src/collector_schedule.rs"]
mod collector_schedule;
#[path = "../src/enumeration.rs"]
mod enumeration;
#[path = "../src/factor_base.rs"]
mod factor_base;
#[path = "../src/hnf.rs"]
mod hnf;
#[path = "../src/ideal_arithmetic.rs"]
mod ideal_arithmetic;
#[path = "../src/numerical_preparation.rs"]
mod numerical_preparation;
#[path = "../src/pari_random.rs"]
mod pari_random;
#[path = "../src/prepared.rs"]
mod prepared;
#[path = "../src/prepared_factor_base.rs"]
mod prepared_factor_base;
#[path = "../src/prepared_ideal.rs"]
mod prepared_ideal;
#[path = "../src/prime_valuation.rs"]
mod prime_valuation;
#[path = "../src/relation_cache.rs"]
mod relation_cache;
#[path = "../src/smooth_admission.rs"]
mod smooth_admission;

use class_group::collect_h1_class_group;

const POLYNOMIAL: [i64; 4] = [20_034, -20_018, 0, 1];
const BASIS: [i64; 9] = [1, 0, 0, 0, 1, 0, -13_345, 2, 1];

#[test]
fn rust_collector_reaches_the_h1_relation_target_without_an_oracle_input() {
    let answer = collect_h1_class_group(POLYNOMIAL, BASIS).unwrap();
    assert_eq!(answer.factor_base.ideals.len(), 66);
    assert_eq!(answer.relations.len(), 66 * 73);
    assert_eq!(answer.generators.len(), 3 * 73);
    assert_eq!(answer.counters.visited_ideals, 16);
    assert_eq!(answer.counters.appended_relations, 61);
    assert_eq!(answer.counters.smooth_candidates, 96);
}

#[test]
#[ignore = "requires an explicitly supplied authenticated oracle path"]
fn rust_collector_matches_the_excluded_h1_trace() {
    let path = std::env::var("SAGEJS_H1_COLLECTOR_TRACE")
        .expect("set SAGEJS_H1_COLLECTOR_TRACE to the excluded oracle JSON");
    let oracle: serde_json::Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(oracle["oracleOnly"]["excludedFromTimedInput"], true);
    let expected: Vec<i64> = oracle["oracleOnly"]["terminalRelationRecords"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value.as_i64().unwrap())
        .collect();
    let answer = collect_h1_class_group(POLYNOMIAL, BASIS).unwrap();
    if answer.relations != expected {
        let mismatch = answer
            .relations
            .iter()
            .zip(&expected)
            .position(|(actual, expected)| actual != expected)
            .unwrap();
        eprintln!(
            "natural presentation differs first at {mismatch}; counters={:?}; timings={:?}",
            answer.counters, answer.timings
        );
    }
    assert_eq!(answer.counters.smooth_candidates, 96);
    assert_eq!(answer.counters.appended_relations, 61);
}
