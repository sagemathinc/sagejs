# Compact flag-one fresh-execution gap audit (2026-09-18)

Status: correctness/planning audit at integration commit
`e476f1f8fafb97927eac37b388896f8364bf9096`; no timing, reserve, final-run,
or public-completion claim.

## Frozen population and authorities

The required usable-compact-unit tier is exactly the twelve
`additional-development` rows selected by
`compact-flag-one-manifest.json`. Its execution switches remain false. The
field identities below are not a new selection.

One integration defect is visible at this HEAD: the compact manifest's
historical pins for `class-unit-qualification-manifest.json` and
`run_class_unit_qualification.cjs` are stale. The manifest records
`3821a5a5...` and `ee2aa15e...`; the current files are respectively
`fb3b5d16a03ab348b7d8f495dddb6d2716dda45c0486213246298222a9a3cb90`
and
`8cea73a89f02716cada918aa790330b72db47c166402704498f6dafc2965e49e`.
The ordered twelve-row derivation itself is unchanged and is independently
rechecked by the new row-20 adapter. Updating the shared frozen manifest belongs
to the integration owner; this lane does not do it.

| row | exact field ID | polynomial SHA-256 | frozen flag-zero W0 SHA-256 |
| ---: | --- | --- | --- |
| 3 | `generated-sha256-11997528676ebeb1c0636be2cb828b5ed5a527ea18eb3a4ace953984da507de9` | `aae73048ee765ce38148539a3abf01dac43ab04427126dae8295211d684d4d15` | `8ef5cd64a3baaf0ff6f3e57951cdb0d1a7549879aef6dd089d5a69b39da970b9` |
| 4 | `generated-sha256-806defcf929c9cfff7467b8e7ea7b9f939cdd042bce8c1f5a310f5688904e3b9` | `beb19c9584069e8397f9b1d5ddb6d87965aabcc0c788003ea106f3a2f0f566e6` | `acebe2f9f4bdfc0c3da76ab6d9ad1aa409a1fb0bfd4113ebec9b825c432e2cb8` |
| 6 | `generated-sha256-55ba15494f03f38bf8f687ff4d2813e81184d71c84dbed9e1adc6af7ba62f0eb` | `26fed17015f6479f2de7a3544d8e2ac9ef41ec899b18193d997489a0aeafa416` | `2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5` |
| 10 | `generated-sha256-984793770b4a15a79fbc9984fe352fbc867491917733c78bdba3b1856c18e3a7` | `205cea0cc9446e959892f4b3cd8dd5e53ff37ae4fd43d335974bffaf3c92ec7a` | `67d29d2d9088506de478140bc4c7393ce81b12d0809a4412e3e6a2fdcc1b443b` |
| 11 | `generated-sha256-147ddd296edb3764954d6142a499d17edcfecc635aec0181d4beda65d97ad4ab` | `ce2bfa61425aa6816f76d5d4f48e7568a7cca85e7ae408e6ec3cb423cf353b07` | `6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165` |
| 13 | `generated-sha256-353468f1887e96f5a2f66e3121564636ed8cdbd75bde6571609627bbe8586e33` | `a0f7253a51b3045aa02d82f0846e4caa390b93ef159b8c1713245f5793d1e06c` | `50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589` |
| 16 | `3.1.1002718428660.2` | `aabb93f0d6139f9397586e148a87f5444f7da173ef7d1aabc0c8fae15705cf56` | `8ec0387525e4e3f34eb6431ede35b7438b19c4a8f208dc76da682821a14756ce` |
| 18 | `3.1.1005907102200.3` | `d48b43b95d82e5e127e939b4625aedac5bbb1f927c9b92e19c583c51c0901c6e` | `6e872fc1cf4765b30782ac32f2a0d7db5fc21c8b22721a976276708ddb084d92` |
| 19 | `3.1.1086061775432017340256300.107` | `0aab4dadcd4bc7c70dcb017b9f584154d6fd1d98500e7951c71ace3efa5e81db` | `0be835c418ce9b2055cf79051db7220248299c6d53e56a84ae47b0d1ec747ad9` |
| 20 | `5.1.1000000.1` | `36db16a4e174ca1a24dc16439e97c3660cb5135b378dcd3c2e86e438fb3bee11` | `6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468` |
| 21 | `5.3.1009349859375.3` | `6966124ec38a3af183ec7fa9d6cc4f376ef36aa0ba716eeff92bcba0bf7a64bb` | `45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a` |
| 23 | `5.5.1002836007889.1` | `c3077e07c31ac7586ee22c1a57ecfab1883699f8061f850ad75a86d46f23ea73` | `6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89` |

