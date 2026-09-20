# Rust class-group qualification evidence

This directory contains the executable contracts and receipts for the
[Rust class-group qualification campaign](../../../agents/rust-class-group-core-qualification-plan.md).
It is deliberately stricter than the historical Rust benchmark: a relation
matrix and its Smith factors are a candidate, not a completed public class
group.

## Current milestone state

| Milestone | State | Evidence and remaining work |
| --- | --- | --- |
| R0 contracts | In progress | Schemas, public-contract map, benchmark harness, independent relation verifier, and the deterministic 120-slot corpus layout exist. Only nine open cubic cases are populated; the balanced 60 open plus 60 held-out corpus is not complete. |
| W0 exact-integer route | Passed on the development route | One Rust/GMP source pipeline gives an identical 3,300-byte result in native Rust, Node Wasm, Chromium, Firefox, WebKit, and an independent CPython oracle. The browser runs use the actual Sage.js WASI host. See `wasm-arithmetic/receipt.json`. |
| W0 complete arithmetic choice | Open | Rebuild against the current toolchain digest, resolve the two environment imports or admit them explicitly, and qualify high-precision real/complex and enclosure arithmetic needed by completion. |
| R1 prepared cubics | Open | The generic coefficient-box API accepts neutral prepared cubic data but is only a candidate algorithm. The fast PARI-style route is still authenticated only for H1. |
| R2 relation/HNF loop | Open | Exact relation witnesses are independently replayed for the development corpus; general continuation, incremental HNF transformations, GMP retry, and row 6 remain unfinished. |
| R3 completion and maps | Open | Units, regulator/completion proof, saturation, generator ideals, ideal-to-class maps, and principality witnesses are not implemented by the Rust core. |
| R4 public polynomial input | Open | No Rust maximal-order/general preparation path or public Sage.js adapter exists. |
| R5 product qualification | Open | Packaging, lifecycle, cancellation, all platforms, the full corpus, and matched public PARI timings remain future gates. |

No file in this directory authorizes production dispatch. Candidate and
upstream-assumed outputs must remain visibly distinct from publicly complete
results.

## Layout

- `schemas/`: closed JSON contracts for neutral inputs, evidence, benchmarks,
  corpora, and capability status.
- `corpus/`: deterministic selection rules, 120-slot layout, and initial open
  development cases.
- `verify/`: independent PARI-backed replay of emitted ideals and relation
  witnesses. PARI is a test oracle and is not linked into the Rust product.
- `benchmark/`: alternating, raw-sample benchmark runner with explicit timing
  boundaries and exact result fingerprints.
- `wasm-arithmetic/`: direct linkage to Sage.js's pinned GMP Wasm build and
  cross-runtime arithmetic receipt.
- `browser/`: fail-closed class-group reactor ABI and actual-browser runner for
  the first real class-group Wasm artifact.

Each subdirectory documents its focused reproduction commands. Run the Rust
core tests from the repository root with:

```bash
cargo test --release --all-targets \
  --manifest-path bench/pari-class-group-rust/Cargo.toml
```
