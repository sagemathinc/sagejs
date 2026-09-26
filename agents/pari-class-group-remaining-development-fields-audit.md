# Remaining frozen development fields after rows 6 and 13

Status: source-current coverage audit at commit `f44c8e932`; not qualification
evidence and not a claim of public Sage.js completion.

## Audited population and criterion

The frozen order is read from
`bench/pari-class-group-port/phase1-development-ladder.json`:

```text
0, 8, 1, 14, 3, 4, 6, 10, 11, 13, 16, 18, 19, 20, 21, 23
```

This audit calls a field internally complete only when committed evidence
publishes a replayed PARI-correspondence-complete class-and-unit result. A
frozen PARI trace, prepared-number-field authentication, a factor-base
dependency, or class invariants without units does not satisfy that criterion.
No development result is thereby promoted to `public_complete=true`.

Thirteen fields have such committed internal completion evidence:

| Frozen row | Committed terminal evidence |
| ---: | --- |
| 0 | `h1_unified_complete_adapter.cjs` and the cold-replay boundary documented in `h1_complete_real_runner.md` |
| 8 | `panel8_c7_result_composer.cjs` |
| 1 | `panel1_c7_result_composer.cjs` |
| 14 | `row14_strict_prepared_complete_host.cjs` |
| 3 | `row3_c7_result_composer.cjs` |
| 4 | `row4_c7_result_composer.cjs` |
| 6 | `row6_terminal_transaction_host.cjs` |
| 10 | `field3_c7_final_assembly.py` |
| 11 | `row11_c7_result_composer.cjs` |
| 13 | `row13_terminal_transaction_host.cjs` |
| 16, 18 | `mixed_cubic_c7_coordinator.cjs` |
| 20 | `row20_c7_closure.py` |

Thus exactly rows **19, 21, and 23** remain incomplete. This updates the older
11/16 and 12/16 counts in the rolling checkpoint: row 13 was the twelfth and
the later row-6 C7 transaction is the thirteenth.

## Exact remaining fields

The expected outcomes and schedules below are read from the immutable payloads
under `/scratch/sagejs-pari-development-panel-a998`, whose hashes are pinned in
`development12_reuse_matrix.md`. They are oracles, not runtime inputs for the
missing implementations.

| Row | Identity and stratum | Frozen expected result | Frozen work shape | Furthest committed live boundary | Missing connected work |
| ---: | --- | --- | --- | --- | --- |
| 19 | `3.1.1086061775432017340256300.107`; complex cubic, signature `(1,1)`, unit rank 1 | `Cl=[6,3,3,3,3,3,3,3,3]`, `h=39366`; regulator at 192-bit precision | factor base `KC=424`; `71 -> 430` relations; HNF at 423 then 430 relations; terminal `W 9x9`, `B 9x415`, `dep 0x9`; acceptance `0/39366` | Authenticated prepared `nfinit` projection only. There is no row-19-specific live factor-base, relation, HNF, class, unit, or C7 producer in the committed tree. | Run the existing mixed-cubic arithmetic at the much larger bound; retain the two-pass presentation; prove nine independent class coordinates/order relations; reconstruct the rank-one unit; publish neutral C7. |
| 21 | `5.3.1009349859375.3`; quintic, signature `(3,1)`, unit rank 3 | trivial class group, `h=1`; three expanded frozen reference units; regulator at 192-bit precision | factor base `KC=24`; `5 -> 32` relations; one HNF, terminal `W 0x0`, `B 0x24`, `dep 0x0`; acceptance `0/1` | Partial prepared-root dependency only: `prepared_index_prime.py` computes eight descriptors over index primes 2, 3, and 47. It does **not** establish packet-HNF ideal identity, a complete factor base, or any relation. The connected collector fixture still rejects before a probe because degree-5 ranked preparation/LLL/FLATTER is unsupported. | Finish degree-5 defining-polynomial factorization and descriptor/ideal identity; generalize ranked integer rank, LLL selection, FLATTER, and collector preparation; run the 32-relation/HNF closure; add `(3,1)` rank-three cleanarch/getfu/exact-unit reconstruction; publish neutral C7. |
| 23 | `5.5.1002836007889.1`; totally real quintic, signature `(5,0)`, unit rank 4 | `Cl=[6]`, `h=6`; four expanded frozen reference units; regulator at 256-bit precision | factor base `KC=31`; `0 -> 40` relations; one HNF, terminal `W 1x1`, `B 1x30`, `dep 0x1`; acceptance `0/6` | Authenticated prepared `nfinit` projection only. There is no row-23-specific live root or terminal producer. Its equation-order index is 131, outside the committed direct degree-5 index-prime corridor (currently bounded at prime 47). | Extend the degree-5 index-prime/root graph through 131 and close packet-HNF identity; collect 40 relations; prove the cyclic order-six ideal witness; implement totally-real rank-four unit reconstruction; publish neutral C7. |

The frozen `fundamental_units` events for these rows are detached oracle
observations. They are not evidence that Sage.js has derived the units.

## Narrowest next field

**Row 21 is the narrowest next implementation field.** It already has the only
row-specific live dependency cut among the three, has the smallest factor base
and relation schedule, has a one-pass HNF with no `W` or dependency block, and
has a trivial class group, eliminating generator-witness work. It also forces
the most reusable missing capability: a genuine degree-five prepared root and
rank-three unit suffix.

The minimum honest vertical slice is:

1. finish the degree-five prepared factor-base root, including packet-HNF ideal
   identity rather than metadata-only descriptor comparison;
2. widen ranked preparation/LLL/FLATTER enough to execute the already exported
   row-21 collector inputs;
3. connect the authentic `5 -> 32` relation/HNF schedule and trivial
   presentation replay;
4. add rank-three `(3,1)` C5/C6 reconstruction from raw relations and logs;
5. compose and mutation-test the neutral C7 envelope, consulting frozen W0 only
   after publication.

After row 21, row 23 is the natural degree-five continuation because the new
collector/factor-base machinery transfers directly; it adds prime 131,
rank-four units, and one cyclic order-six witness. Row 19 should remain last:
although it reuses the mature complex-cubic and rank-one-unit paths, its
rank-nine class presentation and witness surface is uniquely large.
