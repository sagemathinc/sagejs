// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

//! Checked JSON reactor for the complete public-cubic qualification path.

use sagejs_public_cubic_class_group_e2e_qualification as public_cubic;
use serde::{Deserialize, Serialize};
use std::alloc::{Layout, alloc, dealloc};
use std::cell::RefCell;
use std::collections::BTreeMap;

const ABI_VERSION: i32 = 1;
const MAX_TRANSFER_BYTES: usize = 1 << 20;
const MAX_RESIDENT_SESSIONS: usize = 4;
const SESSION_OPEN_SCHEMA: &str = "sagejs.rust-class-group/cubic-session-open-v1";
const SESSION_QUERY_SCHEMA: &str = "sagejs.rust-class-group/cubic-session-query-v1";
const SESSION_CLOSE_SCHEMA: &str = "sagejs.rust-class-group/cubic-session-close-v1";

struct ResidentSession {
    polynomial_ascending: [String; 4],
    qualified: public_cubic::QualifiedCubic,
}

struct SessionStore {
    next_handle: u32,
    sessions: BTreeMap<u32, ResidentSession>,
}

impl SessionStore {
    fn new() -> Self {
        Self {
            next_handle: 1,
            sessions: BTreeMap::new(),
        }
    }

    fn insert(&mut self, session: ResidentSession) -> Result<u32, &'static str> {
        if self.sessions.len() >= MAX_RESIDENT_SESSIONS {
            return Err("resident session capacity exhausted");
        }
        let handle = self.next_handle;
        self.next_handle = self
            .next_handle
            .checked_add(1)
            .ok_or("resident session handle space exhausted")?;
        self.sessions.insert(handle, session);
        Ok(handle)
    }

    fn preflight_open(&self) -> Result<(), &'static str> {
        if self.sessions.len() >= MAX_RESIDENT_SESSIONS {
            Err("resident session capacity exhausted")
        } else if self.next_handle == u32::MAX {
            Err("resident session handle space exhausted")
        } else {
            Ok(())
        }
    }
}

