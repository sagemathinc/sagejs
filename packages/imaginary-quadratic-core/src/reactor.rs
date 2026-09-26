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
    use std::cell::RefCell;
    use std::collections::BTreeMap;

    const MAXIMUM_OUTSTANDING_ALLOCATIONS: usize = 8;
    const MAXIMUM_OUTSTANDING_CAPACITY: usize = 3 * MAXIMUM_RESPONSE_BYTES;

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum AllocationKind {
        Request,
        Response,
    }

    struct Allocation {
        bytes: Vec<u8>,
        kind: AllocationKind,
    }

    #[derive(Default)]
    struct Allocations {
        owned: BTreeMap<u32, Allocation>,
        capacity: usize,
    }

    impl Allocations {
        fn insert(&mut self, mut bytes: Vec<u8>, kind: AllocationKind) -> Option<u32> {
            if bytes.is_empty()
                || self.owned.len() >= MAXIMUM_OUTSTANDING_ALLOCATIONS
                || bytes.capacity() > MAXIMUM_OUTSTANDING_CAPACITY - self.capacity
            {
                return None;
            }
            let pointer = u32::try_from(bytes.as_mut_ptr() as usize).ok()?;
            if pointer == 0 || self.owned.contains_key(&pointer) {
                return None;
            }
            self.capacity += bytes.capacity();
            self.owned.insert(pointer, Allocation { bytes, kind });
            Some(pointer)
        }

        fn remove_exact(&mut self, pointer: u32, length: usize) {
            if self.owned.get(&pointer).map(|item| item.bytes.len()) != Some(length) {
                return;
            }
            if let Some(item) = self.owned.remove(&pointer) {
                self.capacity -= item.bytes.capacity();
            }
        }

        fn request_bytes(&self, pointer: u32, length: usize) -> Option<&[u8]> {
            let item = self.owned.get(&pointer)?;
            (item.kind == AllocationKind::Request && item.bytes.len() == length)
                .then_some(item.bytes.as_slice())
        }
    }

    thread_local! {
        static SERVICE: RefCell<QuadraticService> = RefCell::new(QuadraticService::new());
        static ALLOCATIONS: RefCell<Allocations> = RefCell::new(Allocations::default());
    }

    fn into_output(bytes: Vec<u8>) -> u64 {
        let bytes = if bytes.len() <= MAXIMUM_RESPONSE_BYTES {
            bytes
        } else {
            br#"{"schema":"sagejs.class-groups/service-response-v1","abi":1,"id":"unknown","ok":false,"error":{"category":"resource-exhausted","operation":"unknown","message":"response exceeds the reactor limit"}}"#.to_vec()
        };
        let length = bytes.len();
        let pointer = ALLOCATIONS.with(|allocations| {
            allocations
                .borrow_mut()
                .insert(bytes, AllocationKind::Response)
        });
        pointer.map_or(0, |pointer| ((length as u64) << 32) | u64::from(pointer))
    }

    // FFI-SAFETY: this query exchanges one fixed-width scalar only.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_abi_version() -> u32 {
        SERVICE_ABI_VERSION
    }

    // FFI-SAFETY: only a registered, zero-initialized guest allocation is returned.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_alloc(length: u32) -> u32 {
        let length = length as usize;
        if length == 0 || length > MAXIMUM_REQUEST_BYTES {
            return 0;
        }
        let mut bytes = Vec::new();
        if bytes.try_reserve_exact(length).is_err() {
            return 0;
        }
        bytes.resize(length, 0);
        ALLOCATIONS.with(|allocations| {
            allocations
                .borrow_mut()
                .insert(bytes, AllocationKind::Request)
                .unwrap_or(0)
        })
    }

    // FFI-SAFETY: an exact owned pointer/length pair is required; other inputs
    // do nothing, and dropping the Vec uses its original allocator and capacity.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_dealloc(pointer: u32, length: u32) {
        let length = length as usize;
        if pointer == 0 || length == 0 || length > MAXIMUM_RESPONSE_BYTES {
            return;
        }
        ALLOCATIONS.with(|allocations| allocations.borrow_mut().remove_exact(pointer, length));
    }

    // FFI-SAFETY: never dereference an unregistered or wrong-length pointer.
    // The request remains owned and immovable while the service runs synchronously.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_run_json(pointer: u32, length: u32) -> u64 {
        let length = length as usize;
        let response = ALLOCATIONS.with(|allocations| {
            let allocations = allocations.borrow();
            let request = if pointer != 0 && length != 0 && length <= MAXIMUM_REQUEST_BYTES {
                allocations.request_bytes(pointer, length)
            } else {
                None
            };
            SERVICE.with(|service| service.borrow_mut().execute_json(request.unwrap_or(&[])))
        });
        into_output(response)
    }
}
