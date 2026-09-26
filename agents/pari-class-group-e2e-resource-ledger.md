# PARI class-group end-to-end aggregate resource ledger

Snapshot: 2026-09-17T21:06:24Z. This is the single aggregate ledger for
`pari-class-group-end-to-end-native-plan.md` at the state recorded by
`pari-class-group-e2e-checkpoint-2026-09-17.md`. It is an accounting document,
not a qualification result and not authority to relax any plan gate.

Only committed statements and artifacts whose hashes are bound by committed
evidence are used for historical accounting. A number is `unknown` when that
evidence does not contain it; elapsed time is never silently converted to CPU
time or active-agent time. The final section separately labels a read-only
current disk snapshot, which is operational state rather than historical
campaign evidence.

## Evidence identity and ancestry

- Current integration `HEAD` while preparing this ledger:
  `1bf4891599db00c78155c864326c4924a9566f46`.
- Plan: commit `0983e77e4b77a7ee86a88ed97e786426392992a2`, blob
  `c4880beb7d69303a640fba70fa117144d574e78a`, file SHA-256
  `5a36d7103e2e912407fff4bc3ab4944b11415be277ca415525267a280eca0933`.
- Checkpoint: commit `aace18e3ac365575b9c096473acdea405002956d`, blob
  `2e42ee51ab9ebc8cf083017dd69bceba9a15ba1e`, file SHA-256
  `eacf24f3041c2eaafca54c45bd5923efbaab5a8cbdf9d082554891ada9274f8e`.
- Definitive Phase-0 evidence commit
  `a56b433be796df561eed89998f0fce2592d3a512` binds clean qualification commit
  `44807189a4eb8f8c58d9f46519ab9e60dde21a99` and tree
  `19625ced91963a784813f98917cd5a3d41d872f1`.
- The retained Phase-0 manifest rehashes to
  `8e0c44d0c480fe8580025f7e337b72fa7023d03a7dbb60f0ddf3aa7cf5a91a27`;
  its resource ledger rehashes to
  `18c0af1ccdb5a713478e85f60061cb2f543e90a9598e4b34744f3843894be519`.
  Both equal the committed digests.
- The two starting histories, `696c0bb472ec7e2aaf63ead93951f7eedcb32be7`
  and `73c34205d5a877f7b3afa776279a993b80fee496`, are ancestors of `HEAD`.
- The plan's named HNF commits `6e68e6e43` and `0b37c8486` exist but are not
  literal ancestors. Their stable patch IDs are present through ancestors
  `be1e26d94d7aec6207cdce8510f4abfcc6a1e8c7` and
  `e683e802afb6798e64f49594cd9546e1ee334fd9`, respectively.
- Every checkpoint commit tested for resource or owner evidence is an ancestor:
  `68a908477`, `e635ce176`, `5083d897a`, `e22b2cc96`, `5cbf21b2e`,
  `0e54e771f`, `88ec9584c`, `1fe2a113c`, `80610c6ad`, `9ae23c0de`,
  `f60734fc9`, `6f08c8b14`, `d2eb36305`, and `ad3c192a8`.

## Budget accounting

| Budget | Plan ceiling | Committed consumption evidence | Auditable status |
| --- | ---: | ---: | --- |
| Aggregate active-agent time | 224 h | Unknown | **Unmet accounting gate.** No committed aggregate active-agent-hour log exists, so neither remaining hours nor checkpoint-hour position may be claimed. |
| Local build/validation CPU | 240 CPU-h | Unknown | **Unmet accounting gate.** Wall times and runner times below are not CPU accounting. |
| Controlled timing-host CPU | 48 CPU-h | Unknown | **Unmet accounting gate.** The H1 seven-pair run is explicitly an unqualified development-host diagnostic. |
| Optional high-memory stress host | 24 CPU-h | Unknown; no committed evidence establishes use | Do not debit zero or open this reserve without a host receipt. |
| Normal request | 600 s, 4 GiB, no swap | Phase-0 mathematical stages were serial under 600 s and 4 GiB; other known exceptions are below | Still binding. No result below authorizes a wider mathematical request. |
| Stress-only request | 1,800 s, 16 GiB | One build-only use: 624.570 s | Authorized for the exact clean Phase-0 build after the 600.169 s normal attempt crossed its threshold. It was not a mathematical-stage exception. CPU time and build peak RSS are unknown. |
| Project-scoped `/scratch` | 100 GiB | Committed checkpoint: 461,946,399 apparent bytes for the active project tree | Within cap at the checkpoint and current snapshot; historical aggregate high-water mark is unknown. |
| Committed/archived evidence | 512 MiB | Unknown | **Unmet accounting gate.** Active immutable-owner totals are known, but no committed inventory proves the entire archived-evidence denominator. Reproducible builds/comparator installs are excluded by the plan. |

