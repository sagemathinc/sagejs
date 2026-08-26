# Finite-field representation and boundary benchmark

The checked measurements and architectural interpretation are in
[`RESULTS.md`](./RESULTS.md). This benchmark answers a different question from
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
```

For a matched interpreter comparison, run the same ten-million-step dependency
chain in Sage.js, PARI/GP, and Magma. PARI/GP and the commercially licensed
Magma system are optional and are not build dependencies:

```sh
node bin/sagejs bench/finite-field-boundary/cas-comparison.sage
gp -q -f bench/finite-field-boundary/cas-comparison.gp
magma bench/finite-field-boundary/cas-comparison.magma
```

On Windows, use `build-windows.ps1` from a PowerShell prompt with Visual
Studio C++ Build Tools installed. The Wasm file is architecture-independent;
copy a `modular.wasm` produced by the POSIX build into the Windows `build`
directory before running the shared JavaScript harness.

The default harness uses warmed, rotated samples, checks every dependency
chain and complete vector result, and reports nanoseconds per mathematical
step. Override the workload with `--iterations`, `--warmup`, `--samples`,
`--vector-length`, and `--vector-samples`.
