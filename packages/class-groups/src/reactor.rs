// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Thin checked WebAssembly boundary for the production product service.

use crate::service::ProductService;

#[cfg(target_family = "wasm")]
use crate::service::{MAXIMUM_REQUEST_BYTES, MAXIMUM_RESPONSE_BYTES, SERVICE_ABI_VERSION};

/// Exercise the exact reactor protocol without crossing an unsafe boundary.
/// Native contract tests use this entry point; Wasm hosts use the exports below.
pub fn execute_for_test(service: &mut ProductService, bytes: &[u8]) -> Vec<u8> {
    service.execute_json(bytes)
}

#[cfg(target_family = "wasm")]
mod wasm {
    use super::*;
    use std::alloc::{Layout, alloc, dealloc};
    use std::cell::RefCell;

    thread_local! {
        static SERVICE: RefCell<ProductService> = RefCell::new(ProductService::new());
    }

    fn into_output(bytes: Vec<u8>) -> u64 {
        let bytes = if bytes.len() <= MAXIMUM_RESPONSE_BYTES {
            bytes
        } else {
            br#"{"schema":"sagejs.class-groups/service-response-v1","abi":1,"id":"unknown","ok":false,"error":{"category":"resource-exhausted","operation":"unknown","message":"response exceeds the reactor limit"}}"#.to_vec()
        };
        let bytes = bytes.into_boxed_slice();
        let length = bytes.len();
        let pointer = Box::into_raw(bytes) as *mut u8 as usize;
        ((length as u64) << 32) | pointer as u64
    }

    // FFI-SAFETY: this query exchanges one fixed-width scalar and accesses no
    // guest memory.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_abi_version() -> u32 {
        SERVICE_ABI_VERSION
    }

    // FFI-SAFETY: the caller supplies a bounded byte length and receives either
    // null or an allocation that must be returned with the exact same length.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_alloc(length: u32) -> u32 {
        let length = length as usize;
        if length == 0 || length > MAXIMUM_REQUEST_BYTES {
            return 0;
        }
        let Ok(layout) = Layout::array::<u8>(length) else {
            return 0;
        };
        // SAFETY: the matching deallocator uses this exact byte layout.
        unsafe { alloc(layout) as usize as u32 }
    }

    // FFI-SAFETY: valid callers return a non-null allocation produced by the
    // export above or a boxed output produced by `run_json`, with its unchanged
    // length. Invalid bounded scalar combinations are ignored.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_dealloc(pointer: u32, length: u32) {
        let length = length as usize;
        if pointer == 0 || length == 0 || length > MAXIMUM_RESPONSE_BYTES {
            return;
        }
        if let Ok(layout) = Layout::array::<u8>(length) {
            // SAFETY: this ABI requires the original pointer/length pair.
            unsafe { dealloc(pointer as usize as *mut u8, layout) };
        }
    }

    // FFI-SAFETY: the checked host writes the complete initialized request into
    // an allocation returned by this reactor. The borrow ends before return.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_run_json(pointer: u32, length: u32) -> u64 {
        let length = length as usize;
        if pointer == 0 || length == 0 || length > MAXIMUM_REQUEST_BYTES {
            return into_output(ProductService::new().execute_json(&[]));
        }
        // SAFETY: the host owns a live guest range of exactly `length` bytes.
        let bytes = unsafe { std::slice::from_raw_parts(pointer as usize as *const u8, length) };
        SERVICE.with(|service| into_output(service.borrow_mut().execute_json(bytes)))
    }
}
