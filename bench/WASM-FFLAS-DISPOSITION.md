# FFLAS/FFPACK WebAssembly disposition

## Decision

Do **not** add FFLAS/FFPACK, Givaro, or a BLAS implementation to the
WebAssembly distribution for the reviewed dense-prime matrix workload.

The ten desktop-only FFLAS capabilities are an optional implementation
surface, not ten missing public mathematical operations. Public multiplication,
rank, canonical RREF, and right nullspace already use mature FLINT algorithms
in the production Wasm artifact. The matched measurements below do not justify
the payload, toolchain, ownership, and initialization cost of a second matrix
library.

The review did find and close one real gap. General word-prime matrices had
been prevented from using FLINT resources in every non-Node host. The public
`GF(65537)` workload therefore performed untraced portable computation even
though 65,537 fits safely in Wasm32 FLINT's 32-bit `ulong`. Public dispatch now
uses the authenticated `nmod_mat` resource whenever the production Wasm native
resolver is installed and

```text
256 <= p <= 2^32 - 1.
```

Native Node retains its 64-bit FLINT range. A browser without the authenticated
resolver, and every modulus above the Wasm32 bound, retains the exact portable
fallback. The complete Givaro `Modular<double>` range used by the optional
desktop FFLAS adapter is below 94,906,266, so this closes that public workload
without importing FFLAS.

## Reviewed capability mapping

The availability functions are backend probes. They must not be made to return
true in a browser that does not ship FFLAS. The eight mathematical boundaries
have the following public Wasm owners:

| Desktop-only capability | Reviewed disposition | Public Wasm capability |
| --- | --- | --- |
| `modular_float_available` | desktop implementation probe | none |
| `modular_float_mul` | covered by source-transparent packed FLINT | `kernel:dense-prime-flint-production` |
| `modular_float_rank` | covered by source-transparent packed FLINT | `kernel:dense-prime-flint-production` |
| `modular_float_rref` | covered by source-transparent packed FLINT | `kernel:dense-prime-flint-production` |
| `modular_float_right_nullspace` | covered by source-transparent packed FLINT | `kernel:dense-prime-flint-production` |
| `modular_double_available` | desktop implementation probe | none |
| `modular_double_mul` | covered by owned FLINT resource | `ffi:flint:nmod_matrix_mul` |
| `modular_double_rank` | covered by owned FLINT resource | `ffi:flint:nmod_matrix_rank` |
| `modular_double_rref` | covered by owned FLINT resource | `ffi:flint:nmod_matrix_rref` |
| `modular_double_right_nullspace` | covered by owned FLINT resource | `ffi:flint:nmod_matrix_right_kernel` |

For byte-sized primes, native automatic dispatch still selects FFLAS beyond
its measured crossover while Wasm selects the packed FLINT boundary. For
larger word primes, the canonical public representation is already a FLINT
resource on native Node, so the desktop `Modular<double>` functions are not on
the normal public route either.

## Workload and correctness contract

The benchmark constructs deterministic dense invertible matrices as products
of unit lower and nonsingular upper triangular matrices. It measures:

- dense square multiplication and rank;
- canonical RREF of a dense `(3n/4) x n` full-row-rank matrix;
- the canonical right-nullspace basis of that same matrix.

Each operation receives one warmup, then five timed samples. The report stores
the median. Input construction, exact result serialization, and verification
are outside the timed region. Native Node, Node-Wasm, and Chromium execute
identical public Sage source.

Correctness is exact, not a checksum of selected entries: the harness hashes
every canonical residue of the product, RREF, and nullspace result. All hosts
must have the same SHA-256 digest and rank/nullity invariants. It also checks
`A * K.transpose() == 0`. Wasm measurements must observe all four fixed FLINT
capability IDs through `receipt-backed-wasm-artifact`; a portable route or
missing trace fails the benchmark.

The reviewed warm target through size 512 is:

- every operation finishes within 250 ms; and
- every operation is within 20 times its matched native public route.

The ratio prevents an accidentally pathological implementation. The absolute
bound reflects the product's interactive browser goal and is the controlling
criterion when native FFLAS uses a highly tuned host BLAS unavailable to the
browser.

