# Live root controls without answer-derived bounds

## Removed controls

The resident generated-root checker previously set its generic factor-base
workspace width `K` to `capacities.relation`, a length inherited from the old
successful fixture. Zeroing that workspace removed answer *values*, but the
observed answer still selected its allocation size.

The detached unit experiment also jumped directly from the resident 192-bit
failure to `bnfnewprec(..., 2048)`, whose successful objects have 2,176-bit
logs and a 2,240-bit embedding entry. That is useful differential evidence,
but it is not a valid live retry controller: the successful target was chosen
before executing intermediate attempts.

## Capacity policy

The caller now bounds factor-base owners by

```text
catalog slots = degree * live prime count
```

Every selected prime ideal is emitted from one catalog slot, so the selected
factor-base size is at most this quantity. For the authentic cubic the live
inputs have degree 3 and 1,230 primes, giving capacity 3,690 independently of
the observed `KC = 66`. The optional padding control adds seven unused slots
after deriving this bound.

`pari_live_root_capacity_policy` also publishes the conservative PARI relation
cache formula `10*(slots+additional)+50`. This is a capacity ceiling, not an
acceptance condition. Resource exhaustion remains an explicit error.

## Retry policy

`pari_live_retry_transition` implements one transition only after receiving a
live failure:

- reason 3 (`fupb_PRECI`) uses PARI 2.17.4 `myprecdbl`: double below 1,280
  bits, otherwise multiply by 1.5, with the source's flagged arch-exponent
  adjustment;
- reason 4 uses the `cleanarch` rule based on the live arch exponent and live
  input precision, with at least one additional storage word.

The returned capacity is rounded to the 64-bit packed-real storage used by the
translated kernels. A caller must execute that attempt and feed its new status
back into the policy. The policy contains no terminal precision, no iteration
count aimed at 2,176 bits, and no success predicate.

The authentic first cleanarch failure therefore derives 256 bits from live
state `(current=192, exponent=10, input_precision=64)`. It does **not** jump to
the known successful result. The current branch does not yet connect all
precision-dependent logarithm/getfu leaves into that iterative root, so it
makes no terminal-precision or end-to-end completion claim.

## Evidence

The focused checker pins the PARI 2.17.4 archive and `buch2.c` hashes, checks
the source forms of `myprecdbl`, the PRECI transition, the cleanarch increment,
and the relation-cache heuristic, then exercises the same ordinary Python
source under CPython, generated JavaScript, GMP, and tagged backends.

The existing resident-root checker now allocates all factor-base-shaped owners
from the live catalog bound. It no longer reads `capacities.relation` when
selecting `K`. Other historical scratch owners noted in its earlier audit are
still experimental resource caps and are not silently promoted to general
bounds by this change.
