# Numerical trace accounting: main-based integration

This is the isolated N1 trace slice from draft #132, rebuilt on
`5b307b65f` (2026-09-12). It does not import the experimental numerical
compiler, floating-FFI, prepared-evaluator, statistics, or LU PR stack.
The unfinished public-LU workspace is preserved separately.

## Contract

Each accepted event owns detached input data and diagnostics. Its canonical
UTF-8 JSON size is computed once; retained-array bytes are maintained through
admission and eviction, including brackets and commas. Exported nested
diagnostics must also be detached, or their mutation would invalidate the
cached size. No serialized event copy is retained solely for accounting.

Count and byte eviction retain their existing head/important/tail policy.
Important events do not override the hard byte ceiling. ODE detail admission
projects only bounded metadata plus cached sizes and still reserves room for
the terminal record. Sequence numbering survives complete history eviction.

The independent list-of-records oracle covers all trace levels, forced and
important events, count and byte caps, exact-boundary equality, Unicode,
oversized events, invalid data, nested aliasing, and ODE projection. A separate
witness makes serialization of previously retained events fail, so correctness
tests also enforce the absence of history rescanning.

This removes repeated history serialization, not every trace cost: deterministic
eviction still scans the bounded retained list. It does not weaken final solver
validation, change algorithms, introduce native defaults, or change budgets.

## Validation and measurement

The initial main-based CPython accounting oracle, all 48 initial workload/trace
combinations, and seven existing root/optimization/ODE oracle tests pass.
Strict Python passes all 386 modules. The complete accounting oracle also
passes on the freshly converged Sage.js compiler under Node 26.8.1 and the
supported Node 22.22.2 floor. The fresh eight-stage build passes (the optional
FLINT addon and production native pack are absent). Fifteen existing domain
tests pass, including Sage.js root/optimization/ODE contracts and a live SciPy
ODE comparison. The symbolic Sage scalar-root test requires the optional FLINT
addon, absent in both fresh baseline and candidate checkouts; its identical
missing-addon failure is retained, not counted as a pass.

The complete oracle also passes through production public workers in Chromium,
Firefox, and WebKit. The fresh production artifact authenticates as
`sha256:3130056a8b9be7ae6c502f7889df84086dbe69c1262c625039c11a18b74ffd83`;
its 15-module ABI review and unchanged payload/topology budgets pass. Eager-core
gzip is 17,185,965 bytes (limit 17,600,000) and Brotli is 9,673,209 bytes
(limit 9,700,000). This is a narrow margin, not permission to grow the budget.
Run `node test/numerics/performance/trace-accounting-browser.mjs` to repeat
the three-engine regression; missing browsers fail instead of qualifying.

[Local paired evidence](../bench/numerics/performance/results/n1-main-2026-09-12/README.md)
retains fresh main/candidate A1/B1/B2/A2 blocks and identical observations in
all 60 workload/policy records. The independent persistent-host repeat is
still running. Source receipts name `db7c806b`, not this evidence-only follow-up.

The broad architecture gate currently fails on the unchanged base-main
`docs/general-class-unit-frontier.md` historical retired-toolchain mention. The numerical,
native, Wasm capability and resource checks preceding it pass. The optimizer
inventory has been regenerated and verifies against the changed source.
The remaining optimization-engine tests (34), memory validation and
algebraic-geometry checks also pass separately.

Use `bench/numerics/performance/run.cjs` with its committed-source and current-
build checks. Retain censored batches, all samples and separately reported
startup/preparation; never infer public speed from a kernel-only number.
Run before/after blocks serially after builds and other tests finish. An
independent quiet persistent-host repeat remains necessary to confirm gains.

## Remaining program

N0–N6 remain open. This slice does not qualify the complete scaling corpus,
compiled statistics, dense or spectral libraries, prepared derivatives,
callback-heavy solvers, sustained memory, browser distributions, or four-host
installed npm/SEA paths. Existing release candidates and publication remain
owned by the release lane. #200 remains draft: its ABI refresh cannot be
applied alone to main, and its payload-budget failure is not waived here.
