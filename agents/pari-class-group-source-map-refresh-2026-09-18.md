# PARI 2.17.4 class/unit source-map refresh

Date: 2026-09-18

This is a read-only correspondence audit of the experimental prepared-number-
field class/unit port. It does not run a class-group computation, make a
performance claim, or promote an internal correspondence result to a public
certified result.

## Authority and vocabulary

The source inspected here is the pristine file
`/home/user/upstream/pari-2.17.4/src/basemath/buch2.c`:

- PARI archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

Line numbers below refer only to that pristine file. The older scratch copy at
`/scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4` is instrumented and has a
different hash; its physical line numbers are not authority.

The following labels deliberately distinguish three different facts:

- **translated leaf**: ordinary Python implements the relevant arithmetic or
  control block and has focused differential evidence;
- **executed corridor**: at least one registered fresh prepared transaction
  reaches the block without receiving the desired answer as a runtime input;
- **general closure**: the connected driver handles all source branches and
  ownership/retry transitions admitted by the campaign boundary.

An executed corridor is not automatically a general closure. Likewise, the
field-neutral result is an upstream-assumed correspondence object, not a
certified `ClassUnitComputation`.

## Consolidated `buch2.c` correspondence

| Pristine source cut | PARI responsibility | Current Sage.js evidence | Honest status |
| --- | --- | --- | --- |
| 113–349 (`RELCACHE_t`/`FB_t` lifecycle, `subFBgen`, `subFB_change`) | Cache growth, factor-base permutations, automorphism-aware subfactor selection and rotation | `relation_cache.py`, `subfactor_base.py`, `bad_subfactor.py`, `collector_next_pass.py` and the focused initialization/subfactor checkers; selected fresh roots retain and replay this state | Translated leaves and selected executed schedules. General automorphism-aware owner growth/restart is not closed. |
| 357–761 (`init_GRHcheck` through `GRHchk`, `get_fs`, `FBgen`) | GRH bound, prime decomposition cache, analytic residue support, factor-base construction | `grh_bound.py`, `analytic_inverse_hr.py`, `get_fs_small.py`, `bounded_get_fs_small.py`, `factor_base.py`, `initial_base.py`, `initial_kummer_catalog.py`, plus the prime-decomposition dependency stack | The selected degrees and prepared panels execute this prefix. It is not a production all-degree factor-base API, and the campaign assumes PARI's bounds. |
| 763–967 (`divide_p_*`, `can_factor`, `factorgen`, `cleanarch`, `cleanarchunit`) | Smoothness/admission and archimedean normalization | `valuation.py`, `ideal_admission.py`, `admission.py`, `class_relation_cleanarch.py`, `mixed_signature_cleanarch.py`, `field3_packed_class_cleanarch.py`, signature-specific row modules | Core leaves are translated. Clean-arch execution is broad across the selected panel; arbitrary-degree/signature generality is not proved. |
| 1025–1172 (`chinese_unit*`, `fixarch`, `getfu`) | Algebraic reconstruction of fundamental units, including exact recovery and `not_given` outcomes | `field3_high_precision_getfu.py`, `getfu_mixed_quartic.py`, `getfu_mixed_complex.py`, `panel8_c6_getfu.py`, `row20_successful_c6.py`, and row-specific exact-unit owners | Executed for the currently completed cubic/quartic/quintic corridors, including legitimate `not_given` cases. There is no one generic all-degree `getfu` entry with every Chinese-reconstruction/precision branch. |
| 1179–1510 (`makeunits`, compact factor utilities, `genback`, `SPLIT`) | Lazy public unit construction, factored ideal recovery, reduced generator construction, principality support | Compact-unit and signed-genback modules cover the portions required by selected terminal roots; `signed_genback_assembly.py` and row-specific generator witnesses replay actual exponent columns | `genback` is executed on selected roots, not a generic public routine. `makeunits`, `SPLIT`, and the later lazy/public principality surface are outside the first timed result and remain unported as general APIs. |
| 2194–2410 (`get_log_embed` through `add_rel`) | Relation logarithms, automorphism copies, sparse factor columns, duplicate/rank admission | `log_embedding.py`, `relation_log_embeddings.py`, `relation_insertion.py`, `relation_cache.py`, `ideal_admission.py` | Translated and connected in fresh prepared roots. The selected roots do not prove every automorphism-copy branch. |
| 2411–2678 (`Fincke_Pohst_bound`, `Fincke_Pohst_ideal`, `small_norm`, `get_random_ideal`, `rnd_rel`) | Enumeration and deterministic/random relation collection | `enumeration.py`, `ideal_enumeration_preparation.py`, `small_norm_outer_schedule.py`, collector modules, `pari_random.py`, `rnd_relation_*` modules | `small_norm` is extensively executed. Random-relation and subfactor transitions have focused executions, but the full arbitrary retry loop is not one general closed driver. |
| 2680–2865 (`automorphism_perms`, `automorphism_matrices`, `pr_orbit_fill`, `be_honest`) | Automorphism orbit compression and unequal-bound honesty | `honesty_branch.py`, `honesty_scheduler.py`, the successful row-21 collector/scheduler path, and `honesty_success_*` evidence | The no-automorphism immediate-success unequal-bound corridor is executed. Automorphism orbits and failed-probe random-product/reduction/restart paths remain unported as a connected general cut. |
| 2932–3103 (`clean_cols`, `compute_multiple_of_R`, `compute_R`) | Unit-rank detection, regulator multiple, analytic `hR` acceptance and retry action | `regulator_preparation.py`, regulator HNF/LLL/scalar modules, `post_hnf_acceptance.py`, `regulator_acceptance_replay.py` | Translated with broad focused differentials and executed in fresh roots. General precision ownership and every outer restart action remain a driver gap, not an arithmetic-leaf gap. |
| 3106–3156 (`get_clg2`, `class_group_gen`) | SNF transformations, reduced class generators and archimedean principal-map state | `class_group_smith_transform.py`, `signed_genback_assembly.py`, `get_clg2_arch.py`, `nf_cxlog.py`, class-witness/result composers | Exact Smith identities are broad and selected roots produce exact class witnesses. The whole routine is still assembled by field-specific adapters; there is no single arbitrary-dimension/signature driver with all generator/map branches. |
| 3452–3465 (`buchall_end`) | Final internal BNF-like object assembly | `class_group_internal_result.py`, neutral immutable result/publisher modules, and row-specific C7/final-result adapters | Field-neutral transactional assembly is present for all internally complete roots. It intentionally does not construct PARI's public object or Sage.js's certified public result. |
| 3513–3554 (`extract_full_lattice`) | Select a small column subset spanning the same unit lattice | `unit_lattice_selection.py` and `unit_lattice_reduction.py` | Translated, including the wide-selector control; selected small roots often take PARI's literal `<200` shortcut. |
| 3556–3727 (`init_rel`, cyclotomic relations, `trim_list`, precision helpers) | Initialize relation state and helper transitions for `Buchall_param` | Relation initialization, torsion/cyclotomic authority, ideal scheduling, retry and precision helper modules | Selected corridors execute the needed helper paths. There is no single source-shaped owner object covering every helper transition. |
| 3729–3886 (`Buchall_param` preparation through initial relations) | Prepared-NF normalization, roots of unity, automorphisms, bounds, factor base, restart setup | Fresh prepared transactions begin from authenticated neutral prepared-NF data and compute their own factor base/owners; exact torsion authorities exist | The plan deliberately excludes polynomial/maximal-order preparation. Within the prepared boundary, roots-of-unity and automorphism construction are still field/signature-specific rather than one general implementation. |
| 3887–4132 (nested relation/HNF/regulator loops) | General relation retries, HNF append/rebuild, rank deficiency, precision rebuild and factor-base restart | Initial and append HNF, selected `small_norm`/random schedules, acceptance, and several real retries are connected; rows 8 and others exercise multi-pass collection | This is the largest remaining general-driver cut. The LIE/squash path, arbitrary random-dependency escalation, all rank-deficient cases, both `flag` precision-rebuild variants, repeated factor-base enlargement and every `goto START` transition are not closed together. |
| 4134–4140 (honesty call site) | Run honesty exactly once when `KCZ2 > KCZ` | Equal-bound source skips are live; one unequal-bound immediate-success corridor is live | No general failed honesty transaction/restart and no live automorphism-orbit corridor. |
| 4142–4177 (fundamental-unit lattice and `getfu`) | Exact/floating LLL, clean logs, compact flag-one provenance, reconstructed units | Unit-lattice reduction, packed log transforms, exact unit reconstruction, compact provenance and per-signature row adapters | Executed across ranks 1–4 in selected roots. General degree/rank dispatch, every precision retry, and one reusable end-to-end `getfu` owner ABI remain open. |
| 4178–4190 (`cleanarch` and retry) | Normalize class-relation logarithms; retry precision on failure | `class_relation_cleanarch.py` plus field-specific cleanarch owners | Success corridors are executed. A genuine failure that rebuilds precision and resumes the entire transaction is not closed generally. |
| 4192–4204 (`class_group_gen`, result construction and cleanup) | Final generator/map construction, result assembly and release | Exact witnessed neutral terminal results exist for selected fresh prepared roots | Cleanup/publication is transactional in those wrappers, but general `Buchall_param`-shaped final dispatch is not present. |

