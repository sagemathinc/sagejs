use std::env;

fn main() {
    let target = env::var("TARGET").unwrap();
    let linkage = if target.starts_with("wasm32-") {
        "static"
    } else {
        "dylib"
    };
    println!("cargo:rustc-link-lib={linkage}=gmp");
    if let Ok(prefix) = env::var("SAGEJS_GMP_PREFIX") {
        println!("cargo:rustc-link-search=native={prefix}/lib");
    }
    if target.starts_with("wasm32-") {
        let sysroot = env::var("SAGEJS_WASI_SYSROOT")
            .expect("SAGEJS_WASI_SYSROOT is required for the GMP WASI build");
        println!("cargo:rustc-link-search=native={sysroot}/lib/wasm32-wasip1");
        println!("cargo:rustc-link-lib=static=wasi-emulated-signal");
    }
    println!("cargo:rerun-if-env-changed=SAGEJS_GMP_PREFIX");
    println!("cargo:rerun-if-env-changed=SAGEJS_WASI_SYSROOT");
}
