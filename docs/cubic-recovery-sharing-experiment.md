# Sharing exact recovery discovery

Research checkpoint, 2026-09-09. Source-copy experiment only; production,
source allowances, and arena limits are unchanged. PR #190 remains draft.

## Change and justification

Recovery duplicated the signed interval dot products, orientation selection,
and bounded Euclidean unit-combination loop already implemented in
`_cubic_discover_dependency_unit`. The new diagnostic builder replaces that
block with a call to the existing helper, borrowing the same three matrices.
It initializes discovery with an active scan, no candidate, and zero bounds.
It does not introduce a new workspace or change any mathematical bound.

The HNF/LLL, coefficient-envelope, and log-enclosure checks before discovery,
and exact reconstruction, regulator verification, and transactional publication
after it remain unchanged. The torsion-only probe composes with this change.
This is code sharing, not permission to skip reconstruction or conditioning.

The focused test extracts both actual source bodies rather than maintaining a
second handwritten discovery implementation. On 2,400 deterministic signed
interval/dependency cases it compares the result and every matrix write in
order. It covers empty prefixes, ambiguous and negative intervals, large
integers, poisoned inactive tails, and consecutive Fibonacci inputs that
actually reach the 1,024-step reduction limit. The existing full recovery
fault-injection suite runs with the real shared helper, both with and without
the torsion probe. These tests are not a formal proof of compiler correctness.

## Source and generated resources

Input is the [torsion-probe candidate](cubic-torsion-probe-experiment.md), SHA-256
`54e8b63ea830fb07acf79ea92a5f77c979c3ad694ba0a87b2304216eb26220e9`.
Shared source SHA-256:
`8911164538c47b5c59a7a6d1d6e3d331574008ae2b0783c28976dd13caab4aa3`.

| Artifact, bytes | Before | Shared recovery |
| --- | ---: | ---: |
| Python source | 448,018 | 442,026 |
| Generated core C, raw | 15,586,726 | 15,964,693 |
| Core C, source path normalized | 11,540,026 | 11,430,113 |
| Generated header | 9,513 | 9,513 |
| Generated host adapter | 200,768 | 200,768 |
| Linux x64 addon | 20,419,344 | 20,411,152 |

The apparently larger generated core is due to provenance/error strings:
the input source path has 69 characters, the new path 77, repeated 67,445 and
66,685 times respectively. Replacing only that exact path with `source.py`
for the comparison shows a 109,913-byte decrease. Actual artifacts retain
their original paths and hashes; no provenance was removed from compilation.
These are file-size measurements, not peak-memory or stack-usage measurements.

Sharing saves 5,992 Python bytes. The combined scheduler/probe candidate is
still 4,358 bytes larger than integrated production. Production had only 713
bytes of aggregate allowance left, so another 3,645 bytes must be removed
before considering integration. Do not raise the allowance to fit it.

## Correctness and timing observations

Every observation and every output slot is identical on the frozen 1,012-field
development corpus: 961 accepts, 51 declines, no exceptions. Accepted class
numbers and invariants agree with the corpus. This does not establish public
receipt authentication or independent exact replay of this experimental source.
The reserved unseen neighbors were not executed.

Controlled timing used `opt`, CPU 0, with seven alternating forward/reverse
rounds, 20 warmups, 64 native calls per sample, and 256 fresh PARI `bnfinit(f,0)`
calls per sample. The native boundary uses preallocated external scratch and
the existing 5/1/7/8 retry policy. Compilation ran elsewhere.

| Polynomial | Before, ms | Shared, ms | PARI, ms | Median paired ratio |
| --- | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 4.267 | 4.268 | 1.547 | 0.9972 |
| $x^3+27x-159$ | 4.058 | 4.034 | 1.500 | 0.9932 |
| $x^3-x^2+56x+99$ | 4.397 | 4.392 | 1.508 | 0.9986 |
| $x^3+146x-156$ | 4.803 | 4.763 | 1.688 | 0.9916 |
| $x^3+9x-55$ | 1.797 | 1.798 | 1.188 | 1.0008 |
| $x^3-x^2+3x-4$ | 1.272 | 1.277 | 1.008 | 1.0038 |
| $x^3-x^2-11x-63$ | 2.179 | 2.174 | 1.227 | 1.0008 |

Times are medians; paired ratios are medians of within-round ratios, not ratios
of medians. This run shows essentially preserved performance, with small mixed
changes, not a statistically established speedup or a new PARI win.

## Reproduction and remaining gates

Use the immutable input linked in the torsion-probe report and a new output
directory:

```sh
node bench/class-unit-groups/diagnose-cubic-recovery-sharing-build.cjs ROOT INPUT.py NEW_DIRECTORY
node --test test/cubic-recovery-sharing.cjs test/cubic-torsion-probe.cjs
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs NEW_DIRECTORY/builds.json FROZEN_CORPUS.jsonl.gz
```

The existing portable ablation timing driver binds source, module, and addon
hashes. `summarize-cubic-recovery-sharing.cjs BEFORE_SURVEY AFTER_SURVEY TIMING`
requires identical full observations, checks that those same binaries were
timed, and emits hash-bound resource and paired-timing comparisons.
Local raw reports are under `build/cubic-next-evidence/recovery-sharing-*`.
The summary SHA-256 is
`b6822049dfd76ba3f31cbe5548c61b5dd0d21312c278159c7dbed46099d049ba`.
The initial builder's incorrect substring boundary failed compilation; its
logs remain alongside the successful v2 build logs.

Focused tests, architecture, docstring/formatting, and strict Python checks
(382 modules, zero errors) pass. The inherited parallel gate still
reports 395 live task records; this does not imply 395 running agents. Public
replay, resource-envelope fault qualification, broad regression checks, and
cross-platform qualification remain required before production promotion.
Next investigate a shared borrowed search workspace for adjacent/expanded
collection, preserving owners and generated behavior while reducing repeated
parameter lists. The main measured runtime opportunity remains relation search.
