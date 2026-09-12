# Canonical dictionary-domain resource evidence

2026-09-12. This is a **bounded M1 prerequisite experiment**, not an optimization
campaign, controlled number-field benchmark, class/unit result, or release
qualification. The source allowance remains unchanged and fails. The final
disposition is **retain as draft; do not adopt or raise the allowance yet**.

## Identities and measurement boundary

The common runtime/compiler source base is
`0c2945e1de400b0ee66150ae523491f7c712ce0a` (dictionary reinitialization fix).
The candidate combines storage `9db4572a9bec6ff6ba5cc49b9c68290ee7e6cbb6`
with the finite-field source hash below. Its build ran from HEAD
`38ccf7ac892b86cb721c4b68d2881d4dea8b25ac` plus the explicitly hashed provider
and test changes. A later source/evidence commit does not rename that historical
build revision or make its whole-tree receipt current.

| Identity | Control | Candidate |
| --- | --- | --- |
| Containers source SHA-256 | `4735cf4b99d4580fee8541fb8f7015eb8ff5b7a5258b2057a9f3dd8588d5d502` | `8fbfc7ada31c057c6f265440f8f5afbb78b72e34ab65fddc423f982968b2c2f7` |
| Finite-field source SHA-256 | `e5735f6c1c043bc1c3ef53eb4bdb72283cb9a5b822096b1ad7ebcdf894a316aa` | `4674b2d15ebb7e857c1f8f702cc6a1334270086883143578c532ec4eb8693dd1` |
| Full build receipt SHA-256 | `8c886cf677d4f0697ff57ff45d9e324d8fce65b2a6ca976a845ab429054cfc63` | `c1571d165f8330727753f652c8a2eb8aadaaea7748ec1635c0564f3b61ef0267` |

Both prepared builds ran locally, serially, with Node 26.8.1 on Linux x64.
Both reconciled five native adapters and rebuilt all 41 production kernel
families, producing a 27.12 MiB pack. Both lacked the optional numerical Wasm
toolchain; skipping that step is not Wasm qualification. No new native
mathematical source or kernel is introduced. These are single developer build
observations, not controlled `opt` measurements. The separate frozen `opt`
smoke run used neither candidate and is unaffected.

`resources.cjs` has SHA-256
`2ccf388707ab4762fb44b63e949f37cdabc851442388c9c80617e82998c72a7d`
and is used unchanged for both roots. It binds runtime source, emitted compiler,
package policy, Node, and the build receipt before and after each observation.
The resource JSON retains its build inspection verbatim. Candidate observations
had a current receipt. The control receipt was invalidated only by the parallel
runner appending its task record after the completed build; before/after task
records and unchanged runtime hashes were checked and retained by the coordinator.
The control is therefore a source-pinned developer observation, **not an
exact-tree product qualification receipt**. Nothing here overrides that failure.

## Generated source and build resources

Isolated modules were emitted with the same frontend/options, including
docstrings and readable formatting. Module counts exclude whole-baselib facade
wrappers; whole artifacts below use their actual built size.

| Measurement | Control | Candidate | Change |
| --- | ---: | ---: | ---: |
| Containers Python bytes | 67,842 | 75,611 | +7,769 |
| Finite-field Python bytes | 85,580 | 92,889 | +7,309 |
| Containers emitted module bytes | 383,394 | 403,966 | +20,572 |
| Finite-field emitted module bytes | 410,362 | 424,618 | +14,256 |
| Compiler artifact bytes | 3,982,571 | 4,003,450 | +20,879 |
| Whole readable baselib bytes | 13,528,603 | 13,569,108 | +40,505 |
| Sage runtime cache bytes | 8,010,544 | 8,045,480 | +34,936 |
| Full build elapsed seconds | 800.208 | 831.498 | +3.9% |
| Child user + system CPU seconds | 1,194.159 | 1,231.486 | +3.1% |
| Maximum child RSS bytes | 1,835,597,824 | 2,435,702,784 | +32.7% |
| Core source / unchanged allowance | 900,094 / 903,000 | 907,863 / 903,000 | **FAIL** |

Maximum child RSS is not simultaneous process-tree peak memory. These samples
do not identify which child caused the increase or establish its variance.
No exact allocation counter is available. Emitted sizes are modest relative
to the complete runtime, but they do not erase the source or memory failures.

## Runtime and retained memory

Each dictionary workload creates fresh data and checks its results. Three
local samples include tiny call compilation and are not statistical performance
certification. All samples, including the candidate's slower first primitive
sample, remain in the JSON. The displayed times are medians in milliseconds.

| Workload | Control | Candidate |
| --- | ---: | ---: |
| Primitive insert/hit/miss, 256 keys | 10.864 | 15.185 |
| Primitive insert/hit/miss, 512 keys | 10.595 | 14.865 |
| Primitive insert/hit/miss, 1,024 keys | 14.911 | 17.734 |
| Residue insert/hit/miss, 256 keys | 419.336 | 32.016 |
| Residue insert/hit/miss, 512 keys | 1,684.749 | 54.206 |
| Residue insert/hit/miss, 1,024 keys | 6,512.143 | 98.410 |
| Unchanged algebra test, 60 s child cap | **timeout** | 3,632 reported |
| Normalized startup, 11-sample median | **407.7 / 400 FAIL** | **420.7 / 400 FAIL** |

