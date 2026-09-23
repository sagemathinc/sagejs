//! Minimal import-inventory experiment; this is not the full arithmetic probe.
#![no_std]

use core::ffi::{c_int, c_ulong};
use core::mem::MaybeUninit;

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
    fn __gmpz_fdiv_ui(value: *const Mpz, divisor: c_ulong) -> c_ulong;
}

#[panic_handler]
fn panic(_information: &core::panic::PanicInfo<'_>) -> ! {
    loop {
        core::hint::spin_loop();
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn sagejs_no_std_gmp_probe() -> u32 {
    let mut value = MaybeUninit::<Mpz>::uninit();
    unsafe {
        __gmpz_init(value.as_mut_ptr());
        let mut value = value.assume_init();
        __gmpz_ui_pow_ui(&mut value, 2, 521);
        __gmpz_sub_ui(&mut value, &value, 1);
        let residue = __gmpz_fdiv_ui(&value, 65_521) as u32;
        __gmpz_clear(&mut value);
        residue
    }
}
