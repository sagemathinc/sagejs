//! Resource-bounded relation-collection prefix on the production prepared path.

#[path = "../../../src/class_group.rs"]
mod class_group;
#[path = "../../../src/collector_schedule.rs"]
mod collector_schedule;
#[path = "../../../src/enumeration.rs"]
mod enumeration;
#[path = "../../../src/factor_base.rs"]
mod factor_base;
#[path = "../../../src/hnf.rs"]
mod hnf;
#[path = "../../../src/ideal_arithmetic.rs"]
mod ideal_arithmetic;
#[path = "../../../src/numerical_preparation.rs"]
mod numerical_preparation;
#[path = "../../../src/pari_random.rs"]
mod pari_random;
#[path = "../../../src/prepared.rs"]
mod prepared;
#[path = "../../../src/prepared_factor_base.rs"]
mod prepared_factor_base;
#[path = "../../../src/prepared_ideal.rs"]
mod prepared_ideal;
#[path = "../../../src/prepared_input.rs"]
mod prepared_input;
#[path = "../../../src/prime_valuation.rs"]
mod prime_valuation;
#[path = "../../../src/relation_cache.rs"]
mod relation_cache;
#[path = "../../../src/smooth_admission.rs"]
mod smooth_admission;

pub use prepared::{
    EmbeddingPrecisionState, PreparedCubicData, PreparedCubicValidationError,
    ValidatedPreparedCubic,
};

use class_group::{PreparedCollectorLimits, collect_prepared_cubic_relations};
use prepared_input::parse_neutral_prepared_cubic_json;
use rug::Integer;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::alloc::{Layout, alloc, dealloc};

