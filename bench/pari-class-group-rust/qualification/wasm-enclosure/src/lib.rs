//! Direct MPFR/MPC probe for the high-precision part of class-group W0.
//!
//! The FFI is intentionally limited to value lifecycle and the operations in
//! one deterministic cubic-embedding pipeline. MPFR/MPC own their allocations;
//! Rust owns the result bytes exposed to the host.

use std::ffi::{c_char, c_int, c_long, c_ulong};
use std::sync::OnceLock;

const RNDN: c_int = 0;
const RNDU: c_int = 2;
const RNDD: c_int = 3;
const MPC_RNDNN: c_int = RNDN | (RNDN << 4);

#[repr(C)]
struct Mpfr {
    precision: c_long,
    sign: c_int,
    exponent: c_long,
    limbs: *mut c_ulong,
}

#[repr(C)]
struct Mpc {
    real: Mpfr,
    imaginary: Mpfr,
}

unsafe extern "C" {
    fn mpfr_init2(value: *mut Mpfr, precision: c_long);
    fn mpfr_clear(value: *mut Mpfr);
    fn mpfr_set(result: *mut Mpfr, value: *const Mpfr, rounding: c_int) -> c_int;
    fn mpfr_set_ui(result: *mut Mpfr, value: c_ulong, rounding: c_int) -> c_int;
    fn mpfr_set_ui_2exp(
        result: *mut Mpfr,
        value: c_ulong,
        exponent: c_long,
        rounding: c_int,
    ) -> c_int;
    fn mpfr_add(result: *mut Mpfr, left: *const Mpfr, right: *const Mpfr, rounding: c_int)
    -> c_int;
    fn mpfr_sub(result: *mut Mpfr, left: *const Mpfr, right: *const Mpfr, rounding: c_int)
    -> c_int;
    fn mpfr_mul(result: *mut Mpfr, left: *const Mpfr, right: *const Mpfr, rounding: c_int)
    -> c_int;
    fn mpfr_mul_ui(
        result: *mut Mpfr,
        value: *const Mpfr,
        factor: c_ulong,
        rounding: c_int,
    ) -> c_int;
    fn mpfr_div_2ui(
        result: *mut Mpfr,
        value: *const Mpfr,
        exponent: c_ulong,
        rounding: c_int,
    ) -> c_int;
    fn mpfr_ui_div(
        result: *mut Mpfr,
        numerator: c_ulong,
        denominator: *const Mpfr,
        rounding: c_int,
    ) -> c_int;
    fn mpfr_log(result: *mut Mpfr, value: *const Mpfr, rounding: c_int) -> c_int;
    fn mpfr_atan(result: *mut Mpfr, value: *const Mpfr, rounding: c_int) -> c_int;
    fn mpfr_cmp(left: *const Mpfr, right: *const Mpfr) -> c_int;
    fn mpfr_cmp_ui(value: *const Mpfr, integer: c_ulong) -> c_int;
    fn mpfr_get_str(
        output: *mut c_char,
        exponent: *mut c_long,
        base: c_int,
        digits: usize,
        value: *const Mpfr,
        rounding: c_int,
    ) -> *mut c_char;

    fn mpc_init2(value: *mut Mpc, precision: c_long);
    fn mpc_clear(value: *mut Mpc);
    fn mpc_set_fr_fr(
        result: *mut Mpc,
        real: *const Mpfr,
        imaginary: *const Mpfr,
        rounding: c_int,
    ) -> c_int;
    fn mpc_log(result: *mut Mpc, value: *const Mpc, rounding: c_int) -> c_int;
    fn mpc_real(result: *mut Mpfr, value: *const Mpc, rounding: c_int) -> c_int;
    fn mpc_imag(result: *mut Mpfr, value: *const Mpc, rounding: c_int) -> c_int;
}

struct Real(Mpfr);

impl Real {
    fn new(precision: c_long) -> Self {
        let mut value = std::mem::MaybeUninit::<Mpfr>::uninit();
        // SAFETY: MPFR initializes the complete object before it is read.
        unsafe { mpfr_init2(value.as_mut_ptr(), precision) };
        Self(unsafe { value.assume_init() })
    }

    fn scientific(&self, digits: usize) -> String {
        let mut bytes = vec![0_u8; digits + 3];
        let mut exponent = 0 as c_long;
        unsafe {
            mpfr_get_str(
                bytes.as_mut_ptr().cast(),
                &mut exponent,
                10,
                digits,
                &self.0,
                RNDN,
            );
        }
        let length = bytes.iter().position(|byte| *byte == 0).unwrap();
        let raw = std::str::from_utf8(&bytes[..length]).unwrap();
        match raw.strip_prefix('-') {
            Some(magnitude) => format!("-0.{magnitude}e{exponent}"),
            None => format!("0.{raw}e{exponent}"),
        }
    }
}

