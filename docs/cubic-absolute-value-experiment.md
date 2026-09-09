# Plain Python absolute values close the cubic source-budget gap

Research checkpoint, 2026-09-09. The fully formatted combined experimental
candidate now fits the existing source allowance. Production remains unchanged;
this is not public qualification or a new PARI win.

## Change and mathematical domain

Twenty-four exact integer sign-normalization branches are replaced by ordinary
`abs` calls. Where a preceding assignment produces the value, its expression is
evaluated once directly inside `abs`. Three independent coordinate copies are
similarly folded into `abs(coefficient_zero)`, etc. Coupled sign updates, such
as conjugating an embedding or changing a separate real-sign flag, are untouched.
No mathematical comments, bounds, or certification stages are removed.

For the admitted exact integer domain, `abs(n)` equals `-n` when $n<0$, and $n$
otherwise. These replacements do not apply to arbitrary objects with overloaded
comparison/absolute-value methods. The existing native compiler already lowers
integer `abs`; this change adds no compiler primitive or foreign dependency.

The source transformer matches the precise branch shape, refuses overlapping
edits, and does not remove comments. A full-module AST test independently
normalizes the old program using the integer identity and checks that nothing
else in the mathematical AST changed. It also verifies single producer
evaluation on 2,055 signed integer cases. A separate exact-arena witness checks
both implementations on 595 values, including machine boundaries and 4,096-bit
integers, across JavaScript, GMP, and fmpz. The native addon executes in a child
process so it is unloaded before temporary cleanup, including on Windows.
That lifetime design is not a claim of a Windows qualification run.

## Source budget and resource evidence

Input is the [borrowed search-workspace candidate](cubic-search-workspace-experiment.md),
SHA-256 `500321a9cdcfa3925443cda04f6c5417816bae3ff917a1a5d606ae92889346c8`.
The fully formatted candidate SHA-256 is
`de7127cab89c2272c13f2a4d295916cf279510136347a027df0aea4175c22c40`.

| Artifact, bytes | Search workspace | Absolute values |
| --- | ---: | ---: |
| Python, pinned formatting | 440,041 | 438,378 |
| Raw generated core C | 16,037,496 | 15,707,375 |
| Core C with source path normalized | 11,436,231 | 11,398,850 |
| Linux x64 addon | 20,411,152 | 20,411,152 |

The runtime companion is 46,619 bytes. Consequently the proposed package
aggregate is **484,997 / 485,000 bytes**, with three bytes of headroom. The test
rebuilds the combined source, requires pinned formatting, reads the actual
package ownership list, and checks the unchanged allowance. This is a candidate
budget check, not a production rebuild. Tiny headroom is not an engineering
margin for future additions; source-size compliance does not replace review.
Arena limits remain 1 MiB resident and 3 MiB temporary. File-size measurements
do not establish peak-memory equivalence or behavior under resource exhaustion.

The raw-path-normalized C comparison replaces only the exact filename with
`source.py`; source provenance remains intact in actual compiled artifacts.

## Frozen corpus and timing

All observations and every output slot match the search-workspace baseline on
the frozen 1,012 development fields: 961 accepts, 51 declines, zero exceptions.
Accepted class numbers and invariants agree with the corpus. The reserved
unseen neighbors were not run. Independent exact replay and public receipt
authentication of this experimental source remain outstanding.

Two serialized timing runs used the dedicated `opt` VM, CPU 0, 20 warmups,
seven alternating rounds, 64 native calls per sample, and 256 fresh PARI
`bnfinit(f,0)` calls per sample. Native calls use preallocated external scratch
and the existing 5/1/7/8 retry sequence. The second run reverses module-load
and initial measurement order. Both runs bind identical sources, modules,
addons, fields, and GP executable hashes.

| Polynomial | First paired ratio | Reversed paired ratio |
| --- | ---: | ---: |
| $x^3-x^2-7x+122$ | 0.9975 | 0.9951 |
| $x^3+27x-159$ | 0.9949 | 0.9950 |
| $x^3-x^2+56x+99$ | 0.9984 | 0.9990 |
| $x^3+146x-156$ | 0.9941 | 1.0022 |
| $x^3+9x-55$ | 1.0068 | 0.9989 |
| $x^3-x^2+3x-4$ | 1.0091 | 1.0015 |
| $x^3-x^2-11x-63$ | 0.9919 | 0.9961 |

Ratios are medians of within-round candidate/baseline times, not ratios of
medians. Results are essentially flat with small mixed changes; neither a
speedup nor strict performance non-regression is established. Absolute target
medians are 4.247 and 4.470 ms, compared with PARI 1.535 and 1.539 ms. Both native
variants moved between runs, reinforcing the need for paired comparisons.

The first run computes $x^3+9x-55$ in 1.806 ms at the diagnostic native boundary.
This must not be reported as a new public API or independent-replay timing.

## Reproduction, discarded route, and next step

```sh
node bench/class-unit-groups/diagnose-cubic-absolute-value-build.cjs ROOT INPUT.py NEW_DIRECTORY
node --test test/cubic-absolute-value.cjs test/cubic-absolute-value-native.cjs
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs NEW_DIRECTORY/builds.json FROZEN_CORPUS.jsonl.gz
```

Raw evidence lives under `build/cubic-next-evidence/absolute-value-*`. SHA-256
identities of the survey, first timing, and reversed timing respectively:

```text
a692026e74446c14ff8e71f5cddad0a04c76d531a37c5470d3a4d3571d84e47f
a29f3efcb8803163d370f1c83cbe22f985ec003a2788a7f8011871d10ceebf28
424db457a08bc2c909e826b88ba544f676e67132eba858e03cfb54a3e1f0adb1
```

An earlier compiled LLL/coefficient-sharing prototype saved only 224 formatted
bytes. It was not selected: sharing the complete precision block would also
move diagnostic publication relative to potentially failing scale allocation,
and a smaller shared stage added a helper boundary for little source benefit.
Its source, builder copies, compiled artifact, and logs remain local evidence;
it is not part of this candidate and no timing/correctness qualification is
claimed for it. The first absolute-value build remained 95 bytes over budget;
the measured v2 also folds the three independent coordinate copies.

Focused semantic/native tests, the combined budget check, architecture,
formatting, and strict Python (382 modules, zero errors) pass. The inherited
parallel gate still reports 395 live task records; full changed-branch and
cross-platform gates are not claimed.

Next qualify and integrate the formatted combined scheduler/probe candidate:
review the complete diff, refresh its source-bound production artifacts, and
repeat authenticated public receipts and independent exact replay. Existing
diagnostic tests that construct prototypes from the old production source need
an explicit baseline strategy when that source changes. PR #190 remains draft.
The source-budget obstacle is addressed; the approximately threefold remaining
PARI gap on the selected field still calls for better adjacent relation search.
