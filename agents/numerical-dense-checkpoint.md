# N3 dense-kernel checkpoint

`perf/numerical-packed-lu` starts with a private bounded partial-pivot LU
candidate. It lowers the actual ordinary Python body, preserves the existing
first-maximum pivot policy and arithmetic order, and has no host callbacks.
It is not a public or automatically selected backend. Shapes are limited to
1–128 rows and columns; nonfinite arithmetic is classified and writable
buffers must be discarded on failure. Completion does not claim nonsingularity.

The local existing OpenBLAS prefix exports `cblas_dgemm` but not the probed
`dgesv`, `dgetrf`, `dpotrf`, `dsyev` or `dgesvd` routines. This agrees with
`packages/flint/scripts/build-deps.cjs`, which explicitly sets `NOFORTRAN=1`,
`NO_LAPACK=1` and `NO_LAPACKE=1`. Reusing that prefix does not by itself provide
LAPACK. No new external dependency or final backend choice is made here.

The focused corpus compares the source body with the existing ordinary LU
factorization and independently reconstructs permuted input entries. It includes
square and rectangular matrices, singular/zero-pivot cases, scaling, shape and
storage rejection, and nonfinite/overflow rejection. The same successful cases
are compared through native, generated JavaScript and Wasm targets. This is
focused evidence, not general qualification of a dense solver library.

`node bench/numerics/performance/packed-lu.cjs` separates fresh compilation from
warm 8/32/64/128-square factorization batches. It includes the generated adapter
and input-to-workspace copy, but excludes public conversion, independent
validation, planning, result creation and buffer allocation. Its generated
JavaScript comparator is not SciPy, BLAS or the full public fallback. Do not
present isolated kernel ratios as public speedups.

Next gates remain public integration with unchanged independent validation,
matched library alternatives, complete-call benchmarks, persistent four-host
and package qualification, and explicit trace/cancellation boundaries. QR,
Cholesky, eigen and SVD are not delivered by this LU candidate.

The [four-host source receipts](../bench/numerics/performance/results/n3-packed-lu-platforms-2026-09-05/README.md)
now pass for the private kernel with identical unchanged selected input hashes.
Windows required moving the large oracle corpus from argv to stdin; no kernel
change was needed. Strict Python passes with 376 modules, architecture passes,
and Node 22.22.2 and three-engine Wasm source checks pass. Public integration
and the broader qualification gates above remain open.

## Validation overflow correction

Before public acceleration, inspection found an existing false-success path:
`[[1e308, 1e308], [0, 1e308]]` has an infinite binary64 infinity norm, and a
factorization with a ten-percent error in its first entry was accepted with
zero relative residual. Related normalization divisions exist in QR, Cholesky,
linear-system backward errors and least-squares checks.

`fix/numerical-lu-validation-overflow` rejects unrepresentable normalization
as `nonfinite_intermediate` / indeterminate validation, rather than dividing
by infinity. It does not claim extended-range validation is implemented.
Focused tests include deliberately wrong factors and the public structured
failure path. A future scaled normalization implementation needs its own
evidence; acceleration must not bypass these guards.

The [overflow qualification](../bench/numerics/performance/results/validation-overflow-2026-09-05/README.md)
retains matching four-host CPython/dynamic receipts and twelve source-browser
routes. A combined-fixture WebKit assertion remains unexplained; the
filename-labeled separate-fixture harness passed. This is source qualification,
not full product or performance qualification.

## Dynamic reconstruction access

`perf/numerical-dense-validation-access` retains immutable row-major entry
snapshots inside the independent product, preserving every `math.fsum` and
cancellation checkpoint. The [local paired public-LU probe](../bench/numerics/performance/results/n3-validation-access-2026-09-05/README.md)
measures 32-square calls at roughly 1.76 s before and 0.96 s after this one
change. This is a development observation, not a target pass or a compiled
backend speedup. It identifies validation overhead that must be addressed
alongside factorization before promoting a public dense acceleration path.
The [four-host and browser witnesses](../bench/numerics/performance/results/n3-validation-access-platforms-2026-09-05/README.md)
pass for this source. They do not qualify public native selection or N3's
performance exit criteria.

## External-library contender

