#[path = "../src/relation_cache.rs"]
mod relation_cache;

use relation_cache::{AddOutcome, CacheError, RelationCache, relation_mod_inverse};

#[test]
fn missing_pivot_indices_follow_rank_updates() {
    let mut cache = RelationCache::new(3, 8, 0);
    assert_eq!(cache.missing_pivot_indices(), [0, 1, 2]);
    cache.add_relation(&[1, 0, 0], 1, 0, 0, 0, false).unwrap();
    assert_eq!(cache.missing_pivot_indices(), [1, 2]);
    cache.add_relation(&[0, 0, 1], 3, 0, 0, 0, false).unwrap();
    assert_eq!(cache.missing_pivot_indices(), [1]);
}
use serde_json::json;
use sha2::{Digest, Sha256};

#[test]
fn modular_inverse_matches_fixed_field_arithmetic() {
    for value in 1..27_449_i64 {
        let inverse = relation_mod_inverse(value).unwrap();
        assert_eq!((value * inverse).rem_euclid(27_449), 1);
    }
}

#[test]
fn independent_duplicate_and_dependent_paths_reuse_storage() {
    let mut cache = RelationCache::new(3, 8, 0);
    assert_eq!(
        cache.add_relation(&[2, 0, 0], 1, 1, 0, 0, false),
        Ok(AddOutcome {
            rank_marker: 1,
            appended: true
        })
    );
    assert_eq!(cache.missing(), 2);
    assert_eq!(
        cache.add_relation(&[2, 0, 0], 1, 1, 0, 0, false),
        Ok(AddOutcome {
            rank_marker: -1,
            appended: false
        })
    );
    assert_eq!(
        cache.add_relation(&[4, 0, 0], 1, 1, 0, 0, false),
        Ok(AddOutcome {
            rank_marker: 0,
            appended: false
        })
    );
    assert_eq!(cache.len(), 1);
    assert_eq!(cache.records(), &[2, 0, 0]);
    assert_eq!(cache.metadata(), &[1, 0, 0]);
}

#[test]
fn supplementary_random_and_zero_relations_follow_pari_policy() {
    let mut cache = RelationCache::new(2, 8, 1);
    cache.add_relation(&[1, 0], 1, 0, 0, 0, false).unwrap();
    let supplementary = cache.add_relation(&[2, 0], 1, 0, 0, 0, false).unwrap();
    assert!(supplementary.appended);
    assert_eq!(supplementary.rank_marker, 3);
    assert_eq!(cache.remaining_supplementary(), 0);

    let random = cache.add_relation(&[3, 0], 1, 9, 0, 0, true).unwrap();
    assert_eq!(random.rank_marker, 0);
    assert!(random.appended);

    let zero = cache.add_relation(&[0, 0], 3, 0, 0, 0, false).unwrap();
    assert_eq!(zero.rank_marker, 0);
    assert!(zero.appended);
    assert_eq!(cache.first_nonzero_hints(), &[1, 1, 1, 3]);
}

#[test]
fn reset_preserves_allocation_and_restores_rank_state() {
    let mut cache = RelationCache::new(4, 16, 0);
    cache
        .add_relation(&[0, 3, 0, 0], 2, 4, 0, 0, false)
        .unwrap();
    let records_pointer = cache.records().as_ptr();
    cache.reset(2);
    assert!(cache.is_empty());
    assert_eq!(cache.missing(), 4);
    assert_eq!(cache.remaining_supplementary(), 2);
    cache
        .add_relation(&[0, 3, 0, 0], 2, 4, 0, 0, false)
        .unwrap();
    assert_eq!(records_pointer, cache.records().as_ptr());
}