const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAXIMUM_VISITED_IDEALS: usize = 1;
const MAXIMUM_CANDIDATES: usize = 64;
const REQUEST_SCHEMA: &str = "sagejs.rust-class-group/prepared-relation-prefix-request-v1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BoundedRequest {
    schema: String,
    maximum_visited_ideals: usize,
    maximum_candidates: usize,
    prepared_field: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Limits {
    maximum_visited_ideals: usize,
    maximum_candidates: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Counters {
    visited_ideals: usize,
    cursor_trials: usize,
    primitive_nonscalar_candidates: usize,
    smooth_candidates: usize,
    appended_relations: usize,
    positive_cache_statuses: usize,
    random_ideals: usize,
    random_search_ideals: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Storage {
    relation_cache_capacity: usize,
    full_relation_cache_capacity: usize,
    dense_records_bytes: usize,
    full_dense_records_bytes: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultDocument {
    schema: &'static str,
    status: &'static str,
    stage: &'static str,
    input_id: String,
    field_id: String,
    limits: Limits,
    relation_bound: usize,
    factor_base_ideals: usize,
    resident_relation_rows: usize,
    missing_rank: usize,
    complete_rank_and_surplus: bool,
    counters: Counters,
    storage: Storage,
    prefix_sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorDocument {
    schema: &'static str,
    status: &'static str,
    stage: &'static str,
    error: String,
}

fn hash_integer(hasher: &mut Sha256, value: &Integer) {
    let text = value.to_string();
    hasher.update((text.len() as u64).to_le_bytes());
    hasher.update(text.as_bytes());
}

fn dense_record_bytes(capacity: usize, width: usize) -> Result<usize, String> {
    capacity
        .checked_mul(width)
        .and_then(|value| value.checked_mul(size_of::<i64>()))
        .ok_or_else(|| "dense relation-record byte count overflow".into())
}

fn run(source: &str) -> Result<ResultDocument, String> {
    let request: BoundedRequest = serde_json::from_str(source)
        .map_err(|error| format!("invalid bounded request: {error}"))?;
    if request.schema != REQUEST_SCHEMA
        || request.maximum_visited_ideals != MAXIMUM_VISITED_IDEALS
        || request.maximum_candidates != MAXIMUM_CANDIDATES
    {
        return Err("unsupported bounded relation-prefix request".into());
    }
    let prepared_source = serde_json::to_string(&request.prepared_field)
        .map_err(|error| format!("invalid prepared field: {error}"))?;
    let input =
        parse_neutral_prepared_cubic_json(&prepared_source).map_err(|error| error.to_string())?;
    let presentation = collect_prepared_cubic_relations(
        input.field(),
        PreparedCollectorLimits {
            maximum_visited_ideals: MAXIMUM_VISITED_IDEALS,
            maximum_candidates: MAXIMUM_CANDIDATES,
        },
    )
    .map_err(|error| format!("{error:?}"))?;
    let width = presentation.factor_base.catalog.ideals.len();
    if width == 0 || presentation.relations.len() % width != 0 {
        return Err("invalid relation presentation shape".into());
    }
    let mut hash = Sha256::new();
    hash.update(b"sagejs.prepared-relation-prefix/v1\0");
    for value in &presentation.relations {
        hash.update(value.to_le_bytes());
    }
    for value in &presentation.generators {
        hash_integer(&mut hash, value);
    }
    for value in &presentation.first_nonzero_hints {
        hash.update((*value as u64).to_le_bytes());
    }
    for value in &presentation.metadata {
        hash.update(value.to_le_bytes());
    }
    for value in &presentation.search_permutation {
        hash.update((*value as u64).to_le_bytes());
    }
    let counters = &presentation.counters;
    let dense_records_bytes = dense_record_bytes(presentation.relation_capacity, width)?;
    let full_dense_records_bytes = dense_record_bytes(presentation.full_relation_capacity, width)?;
    Ok(ResultDocument {
        schema: "sagejs.rust-class-group/prepared-relation-prefix-v1",
        status: "bounded-stage",
        stage: "prepared-cubic-relation-prefix",
        input_id: input.input_id,
        field_id: input.field_id,
        limits: Limits {
            maximum_visited_ideals: MAXIMUM_VISITED_IDEALS,
            maximum_candidates: MAXIMUM_CANDIDATES,
        },
        relation_bound: presentation.factor_base.catalog.relation_bound,
        factor_base_ideals: width,
        resident_relation_rows: presentation.relations.len() / width,
        missing_rank: presentation.missing_rank,
        complete_rank_and_surplus: presentation.complete_rank_and_surplus,
        counters: Counters {
            visited_ideals: counters.visited_ideals,
            cursor_trials: counters.cursor_trials,
            primitive_nonscalar_candidates: counters.primitive_nonscalar_candidates,
            smooth_candidates: counters.smooth_candidates,
            appended_relations: counters.appended_relations,
            positive_cache_statuses: counters.positive_cache_statuses,
            random_ideals: counters.random_ideals,
            random_search_ideals: counters.random_search_ideals,
        },
        storage: Storage {
            relation_cache_capacity: presentation.relation_capacity,
            full_relation_cache_capacity: presentation.full_relation_capacity,
            dense_records_bytes,
            full_dense_records_bytes,
        },
        prefix_sha256: format!("{:x}", hash.finalize()),
    })
}

fn encode(source: &str) -> Vec<u8> {
    match run(source) {
        Ok(result) => serde_json::to_vec(&result).expect("result serialization is infallible"),
        Err(error) => serde_json::to_vec(&ErrorDocument {
            schema: "sagejs.rust-class-group/prepared-relation-prefix-v1",
            status: "error",
            stage: "prepared-cubic-relation-prefix",
            error,
        })
        .expect("error serialization is infallible"),
    }
}

pub fn run_prepared_relation_prefix_json(source: &str) -> String {
    String::from_utf8(encode(source)).expect("JSON output is UTF-8")
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_abi_version() -> i32 {
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_alloc(length: u32) -> u32 {
    let length = length as usize;
    if length == 0 || length > MAX_INPUT_BYTES {
        return 0;
    }
    let layout = Layout::array::<u8>(length).expect("bounded layout");
    unsafe { alloc(layout) as u32 }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_dealloc(pointer: u32, length: u32) {
    if pointer == 0 || length == 0 {
        return;
    }
    if let Ok(layout) = Layout::array::<u8>(length as usize) {
        unsafe { dealloc(pointer as *mut u8, layout) }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_run_json(pointer: u32, length: u32) -> u64 {
    if pointer == 0 || length == 0 || length as usize > MAX_INPUT_BYTES {
        return 0;
    }
    let input = unsafe { std::slice::from_raw_parts(pointer as *const u8, length as usize) };
    let source = match std::str::from_utf8(input) {
        Ok(source) => source,
        Err(error) => return pack(encode(&format!("{{\"invalidUtf8\":{error:?}}}"))),
    };
    pack(encode(source))
}

fn pack(bytes: Vec<u8>) -> u64 {
    if bytes.is_empty() || bytes.len() > MAX_INPUT_BYTES {
        return 0;
    }
    let mut bytes = bytes.into_boxed_slice();
    let pointer = bytes.as_mut_ptr() as u32;
    let length = bytes.len() as u32;
    std::mem::forget(bytes);
    (u64::from(length) << 32) | u64::from(pointer)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROW6: &str = include_str!("../../row6-candidate/inputs/row6-neutral-prepared-field.json");

    fn bounded(prepared: &str) -> String {
        serde_json::to_string(&serde_json::json!({
            "schema": REQUEST_SCHEMA,
            "maximumVisitedIdeals": MAXIMUM_VISITED_IDEALS,
            "maximumCandidates": MAXIMUM_CANDIDATES,
            "preparedField": serde_json::from_str::<serde_json::Value>(prepared).unwrap(),
        }))
        .unwrap()
    }

    fn bounded_row6() -> String {
        bounded(ROW6)
    }

    #[test]
    fn malformed_and_oracle_bearing_inputs_fail_closed() {
        assert!(run("{}").is_err());
        assert!(run(ROW6).is_err());
        let forbidden = ROW6.replacen(
            "\"containsOracleAnswers\": false",
            "\"containsOracleAnswers\": true",
            1,
        );
        let forbidden_request = bounded(&forbidden);
        assert!(run(&forbidden_request).is_err());

        let wrong_limit =
            bounded_row6().replacen("\"maximumCandidates\":64", "\"maximumCandidates\":65", 1);
        assert!(run(&wrong_limit).is_err());
        let wrong_visited = bounded_row6().replacen(
            "\"maximumVisitedIdeals\":1",
            "\"maximumVisitedIdeals\":2",
            1,
        );
        assert!(run(&wrong_visited).is_err());
        assert!(dense_record_bytes(usize::MAX, 2).is_err());
        assert!(dense_record_bytes(2, usize::MAX).is_err());
    }

    #[test]
    fn real_row6_relation_prefix_is_stable_and_incomplete() {
        for _ in 0..3 {
            let result = run(&bounded_row6()).expect("row-6 relation prefix");
            assert_eq!(result.status, "bounded-stage");
            assert_eq!(result.factor_base_ideals, 1130);
            assert_eq!(result.resident_relation_rows, 204);
            assert_eq!(result.missing_rank, 926);
            assert!(!result.complete_rank_and_surplus);
            assert_eq!(result.counters.visited_ideals, 1);
            assert_eq!(result.counters.primitive_nonscalar_candidates, 64);
            assert_eq!(result.counters.smooth_candidates, 1);
            assert_eq!(result.counters.appended_relations, 1);
            assert_eq!(result.storage.relation_cache_capacity, 267);
            assert_eq!(result.storage.full_relation_cache_capacity, 11_420);
            assert_eq!(result.storage.dense_records_bytes, 2_413_680);
            assert_eq!(result.storage.full_dense_records_bytes, 103_236_800);
            assert_eq!(
                result.prefix_sha256,
                "7e4c9242d3fa92c7bc7f8fbb3e9c68cc77f66cbc5838657cf38e610c66ba22b3"
            );
        }
    }
}
