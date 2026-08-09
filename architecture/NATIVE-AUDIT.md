# Native implementation audit: 2026-08-09

This audit is the first application of the mathematical architecture policy in
[`ARCHITECTURE.md`](../ARCHITECTURE.md).  Its machine-readable source is
[`native-audit.json`](native-audit.json); `pnpm architecture:check` verifies
that every reviewed source still has the exact reviewed line and byte count.

## Result

The ten previously unresolved sources contain 21,785 lines of C.  They do not
form one category and should not receive one blanket rewrite:

| Source | Lines | Decision | Priority |
| --- | ---: | --- | --- |
| `packages/flint/src/addon.c` | 4,399 | split adapters from local algorithms | high |
| `packages/flint/src/cyclotomic_rref.c` | 1,008 | retain FLINT storage; migrate control flow later | medium |
| `packages/flint/src/dirichlet.c` | 971 | retain FLINT bridge; migrate orchestration | medium |
| `packages/flint/src/matrix.c` | 5,803 | split FLINT ABI from local algorithms | high |
| `packages/flint/src/modsym_core.c` | 1,458 | staged typed migration after packed P1/sparse storage | high |
| `packages/flint/src/number_field_factor.c` | 516 | retain mature-library bridge | low |
| `packages/flint/src/p1.c` | 4,603 | immediate source-transparent remediation pilot | critical |
| `packages/flint/src/p1_core.c` | 338 | retain compact primitive; compile normalization witness | medium |
| `packages/flint/src/sparse_rational.c` | 1,186 | split storage from elimination, then migrate | high |
| `packages/graph/src/addon.c` | 503 | retain nauty bridge | low |

The principal finding is structural.  `p1.c`, `matrix.c`, and `addon.c` are not
bad because they use C; they are dangerous because host conversion, ownership,
foreign-library calls, and independent mathematical algorithms share enormous
translation units.  The remediation unit is one algorithm and its packed ABI,
not one whole file rewritten at once.

## P1 remediation pilot

[`src/lib/sagejs/kernels/p1.py`](../src/lib/sagejs/kernels/p1.py) now contains
ordinary CPython-parseable bodies for:

- P1 gcd, extended gcd, and normalization with scalar;
- Cremona's continued-fraction Heilbronn representatives for `T_p`;
- Merel's determinant-`n` Heilbronn representatives used by degeneracy maps;
- representative counting, complete packed signed-matrix output, per-entry
  differential access, and an ordered benchmark digest;
- the full homogeneous-polynomial action block for every Heilbronn matrix,
  matching the coefficient-assembly stage of the higher-weight Hecke loop.

The compiler receives no P1 or Heilbronn function names.  It lowers nested
exact loops and direct typed helper calls from their bodies.  The same bodies
run under CPython and as generated JavaScript.  The benchmark compares every
representative for seven primes between generated C and JavaScript, compares
1,200 normalizations to `p1_core.c`, and compares the complete enumeration
digest with the standalone handwritten-C transcription in
[`native-p1-heilbronn-reference.c`](../bench/native-p1-heilbronn-reference.c).
The packed action stage is also checked coefficient-for-coefficient against
the generated JavaScript fallback and by an independent C digest.

Run it with:

```sh
pnpm bench:native:p1
sagejs native explain src/lib/sagejs/kernels/p1.py \
  --function heilbronn_cremona_digest
sagejs native emit-c src/lib/sagejs/kernels/p1.py \
  --function heilbronn_cremona_digest
```

On the shared development host at `p=1009`, representative medians after the
compiler changes were approximately 52 microseconds for compiled typed Python,
24 microseconds for the matched handwritten C body, and 2.1 milliseconds for
both CPython and the generated JavaScript fallback.  These figures are
diagnostic, not release claims; the benchmark emits JSON and is intended for a
dedicated host before budgets are fixed.

The more deeply nested Merel enumeration at `n=75` measured approximately 56
microseconds from typed Python and 51 microseconds from matched C on the same
host.  This near parity is especially useful evidence because the compiler
lowered the real nested divisibility loops rather than recognizing a library
operation.

## Compiler findings

The pilot produced two general compiler improvements rather than a P1-specific
substitution:

1. GCC/Clang overflow builtins replace branch-heavy handwritten checked
   addition, subtraction, and multiplication.  Their failure path preserves
   aliased accumulator values before tagged GMP promotion resumes.
2. Nonrecursive exact helper functions are forced inline.  This prevents an
   unrelated expansion of the module from changing whether a small helper in
   the inner Euclidean loop is inlined.

The signed matrix-record ABI is now implemented generally rather than as a P1
intrinsic. `Int64Buffer` borrows caller-owned `BigInt64Array` storage,
`Int64Record` creates checked non-owning views, and exact reads re-enter the
tagged word/GMP data flow. Writes are signed-range checked. Mutation roots are
part of effect analysis, so externally visible writes disable unsafe replay.

At `p=1009`, weight 4, the compiled typed-Python action stage writes 49,284
coefficients in median 0.745 milliseconds with GCC and 0.447 milliseconds with
Clang on the dedicated 16-vCPU AMD EPYC 7B13 host. The standalone C
transcription takes 0.353 and 0.695 milliseconds respectively; compiler choice
therefore changes generated typed Python from 2.11x behind to 1.55x faster.
Generated JavaScript takes about 79 milliseconds. This is strong evidence for
continuing the readable typed-Python migration, and against drawing conclusions
from one C compiler. It is not yet permission to delete the production C path:
coset transport, retained presentation data, and rational quotient reduction
still need suitable packed ABIs and complete production differential coverage.
Sparse rational star elimination remains later for the same reason.

## WebAssembly consequence

The policy is compatible with WebAssembly because the mathematical source and
typed IR are target-independent.  Today this compiler emits C plus a Node-API
wrapper.  A Wasm target should instead emit the same C core behind a flat
exported ABI over packed linear memory, compile it with Clang/WASI or Emscripten,
and use a small JavaScript adapter.  GMP/FLINT can themselves be linked into
Wasm, as the existing `flint-wasm` package demonstrates.

The architectural constraint is that Node-API values may appear only in the
host adapter.  Algorithms, ownership contracts, and packed layouts must not
depend on Node.  Browser builds normally ship precompiled Wasm; including an
in-browser C compiler is technically possible but is not required for dynamic
fallback correctness or for user-authored native compilation on desktop.
