# Optimizer development workloads

This directory contains the immutable controls and authentic workloads used by
the compiler-development campaign. The content-addressed catalog is
`architecture/optimizer-workloads.json`.

Validate or inspect it without starting Sage.js:

```sh
node scripts/optimizer-workload.cjs check
node scripts/optimizer-workload.cjs list
node scripts/optimizer-workload.cjs show bounded-integer
```

Run a short development profile after a current build:

```sh
pnpm build
node scripts/optimizer-workload.cjs run bounded-integer --smoke
```

Promotion evidence uses the standard profile and a clean source tree. The
strict preflight rejects a stale build receipt or dirty source identity before
starting a workload. `--allow-dirty` only permits an explicitly
non-promotable development run; it does not waive the current-build check.

The five `*.py` controls are static CPython-parseable sources. The profiler
compiles those exact bytes, while the established machine-corpus harness
supplies alternating O0/O2/CPython execution measurements. Their reviewed
paths, byte digests, functions, and expected selection policies are pinned in
`test/fixtures/optimizer-development/workloads/static-control-inventory.json`.

Workload receipts use phase-only authority. They report directly measured
phase distributions and optimizer-report digests, but deliberately make no
claim to private runtime-route telemetry or source-sampled canonical region
attribution. That stronger evidence belongs to the inspector profiler.

The cubic workload constructs a fresh field and maximal order outside each
class-number timer. Both proof modes verify a retained carrier, reconstruct it
detached from its serialized payload, and record a canonical presentation
digest. The ten-field fixture is the mandatory neighboring semantic policy.
The generated-JavaScript cubic kernel remains a measured negative control.

The public polynomial workload evaluates a degree-19,999 polynomial over
`GF(65537)` at `12345`. Independent JavaScript and CPython Horner oracles pin
the standard answer `33853`; dynamic and source-transparent native Sage.js
routes must agree exactly. It also measures the complete generic/dynamic public
call. The source-transparent kernel has no generated-JavaScript target today,
so that disposition remains explicitly unavailable rather than being confused
with the dynamic fallback. A handwritten `Number`/`Uint32Array` Horner loop is
recorded only as a V8 lower bound, never mislabeled as a complete candidate
route. WebAssembly remains explicitly unavailable until an equally complete
public call exists.
