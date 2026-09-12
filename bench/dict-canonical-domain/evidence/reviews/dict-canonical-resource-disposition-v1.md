# Canonical dictionary V4: independent resource disposition

2026-09-12 UTC. Bounded read-only review of existing completed receipts; no
builds, tests, benchmarks, CAS, SSH/opt traffic, tracked edits, or cap changes.
Earlier failed receipts and independent reviews remain unchanged.

## Decision

**Defer the proposed 910,000-byte core source allowance increase for now.**
Keep this implementation a candidate pending ordinary-dictionary allocation,
startup, and normal platform/integration qualification. The generated-code
growth is modest and the modular-key benefit is demonstrated in the local
diagnostics, but neither cancels the ordinary-dictionary heap increase or the
failed startup gate. This is a resource disposition, not a newly found
mathematical or dictionary-semantics blocker.

The earlier conditional recommendation for a modest source-only allowance was
contingent on resource/runtime evidence. V4 supplies useful evidence, including
two real unresolved costs; it does not satisfy that condition yet. Do not
raise the startup, algebra timeout, memory, mathematical, or verifier limits.
Changing the source cap alone would not make this candidate qualified.

## Exact evidence boundary

Candidate directory (`F`):
`/home/user/sagejs-worktrees/class-unit-rank-two-frontier-worktrees/finite-field-canonical-domain/build/general-frontier`.

Control directory (`C`):
`/home/user/sagejs-worktrees/class-unit-rank-two-frontier/build/general-frontier/dict-canonical-control-v1`.

Candidate HEAD recorded by the resource script:
`38ccf7ac892b86cb721c4b68d2881d4dea8b25ac`.
Control source base: `0c2945e1de400b0ee66150ae523491f7c712ce0a`.

| Identity | Candidate | Control |
| --- | --- | --- |
| `containers.py` SHA-256 | `8fbfc7ada31c057c6f265440f8f5afbb78b72e34ab65fddc423f982968b2c2f7` | `4735cf4b99d4580fee8541fb8f7015eb8ff5b7a5258b2057a9f3dd8588d5d502` |
| `finite_fields.py` SHA-256 | `4674b2d15ebb7e857c1f8f702cc6a1334270086883143578c532ec4eb8693dd1` | `e5735f6c1c043bc1c3ef53eb4bdb72283cb9a5b822096b1ad7ebcdf894a316aa` |
| compiler SHA-256 | `80a1dcabee837724f8982108bd4a75e9043edda2f7738704ea4a644f140d2b78` | `752c25a5ca302d1377df106b4a7b5f140e5a32767b76507d2232691a2c3477e3` |
| build receipt SHA-256 | `c1571d165f8330727753f652c8a2eb8aadaaea7748ec1635c0564f3b61ef0267` | `8c886cf677d4f0697ff57ff45d9e324d8fce65b2a6ca976a845ab429054cfc63` |

Both developer observation files use Node v26.8.1, Linux x64, resource-script
SHA-256 `2ccf388707ab4762fb44b63e949f37cdabc851442388c9c80617e82998c72a7d`,
and unchanged package policy
`e7498ef824ccb6544860c1f10bb56f63cf40351036c0d12c95e65cf4e7e64def`.
The script checks that recorded source/compiler/build identities are unchanged
across each observation.

Candidate `build_inspection.current` is **true**, with build and validation
workspace hash `a9b53e7a872e64c2c1e64f282aecb14257fb202a21fdb29f5b65c05e11ca56f9`.
The control records **false: build inputs changed**, despite a successful own
build and the recorded baseline mathematical/runtime source hashes. Preserve
that limitation: the control is developer comparison evidence, not a final
exact-tree platform qualification. The generic receipt text about invalidated
builds must not be misread as contradicting the candidate's explicit true
inspection result. No earlier opaque-token pass is used below.

## Results observed in V4

