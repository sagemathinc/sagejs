# Rust class-group build and artifact metrics

This directory records the R5 developer-build and artifact-size evidence for
the experimental Rust class-group core. It deliberately does not run or modify
the class-group algorithms.

Run from the repository root:

```bash
python3 bench/pari-class-group-rust/qualification/build-metrics/measure.py
```

The harness:

1. hashes the current core manifests, lockfile, build script, and `src/` tree;
2. copies those files to a disposable source tree under `/tmp`;
3. links the snapshot to the repository's existing pinned FLINT prefix;
4. builds `--release --locked --features flint-normal-form` in an initially
   absent target directory, with eight Cargo jobs and incremental compilation;
5. measures a warm no-op build and a one-module comment-only change in that
   disposable snapshot;
6. samples aggregate compiler-process-tree RSS from Linux `/proc` every 20 ms;
7. records target-directory disk use and stripped/unstripped executable sizes;
8. records raw and deterministic gzip-9 sizes plus import/export linkage
   indicators for the three retained Rust class-group Wasm artifacts; and
9. validates `receipt.json` against the closed schema before deleting the
   disposable build tree.

The clean build means a clean **target directory**, not a clean download cache.
Cargo's global source/archive cache remains warm. `CARGO_INCREMENTAL=1` measures
the intended developer loop; it is not a statement about the final shipping
profile. Rust recompiles crates rather than independently compiled source
modules, so the one-module measurement means “change one module and ask Cargo
to rebuild,” not “only that module was compiled.”

The Wasm duplication evidence is intentionally conservative. The manifests and
build scripts prove that the prepared factor-base and relation-prefix modules
both statically link GMP, while the latter also links MPFR. Each retained Wasm
module exports its own memory and none dynamically imports those arithmetic
symbols. This shows separate arithmetic runtimes are packaged, but does not
assign an exact number of duplicate bytes; that requires linker maps or a
componentized shared-runtime experiment.

This receipt is Linux x86_64 development-host evidence only. It is not Windows,
macOS, Linux ARM64, quiet-host acceptance, fresh dependency-install, final npm
packaging, or browser-download qualification.