The plan's earlier rough observations of 1.46 GiB of runtime owners and 61 MiB
of generated C are not charged as current usage: they are neither a complete
campaign total nor bound to one of the current cuts. Compiler-owner logical/live
high-water bytes remain unknown. The separate sentinel target
`max(512 MiB, 5 * matched PARI peak RSS)` also remains unevaluable because
matched PARI peak RSS is not committed for the sentinels.

## Definitive Phase-0 stage ledger

These 25 fresh serial stages are from the hash-verified resource ledger at
clean commit `44807189a`. Time is runner wall time. RSS is a one-second sample
of the primary process group, not a whole descendant-tree maximum; detached
native compiler groups may be absent, although every process separately
inherited the 4-GiB address-space limit. Per-stage CPU and retained-storage
deltas were not recorded.

| Stage | Wall s | Sampled peak RSS KiB | CPU | Storage delta |
| --- | ---: | ---: | --- | --- |
| `analytic` | 33.598 | 451,672 | Unknown | Unknown |
| `splitting-fixture` | 11.424 | 366,884 | Unknown | Unknown |
| `splitting-replay` | 29.482 | 652,892 | Unknown | Unknown |
| `cubic-collector` | 221.179 | 833,116 | Unknown | Unknown |
| `cubic-driver` | 3.688 | 271,888 | Unknown | Unknown |
| `cubic-acceptance` | 80.753 | 517,600 | Unknown | Unknown |
| `cubic-candidate` | 266.687 | 1,200,604 | Unknown | Unknown |
| `resident-cubic-collector` | 42.928 | 619,404 | Unknown | Unknown |
| `resident-cubic-driver` | 4.236 | 295,076 | Unknown | Unknown |
| `resident-cubic-acceptance` | 14.888 | 456,784 | Unknown | Unknown |
| `resident-cubic-input` | 42.293 | 806,472 | Unknown | Unknown |
| `kummer-prepared-nf` | 13.260 | 322,748 | Unknown | Unknown |
| `initial-kummer` | 60.496 | 446,100 | Unknown | Unknown |
| `resident-cubic-cpython` | 3.816 | 335,196 | Unknown | Unknown |
| `resident-cubic-javascript` | 50.287 | 1,111,708 | Unknown | Unknown |
| `resident-cubic-gmp` | 375.085 | 1,240,252 | Unknown | Unknown |
| `resident-cubic-tagged` | 66.099 | 966,300 | Unknown | Unknown |
| `quartic-collector` | 48.836 | 693,756 | Unknown | Unknown |
| `quartic-driver` | 3.821 | 284,652 | Unknown | Unknown |
| `quartic-hnfadd-trace` | 4.311 | 309,336 | Unknown | Unknown |
| `quartic-continuation` | 2.739 | 622,852 | Unknown | Unknown |
| `quartic-retry-cpython` | 8.465 | 729,512 | Unknown | Unknown |
| `quartic-retry-javascript` | 334.848 | 1,523,124 | Unknown | Unknown |
| `quartic-retry-gmp` | 45.831 | 2,246,664 | Unknown | Unknown |
| `quartic-retry-tagged` | 45.213 | 2,259,124 | Unknown | Unknown |
| **Derived serial runner sum** | **1,814.264** | **2,259,124 maximum sample** | **Unknown** | **Unknown** |

