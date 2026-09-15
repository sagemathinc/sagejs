# Smallest remaining end-to-end class-group boundary

2026-09-15, read-only source audit. Source references below use pristine
PARI 2.17.4 `src/basemath/buch2.c`, SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
The instrumented checkout adds 13 lines before the later functions; do not
mix its physical line numbers with these references.

## What the accepted field actually establishes

The current post-HNF fixture for field 1 (`x^3-20010*x+20018`) has
`W=[3]`, one HNF row, 50 factor-base ideals, zero dimension need, and
acceptance `[2,0,0]` in both producer backends. The inspected artifact is
`/tmp/sagejs-post-hnf-acceptance-uEEqVe/fixtures.json`. This is real relation
collection and native HNF, followed by source-matched regulator acceptance.
It is not yet evidence that the factor base is a generating set under the
selected PARI bound policy.

Specifically, `collector_c_control.cjs:44–53` constructs **all** prime ideals
over rational primes `p <= 101`, puts them in `F.LP`, sets `F.KC`, and sets
`F.ballvol=500`. `F.KCZ` and `F.KCZ2` remain zero from `FB_t F={0}`.
`check_collector_unit_dependencies.cjs` retains that prepared boundary and
computes inverse hR upstream. Therefore reading those zero fields as proof
that honesty is unnecessary would be a mistake. This catalog also differs
from `FBgen`, which excludes inert primes and restricts residue degrees by
the ideal norm bound.

Once a genuine generating factor base and the corresponding source
acceptance policy are connected, the abstract invariant group for this
particular one-by-one `W` is simply `Z/3Z`; no general Smith algorithm is
needed to interpret that matrix. This is a useful bounded first endpoint,
not a claim that arbitrary accepted HNF matrices can be read diagonally.

## The shortest next connector already mostly exists

`initial_base.py:pari_prepared_initial_base` connects:

- prepared discriminant logarithm/configuration;
- `init_GRHcheck` scalar constants and prime logarithms;
- `grh_bound.py:pari_prepared_grh_search` doubling/bisection/clamp;
- source `nthideal` ordering and lower bound;
- `factor_base.py:pari_prepared_factor_base`, returning
  `C1,C2,KC,KCZ,KCZ2,KC2,prodZ` plus exact selected catalog indices.

`check_compiled_factor_base.cjs --initial` contains 12 initial-policy
controls: four tuning fields with `cbach=0`, `0.3`, and `13` (including
the source clamp). Ordinary mode contains 64 declared-bound controls:
four fields, eight bounds, two relation/checking splits. They compare
CPython, JavaScript and GMP to actual `FBgen`, including selected ideals,
offsets, counts, complete-group flags, and incomplete groups. This audit
inspected those tests but did not rerun them. Tagged mixed-float execution
is explicitly unavailable in that checker.

Minimal integration work:

1. Supply a sufficiently long **raw decomposition catalog**, not selected
   factor-base answers, and invoke `pari_prepared_initial_base` in the
   connected computation. Preserve the prepared `nfinit`/prime-decomposition
   boundary for the first experiment; record that it remains prepared.
2. Gather ideal HNF packets, norms, ramification and valuation data using the
   returned `selected_indices`, offsets and counts. Rebuild cache dimensions
   from returned `KC`; do not retain the diagnostic 50-column cache.
3. Supply the source `ballvol(N)` (buch2.c:643: short binary64 recurrence),
   not 500. Reuse `subfactor_base.py` for supported no-automorphism
   subfactor selection/permutation, with source `bad_subFB` inputs and
   product threshold. Verify the actual `small_norm` ideal order/quota;
   the current all-ideal diagnostic sweep is not the whole outer scheduler.
4. Connect `residue_bound.py`, `residue.py` and
   `regulator_normalization.py` from raw field/prime data instead of the
   upstream-produced inverse hR scalar. Root is integrating this separately.
5. Retain the existing collector, weighted log, HNF and regulator modules,
   rebuilding their owners for the selected base. Publish the actual bounds,
   `KCZ/KCZ2`, completeness assumption, and retry outcome with any result.

For the **default** `cbach=0` first attempt, pristine buch2.c:3821–3860
sets `LIMC=LIMC2`, then raises both if the `nthideal` floor requires it.
Thus genuine default `FBgen` gives `KCZ==KCZ2`: the honesty loop really is
skipped by source policy. This is a legitimate way to avoid implementing
honesty for the first endpoint, provided those values are computed rather
than asserted. It does not license skipping honesty for a smaller custom
relation bound.

## Exact acceptance and retry boundary

