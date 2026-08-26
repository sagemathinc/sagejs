# Finite-field representation and boundary results

Measured 2026-08-26 with two million dependency-chained field steps per
sample, five rotated samples, and 500,000-element vectors. The field is
`GF(65521)` and the recurrence is `x = 12345*x + 6789`. All rows verify exact
checksums. Hosts are AMD EPYC 7B13 Linux x64, Neoverse-N1 Linux ARM64, AMD EPYC
7B13 Windows x64, and Apple M1 Max macOS ARM64.

The headline result is not that Wasm beats optimized native code. It does not.
The result is that a typed scalar Wasm boundary is only about 5–13 ns above an
optimized JavaScript Number loop on the tested x64/Linux-ARM hosts, while a
checked Node-API boundary costs another 38–136 ns. That reverses the usual
intuition for tiny operations: the native instruction is faster, but reaching
it through Node-API is much more expensive.

## Scalar and object medians

All values are nanoseconds per modular multiply-add. “Frozen” and “Number”
both allocate two result-shaped objects; the former additionally calls
`Object.freeze` twice. “Fused Wasm object” makes one Wasm call and allocates one
unfrozen result-shaped object.

| Host/runtime | JS Number | JS BigInt | Wasm | Node-API | Frozen objects | Number objects | Fused Wasm object |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux x64, Node 26.7.0 | 4.98 | 8.61 | 9.77 | 56.09 | 150.84 | 69.40 | 42.92 |
| Linux x64, Bun 1.4.0 | 5.31 | 31.49 | 11.77 | 76.01 | 133.99 | 96.52 | 32.27 |
| Linux x64, Deno 2.9.5 | 4.98 | 7.08 | 9.13 | 81.30 | 143.16 | 66.57 | 41.12 |
| Linux ARM64, Node 26.7.0 | 4.33 | 11.91 | 14.32 | 64.41 | 228.81 | 118.18 | 68.23 |
| Linux ARM64, Bun 1.4.0 | 5.39 | 51.11 | 16.82 | 116.81 | 170.99 | 113.46 | 45.65 |
| Linux ARM64, Deno 2.9.5 | 4.32 | 10.28 | 13.31 | 140.18 | 220.20 | 113.68 | 67.22 |
| Windows x64, Node 26.5.1 | 4.95 | 8.16 | 10.00 | 42.97 | 152.46 | 71.65 | 42.68 |
| Windows x64, Bun 1.4.0 | 5.29 | 46.05 | 11.48 | 82.02 | 122.35 | 79.72 | 37.49 |
| Windows x64, Deno 2.9.5 | 5.05 | 7.24 | 9.55 | 91.24 | 157.54 | 71.79 | 42.28 |
| macOS ARM64, Node 26.5.0 | 14.48 | 26.96 | 22.57 | 96.46 | 307.30 | 161.65 | 90.68 |
| macOS ARM64, Bun 1.4.0 | 16.83 | 69.32 | 27.93 | 125.38 | 273.65 | 207.29 | 56.24 |
| macOS ARM64, Deno 2.9.5 | 14.37 | 24.24 | 22.60 | 169.53 | 292.68 | 147.82 | 85.54 |

## Amortization and vectors

These are Node medians. The `1`, `8`, and `64` columns execute that many
dependent modular steps per foreign call. Vector rows operate in-place over
500,000 `uint32` values.

| Host | Wasm 1 | Wasm 8 | Wasm 64 | N-API 1 | N-API 8 | N-API 64 | JS vector | Wasm resident | N-API borrowed | Wasm copy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux x64 | 10.24 | 4.76 | 4.67 | 62.61 | 10.18 | 5.36 | 3.51 | 2.21 | 2.22 | 2.77 |
| Linux ARM64 | 14.76 | 5.77 | 5.40 | 71.53 | 12.58 | 5.66 | 4.48 | 3.07 | 3.05 | 3.66 |
| Windows x64 | 10.42 | 4.72 | 4.64 | 47.14 | 9.10 | 5.20 | 3.84 | 2.22 | 2.19 | 3.01 |
| macOS ARM64 | 22.62 | 14.86 | 13.90 | 107.60 | 18.20 | 13.93 | 5.33 | 1.95 | 1.90 | 2.31 |

Eight operations per crossing are already enough for Wasm to approach the
inline arithmetic loop. At 64 operations, both foreign boundaries are almost
fully amortized. For resident vectors, the Wasm and borrowed Node-API kernels
are indistinguishable; copying one million bytes in each direction adds only
about 0.4–0.8 ns per element here.

## Specialized computer algebra systems

The same Linux x64 host also ran a longer ten-million-step dependency chain,
with one million warmup steps and seven measured samples. The Sage.js program
is ordinary Sage source and the other programs use each system's public
modular element type. The raw rows use each interpreter's exact integer
remainder operation. Every row produced checksum `19598`.

| System and representation | Version | Median ns/step |
| --- | --- | ---: |
| Magma `GF(65521)` | 2.18 | 88.0 |
| Sage.js `GF(65521)` | 0.4.0 / Node 26.7.0 | 107.625 |
| PARI/GP `Mod(1, 65521)` | 2.17.2 | 154.0 |
| Magma integer `mod` | 2.18 | 102.0 |
| PARI/GP integer `%` | 2.17.2 | 130.6 |
| Sage.js exact integer `%` | 0.4.0 / Node 26.7.0 | 432.002 |

The public Sage.js field loop is only about 22% slower than Magma's highly
tuned finite-field interpreter path and about 30% faster than PARI/GP's
`Mod` path on this workload. That is strong evidence that the new public
representation is viable, but it also exposes the more consequential compiler
opportunity: the exact-integer source loop is about 86 times slower than the
same recurrence after it becomes a proven Number loop in V8. The next target
is therefore guarded representation-aware lowering, not another scalar
foreign-function call.

## Consequences for Sage.js

The original public `GF(65521)` representation stored every residue as BigInt,
froze every result, and entered the full coercion model for every operator. A
public `x*a+b` iteration cost roughly 759 ns. The machine-residue and guarded
closed-parent implementation measured in this change costs roughly 84–113 ns
on the Linux x64 development host while preserving exact BigInt storage above
the reviewed safe modulus limit. This is already faster than the approximately
125 ns observed for the same public loop in SageMath/CPython on that host.

The decomposition also identifies the next compiler problem. A raw residue
loop written in Sage source still costs roughly 670 ns because ordinary `*`,
`+`, and `%` lose the bounded-Number fact and retain exact-Python overflow and
dispatch semantics. Calling `_mul_` and `_add_` explicitly is even slower
because dynamic Python attribute/call semantics become visible. V8 is not
failing to optimize the arithmetic; the compiler is withholding the
representation facts that would make optimization legal.

The resulting design rules are:

1. Use Number residues only when the parent proves every accepted scalar
   expression exact; otherwise retain BigInt.
2. Keep closed-parent guards monomorphic and representation-native, with all
   coercion and user-defined behavior in an exact slow path.
3. Enforce Python immutability in assignment/deletion semantics rather than
   freezing every ephemeral JavaScript object.
4. Convert Number residues to BigInt once at coarse legacy ABI boundaries.
5. Fuse or batch inner loops. Foreign scalar calls can be competitive, but a
   resident typed kernel is still the right endpoint for substantial work.
6. Teach future compiler passes to preserve guarded parent/representation
   facts across local variables and loops; do not infer Number arithmetic from
   names or silently drop exactness.

This benchmark is deliberately a ratchet as well as evidence: it separately
exposes arithmetic, boundary, allocation, freezing, batching, and copying, so
a future “optimization” cannot hide one cost by moving it into another layer.
