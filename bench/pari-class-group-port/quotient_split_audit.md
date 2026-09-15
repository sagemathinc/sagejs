# Etale quotient splitting dependency

This translates PARI 2.17.4 `base2.c:primedec_aux` from the quotient
projection through the child-image loop, followed by its LIFO worklist.
It uses the already pinned archive and its literal source blocks in independent
PARI-only controls. It does not translate Kummer-factor selection or
`primedec_end` and is not a complete prime decomposition or class-group entry.

The one-step entry lifts the second projected Frobenius-kernel vector with
exact integer dot products, builds `zk_multable` columns before reduction,
projects that multiplication matrix, computes the source power dependence,
finds its roots and forms image ideals. Intermediate values, not just ideals
up to equivalence, are compared to PARI. The recursive entry preserves
ascending child insertion, LIFO processing and reverse publication when the
number of roots equals the number of components. Completed children are not
projected again. The already-field case publishes H directly.

All owners are disjoint and remain resident. Explicit fixed-capacity packed
copies replace PARI shallow references; this is a representation difference,
not a claim of equal memory traffic or allocation cost. Each pending/final
ideal has n² capacity and at most n slots are needed in degree n. The entry
supports degrees three and four, with the existing small-prime arithmetic
corridor. Higher-degree root splitting currently supports primes at most 37;
degree-at-most-two odd-prime roots retain their separately documented broader
corridor and nonresidue-search frontier. These bounds are explicit experiment
coverage, not changes to upstream mathematical bounds.

## Signed basis correction

PARI `FpM_image`/`FpM_suppl` reduce a private matrix for pivot selection but
return original columns. The shared basis helper previously required reduced
inputs and projection reduced H before calling it. Both are corrected:
signed/unreduced originals survive, private pivot entries are reduced.
The basis checker now passes 4,608 PARI/CPython/JavaScript/GMP/tagged cases,
including 2,304 signed controls, with exact original output columns.
Receipt: `/tmp/sagejs-small-prime-basis-Hnlz8t/fixtures.json`.

This distinction is exercised by actual recursive input, not just synthetic
matrices. For field 3 at p=37, the initial quotient has three components but
the first polynomial has two roots, 4 and 33. The last-pushed signed child
starts with -33 and splits at roots 15 and 32; those children are published
in order 32,15, followed by the other original child. Two real signed H
visits are present in the literal source oracle.

## Root dependency and review

`small_prime_polynomial_roots.py` translates the degree-three/four small-prime
root branch, including square/nonsquare separation, deterministic x+k queue,
binary parity handling and source sorting. It uses 244 scratch entries and
requires four output slots even for cubic calls. The outer step checks that
requirement before any write. Root qualification passes 3,134 cases in all
four execution modes, including monic polynomials, repeated roots, supported
primes through 37 and degree-two forwarding at 101.
Final receipt: `/tmp/sagejs-small-polynomial-roots-TimUz8/fixtures.json`.
Independent source review found a simplified inv*1 reduction in monomial
division; the explicit source multiplication/reduction is restored in this
receipt. No correctness or workspace blocker remained in that review.

The single-step checker passes all 24 field/prime inputs, then all 26 visits
of the recursive oracle, including the signed children. It compares element,
multiplication matrix, projected matrix, polynomial, roots and child bases,
owner tails, input preservation and preflight failures.
Final receipt: `/tmp/sagejs-quotient-split-40CixJ/fixtures.json`.
Core SHA-256:
`13513d929ebd1c1e9a0825915a9a8921f2ab3d5c3f7cff5d4d21f4119d7efc14`.
This final `parallel:run` replay records source provenance but did not apply
an address-space wrapper; capped qualification is the connected run below.
The initial compile/check consumed 48.77 CPU seconds with 405664 KiB peak
child RSS. This is correctness qualification, not a paired performance sample.

Final recursive qualification passes 24 cases and 26 visits in all four
execution modes: `/tmp/sagejs-quotient-recursive-U70frQ/fixtures.json`.
Core SHA-256:
`18d25a91e83e9caa76e6fe53060d3731245a4eef9310e830083fbe90d3f252ee`.
It also compares CPython's exact visited-H sequence to the PARI trace and
checks every native owner's final contents against CPython, exact PARI final
images/order, immutable inputs, sentinel tails and short-owner atomic guards.
The checker requires a genuine partial split so future fixture edits cannot
silently remove recursion coverage. Independent review confirmed the stack
indices, reverse publication and partial-prefix error-state protocol.
The final compile/replay used 52.21 CPU seconds, peak child RSS 406968 KiB,
under the 4 GiB cap. Native per-visit instrumentation is not claimed.

Strict library checking passes (403 configured modules, zero errors/warnings).
The broader changed-file run passes merge invariants then fails at the known
module-cache `ReferenceError: $ρσ$py$Any is not defined`; unscheduled siblings
are not passes. The architecture gate still fails on its pre-existing stale
optimizer manifest. No gate waiver or manifest refresh is included here.

Reproduce under `meter_command.py`, one thread, 4 GiB address cap:

```sh
node bench/pari-class-group-port/check_quotient_split.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz --recursive-visits
node bench/pari-class-group-port/check_quotient_split_recursive.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```

## Remaining boundary

Current fixtures start from the full radical, not the Kummer-removed ideal.
Actual polynomial factors, Kummer selection/removal, descriptor construction,
embedding preparation and composition into the resident class-group driver
remain. No prepared-`nfinit` completion or whole-engine speed claim follows
from this dependency checkpoint. Production defaults and proof status are
unchanged.