impl Drop for Real {
    fn drop(&mut self) {
        unsafe { mpfr_clear(&mut self.0) };
    }
}

struct Complex(Mpc);

impl Complex {
    fn new(precision: c_long) -> Self {
        let mut value = std::mem::MaybeUninit::<Mpc>::uninit();
        unsafe { mpc_init2(value.as_mut_ptr(), precision) };
        Self(unsafe { value.assume_init() })
    }
}

impl Drop for Complex {
    fn drop(&mut self) {
        unsafe { mpc_clear(&mut self.0) };
    }
}

fn polynomial_bound(result: &mut Real, x: &Real, rounding: c_int, scratch: &mut Real) {
    let product_rounding = rounding;
    let subtrahend_rounding = if rounding == RNDD { RNDU } else { RNDD };
    unsafe {
        mpfr_mul(&mut result.0, &x.0, &x.0, product_rounding);
        mpfr_mul(&mut result.0, &result.0, &x.0, product_rounding);
        mpfr_mul_ui(&mut scratch.0, &x.0, 3, subtrahend_rounding);
        mpfr_sub(&mut result.0, &result.0, &scratch.0, rounding);
        mpfr_set_ui(&mut scratch.0, 1, subtrahend_rounding);
        mpfr_sub(&mut result.0, &result.0, &scratch.0, rounding);
    }
}

fn enclose_root(precision: c_long) -> Result<(Real, Real, usize), &'static str> {
    let mut lower = Real::new(precision);
    let mut upper = Real::new(precision);
    let mut midpoint = Real::new(precision);
    let mut lower_value = Real::new(precision);
    let mut upper_value = Real::new(precision);
    let mut scratch = Real::new(precision);
    unsafe {
        mpfr_set_ui(&mut lower.0, 1, RNDN);
        mpfr_set_ui(&mut upper.0, 2, RNDN);
    }

    let mut completed = 0;
    // Leave guard bits so the sign enclosure remains separated from zero.
    for step in 0..(precision as usize - 8) {
        unsafe {
            mpfr_add(&mut midpoint.0, &lower.0, &upper.0, RNDN);
            mpfr_div_2ui(&mut midpoint.0, &midpoint.0, 1, RNDN);
        }
        polynomial_bound(&mut lower_value, &midpoint, RNDD, &mut scratch);
        polynomial_bound(&mut upper_value, &midpoint, RNDU, &mut scratch);
        if unsafe { mpfr_cmp_ui(&upper_value.0, 0) } < 0 {
            unsafe { mpfr_set(&mut lower.0, &midpoint.0, RNDN) };
        } else if unsafe { mpfr_cmp_ui(&lower_value.0, 0) } > 0 {
            unsafe { mpfr_set(&mut upper.0, &midpoint.0, RNDN) };
        } else {
            return Err("precision was insufficient to certify a bisection sign");
        }
        completed = step + 1;
    }

    polynomial_bound(&mut upper_value, &lower, RNDU, &mut scratch);
    if unsafe { mpfr_cmp_ui(&upper_value.0, 0) } > 0 {
        return Err("lower endpoint does not certify p(x) <= 0");
    }
    polynomial_bound(&mut lower_value, &upper, RNDD, &mut scratch);
    if unsafe { mpfr_cmp_ui(&lower_value.0, 0) } < 0 {
        return Err("upper endpoint does not certify p(x) >= 0");
    }
    Ok((lower, upper, completed))
}

