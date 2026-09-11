# Object and call protocol campaign

## Intermediate checkpoint — 2026-09-11

The combined artifact at `2e6be3f44` plus the recorded integer-adapter
registration consolidation passed a full build and 17 focused protocol tests.
The full adopted corpus improved to **531 passes, three reviewed differences,
and two required failures**: `rustpython/builtin_object` and
`rustpython/builtin_mappingproxy`. No dispositions or assertions changed.
This is not complete qualification. The namespace implementation remains in
progress, and subsequent integration changes require a new full build.

Delivered mechanisms in this branch include canonical property identity,
prepared class mappings executed in source order, canonical saved-method
function identity, and immediate positional method calls that capture lookup
before evaluating arguments without allocating ordinary bound metadata.
The cross-feature CPython oracle covers aliases between explicit-self and
receiver-style methods, saved identity, properties returning callables,
descriptor precedence, and mutation while arguments are evaluated.

## Controlled intermediate measurements

Measured on the idle `bench-1` host against the retained `f9b2b4d98` baseline,
with pinned CPython 3.14.4, Node 26.7.0, correctness preflights, source/artifact
hashes, three warmups and seven samples. These are artifact measurements, not
qualification of the later source tree. None closes a performance cliff.

| Workload | Baseline median | Candidate median | Outcome |
| --- | ---: | ---: | --- |
| Packaging 26.2 cold CLI | 5237 ms | 6338 ms | 21% slower |
| Packaging first import (including lazy compilation) | 4273 ms | 5328 ms | 25% slower |
| Packaging 1000 Version workflows | 2878 ms | 2497 ms | 1.15x faster; still 216x CPython |
| Simple construction | 4685 ms | 2556 ms | 1.83x faster; still 47x CPython |
| Initialized construction | 471 ms | 303 ms | 1.55x faster; still 35x CPython |
| Immediate method calls | 316 ms | 227 ms | 1.39x faster; still 71x CPython |

The common-call measurements use an identical reduced import driver for both
artifacts, retaining the original three workload bodies and counts. The full
standalone driver failed on a missing implicit `_introspection` dependency;
that failure was retained, not treated as a passing measurement. The subsequent
standalone closure repair is integrated but was not present in this snapshot.
Two reversed-order rounds agree on the common-call improvements. Package
startup/import regression is material and must be remeasured after subsequent
changes, not hidden behind the warm improvement.

Raw evidence lives under
`/home/user/python-output-integration-evidence.X9vc1T/`:

- `packaging-objectcalls-pr216-timings.json`, SHA256
  `4b82acff73928605656ea16ef2496975cdf6c2e320619d23acbe2a6727d586b9`.
- `common-subset-pr216-timings.json`, SHA256
  `bc62fdd788da25c84bd47356d4fa9fc856a9f47dd913a3c2590fba77c164cb58`.
- `packaging-pr216.cpuprofile`, SHA256
  `ffc407af918c97b8d4234e8f5250ab2e8f15e072b3ae68b156e6ed69034017ed`.

The separate diagnostic profile attributes about 17.5% inclusive warm-workload
samples to `StopIteration`, with eager native stack formatting prominent.
These nested percentages are not additive, and the profile is not a timing
sample. Investigate lazy formatting while preserving surfaced exception
diagnostics; do not discard traceback information to improve this workload.

## Remaining integration gates

- Repair the two required namespace cases with exact dictionary identity and
  descriptor ownership, while preserving native backing fields and ordinary
  construction costs.
- Finish the generated-default-code size repair on the prerequisite branch;
  no source or browser distribution budgets may be increased.
- Rebuild and qualify the combined standalone closure, namespace, property,
  call and default mechanisms; retain private/global no-host coverage.
- Rerun the package and common-call campaign on that exact candidate, including
  cold/import scopes and any regressions, before marking the PR ready.
