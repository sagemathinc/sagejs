use std::env;

fn main() {
    let target = env::var("TARGET").expect("Cargo supplies TARGET");
    if !target.starts_with("wasm32-") {
        return;
    }
    let gmp = env::var("SAGEJS_GMP_PREFIX").expect("SAGEJS_GMP_PREFIX is required");
    let sysroot = env::var("SAGEJS_WASI_SYSROOT").expect("SAGEJS_WASI_SYSROOT is required");
    println!("cargo:rustc-link-search=native={gmp}/lib");
    println!("cargo:rustc-link-search=native={sysroot}/lib/wasm32-wasip1");
    println!("cargo:rustc-link-lib=static=gmp");
    println!("cargo:rustc-link-lib=static=wasi-emulated-signal");
    for name in ["SAGEJS_GMP_PREFIX", "SAGEJS_WASI_SYSROOT"] {
        println!("cargo:rerun-if-env-changed={name}");
    }
}