fn compute_at_precision(precision: c_long) -> Result<(String, bool), &'static str> {
    let (root_lower, root_upper, bisections) = enclose_root(precision)?;
    let mut width = Real::new(precision);
    let mut threshold = Real::new(precision);
    unsafe {
        mpfr_sub(&mut width.0, &root_upper.0, &root_lower.0, RNDU);
        mpfr_set_ui_2exp(&mut threshold.0, 1, -160, RNDN);
    }
    let target_met = unsafe { mpfr_cmp(&width.0, &threshold.0) } < 0;

    let mut real_lower = Real::new(precision);
    let mut real_upper = Real::new(precision);
    let mut imag_lower = Real::new(precision);
    let mut imag_upper = Real::new(precision);
    let mut scratch = Real::new(precision);

    // log(alpha + i) = log(alpha^2 + 1)/2 + i atan(1/alpha).
    unsafe {
        mpfr_mul(&mut scratch.0, &root_lower.0, &root_lower.0, RNDD);
        mpfr_set_ui(&mut real_lower.0, 1, RNDD);
        mpfr_add(&mut scratch.0, &scratch.0, &real_lower.0, RNDD);
        mpfr_log(&mut real_lower.0, &scratch.0, RNDD);
        mpfr_div_2ui(&mut real_lower.0, &real_lower.0, 1, RNDD);

        mpfr_mul(&mut scratch.0, &root_upper.0, &root_upper.0, RNDU);
        mpfr_set_ui(&mut real_upper.0, 1, RNDU);
        mpfr_add(&mut scratch.0, &scratch.0, &real_upper.0, RNDU);
        mpfr_log(&mut real_upper.0, &scratch.0, RNDU);
        mpfr_div_2ui(&mut real_upper.0, &real_upper.0, 1, RNDU);

        mpfr_ui_div(&mut scratch.0, 1, &root_upper.0, RNDD);
        mpfr_atan(&mut imag_lower.0, &scratch.0, RNDD);
        mpfr_ui_div(&mut scratch.0, 1, &root_lower.0, RNDU);
        mpfr_atan(&mut imag_upper.0, &scratch.0, RNDU);
    }

    let mut midpoint = Real::new(precision);
    let mut one = Real::new(precision);
    unsafe {
        mpfr_add(&mut midpoint.0, &root_lower.0, &root_upper.0, RNDN);
        mpfr_div_2ui(&mut midpoint.0, &midpoint.0, 1, RNDN);
        mpfr_set_ui(&mut one.0, 1, RNDN);
    }
    let mut input = Complex::new(precision);
    let mut output = Complex::new(precision);
    let mut mpc_real_part = Real::new(precision);
    let mut mpc_imag_part = Real::new(precision);
    unsafe {
        mpc_set_fr_fr(&mut input.0, &midpoint.0, &one.0, MPC_RNDNN);
        mpc_log(&mut output.0, &input.0, MPC_RNDNN);
        mpc_real(&mut mpc_real_part.0, &output.0, RNDN);
        mpc_imag(&mut mpc_imag_part.0, &output.0, RNDN);
    }
    if unsafe {
        mpfr_cmp(&mpc_real_part.0, &real_lower.0) < 0
            || mpfr_cmp(&mpc_real_part.0, &real_upper.0) > 0
            || mpfr_cmp(&mpc_imag_part.0, &imag_lower.0) < 0
            || mpfr_cmp(&mpc_imag_part.0, &imag_upper.0) > 0
    } {
        return Err("MPC midpoint result escaped the directed MPFR enclosure");
    }

    Ok((
        format!(
            "{{\"precisionBits\":{precision},\"bisections\":{bisections},\"targetMet\":{target_met},\"root\":{{\"lower\":\"{}\",\"upper\":\"{}\",\"width\":\"{}\"}},\"complexLog\":{{\"realLower\":\"{}\",\"realUpper\":\"{}\",\"imagLower\":\"{}\",\"imagUpper\":\"{}\",\"mpcReal\":\"{}\",\"mpcImag\":\"{}\"}}}}",
            root_lower.scientific(70),
            root_upper.scientific(70),
            width.scientific(30),
            real_lower.scientific(70),
            real_upper.scientific(70),
            imag_lower.scientific(70),
            imag_upper.scientific(70),
            mpc_real_part.scientific(70),
            mpc_imag_part.scientific(70),
        ),
        target_met,
    ))
}

fn compute() -> Result<String, &'static str> {
    let (low, low_target_met) = compute_at_precision(96)?;
    let (high, high_target_met) = compute_at_precision(192)?;
    if low_target_met {
        return Err("96-bit stage unexpectedly met the 160-bit enclosure target");
    }
    if !high_target_met {
        return Err("192-bit stage did not meet the 160-bit enclosure target");
    }
    Ok(format!(
        "{{\"schema\":\"sagejs.rust-wasm-enclosure-probe/v1\",\"polynomial\":[-1,-3,0,1],\"targetWidthBits\":160,\"stages\":[{low},{high}]}}"
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn precision_escalation_produces_a_certified_result() {
        let result = result_json().unwrap();
        assert!(result.contains("\"precisionBits\":96"));
        assert!(result.contains("\"precisionBits\":192"));
        assert!(result.contains("\"targetMet\":false"));
        assert!(result.contains("\"targetMet\":true"));
        assert_eq!(result.len(), 1759);
    }
}