#[test]
fn complete_prime_groups_seed_the_cache_without_new_storage() {
    let mut cache = RelationCache::new(3, 100, 0);
    let mut relation = [99_i64; 3];
    let count = cache
        .initialize_complete_prime_groups(
            2,
            &[2, 3, 5],
            &[0, 1, 0],
            &[1, 2, 3],
            &[true, true, false],
            &[1, 2, 1],
            &mut relation,
        )
        .unwrap();
    assert_eq!(count, 2);
    assert_eq!(cache.records(), &[1, 0, 0, 0, 2, 1]);
    assert_eq!(cache.first_nonzero_hints(), &[1, 2]);
    assert_eq!(cache.metadata(), &[2, 0, 0, 3, 0, 0]);
    assert_eq!(cache.missing(), 1);
    let mut generators = [99_i64; 6];
    cache
        .publish_initial_generators(3, &mut generators)
        .unwrap();
    assert_eq!(generators, [2, 0, 0, 3, 0, 0]);
    assert_eq!(cache.metadata(), &[1, 0, 0, 2, 0, 0]);
}

#[test]
fn complete_prime_groups_accept_exact_bounded_capacity_and_fail_closed_below_it() {
    let arguments = (
        2,
        [2, 3, 5],
        [0_usize, 1, 0],
        [1_usize, 2, 3],
        [true, true, false],
        [1_i64, 2, 1],
    );
    let mut exact = RelationCache::new(3, arguments.0, 2);
    let mut relation = [0_i64; 3];
    assert_eq!(
        exact.initialize_complete_prime_groups(
            2,
            &arguments.1,
            &arguments.2,
            &arguments.3,
            &arguments.4,
            &arguments.5,
            &mut relation,
        ),
        Ok(arguments.0)
    );
    assert_eq!(exact.records(), &[1, 0, 0, 0, 2, 1]);

    let mut too_small = RelationCache::new(3, arguments.0 - 1, 2);
    assert_eq!(
        too_small.initialize_complete_prime_groups(
            2,
            &arguments.1,
            &arguments.2,
            &arguments.3,
            &arguments.4,
            &arguments.5,
            &mut relation,
        ),
        Err(CacheError::CapacityExhausted)
    );
}

#[test]
fn allocation_dimensions_reject_usize_overflow() {
    assert!(matches!(
        RelationCache::try_new(usize::MAX, 2, 0),
        Err(CacheError::InvalidLayout)
    ));
    assert!(matches!(
        RelationCache::try_new(2, usize::MAX, 0),
        Err(CacheError::InvalidLayout)
    ));
}

#[test]
fn all_192_transitions_match_the_pari_2_17_4_oracle_digest() {
    let mut rows = Vec::new();
    for n in [2_usize, 3, 5, 8] {
        for allowance in [0_usize, 2] {
            let mut cache = RelationCache::new(n, 64, allowance);
            let mut prior = vec![0_i64; n];
            for step in 0_usize..24 {
                let mut relation = vec![0_i64; n];
                for (index, value) in relation.iter_mut().enumerate() {
                    let j = index + 1;
                    *value = if (1..=3).contains(&step) {
                        if j == 1 { step as i64 } else { 0 }
                    } else if step % 7 == 0 {
                        0
                    } else if step % 5 == 0 {
                        prior[index]
                    } else {
                        ((step * 7 + j * 3 + step * j) % 7) as i64 - 3
                    };
                }
                let first_nonzero = relation
                    .iter()
                    .position(|value| *value != 0)
                    .map_or(n + 1, |index| index + 1);
                prior.clone_from(&relation);
                let before = cache.len();
                let generator = i64::from(step % 3 != 0);
                let random = step % 2 != 0;
                let outcome = cache
                    .add_relation(&relation, first_nonzero, generator, 0, 0, random)
                    .unwrap();
                rows.push(json!([
                    n,
                    allowance,
                    step,
                    outcome.rank_marker,
                    cache.len(),
                    cache.missing(),
                    cache.remaining_supplementary(),
                    first_nonzero,
                    generator,
                    usize::from(random),
                    relation,
                    cache.basis(),
                    cache.first_nonzero_hints(),
                    cache.records(),
                    usize::from(cache.len() > before),
                ]));
            }
        }
    }
    assert_eq!(rows.len(), 192);
    let digest = Sha256::digest(serde_json::to_vec(&rows).unwrap());
    assert_eq!(
        format!("{digest:x}"),
        "53fb486339f3c26fbd872a7d59bb020907b3ee53e168ba1caef42f662f8d08a1"
    );
}

