# Twelve-field development reuse matrix

Status: implementation-planning audit, not qualification evidence.

This audit maps the twelve `additional-development` fields onto the committed
class-and-unit machinery after the row-14 live-driver cut. It is deliberately
read-only with respect to the frozen PARI payloads: the schedules below were
extracted with streaming `jq` queries over exact manifest-owned paths, not by
loading or rewriting the large payloads.

## Provenance and scope

The trace audit began at commit
`aace18e3ac365575b9c096473acdea405002956d`. Before this document was written,
the branch advanced to `01888298cb279176dd56eb12a27bb73ae68e9193`, which adds
the untimed compact flag-one row-20 seed. That intervening commit does not
change any of the four frozen inputs below. The final reuse assessment includes
only files committed at `01888298cb279176dd56eb12a27bb73ae68e9193` and excludes
all concurrent uncommitted or untracked row-14 and row-20 experiments.

| Frozen input | SHA-256 |
| --- | --- |
| `panel.json` | `7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5` |
| `class-unit-qualification-manifest.json` | `3821a5a51390ca25b3110e7a8058d73cd9945d0ab6ad254c07186e0ac19c1c50` |
| `phase1-development-ladder.json` | `e7d96a3c02308863d90ff8c070e5c2741c69bbd7f697325dc24a12ef9362cd22` |
| `development-default-driver-manifest.json` | `abe10f55aa44fbb47560cd23cf8b708268d838720d38b0fc98debbc1b763ef46` |

