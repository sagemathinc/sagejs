# Numerical JSON scalar-leaf specialization

N1 increment on baseline `c4c126d09`, 2026-09-12. No numerical latency target
is claimed complete. This change is ordinary Python, not a new native backend.

Prepared-statistics profiling found that result construction and repeated
materialization dominate the compiled arithmetic. This change preserves those
detached copies and validation boundaries, but avoids recursively dispatching
exact built-in JSON scalar leaves and eagerly constructing their error paths.
Exact float leaves still get one finite check. Invalid leaves retain the exact
diagnostic path. Subclasses, custom mappings/sequences, non-string keys and
custom diagnostic-path objects retain the general behavior and read ordering.

The first float-only prototype improved float arrays but regressed integer
arrays. It was not accepted as the final implementation. The final path handles
all exact built-in scalars, with custom-path/key guards. Tests cover ownership,
shared-input detachment, signed zero, extremes/subnormals, invalid values,
predicate counts, canonical serialization and observable container operations.

## Measured scope

The [collector](../bench/numerics/performance/json-leaves.cjs) extracts the
actual pinned baseline and candidate function bodies, renames their definitions
and recursive calls, and compiles both into one runtime. Each of three cases
runs A1/B1/B2/A2 with three warmups and seven samples per round. All outputs
match and are detached. This is an internal materializer experiment, not an
end-to-end solver measurement, installed-product receipt or startup benchmark.

Independent reserved `bench-1`, Node 26.5.1, EPYC 7B13, final load 0.16/0.38/0.27:

| Case | Baseline A1/A2 median ms | Candidate B1/B2 median ms |
| --- | ---: | ---: |
| 514 float plot leaves | 16.15 / 14.95 | 7.21 / 6.53 |
| 514 integer leaves | 7.52 / 7.49 | 3.72 / 3.70 |
| Mixed metadata | 0.327 / 0.314 | 0.265 / 0.266 |

The same source-body experiment under CPython is also retained: candidate float
and integer cases are approximately 0.047 and 0.044 ms. Sage.js remains much
slower than CPython here. The local shared-host run is retained separately;
its load makes it development evidence, not a quiet-host result. No ratio is
extrapolated to a complete public query.

[Raw records and verifier](../bench/numerics/performance/results/n1-json-leaves-20260912/)
bind both source hashes, collector and generated-program hashes, runtime commit,
build status, host, ordering, every sample, and correctness observations. The
remote runtime is the unchanged, clean `dca0b0873` statistics qualification
checkout; both comparison bodies use that same runtime. Local build receipts
are recorded honestly as stale after adding a benchmark driver to conservative
artifact inputs; this experiment compiles the current selected bodies directly.
That is not a waiver for public build/distribution qualification.

## Separate inherited limitations

Dynamic `math.copysign` mishandles negative zero. Tests use float `repr` as an
independent zero-sign observation, not that defective oracle. Dynamic
`math.isfinite` also rejects float subclasses which CPython accepts. The exact
type shortcut does not silently reinterpret subclasses: tests require the
materializer to preserve the actual general predicate behavior on each runtime.
Neither underlying math-wrapper limitation is fixed or hidden by this PR.

## Historical browser failure and current-main integration

Public Node/CPython focused tests pass; strict Python passes all 387 modules
with zero errors. The first browser corpus **fails** on canonical module
identity: a session-defined subclass of `collections.abc.Mapping` is not
recognized by the precompiled JSON module. Both `_json.math is math` and the
unchanged statistics `_core.math is math` are false in Chromium. Patching the
actual JSON module predicate verifies one finite check; patching only the
session's separate `math` module was a false counting oracle. The actual public
Mapping-subclass failure remains in the test, not hidden behind a private ABC.
See [the runtime handoff](https://github.com/sagemathinc/sagejs/discussions/104#discussioncomment-18410733).

That run used the original branch's old browser artifact. Investigation on
current main `02a683d21` found that its compiler `runtime_module_names` handling
and generated `stdlib.json.runtimeModules` ownership metadata already resolve
this mismatch. A broad `runtime_imports=True` prototype was rejected because
it broke static-only standard-library imports. The same identity tests pass
with unmodified current-main host sources; no proposed compiler/worker changes
are part of this integration.

The branch is now merged with that main snapshot. Its new
`packages/flint-wasm/test/browser-module-identity.mjs` regression covers both
import orders, repeated cells, public Mapping subclasses, public `math.isfinite`
instrumentation, dynamic compile/eval/exec, static-only calendar/textwrap,
Sage/Python distinctions and isolated/portable browser workers. Routine Wasm CI
runs Chromium; the local qualification explicitly requires all three engines.
No private module predicate or ABC substitutes for the public identity check.

Fresh integration root build passes all eight stages (10m24s). The rebuilt
production Wasm artifact also passes assembly and its 16 reviewed ABI checks;
286 functions compile and the existing 64-bit-FLINT-limb class-group function
retains its explicit same-source Wasm32 fallback. Focused CPython/Node tests pass
2/2. Strict Python passes 403 modules with zero errors; architecture passes.
The regenerated optimizer inventory and unchanged retained-experiment verifier
pass. Original timing receipts remain bound to their actual older comparison
runtime, not relabeled as measurements of this integration.

The actual rebuilt artifact now passes all 12 module-identity combinations
(Chromium/Firefox/WebKit, Python/Sage, isolated/portable) and the complete public
JSON ownership/validation corpus in all three engines. Chromium also imports
68 public numerical modules and passes the domain witnesses; isolated and
portable compile/eval/exec and mpmath regressions pass. Node contract/gallery
regressions pass 15/15 without skips. These checks resolve the original browser
draft gate; they are correctness evidence, not new browser timing measurements.

At `d8e65e466`, the complete ordinary local `pnpm test` run passes its
functional phases, then fails the unchanged startup gate at 409.5ms normalized
versus 400ms (empty CLI 185.0ms). This is retained as a failure, not waived
because the JSON module is lazy or the browser tests pass. The PR remains draft.
An exact-source ARM64 build/routine run is being collected independently; it
does not substitute for diagnosis of the local startup miss.

The four content-addressed optimizer-inventory assets for logical snapshot
`99c4c7469ecd80e2d24032d6e2ac077df54326975d020b7b6c46e5346a184fdc`
are now published. Their remote SHA-256 digests and sizes match the manifest.
This is infrastructure evidence only, created with `--latest=false`; the
published product Latest pointer is unchanged.

General four-platform product performance, memory, startup and the program
targets remain separate open gates. No compiler, dictionary-runtime, native
prefix, product release or shipping ownership is taken by this change.