#[test]
#[ignore = "requires export_h1_rust_phase_checkpoints.cjs output"]
fn h1_initial_cache_matches_the_authenticated_phase_checkpoint() {
    fn values_at(document: &serde_json::Value, pointer: &str) -> Vec<i64> {
        document
            .pointer(pointer)
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_str().unwrap().parse().unwrap())
            .collect()
    }
    fn digest(values: impl IntoIterator<Item = i64>) -> String {
        let strings: Vec<String> = values.into_iter().map(|value| value.to_string()).collect();
        format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&strings).unwrap())
        )
    }
    fn expected_digest<'a>(document: &'a serde_json::Value, pointer: &str) -> &'a str {
        document.pointer(pointer).unwrap().as_str().unwrap()
    }

    let path = std::env::var("SAGEJS_H1_PHASE_CHECKPOINT")
        .expect("set SAGEJS_H1_PHASE_CHECKPOINT to the generated checkpoint");
    let document: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(
        document["schema"],
        "sagejs.pari-class-group/h1-rust-phase-checkpoints-v1"
    );
    let rows = document["shape"]["rows"].as_u64().unwrap() as usize;
    let columns = document["shape"]["columns"].as_u64().unwrap() as usize;
    let degree = document["shape"]["degree"].as_u64().unwrap() as usize;
    let additional = columns - rows;
    let capacity = 10 * (rows + additional) + 50;
    let primes = values_at(
        &document,
        "/oracleOnly/factorBase/activePrimeGroups/primes/values",
    );
    let offsets: Vec<usize> = values_at(
        &document,
        "/oracleOnly/factorBase/activePrimeGroups/offsets/values",
    )
    .into_iter()
    .map(|value| value as usize)
    .collect();
    let counts: Vec<usize> = values_at(
        &document,
        "/oracleOnly/factorBase/activePrimeGroups/counts/values",
    )
    .into_iter()
    .map(|value| value as usize)
    .collect();
    let complete: Vec<bool> = values_at(
        &document,
        "/oracleOnly/factorBase/activePrimeGroups/complete/values",
    )
    .into_iter()
    .map(|value| value != 0)
    .collect();
    let ramification = values_at(
        &document,
        "/oracleOnly/factorBase/activeIdeals/ramification/values",
    );

    let mut cache = RelationCache::new(rows, capacity, additional);
    let mut relation = vec![0; rows];
    let initial_count = cache
        .initialize_complete_prime_groups(
            additional,
            &primes,
            &offsets,
            &counts,
            &complete,
            &ramification,
            &mut relation,
        )
        .unwrap();
    assert_eq!(initial_count, 12);
    assert_eq!(cache.missing(), 54);
    assert_eq!(cache.remaining_supplementary(), 7);
    assert_eq!(
        digest(cache.basis().iter().copied()),
        expected_digest(&document, "/oracleOnly/initialRelationCache/basis/sha256")
    );
    assert_eq!(
        digest(cache.records().iter().copied()),
        expected_digest(&document, "/oracleOnly/initialRelationCache/records/sha256")
    );
    assert_eq!(
        digest(
            cache
                .first_nonzero_hints()
                .iter()
                .map(|value| *value as i64)
        ),
        expected_digest(&document, "/oracleOnly/initialRelationCache/hashes/sha256")
    );
    let mut generators = vec![0_i64; initial_count * degree];
    cache
        .publish_initial_generators(degree, &mut generators)
        .unwrap();
    assert_eq!(
        digest(cache.metadata().iter().copied()),
        expected_digest(
            &document,
            "/oracleOnly/initialRelationCache/metadata/sha256"
        )
    );
    assert_eq!(
        digest(generators),
        expected_digest(
            &document,
            "/oracleOnly/initialRelationCache/generators/sha256"
        )
    );
}
