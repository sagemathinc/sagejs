//! Exact-arithmetic ABI probe shared by native Rust and `wasm32-wasip1`.
//!
//! The probe intentionally binds only the small GMP surface it exercises. GMP
//! owns every limb allocation and no GMP allocation crosses the Rust/host ABI.

use std::ffi::{c_char, c_int, c_ulong};
use std::mem::MaybeUninit;
use std::sync::OnceLock;

#[repr(C)]
struct Mpz {
    alloc: c_int,
    size: c_int,
    limbs: *mut c_ulong,
}

unsafe extern "C" {
    fn __gmpz_init(value: *mut Mpz);
    fn __gmpz_clear(value: *mut Mpz);
    fn __gmpz_ui_pow_ui(result: *mut Mpz, base: c_ulong, exponent: c_ulong);
    fn __gmpz_sub_ui(result: *mut Mpz, value: *const Mpz, amount: c_ulong);
    fn __gmpz_add_ui(result: *mut Mpz, value: *const Mpz, amount: c_ulong);
    fn __gmpz_mul(result: *mut Mpz, left: *const Mpz, right: *const Mpz);
    fn __gmpz_add(result: *mut Mpz, left: *const Mpz, right: *const Mpz);
    fn __gmpz_gcd(result: *mut Mpz, left: *const Mpz, right: *const Mpz);
    fn __gmpz_divexact(result: *mut Mpz, numerator: *const Mpz, denominator: *const Mpz);
    fn __gmpz_powm(result: *mut Mpz, base: *const Mpz, exponent: *const Mpz, modulus: *const Mpz);
    fn __gmpz_fac_ui(result: *mut Mpz, value: c_ulong);
    fn __gmpz_cmp(left: *const Mpz, right: *const Mpz) -> c_int;
    fn __gmpz_sizeinbase(value: *const Mpz, base: c_int) -> usize;
    fn __gmpz_get_str(output: *mut c_char, base: c_int, value: *const Mpz) -> *mut c_char;
}

struct Integer(Mpz);

impl Integer {
    fn new() -> Self {
        let mut value = MaybeUninit::<Mpz>::uninit();
        // SAFETY: GMP initializes the complete `Mpz` object before it is read.
        unsafe { __gmpz_init(value.as_mut_ptr()) };
        // SAFETY: `__gmpz_init` initialized `value` above.
        Self(unsafe { value.assume_init() })
    }

    fn decimal(&self) -> String {
        // One byte for the sign and one for NUL is sufficient beyond this bound.
        let capacity = unsafe { __gmpz_sizeinbase(&self.0, 10) } + 3;
        let mut bytes = vec![0_u8; capacity];
        // SAFETY: the destination is writable and large enough by GMP's API contract.
        unsafe { __gmpz_get_str(bytes.as_mut_ptr().cast(), 10, &self.0) };
        let length = bytes.iter().position(|byte| *byte == 0).unwrap();
        String::from_utf8(bytes[..length].to_vec()).unwrap()
    }
}

impl Drop for Integer {
    fn drop(&mut self) {
        // SAFETY: `self.0` was initialized once and is cleared exactly once here.
        unsafe { __gmpz_clear(&mut self.0) };
    }
}

fn compute() -> Result<String, &'static str> {
    let mut mersenne = Integer::new();
    let mut power3 = Integer::new();
    let mut factor = Integer::new();
    let mut product = Integer::new();
    let mut sum = Integer::new();
    let mut gcd = Integer::new();
    let mut quotient = Integer::new();
    let mut exponent = Integer::new();
    let mut seven = Integer::new();
    let mut modular_power = Integer::new();
    let mut factorial = Integer::new();
    let mut combined = Integer::new();
    let mut reconstructed = Integer::new();

    unsafe {
        __gmpz_ui_pow_ui(&mut mersenne.0, 2, 521);
        __gmpz_sub_ui(&mut mersenne.0, &mersenne.0, 1);
        __gmpz_ui_pow_ui(&mut power3.0, 3, 329);
        __gmpz_add_ui(&mut factor.0, &power3.0, 1);
        __gmpz_mul(&mut product.0, &mersenne.0, &factor.0);
        __gmpz_add(&mut sum.0, &product.0, &mersenne.0);
        __gmpz_gcd(&mut gcd.0, &sum.0, &product.0);
        __gmpz_divexact(&mut quotient.0, &product.0, &mersenne.0);

        __gmpz_ui_pow_ui(&mut exponent.0, 1_000_003, 1);
        __gmpz_ui_pow_ui(&mut seven.0, 7, 1);
        __gmpz_powm(&mut modular_power.0, &seven.0, &exponent.0, &mersenne.0);
        __gmpz_fac_ui(&mut factorial.0, 1000);
        __gmpz_mul(&mut combined.0, &modular_power.0, &factorial.0);
        __gmpz_add(&mut combined.0, &combined.0, &quotient.0);

        __gmpz_mul(&mut reconstructed.0, &quotient.0, &mersenne.0);
        if __gmpz_cmp(&reconstructed.0, &product.0) != 0 {
            return Err("exact division reconstruction failed");
        }
        if __gmpz_cmp(&gcd.0, &mersenne.0) != 0 {
            return Err("gcd identity failed");
        }
        if __gmpz_cmp(&quotient.0, &factor.0) != 0 {
            return Err("exact quotient identity failed");
        }
    }

    Ok(format!(
        "{{\"schema\":\"sagejs.rust-wasm-arithmetic-probe/v1\",\"gcd\":\"{}\",\"quotient\":\"{}\",\"modularPower\":\"{}\",\"combined\":\"{}\"}}",
        gcd.decimal(),
        quotient.decimal(),
        modular_power.decimal(),
        combined.decimal(),
    ))
}

static RESULT: OnceLock<Result<Box<[u8]>, &'static str>> = OnceLock::new();

fn result() -> &'static Result<Box<[u8]>, &'static str> {
    RESULT.get_or_init(|| compute().map(|text| text.into_bytes().into_boxed_slice()))
}

pub fn result_json() -> Result<&'static str, &'static str> {
    match result() {
        Ok(bytes) => Ok(std::str::from_utf8(bytes).unwrap()),
        Err(message) => Err(message),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_probe_status() -> u32 {
    u32::from(result().is_err())
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_probe_result_ptr() -> *const u8 {
    match result() {
        Ok(bytes) => bytes.as_ptr(),
        Err(message) => message.as_ptr(),
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_probe_result_len() -> usize {
    match result() {
        Ok(bytes) => bytes.len(),
        Err(message) => message.len(),
    }
}
