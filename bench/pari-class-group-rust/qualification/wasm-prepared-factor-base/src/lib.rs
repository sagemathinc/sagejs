//! Bounded browser milestone on the real prepared-cubic class-group path.
//!
//! The artifact accepts the answer-free neutral prepared-field document,
//! replay-validates its exact arithmetic, and constructs the complete exact
//! maximal-order factor base.  It intentionally does not collect relations or
//! claim a class group.

#[path = "../../../src/factor_base.rs"]
mod factor_base;
#[path = "../../../src/hnf.rs"]
mod hnf;
#[path = "../../../src/prepared.rs"]
mod prepared;
#[path = "../../../src/prepared_factor_base.rs"]
mod prepared_factor_base;
#[path = "../../../src/prepared_ideal.rs"]
mod prepared_ideal;
#[path = "../../../src/prepared_input.rs"]
mod prepared_input;
#[cfg(test)]
#[path = "../../../src/relation_cache.rs"]
mod relation_cache;

pub use prepared::{
    EmbeddingPrecisionState, PreparedCubicData, PreparedCubicValidationError,
    ValidatedPreparedCubic,
};

use prepared_factor_base::prepared_maximal_cubic_factor_base;
use prepared_input::parse_neutral_prepared_cubic_json;
use rug::Integer;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::alloc::{Layout, alloc, dealloc};

const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResultDocument {
    schema: &'static str,
    status: &'static str,
    stage: &'static str,
    input_id: String,
    field_id: String,
    equation_order_index: String,
    relation_bound: usize,
    checking_bound: usize,
    rational_prime_count: usize,
    ideal_count: usize,
    complete_group_count: usize,
    descriptor_sha256: String,
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

fn run(source: &str) -> Result<ResultDocument, String> {
    let input = parse_neutral_prepared_cubic_json(source).map_err(|error| error.to_string())?;
    let base =
        prepared_maximal_cubic_factor_base(input.field()).map_err(|error| format!("{error:?}"))?;
    if base.catalog.ideals.len() != base.exact_ideals.len() {
        return Err("descriptor/exact-ideal length mismatch".into());
    }
    let mut hash = Sha256::new();
    hash.update(b"sagejs.prepared-factor-base/v1\0");
    for (descriptor, exact) in base.catalog.ideals.iter().zip(&base.exact_ideals) {
        hash.update(descriptor.prime.to_le_bytes());
        hash.update((descriptor.ramification as u64).to_le_bytes());
        hash.update((descriptor.residue_degree as u64).to_le_bytes());
        for value in descriptor.generator {
            hash.update(value.to_le_bytes());
        }
        for value in descriptor.hnf {
            hash.update(value.to_le_bytes());
        }
        hash.update(descriptor.norm.to_le_bytes());
        for row in exact.basis_rows() {
            for value in row {
                hash_integer(&mut hash, value);
            }
        }
    }
    for group in 0..base.catalog.rational_primes.len() {
        hash.update(base.catalog.rational_primes[group].to_le_bytes());
        hash.update((base.catalog.rational_offsets[group] as u64).to_le_bytes());
        hash.update((base.catalog.rational_counts[group] as u64).to_le_bytes());
        hash.update([u8::from(base.catalog.complete_groups[group])]);
    }
    let equation_order_index = input.field().equation_order_index().to_string();
    Ok(ResultDocument {
        schema: "sagejs.rust-class-group/prepared-factor-base-v1",
        status: "bounded-stage",
        stage: "prepared-maximal-cubic-factor-base",
        input_id: input.input_id,
        field_id: input.field_id,
        equation_order_index,
        relation_bound: base.catalog.relation_bound,
        checking_bound: base.catalog.checking_bound,
        rational_prime_count: base.catalog.rational_primes.len(),
        ideal_count: base.catalog.ideals.len(),
        complete_group_count: base
            .catalog
            .complete_groups
            .iter()
            .filter(|value| **value)
            .count(),
        descriptor_sha256: format!("{:x}", hash.finalize()),
    })
}

fn encode(source: &str) -> Vec<u8> {
    match run(source) {
        Ok(result) => serde_json::to_vec(&result).expect("result serialization is infallible"),
        Err(error) => serde_json::to_vec(&ErrorDocument {
            schema: "sagejs.rust-class-group/prepared-factor-base-v1",
            status: "error",
            stage: "prepared-maximal-cubic-factor-base",
            error,
        })
        .expect("error serialization is infallible"),
    }
}

/// Execute the identical bounded stage without crossing the Wasm allocation
/// ABI. This is used only by the native comparison harness.
pub fn run_prepared_factor_base_json(source: &str) -> String {
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
        unsafe {
            dealloc(pointer as *mut u8, layout);
        }
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
    // A boxed slice has the exact allocation layout reconstructed by the ABI
    // deallocator. `Vec::shrink_to_fit` would not make that guarantee.
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

    #[test]
    fn real_row6_prepared_factor_base_is_stable() {
        for _ in 0..3 {
            let result = run(ROW6).expect("row-6 factor base");
            assert_eq!(result.status, "bounded-stage");
            assert_eq!(result.stage, "prepared-maximal-cubic-factor-base");
            assert_eq!(result.equation_order_index, "3");
            assert_eq!(result.relation_bound, 9196);
            assert_eq!(result.checking_bound, 9196);
            assert_eq!(result.rational_prime_count, 740);
            assert_eq!(result.ideal_count, 1130);
            assert_eq!(result.complete_group_count, 203);
            assert_eq!(
                result.descriptor_sha256,
                "dc63c73dbc419b05a4a1b907cdd8a60f70247f74a0d477880eb25d19c4356306"
            );
        }
    }

    #[test]
    fn malformed_and_oracle_bearing_inputs_fail_closed() {
        assert!(run("{}").is_err());
        let forbidden = ROW6.replacen(
            "\"containsOracleAnswers\": false",
            "\"containsOracleAnswers\": true",
            1,
        );
        assert!(run(&forbidden).is_err());
    }
}