The [Eigen 5.0.0 closure probe](../bench/numerics/performance/results/n3-eigen-closure-2026-09-05/README.md)
builds and runs on all four native hosts and in Chromium/Firefox/WebKit. It
covers only tiny known solves and decomposition smoke cases. The Wasm build
needs exceptions disabled with the current SDK; allocation failure and recovery
remain unqualified. This makes Eigen a concrete contender, not a selected or
integrated backend. Matched performance, independent broad correctness,
generic floating FFI storage and production memory/failure contracts remain
required. No new runtime dependency is introduced.

## Floating predicate boundary

The next generic compiler prerequisite supports boolean-returning binary64
functions, typed boolean locals/literals, and boolean results from compiled
helpers. C uses an `int` result slot, Node exposes a boolean, and Wasm uses
the existing boolean result ABI. Integer-only boolean signatures retain their
existing compiler path. This does not add floating foreign calls or select
Eigen. Focused tests compare CPython, generated JavaScript, native Node and
standalone/browser-shaped Wasm, including NaN, infinities and signed zero;
these loader tests are not a new three-browser qualification receipt.
The focused compiler suite passes on Node 22.22.2 and 26.8.1; nine existing
evaluator/helper/root/LU regressions, architecture and strict Python pass.
The broad `test/native-kernel.cjs` run is incomplete in this portable worktree:
after exercising generated cores it requires the absent FLINT Node addon.
Its standalone compilation checks now honor `SAGEJS_FLINT_PREFIX`, as the
compiler already does. No exact addon was built or installed for this change.

## Floating foreign storage (in progress)

`perf/numerical-floating-slices` extends the declaration catalog with
`Float64Buffer` and `packed_float64_slice`. The first accepted compiled shape
uses floating buffers, unsigned dimensions and boolean status, with
`RuntimeError` failure. Generic C staging preserves aliased input/output and
does not copy failed output back. The focused witness tests allocation failure,
length mismatch, empty buffers, generated JavaScript and the generated Linux
Node adapter. It requires no FLINT/GMP link. Scalar floating arguments, resource
composition and generated Wasm foreign adapters are deliberately rejected.

The catalog change invalidates declaration identities; regenerated wrappers
and the opportunity inventory are part of the change, not new mathematics.
The ordinary Python runtime to generated native Node adapter path now passes,
including boxed floats and rollback. Node 22.22.2 and 26.8.1 focused checks
pass. Eleven existing declaration/code-generation checks and six existing
Wasm FFI checks pass; addon-dependent FLINT/graph integration checks cannot
run in this portable worktree. Four-host qualification and an actual Eigen
product binding remain open. The existing source-compiled floating Wasm fallback is
unchanged. No automatic backend or public performance claim is added.

Local self-hosting convergence passed after restarting the build process: a
prior four-pass in-process attempt aborted inside Tree-sitter Wasm. This is
retained as a build-tool incident, not a numerical failure or a claimed parser
fix. The final generated bootstrap contains the current floating storage
normalization and its end-to-end runtime tests pass.

The first remote run passed the floating witness on Linux x64, Linux ARM64
and macOS ARM64. Windows passed standalone C but its test-only Node build
conflicted on Node 26's inherited `/std:c++20` and explicit `/std:c11` flags.
The harness now clears the inherited C++ language standard; its Windows rerun
is pending the release lane's host reservation. This is not yet a four-host
pass. The collector now selects four addon-independent tests explicitly: the
existing FLINT resource-ownership test remains in the full integration suite,
not this portable bundle. Local selected tests also pass from a fresh archive
extraction with no inherited build tree. Future receipts must use fresh archive
extractions: copying prior qualification trees retained extra files and changed
the selected snapshot even though the four remote snapshots agreed.

## Independent reconstruction arithmetic

`perf/numerical-validation-products` adds a private bounded reconstruction-row
kernel that imports the existing accurately rounded sum from numerical core.
The [local comparison](../bench/numerics/performance/results/n3-validation-products-2026-09-06/README.md)
measures a full 32-square product through native row calls at 0.681 ms versus
39.2 ms for generated JS. It excludes public result construction and norms;
public LU and its cancellation/check order are unchanged. The shared sum was
moved out of statistics rather than adding a linear-algebra-to-statistics
dependency. Source/native/JS/Wasm and three-browser corpus checks pass. Remote
qualification waits for the release host reservation; this is not N3 acceptance.
Node 22.22.2, 22 reduction/lazy-loading/row tests, three prepared-statistics and
pack checks, strict Python (377 modules), and the complete architecture gate
pass locally. The full lazy-module rebuild and public browser-statistics rerun
are separate pending packaging checks; kernel browser witnesses are not used
as substitutes for them.