Pristine buch2.c:4093–4140 selects the leading unit columns, runs
`compute_multiple_of_R`, checks missing `lambda`/`R`, checks unchanged cache,
then computes `h=ZM_det_triangular(W)` and `compute_R(lambda,h*invhr,...)`.
`fupb_RELAT` requests another relation; `fupb_PRECI` restarts precision or
the factor-base attempt. `post_hnf_acceptance.py` and the regulator modules
cover the diagnostic arithmetic and decisions, not all outer resumptions.

For a bounded first successful path, a faithful reported frontier on a
required retry is acceptable; silently returning the current quotient is
not. Complete general success needs source cache repair, retry and precision
reinitialization. The eager `h*invhr` bridge is documented as diagnostic:
equal-work timing must restore its placement after the unchanged-cache gate.

If `KCZ2 > KCZ`, pristine `be_honest` at 2801–2865 requires the excluded
prime-ideal checks before accepted class invariants are final under the
experiment's assumptions. Dependencies are orbit selection (`pr_orbit_fill`
when automorphisms exist), `pr_hnf`, `pr_norm`, `Fincke_Pohst_ideal` in
no-relation-cache mode, and failed-test random prime-power products,
`Q_primpart`, `idealred`, determinant and source retry limits. Existing
ideal HNF, power/product and enumeration ports are useful components, not
an already implemented honesty entry. `F.KCZ` mutation/restoration on
success/failure also matters. Do not prioritize this branch before measuring
whether the selected default endpoint enters it.

## Abstract invariants are not returned PARI generators/maps

`class_group_gen` at pristine buch2.c:3115–3156 does considerably more:

| Source work | Existing coverage / missing boundary |
| --- | --- |
| `ZM_snfall(W,&U,&V)`, `UWV=D` | No bench source Smith port found; one-by-one positive HNF is a tiny initial source path. General HNF diagonal entries are not Smith invariants. |
| `ZM_inv(U,NULL)` | Regulator inverse handles a different scalar dispatch. Exact unimodular inversion is not automatically covered; upstream has direct 1×1/2×2 branches. |
| `ZM_hnfdivrem(U,D,&Y)` and `(Ui,W,&X)` | Missing exact rounded quotient/remainder transformation entry (`ZV.c:1202` calls `ZC_hnfremdiv`). |
| `genback` for each generator | Missing extended ideal product/reduction chain: `idealpowred`, `idealHNF_mulred`, factored principal multiplier. Ordinary positive prime-power HNF alone is not this. |
| `nf_cxlog` of multipliers | Existing weighted relation-log machinery covers components, but not necessarily factored `genback` multipliers. |
| `M1/M2`, `get_clg2` | Exact products plus archimedean actions assemble principal-ideal maps. No complete source entry found. |

For field 1, after true acceptance, `[3]` makes the algebraic group order
and invariant list `[3]` immediate. Returning a factor-base ideal as a
generator with retained provenance is a separate, useful endpoint, but
matching PARI's *reduced* generator and maps requires the above work.

## Units: no hidden class-only flag shortcut in Buchall

Pristine buch2.c:4142–4186 performs unit work **unconditionally**.
The `flag` controls extra exact S-unit/relation tracking, not whether the
unit-log reduction/getfu block runs. There is therefore no justification
for saying `bnfinit(...,0)` skips all unit computation.

For a full source BNF return the missing chain includes:
`extract_full_lattice` (now ported), rectangular `ZM_lll(L,.99,LLL_IM)`,
floating `lll(real_i(A)*U)`, `cleanarchunit`, `get_regulator`, and `getfu`.
Existing LLL preparation ports are primarily degree-sized integer basis
segments and cannot be assumed to cover wide unit-coordinate matrices or
the floating-unit LLL dispatch. `getfu` also needs real/complex exponentials,
real-imaginary solve, integer reconstruction, `zk_inv` checks and norm-based
normalization. It may return `not_given` when source says so; successful
class invariants need not imply expanded units were returned.

## Ranked next tasks

1. **Genuine default base and analytic normalization → existing acceptance.**
   This removes the most consequential outstanding mathematical-policy
   preparation. Reuse `initial_base`; first target an accepted abstract
   class-number/invariant endpoint, honestly labeled upstream-assumed.
2. **Resident outer driver and first-pass success comparison.** Preserve
   native produced owners, source ordering and stop points; report missing
   retry cases explicitly. Compare the same narrower endpoint in PARI,
   not a full BNF/unit/map call against a class-number-only port.
3. **Source Smith transformation and reduced-generator path.** Start with
   observed matrix dimensions, then generalize; preserve transformation
   identities, actual ideal witnesses and principal relation provenance.
4. **Unit-output and BNF-map completion**, or honesty when an actual selected
   policy requires it. These are necessary for a full BNF claim, but should
   not delay demonstrating the first genuine-policy abstract class group.

No timings, mathematical certificates, or completed whole-engine results
were produced by this audit.