After explicit GC, 10,000 retained two-entry primitive dictionaries added
4,362,848 managed-heap bytes in the control and 7,408,608 in the candidate:
**3,045,760 additional bytes**, approximately 70% more for that allocation
delta. Releasing the dictionaries allowed the bulk of that memory to be
collected. Every dictionary currently allocates a private five-slot metadata
object, even before canonical object keys are used. This is a concrete next
representation question, not a justified universal memory surcharge.

24,576 distinct empty-dictionary residue misses added 5,475,864 managed-heap
bytes in the control versus 487,624 in the candidate. The new provider uses
the exact native BigInt value as token and retains no per-value cache; its
private parent domain has only a `parent` property. Residual heap includes
runtime/compiler caches and cannot be called exact token allocation.

Process RSS is a different quantity: during that miss phase it grows by
34,725,888 bytes in the candidate versus 1,515,520 in the control. Lower
post-GC managed heap does not establish lower resident memory; transient
allocation and heap reservation remain part of the required attribution.

The candidate's startup observation is 13.0 ms above control, but both fail.
Neither this small difference nor the failed baseline proves that the patch
caused all startup failure. Conversely, baseline failure does not authorize a
waiver or a no-regression claim. Runtime allocation, startup and build-memory
attribution require a bounded follow-up before production adoption.

## Correctness, earlier attempts and disposition

The current candidate passed **25/25** focused storage/provider/reinitialization
checks and strict Python checks. Its value-token tests include zero, mixed
machine/BigInt representation, large-BigInt structural collisions, different
residue parents, ordinary integer collisions, original-key/order preservation,
subclasses, explicit mutation, changed equality dispatch, and sticky guard
invalidation. The source review found no blocking flaw in this narrow private
provider contract; it is not a formal proof or platform certification.

Earlier failed attempts are not replacements for these results:

- The first resource wrapper did not start a build because `/usr/bin/time`
  was unavailable; `measure.py` now reports portable supported observations.
- Build v2 failed in the immutable stage-zero keyword-call convention for
  declaration-time `__import__`. Its failed stage-one artifact hash is
  `00253dcd47db5506e52e4adb496ab5a8ff6b62c6fdb6be09c06d2ee285595c0a`;
  its log hash is `4f9c14e8091696c2a4e08673da4ed060f3d5380fdb158a78a1c250c5a0102b8c`.
  An equivalent positional import fixed that bootstrap boundary.
- V3 first lacked FLINT, then exposed one fixture's type-alias parser ambiguity.
  Ordinary cache preparation and a named class variable closed those failures.
  Its later 22 tests and 3,787 ms algebra result belong to the **older
  opaque-token provider**, not this current value-token source.
- The current full pipeline exits nonzero: architecture stops at the failed
  core source allowance, and startup separately fails. Strict checks pass.
  A refreshed manifest is not substituted for these failures.
- Final `test:changed -- --base 9db4572a9...` also fails at its first
  `merge:check` source-ownership gate. Its subsequent build, unit, compiler,
  integration and docs steps were **not run** by that command. The earlier
  explicitly recorded full build/focused/strict results remain distinct.

The four-hour aggregate active-work bound includes implementation and review,
but excludes queued builds/tests. Close this representation approach as an
**unqualified draft**, preserving a useful source result and the measured
ordinary-dictionary costs. Coordinate any metadata refactor with the allocator
owner of `containers.py`; do not mutate the frozen source during qualification.
No source allowance increase is currently recommended. No proof bound,
verifier limit, timeout, memory cap, public output contract or corpus changed.

Remaining adoption gates: ordinary-dictionary allocation/runtime analysis,
startup, aggregate source ownership and justified placement/allowance review,
complete exact-revision integration tests, Linux arm64/macOS arm64/Windows x64,
and applicable browser/fallback checks. The broad class/unit plan is not
complete, and this experiment does not meet its cross-degree performance gate.

## Reproduction

Use separate worktrees, prepare their pinned native dependencies through the
normal workflow, and preserve all failed runs. Use new output names; the
resource wrapper refuses to overwrite an existing receipt.

```sh
python3 bench/dict-canonical-domain/measure.py new-build.resource.json pnpm build
node --test test/dict-canonical-domain.cjs test/finite-field-canonical-domain.cjs test/dict-reinitialization-storage.cjs
node --test --test-name-pattern=compiler/algebra.py test/compiler.test.cjs
node bench/dict-canonical-domain/resources.cjs /absolute/worktree generated
node --expose-gc bench/dict-canonical-domain/resources.cjs /absolute/worktree runtime
node scripts/check-startup-budget.cjs
pnpm test:baselib:strict
pnpm architecture:check
```

For the unmodified common-base root, run this candidate's same resource helper
by absolute path; do not copy candidate runtime artifacts into the control.
Full build receipts and failed stage artifacts remain in backed-up coordinator
storage; this directory versions the small raw observations and reviews.