| Gate | Candidate result | Qualification limit |
| --- | --- | --- |
| Own full build | PASS, exit 0 | Not all tests or platforms |
| Focused dictionary/provider/reinitialization tests | 25 PASS, 0 fail | These exact test logs, not a whole-suite pass |
| Compiler `algebra.py` | PASS, reported 3,632 ms; test duration 3,635 ms | Existing 60-second child cap unchanged |
| Strict Python | PASS, 393 modules, zero errors | Syntax/format/types, not runtime proof |
| Package source gate | FAIL: 907,863 / 903,000 core bytes | Over by 4,863 bytes |
| Full architecture command | FFI check passes, then package gate FAIL | Later architecture checks were not reached |
| Development startup | FAIL: 420.7 / 400.0 ms normalized | 11 fresh-process samples, median |

The baseline algebra run times out at the unchanged 60-second child cap; its
61.916-second test duration is timeout/wrapper overhead, not a completed
baseline computation. It must not be treated as an exact baseline time or
converted into an exact speedup ratio.

The baseline startup also fails: 407.7 / 400.0 ms. Candidate is 13.0 ms
(approximately 3.2%) higher in this pair, with empty-startup medians 189.0
versus 182.6 ms. This does not establish that the patch caused the entire
startup failure. It also does not establish an acceptable regression or a
passing gate. The 1,500 ms catastrophic ceiling is not the normal acceptance
threshold. No controlled repeated-host/platform adjudication is present here.

## Source and generated-code cost

Current core source growth is 7,769 bytes over the 900,094-byte base. The two
changed modules grow from 67,842 to 75,611 source bytes (containers) and from
85,580 to 92,889 (residue provider). This is readable shared machinery, not a
large unexplained duplicated implementation.

The candidate generated receipt compiles both base and candidate module
sources through the same candidate frontend/emitter and module options:

| Same-boundary generated module | Base bytes | Candidate bytes | Delta |
| --- | ---: | ---: | ---: |
| Containers | 383,394 | 403,966 | 20,572 |
| Finite fields | 410,362 | 424,618 | 14,256 |
| Combined | 793,756 | 828,584 | 34,828 |

This approximately 4.4% combined module-output increase is explained and not
an obvious code-expansion alarm. Whole-build developer artifacts grow by
40,505 bytes for `baselib-plain-pretty.js`, 20,879 for `compiler.js`, 14,728
for `compiler.bin`, and 34,936 each for the Sage and Python bootstrap caches.
These whole-build deltas use each tree's own generated compiler/runtime;
they are not the same isolated-emitter experiment. No new native mathematical
kernel or object family is introduced. Existing native packs were rebuilt by
both full builds; that is not new mathematical source hidden in this change.

## Managed memory: benefit and unresolved cost

The same script runs twice-GC snapshots around dictionaries in a fresh
evaluator. It records managed heap including runtime/compiler caches, not
allocation counts or precise object-size accounting.

| Diagnostic heap delta | Control | Candidate | Interpretation |
| --- | ---: | ---: | --- |
| Retain 10,000 ordinary two-entry string-key dictionaries | 4,362,848 B | 7,408,608 B | +3,045,760 B, about 70% more |
| After releasing those dictionaries, versus pre-churn | 72,200 B | 313,856 B | Most live-dictionary cost releases; not a zero-retention proof |
| 24,576 distinct modular misses into an empty dictionary | 5,475,864 B | 487,624 B | About 91% less retained managed-heap growth |

The added live-dictionary cost averages about 305 bytes per dictionary in this
fixture. It is consistent with a real general-purpose metadata cost, although
the snapshot is not an exact per-object allocator attribution. This matters
for every ordinary dictionary, not just the target modular algorithm. It is
sufficient evidence to investigate before accepting the resource tradeoff.

The cache-free value-token change successfully targets the old append-only
miss-cache retention in these diagnostics. Do not describe that as a blanket
resident-memory improvement: during the same miss phase RSS grows by
34,725,888 bytes in the candidate versus 1,515,520 in control. Post-GC managed
heap and process RSS measure different things; transient allocation/heap
reservation needs attribution. Allocation counts are explicitly unavailable.

Developer primitive-work sample medians are also higher at all three tested
sizes (approximately 15.2/14.9/17.7 ms candidate versus 10.9/10.6/14.9 ms
control for sizes 256/512/1024). These are only three unisolated evaluation
samples including tiny call compilation, not statistically certified
slowdowns. The modular samples show a large opposing improvement, and the
actual algebra gate now passes; neither warrants dismissing the primitive
signals without attribution.

## Build resources