The derived sum is 0.503962 elapsed hours, not CPU-hours or agent-hours. The
immutable Phase-0 root's current apparent size is recorded only in the current
snapshot below; there is no committed completion-time root-size total.

## Other measured execution and publication cuts

These measurements come from the committed checkpoint. “Arithmetic” and
“worker aggregate” retain their source meanings and must not be treated as
end-to-end wall time. Unknown cells were not recorded.

| Cut | Time | Peak RSS KiB | Retained storage | Limit/result note |
| --- | ---: | ---: | ---: | --- |
| H1 complete root, seven-pair development diagnostic | Sage.js median 0.942830 s; PARI median 0.011488 s | Unknown | Unknown | 82.07x, explicitly unqualified; source cuts are not proved identical. |
| H1 Sage.js unit/regulator partition | Median 0.626123 s | Unknown | Unknown | Diagnostic only. |
| H1 Sage.js relation/retry partition | Median 0.251142 s | Unknown | Unknown | Diagnostic only. |
| H1 Sage.js sparse HNF/SNF partition | Median 0.064037 s | Unknown | Unknown | Diagnostic only. |
| H1 Sage.js honesty/final partition | Median 0.000100 s | Unknown | Unknown | Diagnostic only. |
| H1 Sage.js unattributed remainder | Median 0.000011 s | Unknown | Unknown | Diagnostic only. |
| Field-3 bounded full-presentation checker | Unknown | 2,637,224 aggregate | Unknown | Completed at `e635ce176`; below 4 GiB. |
| Field-3 generic source-transform route | Unknown | **Exceeded 4 GiB** | Unknown | Failed before a result; not an alternative route. |
| First field-specific 153088-bit log replay | 99.663 s wall | 2,108,868 aggregate | One of 301 columns published; bytes unknown | Completed at `5083d897a`. |
| Complex neutral root after full-product change | 170.488 s arithmetic | 1,228,256 | Unknown | Previous arithmetic time 380.346 s; not end-to-end wall. |
| Focused 153088-bit real AGM GMP batch | 96.266 s arithmetic | 1,298,336 aggregate | Unknown | Focused batch. |
| Complete field-3 complex-log corpus | 8,588.801 s aggregate worker wall; 5,521.902412 s native kernel | 1,523,248 maximum aggregate | 26,577,591-byte immutable correctness owner | Across 76 batches and source/compiler epochs; not a single-commit benchmark. |
| Field-3 native `getfu` module build | 56 s | 470,156 process group | 1,590,570-byte module | Build SHA-256 `a24d89365e9d35713bfec9cfba2a12618278c4588f9c9aab1cd29acb10bcb0f8`. |
| Authentic field-3 C5 | 1.165796 s | Unknown | C5 owner size unknown individually | Completed. |
| Authentic field-3 C6 | 92 s wall | 3,641,268 process group | See owner table | Authorized normal-tier attempt, below 4 GiB; terminal source status 3 (`PRECI`). |
| Earlier field-3 C6 guard failure | 4 s wall | 3,529,788 process group | No completed arithmetic owner | Diagnostic failure at the artificial guard; not counted as completion. |
| C6 + terminal-owner publication | 0.017075 s | Unknown | See owner table | Coordinator publication only. |
| Corrected relation publication | 0.866540 s | Unknown | See owner table | Publication only. |
| Corrected class-owner publication | 23.290736 s | Unknown | See owner table | Publication only. |

No committed aggregate connects these elapsed measurements to local CPU-hours,
timing-host CPU-hours, or agent-hours. They must not be added to those budgets.

## Immutable owner storage

All listed active owners are committed as mode 0444 and content-addressed. A
blank individual size in the checkpoint is kept as `unknown`; the field-3
aggregate is authoritative and is not redistributed by guesswork.

### Field 3 authentic C1--C7 chain

