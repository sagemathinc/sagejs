// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Checked WebAssembly reactor for the standalone quadratic service.

use crate::service::QuadraticService;

#[cfg(target_family = "wasm")]
use crate::service::{MAXIMUM_REQUEST_BYTES, MAXIMUM_RESPONSE_BYTES, SERVICE_ABI_VERSION};

pub fn execute_for_test(service: &mut QuadraticService, bytes: &[u8]) -> Vec<u8> {
    service.execute_json(bytes)
}

#[cfg(target_family = "wasm")]
mod wasm {
    use super::*;
    use std::alloc::{Layout, alloc, dealloc};
    use std::cell::RefCell;

    thread_local! {
        static SERVICE: RefCell<QuadraticService> = RefCell::new(QuadraticService::new());
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

    // FFI-SAFETY: this query exchanges one fixed-width scalar only.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_abi_version() -> u32 {
        SERVICE_ABI_VERSION
    }

    // FFI-SAFETY: the caller owns and initializes the bounded allocation.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_alloc(length: u32) -> u32 {
        let length = length as usize;
        if length == 0 || length > MAXIMUM_REQUEST_BYTES {
            return 0;
        }
        let Ok(layout) = Layout::array::<u8>(length) else {
            return 0;
        };
        // SAFETY: dealloc receives this exact pointer and length.
        unsafe { alloc(layout) as usize as u32 }
    }

    // FFI-SAFETY: only the original pointer/length pair is accepted by ABI.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_dealloc(pointer: u32, length: u32) {
        let length = length as usize;
        if pointer == 0 || length == 0 || length > MAXIMUM_RESPONSE_BYTES {
            return;
        }
        if let Ok(layout) = Layout::array::<u8>(length) {
            // SAFETY: the host returns the allocation with its original layout.
            unsafe { dealloc(pointer as usize as *mut u8, layout) };
        }
    }

    // FFI-SAFETY: the checked host writes all request bytes into a live guest
    // allocation, and the borrow ends before the call returns.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_run_json(pointer: u32, length: u32) -> u64 {
        let length = length as usize;
        if pointer == 0 || length == 0 || length > MAXIMUM_REQUEST_BYTES {
            return into_output(QuadraticService::new().execute_json(&[]));
        }
        // SAFETY: the host owns an initialized guest allocation of this length.
        let bytes = unsafe { std::slice::from_raw_parts(pointer as usize as *const u8, length) };
        SERVICE.with(|service| into_output(service.borrow_mut().execute_json(bytes)))
    }
}
