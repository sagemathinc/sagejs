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

## Remaining qualification

Public Node/CPython focused tests pass; strict Python passes all 387 modules
with zero errors. The first browser corpus **fails** on canonical module
identity: a session-defined subclass of `collections.abc.Mapping` is not
recognized by the precompiled JSON module. Both `_json.math is math` and the
unchanged statistics `_core.math is math` are false in Chromium. Patching the
actual JSON module predicate verifies one finite check; patching only the
session's separate `math` module was a false counting oracle. The actual public
Mapping-subclass failure remains in the test, not hidden behind a private ABC.
See [the runtime handoff](https://github.com/sagemathinc/sagejs/discussions/104#discussioncomment-18410733).

The browser fixture requires all three real engines with no passing missing
engine skips, but stops at the Chromium failure. Firefox and WebKit are not
claimed to pass. A final frozen build and current-source browser run must be
recorded before marking this increment ready. General
four-platform product performance, memory, startup and the program targets
remain separate open gates. No compiler, dictionary-runtime, native prefix,
release or shipping ownership is taken by this change.
