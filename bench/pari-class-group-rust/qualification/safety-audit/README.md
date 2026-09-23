# Rust safety and provenance audit

This qualification-only audit inventories every first-party Rust/C/C++ source
under `bench/pari-class-group-rust`, excluding generated dependency/build trees
such as `target/`. It distinguishes the product-candidate crate, its tests, and
qualification-only probes. For each source it records a SHA-256 digest,
license/attribution header status, and a conservative origin classification.
Cargo manifests and lockfiles are separately hashed with dependency-source
counts; this does not substitute for a later dependency-license review.

The Rust scan accounts for every lexical `unsafe` token as an unsafe block,
function, impl, trait, C-import block, or unsafe attribute. It also inventories
every function declared in a Rust `extern "C"` block, every Rust C-ABI export,
and every externally visible `sagejs_*` C definition. A new unrecognized
`unsafe` form fails closed.

Regenerate and check the receipt from this directory:

```sh
python3 audit.py --write receipt.json
python3 audit.py --check receipt.json
python3 -m unittest -v test_audit.py
```

The reproducibility check proves only that the checked-in receipt exactly
describes the current source. The promotion gate is deliberately stronger:

```sh
python3 audit.py --check receipt.json --require-qualified
```

That command exits nonzero until every unsafe site and FFI boundary has a
directly attached explicit `SAFETY:` or `FFI-SAFETY:` rationale, every source
has the required provenance header, and there are no unclassified tokens or
source scopes. Missing rationales remain visible in `receipt.json`; they are
not allowlisted away. The narrower `documentationGatePassed` field can become
true from these local checks. The overall promotion gate additionally remains
false until generated source, actual linked native artifacts, dependency
licenses, and source-lineage evidence receive their own qualification inputs.

This lexical inventory is not a soundness proof. It does **not** claim Miri,
sanitizer, fuzzing, dependency-license, or production qualification coverage.
Those require separate receipts and promotion gates.

## Current receipt

`receipt.json` is the authoritative snapshot, including exact totals and
per-scope gaps under `summary`. Regenerate it whenever any Rust/C source or
Cargo input changes; `--check` deliberately rejects stale source hashes. A red
promotion result is expected until both the local documentation gaps and the
separately listed provenance/dependency/generated-source evidence are closed.
