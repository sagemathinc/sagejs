# Sparse integer linear algebra in WebAssembly

## Selection

The representative native profile compared exact sparse rank, right-kernel,
and solve workloads over `ZZ`, `QQ`, and `GF(65521)` at dimensions through
`192 x 204`. The `ZZ` right kernel was the Tier-2 hot case: the initial
single-sample profile took about 73.5 ms, compared with 27.6 ms for the `QQ`
kernel, 2.1 ms for the prime-field kernel, and 47.3 ms for a `192 x 192`
sparse integer solve.

The selected route is FLINT's existing owned `fmpz_mat` resource operation.
The declaration admits exactly `fmpz_matrix_right_kernel` to Wasm. It does not
port LinBox, introduce a new matrix algorithm, or add a host callback. The
dynamic generated FFI wrapper remains the exact ordinary execution path, and
the public native and `SAGEJS_NATIVE_DISABLE=1` witnesses agree entry for
entry, including arbitrary-size integers and zero-dimensional cases.

## Workload and result

`node bench/wasm-sparse-integer-linear-algebra.cjs` constructs matrices with
at most four nonzero entries per row and fixed nullity 12. It reports five
samples at each size, retains the first sample, and separately measures native,
disabled-native, direct Wasm, and the public Node-Wasm evaluator.

| Rows x columns | Native median | Direct Wasm median | Public Node-Wasm median | Public/native |
| --- | ---: | ---: | ---: | ---: |
| 32 x 44 | 4.11 ms | 3.23 ms | 2.93 ms | 0.71x |
| 64 x 76 | 10.69 ms | 11.16 ms | 10.41 ms | 0.97x |
| 96 x 108 | 9.84 ms | 23.02 ms | 22.33 ms | 2.27x |
| 128 x 140 | 18.85 ms | 44.54 ms | 44.69 ms | 2.37x |
| 192 x 204 | 41.04 ms | 116.19 ms | 118.89 ms | 2.90x |

The largest measured public workload stays within the program's 3x native
objective. The crossover is near 64 rows on this host; above it the Wasm32
FLINT core is slower but remains bounded and interactive.

The 25-sample public Node-Wasm run observed 25 fixed
`ffi:flint:fmpz_matrix_right_kernel` calls, 125 total crossings (five per
sample), and zero copied host bytes attributed to the owned-resource kernel.
The public Chromium receipt used the same route in 147.1 ms end to end with
five crossings and zero kernel-attributed copied bytes. FLINT resource
construction and the result stay inside one Wasm ownership domain.

Exact raw measurements and host details are checked in at
`bench/results/wasm-sparse-integer-linear-algebra.json`.

## Correctness and limits

The direct Wasm test checks the canonical integral kernel entries and computes
`A * K.transpose()` through the same Wasm instance. Public native and
disabled-native executions agree exactly. Direct boundary tests cover invalid
and closed handles, dimensions beyond Wasm32 capacity, zero rows, zero
columns, idempotent close, and leak-free failure paths. The generated backend
records the capability ID from its fixed declaration; evaluated Python is not
given the recorder or a route-claim hook.
