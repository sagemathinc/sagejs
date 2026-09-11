# Object and call protocol campaign

## Qualified semantic checkpoint — 2026-09-11

Clean candidate `5b7f4ddc5` passes the full unchanged adopted corpus:
**533 passes, three unchanged reviewed differences, zero required failures**.
This repairs the original fifteen required failures without changing assertions
or dispositions. The full build, 21 focused cross-feature tests, four pinned
package workflows (packaging, attrs, tomli, decorator), and strict checks for
386 modules pass. Core source remains 902,570 / 903,000 bytes.

The namespace integration initially bypassed native property setters; the
shared storage guard now preserves setters/read-only errors before and after
dictionary exposure, including injected shadow entries. Both upstream property
programs and the expanded Python/Sage oracle pass.

This is not full PR qualification. The subsequent routine run caught compiled
compiler size of 4,325,754 bytes against the unchanged 4,276,224-byte limit.
PR214 passes a quiet full routine and production Chromium qualification and is
non-draft; PR216 remains draft while its compiled-size and cold-path issues are
addressed. A separate, pre-existing class-property deletion defect has a focused
tested follow-up, not part of this checkpoint.

### Compiler footprint correction

Commit `1c8e82c24` compacts only the private compiler implementation artifact,
using the existing adjacent-statement safety probe and preserving metadata.
It does not change user-facing generated output or remove documentation.
In the isolated matching build (`943863f38`), compiler size falls from
4,325,754 to 3,957,471 bytes; 72 focused checks, including the unchanged
runtime-cache footprint gate and a new adjacent-IIFE regression, pass.
This is a focused receipt, not qualification of the combined PR artifact.

The cold-import problem is separate: changing whitespace does not remove
duplicated prepared/legacy method emission. A bounded shared-method factory
optimization is being checked against runtime-selected metaclasses, source-order
defaults, closures, saved functions and live metadata before another full build
and controlled cold/warm comparison. The existing cold regression remains open
until that comparison is completed.

### Final paired measurements for this snapshot

The retained clean snapshot was measured on idle `bench-1`, with the same
`f9b2b4d98` baseline, Node 26.7.0 and pinned CPython 3.14.4. Correctness preflights,
three warmups/seven samples, source/artifact hashes and reversed-order common-call
rounds are retained. The full original common-call driver now works; no reduced
import driver was needed. Ratios to the earlier reduced-driver checkpoint are
not an isolated causal comparison.

| Workload | Baseline median | Candidate median | Outcome |
| --- | ---: | ---: | --- |
| Packaging cold CLI | 5184 ms | 6524 ms | 26% slower |
| Packaging first import, including lazy compilation | 4268 ms | 5554 ms | 30% slower |
| Packaging first workflow | 25.87 ms | 24.46 ms | 1.06x faster |
| Packaging 1000 Version workflows | 2826 ms | 2575 ms | 1.10x faster; still 228x CPython |
| Simple construction | 4748 ms | 2526 ms | 1.88x faster; still 47x CPython |
| Initialized construction | 473 ms | 385 ms | 1.23x faster; still 46x CPython |
| Immediate method calls | 319 ms | 247 ms | 1.29x faster; still 79x CPython |

None of these closes a performance cliff. Cold/import sample ranges do not
overlap. Separate diagnostic profiles attribute about 94.5% of the sampled
increase to compiler/frontend work: prepared-class lowering emits both prepared
and legacy method bodies/metadata. Generated `packaging.version` grew 69% and
`collections` 90%; `_namespace` lazy compilation is a secondary cost. Runtime
module execution excluding compilation did not account for the increase.
The next optimization must share emission while retaining runtime metaclass
selection, namespace ordering, receiver conventions and live metadata.

Evidence in the directory below:

- `object-final-corpus.json`, `object-final-packages.json`, and
  `object-final-focused.log` qualify the stated semantic scopes.
- `common-final-5b7f4ddc5-timings.json`, SHA256
  `138db85294a8bb94dd4a40ae9603081988fa5a17ee6de0f087ea331f1fdf480b`.
- `packaging-final-5b7f4ddc5-timings.json`, SHA256
  `1ed2b7fa46367d4c51de64d922560956943989d64d3abd512d1d2c7890886ded`.
- `final-5b7f4ddc5-benchmark-handoff.md` and `cold-profile-handoff.md`
  distinguish timings from diagnostic profiles and record source identities.

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

## Earlier remaining integration gates (superseded by checkpoint above)

- Repair the two required namespace cases with exact dictionary identity and
  descriptor ownership, while preserving native backing fields and ordinary
  construction costs.
- Finish the generated-default-code size repair on the prerequisite branch;
  no source or browser distribution budgets may be increased.
- Rebuild and qualify the combined standalone closure, namespace, property,
  call and default mechanisms; retain private/global no-host coverage.
- Rerun the package and common-call campaign on that exact candidate, including
  cold/import scopes and any regressions, before marking the PR ready.
