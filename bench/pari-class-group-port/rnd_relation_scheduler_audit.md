# PARI random-relation resident scheduler audit

This lane closes the scheduling and random-ideal prefix immediately before
PARI 2.17.4 `rnd_rel`. It does not claim the inner Fincke--Pohst collection or
the final class-group driver.

## Frozen source corridor

- `buch2.c:301-344`: `subFB_change`
- `buch2.c:2635-2677`: `get_random_ideal` and `rnd_rel`
- `buch2.c:3946-3970`: dependency trials, subfactor rotation/growth, restart,
  the `rnd_rel` call, and publication of `F.L_jid = F.perm`

The fixture is regenerated from the pristine PARI 2.17.4 release archive and
checks its `buch2.c` SHA-256 before compilation. Its polynomial, bounds,
precision, seed, and scheduler entry state are declared before execution. It
is not selected from a successful answer. On the prepared quartic
`x^4-2000022*x-2000042`, the literal source branch grows the resident
subfactor base from `[4,6]` to `[4,6,2]`, consumes the three four-bit draws
`[14,0,14]`, and constructs the committed non-scalar ideal HNF.

## Implemented boundary

`pari_begin_random_relation_schedule` owns the exact `nreldep`, `sfb_trials`,
`sfb_chg`, rotation/growth, restart, and dependency-limit mutations. The
current subfactor owner has factor-base capacity, so growth does not allocate.
It suspends with status 1 immediately where source calls `rnd_rel`.

`pari_random_subfactor_ideal` translates `get_random_ideal`: one XORGEN draw
per live subfactor on every attempt, zero powers skipped, positive prime
powers multiplied in order, and empty or scalar products retried. The field
basis table and prime descriptors are mathematical inputs; powered ideals are
not supplied as answers. All HNF storage is caller-owned and reusable.

`pari_finish_random_relation_schedule` performs only the source assignment
`F.L_jid = F.perm`. The checker keeps representative relation-cache and HNF
owners resident across begin, random ideal preparation, and finish, and checks
they remain bit-for-bit unchanged. Their mutation belongs to the suspended
collector, not this source corridor.

## Exact checks

- pristine PARI source regenerates the committed branch fixture;
- ordinary CPython reproduces scheduler state, subfactor growth, RNG state,
  exponents, random ideal HNF, and final search permutation;
- JavaScript and GMP native backends reproduce the same objects;
- short output and malformed permutation controls fail before RNG or
  scheduler mutation;
- the source branch fixture includes an actual zero exponent while retaining
  exact draw count and order.

## Remaining scheduler gaps

1. Connect `R * P[j]` and `Fincke_Pohst_ideal(..., RND_REL_RELPID, ex, ...)`
   for every live search ideal to the existing prepared collector.
2. Let those random relations mutate the resident cache, then feed their
   exact appended columns through the existing HNF continuation.
3. Join this suspension boundary to the shared final driver after the
   `small_norm` path; this lane intentionally does not edit that shared file.
4. Exercise natural repeated random-relation calls, `sfb_CHANGE`, exhausted
   subfactor growth, and factor-base restart in a complete field run.
5. Remove the inherited composite-HNF modulus-below-`2**64` frontier for
   larger random products.

These are explicit follow-on corridors. No fallback, weakened acceptance
criterion, or answer-derived runtime input is hidden here.
