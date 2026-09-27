// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Checked WebAssembly reactor for the standalone quadratic service.

use crate::service::QuadraticService;

#[cfg(target_family = "wasm")]
use crate::service::{MAXIMUM_REQUEST_BYTES, MAXIMUM_RESPONSE_BYTES};

#[cfg(target_family = "wasm")]
const REACTOR_ABI_VERSION: u32 = 2;

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
        generation: u32,
    }

    #[derive(Default)]
    struct Allocations {
        owned: BTreeMap<u32, Allocation>,
        capacity: usize,
        next_generation: u32,
    }

    impl Allocations {
        fn insert(&mut self, mut bytes: Vec<u8>, kind: AllocationKind) -> Option<u64> {
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
            // Never recycle a generation, even if the allocator recycles a
            // pointer. Exhaustion after 2^32-1 allocations fails closed.
            let generation = self.next_generation.checked_add(1)?;
            self.next_generation = generation;
            self.capacity += bytes.capacity();
            self.owned.insert(
                pointer,
                Allocation {
                    bytes,
                    kind,
                    generation,
                },
            );
            Some((u64::from(generation) << 32) | u64::from(pointer))
        }

        fn remove_exact(&mut self, handle: u64, length: usize) {
            let pointer = handle as u32;
            let generation = (handle >> 32) as u32;
            if self
                .owned
                .get(&pointer)
                .map(|item| (item.generation, item.bytes.len()))
                != Some((generation, length))
            {
                return;
            }
            if let Some(item) = self.owned.remove(&pointer) {
                self.capacity -= item.bytes.capacity();
            }
        }

        fn request_bytes(&self, handle: u64, length: usize) -> Option<&[u8]> {
            let pointer = handle as u32;
            let item = self.owned.get(&pointer)?;
            (item.generation == (handle >> 32) as u32
                && item.kind == AllocationKind::Request
                && item.bytes.len() == length)
                .then_some(item.bytes.as_slice())
        }

        fn response_length(&self, handle: u64) -> u32 {
            let pointer = handle as u32;
            let Some(item) = self.owned.get(&pointer) else {
                return 0;
            };
            if item.generation != (handle >> 32) as u32 || item.kind != AllocationKind::Response {
                return 0;
            }
            u32::try_from(item.bytes.len()).unwrap_or(0)
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
        ALLOCATIONS.with(|allocations| {
            allocations
                .borrow_mut()
                .insert(bytes, AllocationKind::Response)
                .unwrap_or(0)
        })
    }

    // FFI-SAFETY: this query exchanges one fixed-width scalar only.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_abi_version() -> u32 {
        REACTOR_ABI_VERSION
    }

    // FFI-SAFETY: the low 32 bits locate a registered zero-initialized guest
    // allocation; the high 32 bits identify its non-recycled generation.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_alloc(length: u32) -> u64 {
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

    // FFI-SAFETY: an exact owned handle/length pair is required; other inputs
    // do nothing, and dropping the Vec uses its original allocator and capacity.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_dealloc(handle: u64, length: u32) {
        let length = length as usize;
        if handle == 0 || length == 0 || length > MAXIMUM_RESPONSE_BYTES {
            return;
        }
        ALLOCATIONS.with(|allocations| allocations.borrow_mut().remove_exact(handle, length));
    }

    // FFI-SAFETY: only the exact live response handle exposes its bounded length.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_allocation_length(handle: u64) -> u32 {
        ALLOCATIONS.with(|allocations| allocations.borrow().response_length(handle))
    }

    // FFI-SAFETY: never dereference an unregistered or wrong-generation handle.
    // The request remains owned and immovable while the service runs synchronously.
    #[unsafe(no_mangle)]
    pub extern "C" fn sagejs_class_group_run_json(handle: u64, length: u32) -> u64 {
        let length = length as usize;
        let response = ALLOCATIONS.with(|allocations| {
            let allocations = allocations.borrow();
            let request = if handle != 0 && length != 0 && length <= MAXIMUM_REQUEST_BYTES {
                allocations.request_bytes(handle, length)
            } else {
                None
            };
            SERVICE.with(|service| service.borrow_mut().execute_json(request.unwrap_or(&[])))
        });
        into_output(response)
    }
}
