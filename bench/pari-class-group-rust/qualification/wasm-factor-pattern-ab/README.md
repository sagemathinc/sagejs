# Cubic factor-pattern residue-width A/B

This artifact isolates the modular root scan used by the production prepared
cubic factor base. It runs the row-6 polynomial through every rational prime
at most 9,196 and serializes all factor records into one exact digest.

The harness freezes two independent local implementations:

- `baseline` is the original `i128` multiply-add and remainder kernel;
- `bounded-i64` uses `i64` only when
  `(p - 1)^2 + (p - 1) <= i64::MAX`, and otherwise calls the frozen `i128`
  implementation.

Because every operand is first reduced into `[0, p)`, the largest fast-path
intermediate is `(p - 1)^2 + (p - 1)`. The guard is evaluated in division
form, so the proof check cannot overflow. Tests exercise the whole row-6 prime
range, extreme signed coefficients, counterfeit requests, nontrivial operands
at the exact supported boundary `p = 3,037,000,500`, and the fallback at
`p + 1`.

The two request vectors, Cargo dependency resolution, and Wasm toolchain digest
are committed. Performance and browser receipts are deliberately not recorded
until the production optimization and this harness have a committed repository
revision. That prevents evidence from claiming an uncommitted source identity.

## Reproduce inputs and tests

From this directory:

```bash
node verify-inputs.mjs
cargo test --locked --release
cargo run --locked --release
./build-wasm.sh
```

After the production commit exists, the two real-browser runs are:

```bash
node ../browser/run-browser.mjs \
  --engines chromium,firefox,webkit \
  --artifact bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/build/factor-pattern-ab.wasm \
  --vector bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/baseline.vector.json \
  --output bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/baseline.browser-receipt.json
node ../browser/run-browser.mjs \
  --engines chromium,firefox,webkit \
  --artifact bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/build/factor-pattern-ab.wasm \
  --vector bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/bounded-i64.vector.json \
  --output bench/pari-class-group-rust/qualification/wasm-factor-pattern-ab/bounded-i64.browser-receipt.json
```

The evidence verifier added with those receipts must reject the evidence unless
all engines have the required sample count, all exact digests agree, medians
match the raw samples, and source, vector, executable, toolchain, host, and
repository identities are complete.
