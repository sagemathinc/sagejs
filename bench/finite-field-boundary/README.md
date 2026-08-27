# Finite-field representation and boundary benchmark

The checked measurements and architectural interpretation are in
[`RESULTS.md`](./RESULTS.md), and the compiler specialization's enumerated
correctness argument is in
[`PROOF-OBLIGATIONS.md`](./PROOF-OBLIGATIONS.md). This benchmark answers a different question from
the minimal two-`int32` call-boundary benchmark in `bench/call-boundary`: what
happens when the operation is a realistic word-prime modular add, multiply, or
multiply-add, and what happens once immutable-looking public element objects
and packed arrays are included?

The JavaScript harness compares:

- inline Number and BigInt arithmetic;
- scalar and batched WebAssembly calls;
- scalar and batched Node-API calls;
- two-result public-object shapes with and without `Object.freeze`;
- one-result fused object paths; and
- resident and copied typed-array kernels.

`public.sage` is accepted unchanged by Sage.js and SageMath. It measures the
ordinary `GF(65521)` and `Zmod(65521)` API rather than a synthetic
representation. `decompose.sage` and `compiler-primitives.sage` isolate object
allocation, direct method dispatch, raw residue expressions, and primitive
exact-integer lowering.

Build on Linux or macOS, then run any supported JavaScript runtime:

```sh
bench/finite-field-boundary/build-posix.sh
node bench/finite-field-boundary/benchmark-js.mjs
bun bench/finite-field-boundary/benchmark-js.mjs
deno run -A --unstable-ffi bench/finite-field-boundary/benchmark-js.mjs
node bin/sagejs bench/finite-field-boundary/public.sage
node bin/sagejs bench/finite-field-boundary/decompose.sage
node bin/sagejs bench/finite-field-boundary/compiler-primitives.sage
pnpm bench:finite-field-compiler --check
pnpm bench:finite-field-native --check
```

For a matched interpreter comparison, run the same ten-million-step dependency
chain in Sage.js, PARI/GP, and Magma. PARI/GP and the commercially licensed
Magma system are optional and are not build dependencies:

```sh
node bin/sagejs bench/finite-field-boundary/cas-comparison.sage
gp -q -f bench/finite-field-boundary/cas-comparison.gp
magma bench/finite-field-boundary/cas-comparison.magma
julia --startup-file=no --history-file=no bench/finite-field-boundary/cas-comparison.jl field
julia --startup-file=no --history-file=no bench/finite-field-boundary/cas-comparison.jl fused
julia --startup-file=no --history-file=no bench/finite-field-boundary/cas-comparison.jl raw
```

Running each Julia mode in a fresh process makes its `COLD_*` row an honest
compile-plus-execute measurement. The following seven rows are warmed. The
ordinary `field` mode uses an immutable parametric `ModP{65521}` and overloaded
`*`/`+`; `fused` adds an explicit modular `muladd`; `raw` uses typed `Int`
locals directly.

The `@native` control compiles the same primitive `uint64` recurrence through
the real Native Kernel compiler, then reports compilation, addon loading,
first-call, and nine warmed-call timings separately. Its `--check` mode
requires a machine-code backend and the exact checksum; it does not count a
portable JavaScript fallback as native success.

On Windows, use `build-windows.ps1` from a PowerShell prompt with Visual
Studio C++ Build Tools installed. The Wasm file is architecture-independent;
copy a `modular.wasm` produced by the POSIX build into the Windows `build`
directory before running the shared JavaScript harness.

The default harness uses warmed, rotated samples, checks every dependency
chain and complete vector result, and reports nanoseconds per mathematical
step. Override the workload with `--iterations`, `--warmup`, `--samples`,
`--vector-length`, and `--vector-samples`.

The compiler recurrence benchmark is a performance ratchet for the exact
closed-loop specialization. It requires the ten-million-step public
`GF(65521)` recurrence to remain below a reviewed 50 ns/step ceiling. That is
loose enough for slower CI hosts but far below the approximately 108 ns object
path, so loss of representation-aware lowering fails loudly.