The compact trace manifest pins pristine PARI 2.17.4 archive SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`
and `src/basemath/buch2.c` SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

An exact identity check independently selected the twelve
`additional-development` entries from the qualification and ladder manifests,
selected the same panel indices from the trace manifest, and compared every ID
with `panel.json`. All four ordered lists are exactly
`3, 4, 6, 10, 11, 13, 16, 18, 19, 20, 21, 23`, and every ID agrees.

The following universal committed boundaries apply to every row:

- `prepared_nf_authentication.cjs` v2 already authenticates the frozen degree
  3--5 prepared fields and all signatures in this matrix.
- `relation_owner_capacity.py` supplies a field-neutral, versioned capacity
  protocol, though each live root must still derive and honor its own extents.
- `class_unit_correspondence_result.cjs` supplies the field-neutral final
  envelope with the required distinction between correspondence completion
  and public Sage.js completion.

Current presentation, unit, replay, and C7 coordinators remain substantially
sentinel- or field-specific. Reusing their arithmetic does not by itself grant
authority for a new field.

## Notation and resource tiers

Schedules use `initial relations -> target`. Each HNF checkpoint is written
`relations/+new; W; B; dep`, where matrix shapes are `rows x columns` as
recorded by the frozen event. Acceptance is `code/h`; code zero is the accepted
terminal outcome. A target change after a rejected acceptance is shown
explicitly. `FU event only` means pristine PARI reached its terminal
`fundamental_units` event, but no committed independent raw-relation-derived
unit authority exists for that row.

Resource tiers estimate implementation and replay cost, not qualification
time:

- **S**: sub-1 MiB trace, at most 150 events, and bounded small matrices.
- **M**: roughly 20--30 MiB trace or a modest connector generalization over an
  existing degree/signature path.
- **L**: a high-rank Smith, generator-witness, or unit connector even when the
  trace itself is compact.
- **XL**: roughly 185--213 MiB trace, factor-base width near 1,000, repeated or
  stalled HNF passes, and historical PARI discovery cost around 20 seconds.

## Full reuse matrix

| Row | Degree / signature | Class and unit outcome | Frozen relation/HNF schedule | Existing committed path to reuse | Exact missing connectors | Tier |
| ---: | --- | --- | --- | --- | --- | :---: |
| 3 | 3 / `(3,0)` | `Cl=[6]`, `h=6`; unit rank 2; FU event only | `116 -> 675`; `675/+675; W 2x2; B 2x666; dep 0x2`; `0/6` | Panel-1 exact presentation, cyclic generator witness, exact cubic units, and the retrying H1 suffix | Dynamic 675-relation/666-column capacities; generic W0-to-presentation adapter; order-6 ideal witness; raw-to-rank-2 unit authority; neutral C7 adapter | M |
| 4 | 3 / `(3,0)` | `Cl=[2]`, `h=2`; unit rank 2; FU event only | `107 -> 567`; `567/+567; W 1x1; B 1x559; dep 0x1`; `0/2` | Same real-cubic panel-1/H1 route as row 3 | Dynamic 567-relation/559-column owners; generic presentation adapter; order-2 witness; raw unit authority; neutral C7 adapter | M |
| 6 | 3 / `(3,0)` | `Cl=[2,2]`, `h=4`; unit rank 2; FU event only | `203 -> 1137`; `1133/+1133; W 2x2; B 6x1124; dep 4x2`; `1136/+3; W 2x2; B 3x1127; dep 1x2`; `1137/+1; W 2x2; B 2x1128; dep 0x2`; 14 collection passes; `0/4` | H1 cubic arithmetic plus connected relation/HNF and panel-8 multiappend patterns; field-3 noncyclic presentation machinery | Large dynamic or reused capacity owner; stalled-pass scheduling; two independent order/principal witnesses; dynamic exact-unit and C7 coordinators | XL |
| 10 | 4 / `(2,1)` | `Cl=[2,2]`, `h=4`; unit rank 2; committed compact units with terminal flag-zero `PRECI` | `26 -> 295`; HNFs at `293/+293` (`W4`, `dep2`), `295/+2` (`W5`, `dep0`), `299/+4` (`W3`), `300/+1` (`W3`), `303/+3` (`W2`); acceptance `1/96`, `1/8`, `1/8`, `0/4`; retry targets `300,300,303` | Already covered by the committed field-3 C1--C7 chain for `x^4-2000022*x-2000042`: exact `[2,2]` presentation, compact rank-2 unit authority, and correspondence-complete C7 | No new mathematical connector for this row; extract/genericize field-3-named coordinators only if the ladder requires one uniform API | L, done |
| 11 | 4 / `(2,1)` | `Cl=[2,2]`, `h=4`; unit rank 2; FU event only | `24 -> 428`; `427/+427; W 2x2; B 3x418; dep 1x2`; `428/+1; W 3x3; B 3x418; dep 0x3`; `1/32`; retry target `431`; `430/+2; W 2x2; B 2x419; dep 0x2`; `0/4` | Row-14 live collector after closure, row-10 field-3 class/unit chain, and panel-8 multiappend closure | Data-driven three-HNF schedule adapter; raw exact closure and two generator witnesses; field-neutral compact/exact unit and C7 coordinators | M |
| 13 | 4 / `(2,1)` | `Cl=[2]`, `h=2`; unit rank 2; FU event only; driver precision 256 | `54 -> 1006`; eight HNFs at relation/dep counts `995/11`, `996/10`, `999/7`, `1000/6`, `1001/5`, `1002/4`, `1005/1`, `1006/0`; `W 1x1` throughout; `0/2` | Row-14 capacity/collector path, panel-8 incremental append path, cyclic witness machinery, and quartic C5/C6 arithmetic | Precision-256 live-owner bounds; ten-pass incremental and stalled-pass control; cyclic order-2 witness; unit and C7 adapters | XL |
| 16 | 3 / `(1,1)` | `Cl=[3,3,3]`, `h=27`; unit rank 1; FU event only | `15 -> 54`; `54/+54; W 3x3; B 3x45; dep 0x3`; `0/27` | Generic prepared authentication and one-pass presentation; field-3 complex log/embedding leaves; exact cubic ideal arithmetic | Mixed-signature cubic relation/log connector; rank-1 cleanarch/getfu/factorback; three independent order-3 witnesses; neutral C7 adapter | S |
| 18 | 3 / `(1,1)` | `Cl=[18]`, `h=18`; unit rank 1; FU event only | `13 -> 47`; `47/+47; W 3x3; B 3x38; dep 0x3`; `1/36`; retry target `50`; `50/+3; W 2x2; B 2x39; dep 0x2`; `0/18` | Same mixed-signature cubic ingredients as row 16 plus connected retry/HNF control | Two-pass mixed-cubic retry connector; rank-1 unit path; cyclic order-18 witness; neutral C7 adapter | S |
| 19 | 3 / `(1,1)` | `Cl=[6,3,3,3,3,3,3,3,3]`, `h=39366`; unit rank 1; FU event only | `71 -> 430`; `423/+423; W 9x9; B 16x408; dep 7x9`; `430/+7; W 9x9; B 9x415; dep 0x9`; `0/39366` | Mixed-cubic path from rows 16/18 plus field-3 noncyclic presentation machinery | Rank-9 presentation and independent generator witnesses; multi-generator factorback; rank-1 unit authority; neutral C7 adapter; careful memory bounds | L |
| 20 | 5 / `(1,2)` | trivial class group; unit rank 2; committed two exact norm `-1` units | `3 -> 14`; `14/+14; W 0x0; B 0x7; dep 0x0`; `0/1` | Already covered by committed successful exact-unit C6 and C7: `R*T=0`, `R*Q=I_7`, exact units, and correspondence-complete envelope; compact flag-one seed is also committed but remains untimed | Only generic coordinator extraction remains; the compact flag-one seed is not a matched timing authority or qualification result | S, done |
| 21 | 5 / `(3,1)` | trivial class group; unit rank 3; FU event only | `5 -> 32`; `32/+32; W 0x0; B 0x24; dep 0x0`; `0/1` | Row-20 degree-five exact arithmetic and right-inverse closure | Rank-3 integer/real lattice cleanup, getfu, and exact-unit materialization; `(3,1)` embedding bridge; generic C7 coordinator | S trace / M connector |
| 23 | 5 / `(5,0)` | `Cl=[6]`, `h=6`; unit rank 4; FU event only | `0 -> 40`; `40/+40; W 1x1; B 1x30; dep 0x1`; `0/6` | Row-20 quintic exact arithmetic, panel-1 cyclic witness, and totally real H1 unit leaves | Rank-4 lattice/getfu/factorback; totally-real quintic embedding/log bridge; cyclic order-6 witness; neutral C7 coordinator | S trace / L connector |

For rows other than 10 and 20, the frozen `fundamental_units` event is an
oracle observation only. It must not be treated as the authority that a new
connector is supposed to compute. A valid implementation must derive unit
material from authenticated raw relations and logs, then consult the frozen
event only after publication or for detached comparison.

## Identity and payload ledger

| Row | Exact field ID | Frozen payload SHA-256 |
| ---: | --- | --- |
| 3 | `generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9` | `8ef5cd64a3baaf0ff6f3e57951cdb0d1a7549879aef6dd089d5a69b39da970b9` |
| 4 | `generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9` | `acebe2f9f4bdfc0c3da76ab6d9ad1aa409a1fb0bfd4113ebec9b825c432e2cb8` |
| 6 | `generated-sha256-55ba15494f03f38bf8f687ff4d2813e81184d71c84dbed9e1adc6af7ba62f0eb` | `2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5` |
| 10 | `generated-sha256-984793770b4a15a79fbc9984fe352fbc867491917733c78bdba3b1856c18e3a7` | `67d29d2d9088506de478140bc4c7393ce81b12d0809a4412e3e6a2fdcc1b443b` |
| 11 | `generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab` | `6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165` |
| 13 | `generated-sha256-353468f1887e96f5a2f66e3121564636ed8cdbd75bde6571609627bbe8586e33` | `50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589` |
| 16 | `3.1.1002718428660.2` | `8ec0387525e4e3f34eb6431ede35b7438b19c4a8f208dc76da682821a14756ce` |
| 18 | `3.1.1005907102200.3` | `6e872fc1cf4765b30782ac32f2a0d7db5fc21c8b22721a976276708ddb084d92` |
| 19 | `3.1.1086061775432017340256300.107` | `0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9` |
| 20 | `5.1.1000000.1` | `6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468` |
| 21 | `5.3.1009349859375.3` | `45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a` |
| 23 | `5.5.1002836007889.1` | `6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89` |

## Recommended post-row-14 batches

1. **Rows 16 and 18: mixed cubics, rank-one units.** These are the smallest
   traces and share one new degree/signature connector. Together they exercise
   a one-pass noncyclic class group and a two-pass cyclic retry, so the batch
   tests both presentation shapes without introducing higher-rank units.
2. **Rows 3 and 4: totally real cubics, rank-two units.** Both are one-pass
   cyclic cases close to the panel-1/H1 path. Their moderate relation counts
   force the sentinel-specific sizes out of that path without first taking on
   the row-6 stalled schedule.
3. **Row 11: mixed quartic reuse proof.** This is the closest direct consumer
   of a completed row-14 live collector and the committed row-10/panel-8
   suffixes. It should be a singleton batch. If policy requires at least two
   fields per batch, pair rows 11 and 13 only after row 11 closes; row 13 is an
   XL precision-256 incremental-HNF case and should not define the first
   generic connector.

Defer rows 6 and 13 until capacity reuse and stalled-pass control are proven,
row 19 until the rank-9 class-witness surface is bounded, and rows 21 and 23
until rank-3/rank-4 unit machinery exists. Rows 10 and 20 need no new
field-level implementation; their remaining work is coordinator
generalization and, separately, honest compact flag-one timing authority.
