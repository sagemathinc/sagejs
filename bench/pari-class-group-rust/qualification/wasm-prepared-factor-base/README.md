# Prepared cubic factor-base Wasm milestone

This qualification artifact is the first browser execution of the real
prepared-cubic path. It accepts the same answer-free neutral row-6 input as the
native class/unit engine, then executes the production exact sources for:

1. strict JSON ingress and oracle-answer rejection;
2. replay of polynomial, rational integral basis, discriminant,
   multiplication table, signature, and index-prime invariants;
3. exact maximal-order factor-base construction; and
4. GMP-backed canonical row HNF for all 1,130 exact ideals, including the
   equation-order index prime 3.

It returns a canonical descriptor hash and stage dimensions. It does **not**
collect relations, compute Smith form, reconstruct units, or certify a class
group. Its status is therefore `bounded-stage`; this is neither W0 nor R5.

## Arithmetic bridge

The production sources use Rug. Current Rug 1.30 requires GMP 6.3, whereas the
qualified Sage.js Wasm toolchain intentionally pins GMP 6.2.1. This artifact
uses Rug 1.19.2 with `gmp-mpfr-sys` 1.5.3, the last matching binding line, and
includes the current production source modules by path. The small
`gmp-mpfr-cross-cc.sh` adapter replaces only `gmp-mpfr-sys`'s impossible
compile-and-execute cross probe with the authenticated GMP 6.2.1 Wasm ABI
facts (32-bit limbs, no nails). It delegates all other C compilation to the
prepared WASI clang. The final artifact links the qualified prepared `libgmp.a`.

This is a bounded compatibility bridge, not the final shared arithmetic
backend. The next implementation step should promote a reviewed direct GMP
backend or update the prepared GMP pin before adding MPFR-dependent relation
collection.

## Result

The final artifact is 484,212 bytes with SHA-256
`8c1b168b6fee3e492da4001546efcbbe9b75d4084ad6c82ed2f7e15f7dfb158e`.
All 15 calls in each browser returned the same exact descriptor hash as native.
Median complete-stage times were:

| Runtime | Median | Native ratio |
| --- | ---: | ---: |
| Native Linux | 216.7 ms | 1.00x |
| Chromium | 530.8 ms | 2.45x |
| Firefox | 3,401 ms | 15.69x |
| WebKit | 419 ms | 1.93x |

Every browser grew from 17 to 33 Wasm pages and remained at that high-water
mark through repeated calls. The imports are the bounded WASI file-descriptor
set plus the qualification-only empty-environment shim documented by the
shared browser route. See `native-receipt.json` and `receipt.json` for all raw
samples, exact outputs, versions, imports, and artifact identities.

## Reproduce

From this directory:

```bash
./build-wasm.sh
node prepare-vector.mjs
node ../browser/run-browser.mjs \
  --engines chromium,firefox,webkit \
  --artifact bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/build/prepared-factor-base.wasm \
  --vector bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/build/row6.vector.json \
  --output bench/pari-class-group-rust/qualification/wasm-prepared-factor-base/receipt.json
```

The browser runner performs 15 complete allocate/run/copy/free calls in each
engine. Native source tests replay the same row-6 field and freeze the same
factor-base dimensions and descriptor hash. Run them with:

```bash
cargo clean
CC=gcc cargo test --release --lib
CC=gcc cargo run --locked --release --bin native-benchmark -- \
  ../row6-candidate/inputs/row6-neutral-prepared-field.json
```

The explicit `cargo clean` prevents target-specific GMP limb metadata from a
previous Wasm build being reused for the native build.

## Bounded-residue optimization

Revision `c4d07156194765506d137792732ba5109cd8c87e` replaces millions of
provably bounded i128 remainder operations in the cubic root scan with guarded
i64 multiply-adds, retaining the original i128 fallback outside the proved
range. It also reuses each prime's factor pattern instead of recomputing it for
`full_count`.

The cleanly rebuilt artifact is 484,386 bytes with SHA-256
`1bc6515472a34c559664840afa6f459432b58b8ea14025e5a82bc2188baecdec`.
All 45 browser calls and all 15 native calls preserve descriptor digest
`dc63c73dbc419b05a4a1b907cdd8a60f70247f74a0d477880eb25d19c4356306`
and the 17-to-33-page memory profile.

| Runtime | Before | After | Speedup |
| --- | ---: | ---: | ---: |
| Native Linux | 216.70 ms | 111.62 ms | 1.94x |
| Chromium | 530.8 ms | 160.3 ms | 3.31x |
| Firefox | 3,401 ms | 950 ms | 3.58x |
| WebKit | 419 ms | 163 ms | 2.57x |

See `optimized-receipt.json`, `optimized-native-receipt.json`, and
`../wasm-factor-pattern-ab/optimization-receipt.json`. The aggregate verifier
checks all raw samples and the full source/build/toolchain closure.