| Boundary | Owner SHA-256 | Bytes |
| --- | --- | ---: |
| C1 joined logs | `8edb2b58b7fa8226e3258d5468e4c4d72fb919750c4e6a2fa4c5030b78dddf1e` | 54,345,461 |
| C3 high-precision transform | `55ebf2e3cd1972aa73fe30e083fdc3a2d6321a659e2086e9ed7e442bd683a4fe` | 2,106,785 |
| Full terminal ancestry | `ff43de4786beee14f959276505c9c3b80a6fde6147ee1bcc3aa9abbeee83d960` | 4,929,230 |
| C4 analytic field | `08d3393a9218cd83d93385c30a24881d779dbd4614461f5aea9bd1a1cfe34e40` | Unknown |
| C4 prime catalog | `74726d2477c470792055a873e86a4dd4a640cc8063bff1dff95bf93ca65196e1` | Unknown |
| Accepted C4 | `e21202c987f705108b9391fb429b2eb9d79fba10ce020443431bfe9553044f7a` | Unknown |
| Exact relation authority | `292f5a0c4ab5e39cfa68551638cd870e2a63e360afa8e92415d6de0f06a23b70` | Unknown |
| Exact class suffix | `2e6ec2310be5a2d737a51e3b113c42374487d80a81cbf74c635ee4c1b0e5bb4b` | Unknown |
| Exact live owner | `1b93fe314ea22d3e8d3d5d42532a1ebefef41354b2833d3dac76fe22ab9c4795` | 1,112,518 |
| C5 unit lattice | `d47a5cb6231eeec67849d939a68830e828a7d39f18fbcb7dac813e977bcae7a7` | Unknown |
| Prepared embedding | `e353db1b859ada577239bffa42f2fba77b912a4dda1507776aad0249360a0d8f` | Unknown |
| C6 native candidate | `d2d1798c4ae619debe30ffce5377987b702de8946b9d04c5d41075409a6ff91c` | Unknown |
| C6 publication | `8fa75f15da623f809951df429e7f6f6d6f3d6fe879818c2d62e4b9bd8496d3f9` | Unknown |
| Terminal unit owner | `c8474c87009165ae64401f28436170e851884402c7010f9726120e9ea8557186` | Unknown |
| Compact PRECI unit owner | `04bc6ad74bf0cf55d6385bad6a0e58a39ae29b324518af98a450656b4d8ea115` | 2,082,026 |
| Authentic C7 envelope | `2ecc26edb8249022d47bfdaaae12ee799b36a1bb5db23d8be870aaf22d4e8615` | 5,733,727 |
| **All 16 active owners** | — | **75,123,368** |

The six individually stated sizes sum to 70,309,747 bytes; the other ten
owners jointly account for 4,813,621 bytes. That joint remainder is arithmetic
from the committed aggregate, not evidence for any individual size. The older
26,577,591-byte complex-log corpus is correctness evidence and is not added to
the active 16-owner total.

### Other active chains

| Chain/boundary | Owner SHA-256 | Bytes |
| --- | --- | ---: |
| Panel 8 accepted retry | `b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591` | 467,766 |
| Panel 8 corrected C5 v2 | `f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21` | 6,139 |
| Panel 8 C6 `not_given(PRECI)` | `d1f4e9e2ce4ae987952cbce8e8af9d6c9ede318f5ffa89b185fbd003ab5e28df` | 3,098 |
| Panel 8 exact terminal closure | `2e7a8a896f68e80093e3e5a5e198597569e804e4dc53f888869138a97710919d` | 261,786 |
| Panel 8 field-neutral C7 | `5626e6e186f481f94c7e1752daab96d04753b864a42cda45faca0607f565e27b` | 264,058 |
| **Panel 8 total** | — | **1,002,847** |
| Panel 1 exact presentation | `c5442d0848ec8fb2e6d8f24e516458a15f24f3415d7a1da62d8d5848c2ab0bcf` | 98,465 |
| Panel 1 C3 witness | `77e3a6dd0011fdc5f85fc4d168e3f481eeceb30660a7d158f20cf87e06016d9d` | 6,620 |
| Panel 1 exact units | `75c7f895711566e954db046b76cf49553b8ec1fdf67ee097cddbb98aa004c9ea` | 15,986 |
| Panel 1 field-neutral C7 | `a2c9eabd7c2c41777f80ae8b0fbf75ac5f99272b794540ec57db40bae1d00cb2` | 27,558 |
| **Panel 1 total** | — | **148,629** |
| Panel 20 successful exact-unit C6 | `5449d3812514fa9aad06364e6b5ba0c18d10ee66225d0baa4fc5ea7d39f7ea1d` | 3,371 |
| Panel 20 field-neutral C7 | `3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052` | 7,290 |
| **Panel 20 total** | — | **10,661** |
| **All active owners above** | — | **76,285,505** |