Every W0 above is a PARI 2.17.4 **flag-zero trace**, not a flag-one
authority. The release archive is pinned by SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`
and `buch2.c` by
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
The only committed pristine PARI flag-one authority is row 20:
`pristine-row20-flag-one-authority.json`, SHA-256
`772caa06af410de7ec071ca879765a859238e0c74263c50b4c8dbc374d8777dc`,
from exactly
`bnfinit0(prepared_nf,1,NULL,nbits2prec(192))`. It is untimed and has common
output SHA-256
`ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2`.

## Current execution matrix

“Fresh Sage root” means the compact/factored unit state descends in one branded
transaction from authenticated prepared-number-field input, with no W0 or
retained answer owner as a runtime input. “Retained executable” means useful
arithmetic exists but consumes W0 or a retained result owner. “Matched” requires
both the Sage root and an independently authenticated PARI 2.17.4 flag-one
call; flag-zero agreement is not enough.

| row | usable Sage compact state | fresh Sage root | pristine PARI flag-one | fresh matched status | smallest remaining cut |
| ---: | --- | :---: | :---: | --- | --- |
| 3 | two exact compact rank-two units in neutral result | yes; result `41bef3b744883eb7b91ef1e6fd415d31249322006400e0ffda13a5afbe3a7ba4` | no | Sage-only | capture flag-one authority, then project the branded fresh result |
| 4 | exact two-unit factored suffix, norms `[-1,+1]`, `not_given(LARGE)` | no; W0-backed suffix | no | retained only | finish prepared relation/HNF/log root, then flag-one capture |
| 6 | 7-by-2 compact transform and 1,137-by-2 factored units, `not_given(LARGE)` | yes; result `b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73` | no | Sage-only; separate retained replay exists | capture flag-one authority and add fresh-result projection (do not reuse retained C7 as input) |
| 10 | complete field-3 C7 compact units, authentic flag-zero `PRECI` | no; complete retained chain | no | retained only | connect the in-progress prepared root through the existing suffix, then flag-one capture |
| 11 | two exact 430-factor units, norms `[+1,+1]`, `not_given(LARGE)` | no; W0-backed suffix | no | retained only | prepared root through three-HNF schedule, then flag-one capture |
| 13 | 7-by-2 compact transform and 1,006-relation factored units, `not_given(LARGE)` | yes; result `17ccbab46e27cae538d8958f4eb0a760fbbbfde112ea26b784dcc54057505b73` | no | Sage-only | capture flag-one authority and project fresh result |
| 16 | rank-one mixed-cubic unit arithmetic exists only behind retained W0/presentation owners | no | no | retained fragments | build prepared mixed-cubic collector/HNF/log root and C7, then capture flag one |
| 18 | rank-one mixed-cubic retry/unit arithmetic exists only behind retained W0/presentation owners | no | no | retained fragments | same reusable mixed-cubic root as row 16 plus second HNF pass, then capture flag one |
| 19 | exact compact rank-one unit and inverse in neutral result | yes; result `a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66` | no | Sage-only | capture flag-one authority and project fresh result |
| 20 | two exact rank-two units in neutral result | yes; result `95cb57bd732fe4e2f026568c1e040a0b8e31cfa1be339326775b4e76056d8dbd` | yes | **first untimed fresh matched diagnostic now executable** | generalize capture/projection; qualification remains closed |
| 21 | three exact rank-three units in neutral result | yes; result `df3dddcf96d6cb77c6f9f4003eaeff4c68485d9c1cb48b4e39f7f23a0eab1c8a` | no | Sage-only; older frozen-input compact suffix is superseded for input-boundary purposes | capture flag-one authority and project fresh result |
| 23 | four exact rank-four units in neutral result | yes; result `5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c` | no | Sage-only | capture flag-one authority and project fresh result |

Thus the current honest counts are:

- usable compact/factored Sage evidence: **12/12**, but five rows are retained
  rather than prepared-input executions;
- genuine prepared-input Sage roots: **7/12** (3, 6, 13, 19, 20, 21, 23);
- pristine PARI 2.17.4 flag-one authorities: **1/12** (20);
- untimed fresh matched adapters: **1/12** (20);
- qualified/timed compact results: **0/12**.

## New bounded row-20 bridge

`compact_flag_one_row20_fresh_adapter.cjs` closes the smallest real gap without
changing any frozen manifest or shared registry. It calls the genuine row-20
prepared transaction, authenticates its module-local receipt brand and private
verified result, requires `exact_units`, and compares a representation-neutral
projection with the pinned pristine PARI flag-one authority. The adapter adds
no eager expansion. Its receipt explicitly says that the PARI call was captured
fresh when the authority was produced but was not rerun in the same invocation,
and contains no measurement.

`check_compact_flag_one_row20_fresh_adapter.cjs` normalizes the exact frozen
row-20 prepared event, reruns the entire Sage transaction, checks the local
brand and copied-receipt rejection, and obtains common output SHA-256
`ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2`.
This is a correctness diagnostic, not compact-tier qualification.

## Smallest systematic path to 12/12

1. Generalize the tiny pristine PARI capture boundary from a hard-coded row-20
   polynomial to an exact manifest-selected row and emit one immutable untimed
   authority per row. This is twelve independent calls to the same pinned
   2.17.4 boundary; it does not require compiler work.
2. Add a field-neutral projection over a branded fresh transaction result. Rows
   3, 6, 13, 19, 21, and 23 then need only narrow adapters analogous to row 20.
   The projection must accept both `exact_units` and authenticated compact
   `not_given` materializations without pretending they are the same
   representation.
3. Close the five missing Sage roots in this order: row 4 (real-cubic reuse),
   row 11 (mixed-quartic reuse), row 10 (already complete retained suffix), then
   rows 16 and 18 together through one mixed-cubic rank-one root.
4. Only after 12/12 untimed correctness exists should the integration owner
   enable a separate compact execution registry or any timing switch. A matched
   compact performance boundary must rerun both implementations, retain no
   answer-derived input, and compare lattice-equivalent units rather than a
   particular basis ordering or inversion.

No reserve was opened, no manifest switch changed, and no timing ratio follows
from this audit.
