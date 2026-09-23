// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

#![cfg(feature = "flint-normal-form")]

use rug::Integer;
use sagejs_pari_class_group_rust_experiment::{
    ClassGroupError, CollectorCounters, PreparedContinuationLimits, PreparedCubicRelationCollector,
    PublicCubicPreparationLimits, prepare_monic_cubic,
};

fn assert_counters_monotone(before: &CollectorCounters, after: &CollectorCounters) {
    assert!(after.visited_ideals >= before.visited_ideals);
    assert!(after.cursor_trials >= before.cursor_trials);
    assert!(after.primitive_nonscalar_candidates >= before.primitive_nonscalar_candidates);
    assert!(after.smooth_candidates >= before.smooth_candidates);
    assert!(after.appended_relations >= before.appended_relations);
    assert!(after.positive_cache_statuses >= before.positive_cache_statuses);
    assert!(after.random_ideals >= before.random_ideals);
    assert!(after.random_search_ideals >= before.random_search_ideals);
}

#[test]
fn resumable_collector_appends_a_strict_prefix_and_enforces_cumulative_budgets() {
    let prepared = prepare_monic_cubic(
        [-295, 304, -13, 1].map(Integer::from),
        PublicCubicPreparationLimits::default(),
    )
    .unwrap();
    let limits = PreparedContinuationLimits {
        maximum_visited_ideals: 1_000_000,
        maximum_candidates: 1_000_000,
        maximum_relations: 10_000,
        maximum_dependencies: 9,
    };
    let mut collector = PreparedCubicRelationCollector::new(prepared.field(), limits).unwrap();
    let first = collector.advance_to_supplementary(7).unwrap();
    let second = collector.advance_to_supplementary(8).unwrap();
    let third = collector.advance_to_supplementary(9).unwrap();
    let width = first.factor_base().exact_ideals.len();

    let mut direct_collector =
        PreparedCubicRelationCollector::new(prepared.field(), limits).unwrap();
    let direct = direct_collector.advance_to_supplementary(9).unwrap();

    assert_eq!(second.relations().len(), first.relations().len() + width);
    assert_eq!(third.relations().len(), second.relations().len() + width);
    assert!(second.relations().starts_with(first.relations()));
    assert!(third.relations().starts_with(second.relations()));
    assert!(second.generators().starts_with(first.generators()));
    assert!(third.generators().starts_with(second.generators()));
    assert_counters_monotone(&first.counters, &second.counters);
    assert_counters_monotone(&second.counters, &third.counters);
    assert_eq!(direct.relations(), third.relations());
    assert_eq!(direct.generators(), third.generators());
    assert_eq!(direct.first_nonzero_hints, third.first_nonzero_hints);
    assert_eq!(direct.metadata, third.metadata);
    assert_eq!(direct.counters, third.counters);
    assert!(matches!(
        collector.advance_to_supplementary(8),
        Err(ClassGroupError::ContinuationTargetDecreased)
    ));
    assert!(matches!(
        collector.advance_to_supplementary(10),
        Err(ClassGroupError::ContinuationBudgetExceeded)
    ));
}