Superseded owners remain historical evidence and are excluded from the active
total. The panel-8 mode-0644 W0 artifact is authenticated but is not immutable
owner storage and has no committed size in the checkpoint.

## Checkpoint schedule and preserved gates

| Aggregate active hours | Scheduled scope | Status at this snapshot |
| ---: | --- | --- |
| 24 | Phase 0 integration/baseline | Phase 0 is technically **proven**, but the 24-hour checkpoint cannot be audited because cumulative active-agent hours are unknown. |
| 72 | Phases 1--2 relation/log closure | Hour trigger unknown; phases 1 and 2 remain **partial**. |
| 108 | Phase 3 exact HNF/SNF envelope | Hour trigger unknown; phase 3 remains **partial**. |
| 164 | Phase 4 units/precision and sentinel stop gate | Hour trigger unknown. Genuine correspondence-complete sentinels now exist, but this does not retroactively prove the hour-164 budget gate was observed. Phase 4 remains **partial**. |
| 200 | Phase 5 honesty/final driver/maps | Hour trigger unknown; phase 5 remains **partial**. |
| 224 | Phase 6 qualification/review/report | Hour trigger unknown; phase 6 remains **partial** and the campaign outcome is **D**. |

Every scheduled hours checkpoint therefore has an unmet accounting component.
The following substantive gates also remain open and must not be inferred from
the resource evidence:

- row 14 must reach its authentic 806-relation `[24,8]`, class-number-192
  result under the qualified 4-GiB capacity protocol;
- generic capacity growth, factor-base enlargement, natural random fallback,
  remaining sentinel/development fields, and the remaining 12-field exact
  envelope are incomplete;
- the separately timed compact flag-one tier has not run;
- independent Sage.js certification and public completion remain false;
- the frozen 24-field qualification has not run;
- source stage cuts are not proved cross-implementation-identical and the 80%
  gap-attribution requirement for Outcome C is unmet;
- controlled timing-host selection/fingerprint and CPU accounting are unknown;
- the 512-MiB committed/archived-evidence gate lacks a complete inventory.

## Current disk snapshot (operational, not historical accounting)

Read-only `du --apparent-size`/`df` checks at
2026-09-17T21:06:24Z found:

| Scope | Apparent bytes | Interpretation |
| --- | ---: | --- |
| Active project scratch, `/scratch/sagejs-runtime/pari-class-group-e2e-20260917` | 461,946,399 | Exactly reproduces the committed checkpoint snapshot; 0.43 GiB, below 100 GiB. |
| Definitive Phase-0 root, `/scratch/sagejs-runtime/pari-class-group-phase0-44807189a` | 2,428,558,056 | Current retained reproducible worktree, build products, receipts, and manifest; not all are committed evidence. |
| All top-level `/scratch/sagejs-runtime/pari-class-group-*` roots | 6,006,798,785 | Current aggregate includes historical/reproducible Phase-0 roots; 5.59 GiB, below 100 GiB even if conservatively grouped. |
| Integration worktree in `/home` | 10,725,595,748 | Current apparent use; includes build/cache products and is not a committed-evidence total. |
| All top-level `/home/user/sagejs-worktrees/pari-class-group-e2e-*` trees | 70,103,529,997 | Current campaign-named worktrees; includes the nested lane-worktree collection. No plan cap is stated for this scope. |

Filesystem availability was 347,163,668,480 bytes on `/scratch` (31% used) and
67,187,118,080 bytes on `/home/user` (88% used). These values can change after
this snapshot. No deletion or cache cleanup was performed while preparing this
ledger.
