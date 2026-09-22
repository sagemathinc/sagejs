// Copyright (C) Sage.js contributors.
// GPL-2.0-or-later, without warranty.

use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn run(command: &mut Command, label: &str) {
    let status = command
        .status()
        .unwrap_or_else(|error| panic!("{label}: {error}"));
    assert!(status.success(), "{label} failed with {status}");
}

fn required(name: &str) -> PathBuf {
    PathBuf::from(env::var_os(name).unwrap_or_else(|| panic!("{name} is required")))
}

fn compile_bridge(
    compiler: &Path,
    archiver: &Path,
    source: &Path,
    object: &Path,
    archive: &Path,
    includes: &[PathBuf],
) {
    let mut command = Command::new(compiler);
    command
        .arg("-O3")
        .arg("-c")
        .arg(source)
        .arg("-o")
        .arg(object);
    for include in includes {
        command.arg(format!("-I{}", include.display()));
    }
    if let Some(flags) = env::var_os("SAGEJS_CLASS_GROUP_CFLAGS") {
        for flag in flags.to_string_lossy().split_ascii_whitespace() {
            command.arg(flag);
        }
    }
    run(&mut command, "compile FLINT class-group bridge");
    run(
        Command::new(archiver).arg("crs").arg(archive).arg(object),
        "archive FLINT class-group bridge",
    );
}

fn main() {
    println!("cargo:rerun-if-changed=src/flint_normal_form.c");
    for name in [
        "SAGEJS_WASI_CLANG",
        "SAGEJS_WASI_AR",
        "SAGEJS_FLINT_PREFIX",
        "SAGEJS_GMP_PREFIX",
        "SAGEJS_MPFR_PREFIX",
        "SAGEJS_WASI_SYSROOT",
        "SAGEJS_WASI_STUBS",
        "SAGEJS_CLASS_GROUP_CFLAGS",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }

    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let source = manifest.join("src/flint_normal_form.c");
    let object = output.join("flint_normal_form.o");
    let archive = output.join("libflint_normal_form_bridge.a");
    let target = env::var("TARGET").unwrap();

    if target == "wasm32-wasip1" {
        let compiler = required("SAGEJS_WASI_CLANG");
        let archiver = required("SAGEJS_WASI_AR");
        let flint = required("SAGEJS_FLINT_PREFIX");
        let gmp = required("SAGEJS_GMP_PREFIX");
        let mpfr = required("SAGEJS_MPFR_PREFIX");
        let sysroot = required("SAGEJS_WASI_SYSROOT");
        compile_bridge(
            &compiler,
            &archiver,
            &source,
            &object,
            &archive,
            &[
                flint.join("include"),
                gmp.join("include"),
                mpfr.join("include"),
            ],
        );
        let stubs_source = env::var_os("SAGEJS_WASI_STUBS")
            .map(PathBuf::from)
            .unwrap_or_else(|| manifest.join("../flint-wasm/src/wasi-stubs.c"));
        let stubs_object = output.join("wasi-stubs.o");
        run(
            Command::new(&compiler)
                .arg("-O3")
                .arg("-c")
                .arg(&stubs_source)
                .arg("-o")
                .arg(&stubs_object),
            "compile Sage.js WASI compatibility stubs",
        );
        run(
            Command::new(&archiver)
                .arg("r")
                .arg(&archive)
                .arg(&stubs_object),
            "append Sage.js WASI compatibility stubs",
        );
        for prefix in [&flint, &mpfr, &gmp] {
            println!(
                "cargo:rustc-link-search=native={}",
                prefix.join("lib").display()
            );
        }
        println!(
            "cargo:rustc-link-search=native={}",
            sysroot.join("lib/wasm32-wasip1").display()
        );
        println!("cargo:rustc-link-search=native={}", output.display());
        println!("cargo:rustc-link-lib=static=flint_normal_form_bridge");
        println!("cargo:rustc-link-lib=static=flint");
        println!("cargo:rustc-link-lib=static=mpfr");
        println!("cargo:rustc-link-lib=static=gmp");
        println!("cargo:rustc-link-lib=static=m");
        println!("cargo:rustc-link-lib=static=wasi-emulated-signal");
    } else {
        let prefix = env::var_os("SAGEJS_FLINT_PREFIX")
            .map(PathBuf::from)
            .unwrap_or_else(|| manifest.join("../flint/.native/prefix"));
        let gmp = env::var_os("SAGEJS_GMP_PREFIX")
            .map(PathBuf::from)
            .unwrap_or_else(|| prefix.clone());
        let mpfr = env::var_os("SAGEJS_MPFR_PREFIX")
            .map(PathBuf::from)
            .unwrap_or_else(|| prefix.clone());
        assert!(
            prefix.join("lib/libflint.a").is_file(),
            "build @sagemath/sagejs-flint or set SAGEJS_FLINT_PREFIX"
        );
        for (name, dependency, archive) in [("GMP", &gmp, "libgmp.a"), ("MPFR", &mpfr, "libmpfr.a")]
        {
            let selected = dependency.join("lib").join(archive);
            let flint_domain = prefix.join("lib").join(archive);
            assert!(
                selected.is_file(),
                "{name} archive is missing at {}",
                selected.display()
            );
            assert!(
                flint_domain.is_file(),
                "FLINT dependency domain is missing {name} at {}",
                flint_domain.display()
            );
            assert_eq!(
                selected.canonicalize().unwrap(),
                flint_domain.canonicalize().unwrap(),
                "{name} must use the exact same archive as FLINT; raw GMP objects cannot cross allocator domains"
            );
        }
        compile_bridge(
            Path::new("cc"),
            Path::new("ar"),
            &source,
            &object,
            &archive,
            &[
                prefix.join("include"),
                gmp.join("include"),
                mpfr.join("include"),
            ],
        );
        println!("cargo:rustc-link-search=native={}", output.display());
        println!(
            "cargo:rustc-link-search=native={}",
            prefix.join("lib").display()
        );
        println!("cargo:rustc-link-lib=static=flint_normal_form_bridge");
        println!("cargo:rustc-link-lib=static=flint");
        println!("cargo:rustc-link-lib=static=openblas");
        println!("cargo:rustc-link-lib=static=mpfr");
        println!("cargo:rustc-link-lib=static=gmp");
        println!("cargo:rustc-link-lib=m");
        println!("cargo:rustc-link-lib=pthread");
    }
}