## Linux x64 result

Host: AMD EPYC 7B13, Node 26.7.0, one OpenBLAS thread. Artifact:
`sha256:4f987c63ee67c23c9dc55541dc13819d6942483c63b1f9cf705231a8a132c037`.
Times are warm median milliseconds. The checked-in JSON contains exact
digests, call counts, copied bytes, individual ratios, and route records.

### `GF(97)`: native FFLAS versus packed FLINT Wasm

| Size | Host | Multiply | Rank | RREF | Nullspace |
| ---: | --- | ---: | ---: | ---: | ---: |
| 64 | native | 0.51 | 0.47 | 0.50 | 0.60 |
| 64 | Node-Wasm | 0.83 | 0.46 | 0.54 | 0.79 |
| 64 | Chromium | 0.95 | 0.40 | 0.68 | 0.90 |
| 128 | native | 0.65 | 0.61 | 0.66 | 0.84 |
| 128 | Node-Wasm | 2.38 | 1.25 | 1.31 | 2.26 |
| 128 | Chromium | 2.66 | 1.27 | 1.66 | 2.53 |
| 256 | native | 1.40 | 1.73 | 1.63 | 2.17 |
| 256 | Node-Wasm | 12.70 | 6.60 | 6.05 | 11.46 |
| 256 | Chromium | 13.82 | 6.03 | 6.68 | 11.38 |
| 512 | native | 8.32 | 7.17 | 5.87 | 8.66 |
| 512 | Node-Wasm | 80.01 | 38.24 | 34.25 | 68.30 |
| 512 | Chromium | 83.17 | 38.12 | 37.91 | 70.32 |

### `GF(65537)`: native and Wasm FLINT resources

| Size | Host | Multiply | Rank | RREF | Nullspace |
| ---: | --- | ---: | ---: | ---: | ---: |
| 64 | native | 0.55 | 0.34 | 0.49 | 0.62 |
| 64 | Node-Wasm | 0.53 | 0.31 | 0.38 | 0.55 |
| 64 | Chromium | 0.50 | 0.27 | 0.34 | 0.52 |
| 128 | native | 0.63 | 0.71 | 0.81 | 1.03 |
| 128 | Node-Wasm | 2.60 | 1.21 | 1.25 | 1.67 |
| 128 | Chromium | 2.48 | 1.21 | 1.22 | 1.63 |
| 256 | native | 1.49 | 2.94 | 2.83 | 4.04 |
| 256 | Node-Wasm | 17.18 | 8.36 | 7.44 | 8.79 |
| 256 | Chromium | 16.99 | 8.51 | 7.40 | 8.82 |
| 512 | native | 8.97 | 19.60 | 19.94 | 24.66 |
| 512 | Node-Wasm | 121.72 | 57.86 | 52.74 | 60.04 |
| 512 | Chromium | 117.06 | 56.81 | 52.26 | 59.89 |

The maximum observed browser time is 117.06 ms. The maximum ratio is 13.57,
for Node-Wasm multiplication at 512 over `GF(65537)`. Both remain inside the
reviewed bounds. Node-Wasm and Chromium timings are close at every size, which
also argues against host-boundary or browser-JavaScript computation being the
bottleneck.

## Why a new FFLAS Wasm artifact is rejected

A useful FFLAS port would require not only its C++ templates but Givaro and a
competitive Wasm BLAS. Without that BLAS, there is no evidence it improves on
FLINT's portable exact kernels. With it, the program would add a large lazy
artifact, another ownership/toolchain closure, and separate float/double
conversion buffers. The existing route is exact, mature, batch-oriented,
receipt-backed, and comfortably interactive at the reviewed stress size.

Revisit this decision only with a public workload beyond the recorded envelope
that misses an explicit product budget, plus a prototype demonstrating an
end-to-end browser win after download, initialization, conversions, and memory
are included.

## Reproduce

```sh
pnpm build
pnpm --dir packages/flint-wasm build
node bench/wasm-fflas-disposition.cjs --check \
  --output bench/results/wasm-fflas-disposition.json
node --test packages/flint-wasm/test/wasm-fflas-disposition.test.mjs
```
