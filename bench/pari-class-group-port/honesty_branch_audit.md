# Bounded unequal-bound honesty audit

This lane audits the pinned PARI 2.17.4 `be_honest` routine and implements the
smallest real unequal-bound retry cut that the existing Sage.js translation can
close without replacing mathematics by an answer fixture.

The authority is `src/basemath/buch2.c:2800-2865` from the pinned archive:

- archive SHA-256
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `buch2.c` SHA-256
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

PARI copyright and GPL-2.0-or-later terms apply to the translated routines.

## What the source actually does

For every rational prime index `iz` from `KCZ+1` through `KCZ2`, PARI:

1. removes the final unramified prime ideal over `p` from the check;
2. optionally collapses prime ideals by `pr_orbit_fill`;
3. constructs `id0=pr_hnf(P)` and `Nid=pr_norm(P)`;
4. invokes `Fincke_Pohst_ideal` with a null relation cache;
5. after each failed probe, up to `maxtry_HONEST=50`, resets to `id0`, draws
   one `random_bits(4)` exponent per subfactor prime, multiplies by each
   nonzero prime power, takes `Q_primpart` when needed, conditionally runs
   `idealred`, and recomputes the triangular determinant;
6. returns failure immediately after probe 51, otherwise temporarily increments
   `KCZ` for each checked rational prime and restores the original `KCZ` only
   after complete success.

Thus an equal-bound case is not evidence for this branch. Supplying a Boolean
"probe passed" answer is not a faithful replacement for its ideal arithmetic.

## Frozen unequal-bound fixture

`honesty_branch_fixture.json` is regenerated and checked by
`check_honesty_branch.cjs` from pristine PARI source. It uses the already
declared tuning field

```text
x^3 - 20018*x + 20034
```

with deliberately distinct relation/checking bounds `C1=5`, `C2=31` and
`setrand(1)`. PARI computes, rather than receives:

- `KC=3`, `KCZ=2`, `KCZ2=9`;
- one subfactor prime, the degree-one prime above 3;
- no nonidentity automorphism;
- the checked prime ideal above 11 and its HNF;
- 51 failed no-cache Fincke--Pohst probes;
- 50 exact four-bit exponents and 50 exact retry ideals;
- final failure with `KCZ=2` and no 51st random draw.

The fixture retains the 51 exact determinant norms, an exact transcript hash
of all 51 ideal HNFs, all 50 exponents, hashes of every resident RNG checkpoint,
the complete raw trace hash, and the exact
field multiplication/ideal/prime data needed to replay the retry arithmetic.
It is a correctness fixture, never a timing input or class-group answer.

## Implemented cut

`honesty_branch.py` adds two ordinary CPython-parseable functions:

- `pari_honesty_random_powers` translates `random_bits(4)` using the existing
  resident XORGEN4096 state. Starting from the actual PARI state at the honesty
  boundary, it reproduces all 50 exponents exactly.
- `pari_honesty_retry_ideal` translates the fixture's positive-prime-power
  `idealmulpowprime` branch. It computes the prime power in two-element form,
  constructs the multiplication table, removes/restores rational content,
  performs the composite-modulus HNF product, and returns the triangular
  determinant. Starting from `id0` on every retry, it reproduces all 50 PARI
  norms exactly.

Both functions have the same dynamic Python body and source-transparent native
body. The checker compares CPython, generated JavaScript, native GMP, and
tagged execution with the pristine source fixture. Invalid retry counts,
exponents, and storage fail before publication.

## Existing dependency map

| PARI dependency | Sage.js source-transparent component | Status for this cut |
| --- | --- | --- |
| `random_bits(4)` | `pari_random.py`, `pari_honesty_random_powers` | exact |
| `pr_hnf`, `pr_norm` | `prime_ideal_hnf.py`, prepared descriptor norm | available |
| `idealpowprime` positive branch | `prime_ideal_power.py` | exact for exponents 1--15 |
| `idealmulpowprime` HNF product | `composite_ideal_hnf.py`, retry adapter | exact for fixture |
| `Q_primitive_part` / content restore | `pari_integral_ideal_mul_two` | exact for fixture |
| triangular determinant | direct exact diagonal product | exact |
| no-cache `Fincke_Pohst_ideal` | `unreduced_ideal_collector.py` with `nrelid=0` | component exists, not yet connected here |
| `pr_orbit_fill` | no resident honesty-orbit driver | missing |
| `idealred` after `expi(id[1,1])>100` | ranked preparation is not an ideal-reduction output | missing |
| temporary `KCZ` mutation and complete-success restore | resumable driver currently stops at `-206` | missing |

## Deliberate stopping boundary

This is not a complete `be_honest` implementation and must not replace the
`-206` frontier in `prepared_class_group_resumable.py`. The frozen case closes
the actual RNG and retry-ideal arithmetic, but its probes all fail. A complete
resident branch still needs:

1. a transactional scheduler that connects each freshly prepared retry ideal
   to the existing no-cache Fincke--Pohst graph and resets all probe owners;
2. automorphism-orbit selection for fields with nontrivial automorphisms;
3. the conditional exact `idealred` result path;
4. a second unequal-bound fixture that succeeds and therefore exercises the
   temporary `KCZ` increments and final restoration.

No equal-bound skip, prepared success bit, precomputed retry ideal, or inferred
class-group answer was substituted. This bounded cut should be integrated as a
dependency for the later resident honesty driver, not advertised as Phase 5
completion by itself.