## Executed prepared-root coverage

At this snapshot the fresh-prepared registry admits rows
`0, 1, 3, 6, 8, 13, 14, 19, 20, 21, 23`: **11 of 16** frozen development
fields. These transactions start from authenticated prepared number-field
input, privately compute intermediate owners, independently replay the neutral
result, and publish only a branded immutable receipt. They cover degrees three,
four and five, signatures of several unit ranks, nontrivial class groups,
multi-pass relation collection, exact class-order witnesses, rank-one through
rank-four unit results, and both equal-bound honesty skips and one unequal-bound
success.

The exact frozen rows without a registered fresh prepared transaction are
`4, 10, 11, 16, 18`. Their older internally complete/retained-owner results are
useful differential evidence, but they cannot be counted as fresh prepared
executions.

This 11/16 count is execution coverage, not proof that the generic source cuts
above are closed. Many row transactions intentionally use signature- or
field-specific adapters after shared arithmetic leaves.

## Exact unported cuts and smallest dependency frontier

The next source work should be described as the following exact cuts, rather
than as the vague phrase “finish class groups”:

1. **General retry transaction — `buch2.c:3834–3875, 3887–4132`.** Join
   factor-base enlargement, retained computed relations, mutable cache/subfactor
   owners, the LIE/squash schedule, random dependency escalation, rank/unit-rank
   deficiency, `hnfspec_i`/`hnfadd_i`, and both flag-zero/flag-one precision
   rebuilds into one resumable owner graph. Most arithmetic callees already
   exist. The missing object is the source-faithful transactional state machine.