// A reactor instance is single-threaded under the checked host ABI. Keeping
// the table thread-local avoids imposing Send/Sync on foreign GMP/FLINT state;
// a future threaded product reactor must give each worker its own store.
thread_local! {
    static SESSIONS: RefCell<SessionStore> = RefCell::new(SessionStore::new());
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionOpenRequest {
    schema: String,
    completion_request: public_cubic::Request,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionQueryRequest {
    schema: String,
    handle: u32,
    ideal_integral_basis_rows: [[String; 3]; 3],
    resources: public_cubic::IdealQueryResources,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionCloseRequest {
    schema: String,
    handle: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionOpenReceipt {
    schema: &'static str,
    outcome: &'static str,
    handle: u32,
    maximum_resident_sessions: usize,
    completion: public_cubic::Receipt,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionCloseReceipt {
    schema: &'static str,
    outcome: &'static str,
    handle: u32,
}

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

fn execute_session_open(value: serde_json::Value) -> Vec<u8> {
    let request = match serde_json::from_value::<SessionOpenRequest>(value) {
        Ok(request) if request.schema == SESSION_OPEN_SCHEMA => request,
        Ok(_) => return error_receipt("unsupported session-open schema"),
        Err(error) => return error_receipt(format!("invalid session-open request: {error}")),
    };
    if let Err(error) = SESSIONS.with(|sessions| sessions.borrow().preflight_open()) {
        return error_receipt(error);
    }
    let polynomial_ascending = request.completion_request.polynomial_ascending.clone();
    let qualified = match public_cubic::qualify_with_state(request.completion_request) {
        Ok(qualified) => qualified,
        Err(error) => return error_receipt(format!("{error:?}")),
    };
    SESSIONS.with(|sessions| {
        let mut sessions = sessions.borrow_mut();
        let handle = match sessions.insert(ResidentSession {
            polynomial_ascending,
            qualified,
        }) {
            Ok(handle) => handle,
            Err(error) => return error_receipt(error),
        };
        serde_json::to_vec(&SessionOpenReceipt {
            schema: "sagejs.rust-class-group/cubic-session-open-receipt-v1",
            outcome: "open",
            handle,
            maximum_resident_sessions: MAX_RESIDENT_SESSIONS,
            completion: sessions
                .sessions
                .get(&handle)
                .expect("new resident handle exists")
                .qualified
                .receipt
                .clone(),
        })
        .expect("the session-open receipt is serializable")
    })
}

fn execute_session_query(value: serde_json::Value) -> Vec<u8> {
    let request = match serde_json::from_value::<SessionQueryRequest>(value) {
        Ok(request) if request.schema == SESSION_QUERY_SCHEMA => request,
        Ok(_) => return error_receipt("unsupported session-query schema"),
        Err(error) => return error_receipt(format!("invalid session-query request: {error}")),
    };
    SESSIONS.with(|sessions| {
        let sessions = sessions.borrow();
        let Some(session) = sessions.sessions.get(&request.handle) else {
            return error_receipt("unknown or closed resident session handle");
        };
        let (queried_ideal_integral_basis_rows, certificate) = match session
            .qualified
            .query_integral_ideal(&request.ideal_integral_basis_rows, request.resources)
        {
            Ok(answer) => answer,
            Err(error) => return error_receipt(format!("{error:?}")),
        };
        serde_json::to_vec(&public_cubic::IdealQueryReceipt {
            schema: public_cubic::IDEAL_QUERY_RECEIPT_SCHEMA,
            outcome: "complete-conditional-grh-ideal-class",
            polynomial_ascending: session.polynomial_ascending.clone(),
            completion: session.qualified.receipt.clone(),
            queried_ideal_integral_basis_rows,
            certificate,
        })
        .expect("the resident query receipt is serializable")
    })
}

fn execute_session_close(value: serde_json::Value) -> Vec<u8> {
    let request = match serde_json::from_value::<SessionCloseRequest>(value) {
        Ok(request) if request.schema == SESSION_CLOSE_SCHEMA => request,
        Ok(_) => return error_receipt("unsupported session-close schema"),
        Err(error) => return error_receipt(format!("invalid session-close request: {error}")),
    };
    SESSIONS.with(|sessions| {
        if sessions
            .borrow_mut()
            .sessions
            .remove(&request.handle)
            .is_none()
        {
            return error_receipt("unknown or closed resident session handle");
        }
        serde_json::to_vec(&SessionCloseReceipt {
            schema: "sagejs.rust-class-group/cubic-session-close-receipt-v1",
            outcome: "closed",
            handle: request.handle,
        })
        .expect("the session-close receipt is serializable")
    })
}

fn execute(bytes: &[u8]) -> Vec<u8> {
    let value = match serde_json::from_slice::<serde_json::Value>(bytes) {
        Ok(value) => value,
        Err(error) => return error_receipt(format!("invalid request: {error}")),
    };
    match value.get("schema").and_then(serde_json::Value::as_str) {
        Some(SESSION_OPEN_SCHEMA) => return execute_session_open(value),
        Some(SESSION_QUERY_SCHEMA) => return execute_session_query(value),
        Some(SESSION_CLOSE_SCHEMA) => return execute_session_close(value),
        _ => {}
    }
    if value.get("schema").and_then(serde_json::Value::as_str)
        == Some(public_cubic::IDEAL_QUERY_REQUEST_SCHEMA)
    {
        let request = match serde_json::from_value::<public_cubic::IdealQueryRequest>(value) {
            Ok(request) => request,
            Err(error) => return error_receipt(format!("invalid ideal query: {error}")),
        };
        return match public_cubic::qualify_ideal_query(request) {
            Ok(receipt) => serde_json::to_vec(&receipt).expect("the query receipt is serializable"),
            Err(error) => error_receipt(format!("{error:?}")),
        };
    }
    let request = match serde_json::from_value::<public_cubic::Request>(value) {
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
