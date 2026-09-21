use std::env;
use std::fs;
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
    run(&mut command, "compile FLINT normal-form bridge");
    run(
        Command::new(archiver).arg("crs").arg(archive).arg(object),
        "archive FLINT normal-form bridge",
    );
}

fn prepare_compatibility_source(source_dir: &Path, output: &Path) {
    let target = output.join("core");
    fs::create_dir_all(&target).expect("create generated core source directory");
    for entry in fs::read_dir(source_dir).expect("read shared core source directory") {
        let entry = entry.expect("read shared core source entry");
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("rs") {
            continue;
        }
        let mut source = fs::read_to_string(&path).expect("read shared Rust source");
        if path.file_name().and_then(|value| value.to_str()) == Some("lib.rs") {
            // `include!` cannot contain crate-level inner documentation.
            source = source
                .lines()
                .map(|line| {
                    line.strip_prefix("//!")
                        .map_or(line.to_owned(), |rest| format!("//{rest}"))
                })
                .collect::<Vec<_>>()
                .join("\n");
            source.push('\n');
        }
        // Rug 1.19 is the last binding line authenticated against the pinned
        // GMP 6.2.1 archive. Its Integer predates `is_zero`; assert the exact
        // shared-source shape before applying this compatibility-only edit.
        const NEW_RUG_ZERO_TEST: &str = "diagonal.iter().filter(|value| !value.is_zero()).count()";
        if source.contains(NEW_RUG_ZERO_TEST) {
            assert_eq!(source.matches(NEW_RUG_ZERO_TEST).count(), 1);
            source = source.replace(
                NEW_RUG_ZERO_TEST,
                "diagonal.iter().filter(|value| **value != 0).count()",
            );
        }
        // Two other shared wrappers still rely on `u32: Into<c_long>`, which
        // is true on the native 64-bit target but false on wasm32. Preserve
        // fail-closed behavior rather than trapping or narrowing.
        const NATIVE_PRECISION: &str = "precision.into(),";
        if source.contains(NATIVE_PRECISION) {
            assert_eq!(source.matches(NATIVE_PRECISION).count(), 2);
            source = source.replace(
                NATIVE_PRECISION,
                "c_long::try_from(precision).map_err(|_| FlintNormalFormError::InvalidDimensions)?,",
            );
        }
        fs::write(target.join(path.file_name().unwrap()), source)
            .expect("write generated compatibility source");
    }
}

fn main() {
    println!("cargo:rerun-if-changed=../../../src/flint_normal_form.c");
    println!("cargo:rerun-if-changed=../../../../../packages/flint-wasm/src/wasi-stubs.c");
    if env::var_os("CARGO_FEATURE_FLINT_NORMAL_FORM").is_none() {
        return;
    }
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let shared_source = manifest.join("../../../src/flint_normal_form.c");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    prepare_compatibility_source(&manifest.join("../../../src"), &output);
    let source = shared_source;
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
        let stubs_source = manifest.join("../../../../../packages/flint-wasm/src/wasi-stubs.c");
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
        for library in [
            "flint_normal_form_bridge",
            "flint",
            "mpfr",
            "gmp",
            "m",
            "wasi-emulated-signal",
        ] {
            println!("cargo:rustc-link-lib=static={library}");
        }
    } else {
        let prefix = manifest.join("../../../../../packages/flint/.native/prefix");
        compile_bridge(
            Path::new("cc"),
            Path::new("ar"),
            &source,
            &object,
            &archive,
            &[prefix.join("include")],
        );
        println!("cargo:rustc-link-search=native={}", output.display());
        println!(
            "cargo:rustc-link-search=native={}",
            prefix.join("lib").display()
        );
        for library in [
            "flint_normal_form_bridge",
            "flint",
            "openblas",
            "mpfr",
            "gmp",
        ] {
            println!("cargo:rustc-link-lib=static={library}");
        }
        println!("cargo:rustc-link-lib=m");
        println!("cargo:rustc-link-lib=pthread");
    }
    for name in [
        "SAGEJS_WASI_CLANG",
        "SAGEJS_WASI_AR",
        "SAGEJS_FLINT_PREFIX",
        "SAGEJS_GMP_PREFIX",
        "SAGEJS_MPFR_PREFIX",
        "SAGEJS_WASI_SYSROOT",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
}
