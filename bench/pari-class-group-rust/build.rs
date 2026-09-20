use std::env;
use std::path::PathBuf;
use std::process::Command;

fn run(command: &mut Command, label: &str) {
    let status = command
        .status()
        .unwrap_or_else(|error| panic!("{label}: {error}"));
    assert!(status.success(), "{label} failed with {status}");
}

fn main() {
    println!("cargo:rerun-if-changed=src/flint_normal_form.c");
    if env::var_os("CARGO_FEATURE_FLINT_NORMAL_FORM").is_none() {
        return;
    }
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let prefix = manifest.join("../../packages/flint/.native/prefix");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let object = output.join("flint_normal_form.o");
    let archive = output.join("libflint_normal_form_bridge.a");
    assert!(
        prefix.join("lib/libflint.a").is_file(),
        "build @sagemath/sagejs-flint first"
    );
    run(
        Command::new("cc")
            .arg("-O3")
            .arg("-fPIC")
            .arg(format!("-I{}", prefix.join("include").display()))
            .arg("-c")
            .arg(manifest.join("src/flint_normal_form.c"))
            .arg("-o")
            .arg(&object),
        "compile FLINT normal-form bridge",
    );
    run(
        Command::new("ar").arg("crs").arg(&archive).arg(&object),
        "archive FLINT normal-form bridge",
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
