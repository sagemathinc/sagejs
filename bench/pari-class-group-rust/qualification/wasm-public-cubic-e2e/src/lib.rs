// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Checked JSON reactor for the complete public-cubic qualification path.

use sagejs_public_cubic_class_group_e2e_qualification as public_cubic;
use serde::Serialize;
use std::alloc::{Layout, alloc, dealloc};

const ABI_VERSION: i32 = 1;
const MAX_TRANSFER_BYTES: usize = 1 << 20;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorReceipt {
    schema: &'static str,
    outcome: &'static str,
    error: String,
}

fn error_receipt(error: impl Into<String>) -> Vec<u8> {
    serde_json::to_vec(&ErrorReceipt {
        schema: "sagejs.rust-class-group/public-cubic-e2e-error-v1",
        outcome: "rejected",
        error: error.into(),
    })
    .expect("the fixed error receipt is serializable")
}

fn execute(bytes: &[u8]) -> Vec<u8> {
    let request = match serde_json::from_slice::<public_cubic::Request>(bytes) {
        Ok(request) => request,
        Err(error) => return error_receipt(format!("invalid request: {error}")),
    };
    match public_cubic::qualify(request) {
        Ok(receipt) => serde_json::to_vec(&receipt).expect("the result receipt is serializable"),
        Err(error) => error_receipt(format!("{error:?}")),
    }
}

fn into_output(bytes: Vec<u8>) -> u64 {
    let bytes = bytes.into_boxed_slice();
    let length = bytes.len();
    let pointer = Box::into_raw(bytes) as *mut u8 as usize;
    ((length as u64) << 32) | pointer as u64
}

// FFI-SAFETY: this version query uses the C ABI and exchanges only an `i32`;
// it neither accepts pointers nor accesses guest memory.
#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_abi_version() -> i32 {
    ABI_VERSION
}

// FFI-SAFETY: the exported allocator accepts a Wasm `usize`, rejects zero and
// oversized transfers, and returns either null or a guest pointer allocated
// with the exact byte layout required by `sagejs_class_group_dealloc`.
#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_alloc(length: usize) -> *mut u8 {
    if length == 0 || length > MAX_TRANSFER_BYTES {
        return std::ptr::null_mut();
    }
    let Ok(layout) = Layout::array::<u8>(length) else {
        return std::ptr::null_mut();
    };
    // SAFETY: the matching ABI deallocator receives the same byte length.
    unsafe { alloc(layout) }
}

// FFI-SAFETY: callers may pass only a non-null pointer returned by this ABI
// together with its unchanged allocation length; the function rejects invalid
// transfer lengths before reconstructing the allocation layout.
#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_dealloc(pointer: *mut u8, length: usize) {
    if pointer.is_null() || length == 0 || length > MAX_TRANSFER_BYTES {
        return;
    }
    if let Ok(layout) = Layout::array::<u8>(length) {
        // SAFETY: the host returns only pointers allocated by this ABI with the
        // identical allocation length.
        unsafe { dealloc(pointer, layout) };
    }
}

// FFI-SAFETY: callers must pass a readable, initialized guest allocation from
// this ABI for the full `length`; zero and oversized transfers are rejected,
// and the borrowed input is used only for the duration of this call.
#[unsafe(no_mangle)]
pub extern "C" fn sagejs_class_group_run_json(pointer: *const u8, length: usize) -> u64 {
    if pointer.is_null() || length == 0 || length > MAX_TRANSFER_BYTES {
        return into_output(error_receipt("invalid input memory range"));
    }
    // SAFETY: the checked host ABI allocates and initializes this guest range.
    let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
    into_output(execute(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_request_fields() {
        let result = execute(br#"{"schema":"wrong","preparedField":{}}"#);
        let value: serde_json::Value = serde_json::from_slice(&result).unwrap();
        assert_eq!(value["outcome"], "rejected");
    }
}
