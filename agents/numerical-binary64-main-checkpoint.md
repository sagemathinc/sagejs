# Numerical binary64 foundation on main

This N2 foundation is isolated from draft #146 onto main `c4c126d09`.
It has no dependency on the old numerical PR stack, #224, or #225.
Public statistics dispatch is unchanged. This is not N2 completion.

## Source and boundary decisions

The private `statistics._packed.finite_sum` is ordinary typed Python compiled
through the existing source-transparent native pipeline. It retains the same
dynamic body and a finite-input partials summation with half-even correction,
adapted from pinned CPython source with its license and attribution retained.
It is not a replacement for the complete public `math.fsum` contract.

Callers supply pairwise nonaliasing input, scratch, and output storage. Success
publishes one output; nonfinite input, intermediate overflow, or insufficient
capacity leaves output unchanged. Scratch contents are not results. A future
public owner must enforce aliasing, input/work budgets and cancellation bounds
before calling this kernel. No public automatic selection is enabled here.

Compilation no longer requires the exact-arithmetic prefix when **every**
function in a nonempty module is binary64 and the module has no foreign-library
calls. Mixed exact/field or foreign-library modules keep their dependencies.
The generated Node adapter uses a small Node-API status helper; the mathematical
core remains host-independent and does not call the interpreter. Floating-point
contraction is disabled on Linux, macOS and native Windows compiler paths.
This does not permit reassociation, fast-math, or changed exact arithmetic.

Two portability corrections accompany the foundation: generated JavaScript
binary64 arguments accept genuine boxed numbers using the intrinsic unboxer,
without executing user coercion hooks; native source registration uses physical
paths for existing files, matching the compiler on directory aliases such as
macOS `/tmp`. Changed source hashes and explicit cache isolation must still
reject stale or absent artifacts. Virtual source names retain lexical identity.

## Qualification

The 200-case corpus compares bit patterns against independently rounded exact
rationals and CPython `math.fsum`, including cancellation, half-ulp ties,
subnormals, large offsets, wide exponents, nonfinite input and overflow.
Additional capacity cases check transactional output. Target tests cover
ordinary Sage.js, generated JavaScript, native addons, emitted Wasm and real
Chromium/Firefox/WebKit workers. Worker imports throw if called. Explicit
browser qualification fails if the toolchain or browser engines are absent.
These isolated-kernel tests do not qualify a shipped public browser API.

The kernel opportunity runner separately reports reused storage and fresh
packing/allocation. Small native calls are timed in checksum-verified batches,
with a loop/clock control reported without subtraction. Its numbers exclude
public input conversion, sorting, independent statistics validation, structured
results, tracing and sustained memory; they cannot establish the `describe`
10 ms target. Quiet paired public qualification remains future work.

At source commit `c092f9fe7`, the fresh eight-stage build passes; production exact-native packs are explicitly
skipped because this checkout lacks the optional FLINT adapter. CPython corpus,
formatting and strict Python (388 modules, zero errors) pass. All nine focused
tests pass without skips on both Node 26.8.1 and 22.22.2, including prefix-free
native compilation and three real browser workers. Ordinary dynamic Sage.js
also runs the entire 200-case corpus, not just selected examples, with explicit
signed-zero checks. A standalone AddressSanitizer/UndefinedBehaviorSanitizer
run, with leak detection, passes the complete corpus, capacity failures and
surrounding sentinels.

The broader private-helper, identifier-hygiene and contextual-uint64 tests pass
8/8 using the existing local exact dependency prefix. Their first run exposed
a stale test that expected a private undecorated helper to be exported; the
same assertion fails on unchanged `5b307b65f`, whose relevant compiler sources
match `c4c126d09`. The corrected regression instead verifies the helper remains
private and checks the actual public caller's separate status/result names.
It does not restore the obsolete export or change native mathematical code.
The final full build passes after that test edit, and its artifact receipt
matches that source. The broad compiler fixture suite reports 17 passes, 28 declared
historical/disabled skips and nine failures, all requesting the absent
`sagejs_flint.node` addon. That is not a full compiler-suite pass; the numerical
foundation's prefix-free target tests and the mixed-prefix regressions above
are separate evidence. No failed fixture or dependency requirement was removed.

A subsequent complete optional-addon preparation builds the direct FLINT addon
and all 427 generated FFI adapters against the existing dependency prefix,
without rebuilding or modifying that prefix. The pinned patched eclib source
was copied into this checkout's private build directory. Building only the
direct addon first exposed the separately required FFI manifest; that missing
artifact was built before the final rerun, not bypassed.

With both addon components installed, the full compiler suite reports **25
passes, one `algebra.py` timeout and 28 declared skips**. The identical
60-second algebra timeout reproduces in isolated unchanged `5b307b65f`, using
the same compiled FLINT package through a diagnostic module-cache injection.
The baseline checkout remained untouched; `packages/flint` and its FFI
declaration have no source diff from that baseline to the integration base.
This is a baseline timeout reproduction, not a pass or a diagnosis of the
underlying slow operation. The build predates optional-addon installation and
does not qualify production exact-native packs. Reviewed raw logs, adapter
identities and the baseline injection script are retained under
`bench/numerics/performance/results/n2-binary64-main-2026-09-12/`.

FFI, package graph, numerical, native, Wasm capability/workload/lifetime audits
pass. The broad architecture command stops on inherited historical-word
mentions at `agents/python-property-mutation-followup.md:47` and
`docs/general-class-unit-frontier.md:280`; this is not a full architecture pass.
The remaining optimizer, optimization-engine and algebraic-geometry gates pass
when run explicitly. The source-bound optimizer inventory and q-expansion
manifest's shared package-graph hash are regenerated, not copied from drafts.

[Four-platform isolated-kernel qualification](../bench/numerics/performance/results/n2-binary64-main-2026-09-12/four-platform/README.md)
now passes on the frozen clean source above: Linux x64 and Windows each pass
6 focused tests with 3 explicit skips; Linux ARM64 and macOS ARM64 each pass
8 with 1 explicit sanitizer skip. Original stage-8 provisioning failures and
source-preserving resumes are retained for ARM and Mac. This does not qualify
public query latency, full release builds, or npm/SEA distribution. All four
host reservations have been handed back through Discussion #104.

[Local opportunity measurements](../bench/numerics/performance/results/n2-binary64-main-2026-09-12/README.md)
bind the clean source commit above. At 20,000 values, reused native summation
measures 0.117 ms versus 0.115 ms for CPython's compiled `math.fsum`; packing
and allocating raises the native measurement to 0.293 ms. This is one local
kernel campaign, not independently confirmed public-query performance. Raw
batches, loop/clock controls, setup and artifact identity are retained. The
14,504-byte addon is not the whole runtime or a browser-payload measurement.

## Remaining N2 work

Integrate stable centered/scaled reductions behind checked owned storage,
measure complete public queries and setup separately, and address sorting and
validation costs without weakening the result contract. Then qualify lazy
native/Wasm packaging, missing-resource fallbacks, memory/cancellation bounds,
four-platform installs and browser execution before changing defaults.