Both build wrappers exit 0 and rebuild the same reported counts of adapters
and 41 kernel families. Optional numerical Wasm reactors are skipped, not
qualified. The observations are serialized same-host developer runs, not
controlled performance samples.

| Build measure | Control | Candidate |
| --- | ---: | ---: |
| Elapsed | 800.208 s | 831.498 s |
| Child user CPU | 1,155.476 s | 1,191.619 s |
| Child system CPU | 38.683 s | 39.867 s |
| Maximum child RSS | 1,835,597,824 B | 2,435,702,784 B |

Maximum child RSS rises by 600,104,960 bytes, approximately 33%, while elapsed
time rises approximately 3.9%. This is not concurrent process-tree high water
and does not identify which build phase caused the peak. The common resource
wrapper and broadly matching stages make the observation worth explaining;
they do not by themselves prove the dictionary metadata caused the entire
peak. Do not reinterpret this result as passing a memory budget.

## Smallest next qualification step

Coordinate the already identified allocator owner around ordinary-dictionary
metadata/transient allocation and startup, preserving shared storage semantics,
mutation invalidation, frozen-dictionary behavior, and the collision tests.
Do not expand into another mathematical campaign or a general hash framework.
Retain this frozen source and all V4/control receipts as the before boundary.

After a coherent allocation change, obtain exact-source focused/algebra passes
and comparable ordinary-dictionary heap, modular-miss, build-memory, and startup
evidence. Resolve the pre-existing startup failure transparently; do not simply
repeat until a favorable sample appears or substitute the catastrophic ceiling.
Normal integration and supported-platform gates remain necessary, particularly
because this is shared bootstrap containers code and the current measurements
cover only Node 26 Linux x64.

A final source-only limit near 910,000 bytes can be reconsidered after that
work. Against this snapshot it would leave 2,137 bytes of headroom, but the
final source must be counted anew. There is currently no reason to increase
the arithmetic allowance or any execution/resource safety limit. Preserve
the present source/startup failures in the handoff and keep merge readiness
explicitly pending.

## Receipt hashes

Names below are relative to F unless prefixed `C/` (the control directory).

| Receipt | SHA-256 |
| --- | --- |
| `dict-canonical-generated-v4.json` | `877b394a068ba76bd11bca2642448ca45c8f37b5bce118d89b5c46af458510e6` |
| `dict-canonical-runtime-v4.json` | `b99cf63be59e6f2637048c6dcc79c14239101ff3638e12573b2f88ba3f85471c` |
| `dict-canonical-build-v4.resource.json` | `982137fbe65588267a6406fe4ed87adfd86051e51d2ab37c74af65d229e975e1` |
| `dict-canonical-algebra-v4.log` | `84648bfd9b775fa936342ee29952b66f0ea9f721c33fdeb78b093a832bb24f13` |
| `dict-canonical-startup-v4.log` | `fde5eda6668fb12ed40a05f2aa400866131392741da6e7b71b69ae4e4d225d29` |
| `dict-canonical-focused-v4.log` | `a05f25623981a9b27b491d456f5811ff31fe7481a66c31fcee69d0e17e94dd4c` |
| `dict-canonical-source-budget-v4.log` | `f376464468a9c8f5cd94081725c3064c1391fb1a48230c8d104e8ad28bd13ceb` |
| `dict-canonical-strict-v4.log` | `c9aa7860e7b16c67b5d6e4bb98505055cebe27795c59ee00d23719e8df4074d9` |
| `C/dict-control-generated-v1.json` | `80195bdf7098ffafaa85bc16ea362573c21a09480ad600ec91599168916e60d6` |
| `C/dict-control-runtime-v1.json` | `46ba97c82c496d5e87909aa7f553bfca93cfed4c2157ece557aa5a6fc1166695` |
| `C/dict-control-build-v1.resource.json` | `0823d2cb985a36afe1f2d5d2fd4d90c6d0ae13afffa9a86b003e0d54ba039c27` |
| `C/dict-control-startup-v1.log` | `e91d5d9b9cd5ff4ca936055a916b3d79d055b67df1bddd1a8719ef9c45b3e6fc` |
| `C/dict-control-algebra-v1.log` | `79aaf9881ef9c86e2f971cef298a651ca3f28bea7e53f51b7f43c5e73952b41c` |
