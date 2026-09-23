use std::env;

fn main() {
    let target = env::var("TARGET").unwrap();
    let wasm = target.starts_with("wasm32-");
    if wasm {
        for name in ["mpc", "mpfr", "gmp"] {
            println!("cargo:rustc-link-lib=static={name}");
        }
    } else {
        // The opt VM intentionally has runtime packages, not development
        // symlinks. `+verbatim` names the audited SONAMEs without creating
        // files outside this probe.
        for soname in ["libmpc.so.3", "libmpfr.so.6", "libgmp.so.10"] {
            println!("cargo:rustc-link-lib=dylib:+verbatim={soname}");
        }
    }
    for variable in [
        "SAGEJS_MPC_PREFIX",
        "SAGEJS_MPFR_PREFIX",
        "SAGEJS_GMP_PREFIX",
    ] {
        if let Ok(prefix) = env::var(variable) {
            println!("cargo:rustc-link-search=native={prefix}/lib");
        }
        println!("cargo:rerun-if-env-changed={variable}");
    }
    if wasm {
        let sysroot = env::var("SAGEJS_WASI_SYSROOT")
            .expect("SAGEJS_WASI_SYSROOT is required for the MPFR/MPC WASI build");
        println!("cargo:rustc-link-search=native={sysroot}/lib/wasm32-wasip1");
        println!("cargo:rustc-link-lib=static=wasi-emulated-signal");
    }
    println!("cargo:rerun-if-env-changed=SAGEJS_WASI_SYSROOT");
}
