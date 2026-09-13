# Shared bootstrap metadata copy

Branch `python-bootstrap-metadata-copy` is based on PR #231 head `cd4d959cf`.
PR #231 is an explicit prerequisite. No state-owner or callable branch changes
are stacked or modified.

Extract the identical ordered metadata-copy operations from the native and
unbound receiver adapters into one private bootstrap primitive. Preserve every
field, descriptor inspection, getter-descriptor copy and value read/write;
argument-name adjustment remains before copying, and branding/cache publication
remains afterward. Neither invocation ABI nor cached adapter identity changes.
The helper runs at adapter construction, not on each method invocation.

The two original loops were 860 bytes each. With readable helper definition,
docstring and calls, source ownership drops by 560 bytes: PR #231 core runtime
899981 becomes 899421, against the unchanged 903000 budget. No budget, assertion,
comment-removal or compressed-formatting change is used to obtain the saving.

## Combined audit

The earlier overlap-aware source merge of main c4 plus PRs #223/#226/#227/#228/
#231/#234/#238/#241/#242 and the handled-state snapshot totaled 903099, over by
99 bytes. Applying this exact helper source to that temporary Git merge succeeds
without new conflicts and totals **902539**, leaving **461 bytes**. This is
measured merged-source counting, not just arithmetic projection. It is not a
merged-build, compressed-browser or performance qualification.

Temporary audit directory: `/tmp/sagejs-combined-budget.8g1EHE`.
Prior temporary audit commit: `1fcc0855993b27980fa905544145b08c887aabfc`.
Helper snapshot: `b715e722450914d295ed4c6ceefba29730256d08`.
Combined source tree: `7c9d6fe59b7a595057a40a61bf91dbce466880ac`.
Earlier generated reference and qexp source-freeze conflicts remain preserved;
source paths have no conflicts. The state snapshot predates published PR #244,
so this audit does not claim identity with later edits to that PR.

## Qualification

Seven direct adapter tests pass, covering all 16 fields in exact per-field
descriptor/read/write order, untouched getter descriptors, descriptor/write
exceptions, argument-name order, flags, cache publication and identity.
Diagnostic baselib/runtime caches were rebuilt in this worktree; 20 focused
adapter/native-unbound/live-default/mutation/boundary tests passed. Merge and
format/docstring checks passed. These diagnostic artifacts are not a build
receipt. Seeds were copied without hardlinks from the stable PR #231 worktree.
`parallel:check` retains the existing 406-contract ambiguity; no new lane or
shared contract was created.

Frozen full build passed in 11m 27s. Receipt `2026-09-12T08:33:17.466Z`
records artifact inputs
`07a80dad5b958e68163cf9efb52dafcacd1c217344f42860ac77e719e92fd808`
and baselib SHA-256
`fe6f9c42a80468b7815620443769344090bb253bf3d7801d9f524c9e475b5845`.
Final sequential qualification passed: 20 focused tests; all 207 portable files
in 2m 46s; strict Python 387 modules with zero errors; formatting/docstrings
848 files; direct generated-doc check and merge checks. No source edits occurred
during the build. No full third-party-package or browser qualification is claimed.

One bounded construction diagnostic then compared extracted native bodies from
PR #231 against this source in separate VM contexts. Seven alternating paired
rounds constructed 20000 adapters each, after a 2000-construction warmup. Median
native construction was 104.10ms baseline / 108.83ms candidate (1.0455x);
uncached unbound construction was 108.97ms / 109.16ms (1.0017x). The unbound loop
includes fresh target creation in both variants. These are local raw-body proxy
measurements, not worker, emitted-runtime, isolated startup or browser evidence.
No retry or performance-closure claim is made. Full samples are preserved at
`/home/user/python-bootstrap-metadata-copy-construction.jsonl`; probe source is
`/tmp/sagejs-combined-budget.8g1EHE/adapter-construction.cjs`.