2. **Automorphism-aware honesty and failure — `2680–2865`, called at
   `4134–4140`.** Port/connect `automorphism_matrices`, embedding and ideal
   permutations, `pr_orbit_fill`, and the failed-probe loop's random products,
   primitive part, ideal reduction, 50-try limit, `KCZ` restoration, and
   `goto START` outcome. The existing row-21 success does not enter these
   branches.
3. **Generic unit reconstruction — `1025–1172, 4142–4177`.** Replace the
   collection of signature/rank adapters with one bounded state layout that
   dispatches exact/floating LLL, packed cleanarchunit, Chinese reconstruction,
   exact inverse/norm checks, compact `flag=1` provenance, source `not_given`
   policy, and precision retry for arbitrary admitted degree/rank.
4. **Generic transformation/final assembly — `3106–3156, 4178–4204`.** Feed
   arbitrary accepted `W/C/Vbase` owners through SNF, unimodular divisions,
   every active `Uir` column's `genback`, multiplier `nf_cxlog`, `get_clg2`,
   class-log cleanup and immutable neutral assembly. Existing Smith arithmetic
   is reusable; row-specific witness composers must stop being the only caller.
5. **Prepared-root coverage — no new PARI lines.** Connect rows
   `4, 10, 11, 16, 18` through the existing shared graph. This tests whether
   the generalized cuts above actually replace retained-answer adapters.

After those five items, the remaining major work is qualification and public
certification, not a faithful source cut: a quiet matched PARI 2.17.4 timing
host, independent class-group generation/saturation proof, unit index-one
certificate, and the standard public adapter. Those requirements must not be
misreported as untranslated PARI C.

## Explicit exclusions from this campaign

The following source is intentionally not required for the first prepared
flag-zero/compact result and should not inflate the “unported class-group
kernel” count:

- `bnfinit0`/`Buchall` argument parsing at 3468–3496 and the
  polynomial-to-`nfinit` portion of `Buchall_param` before the prepared-NF
  state is available;
- degree-one special handling at 3498–3508;
- lazy public builders `makeunits` (1179–1257), `makecycgen`/`makematal`
  (3159–3273), and the broader public principality/sign-unit APIs
  (1511–2181);
- unconditional certification of PARI's GRH/bound/analytic assumptions;
- PARI-compatible public object layout.

These may be valuable later, but they are not hidden dependencies of the
current prepared-input performance question.

## License and attribution status

The pristine `buch2.c` header says copyright 2000 The PARI group and licenses
the file under GPL version 2 or, at the recipient's option, any later version,
without warranty. Sage.js declares `GPL-3.0-only`, so the upstream `GPL-2.0-or-
later` code is license-compatible when distributed as part of this GPLv3 work.

The experimental tree carries strong but decentralized attribution:

- 291 of 389 top-level Python files under `bench/pari-class-group-port/`
  contain an explicit PARI copyright and/or `GPL-2.0-or-later` notice;
- among the 41 Python files that explicitly mention `buch2.c`, 38 contain an
  explicit PARI/GPL notice;
- the three exceptions are
  `check_residue_exponential.py` (an oracle diagnostic, explicitly not a port),
  `class_group_internal_result.py` (a Sage.js immutable composition contract),
  and `row19_live_unit_result.py` (a source-policy adapter that invokes PARI's
  flag-zero `getfu` size rule but lacks an inline PARI/GPL notice).

No incompatible license was found. The remaining hygiene issue is that there
is no single machine-readable third-party source inventory mapping every
translated Python file to its exact PARI file/routine/range. Before promoting
this experiment, add such an inventory, add an explicit PARI/GPL notice to
`row19_live_unit_result.py` if its source-policy transcription is retained,
and ensure generated/distributed artifacts preserve the PARI notice and point
to the repository's GPL text. This audit does not itself modify those shared
files.

## Bottom line

The port is no longer blocked by a vast unknown arithmetic dependency stack.
Most arithmetic leaves in the prepared class/unit path exist, and 11 frozen
fields execute end to end from prepared input. The remaining faithful-port
problem is concentrated in four connected general source cuts: the retry
transaction, automorphism/failure honesty, generic unit reconstruction, and
generic transformation/final assembly. Closing the five missing fresh roots is
the most direct test that those generalizations are real rather than another
set of field-specific completions.
