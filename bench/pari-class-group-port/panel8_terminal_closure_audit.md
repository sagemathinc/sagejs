# Panel-8 terminal relation closure

`panel8_terminal_closure.py` closes the exact relation presentation at the
accepted row-8 retry boundary.  It does not turn C6's authentic `PRECI`
outcome into units or public completion.

The replay follows the observed PARI 2.17.4 source schedule: one 143-by-150
`hnfspec` computation and two one-column `hnfadd` calls.  All three packed-log
outputs are compared with the independently accepted retry owner.  The local
HNF transformations are then traversed backwards, as in the existing field-3
retention path, to obtain a column-major source-order transform `T` of shape
152-by-9.  Reversing all terminal columns and undoing the terminal factor-base
permutation also produces a compact 152-by-143 right inverse `Q`.  The owner
checks every cell of `R*T = 0` and `R*Q = I_143` before publication.

The authenticated W0 contributes prepared field data and witnesses, not a
terminal answer.  Its multiplication tensor and 143 prime descriptors
reconstruct every factor-base ideal.  The accepted owner's independently
computed relation matrix and principal generators must agree cell-for-cell
with W0's 152 source relation witnesses.  Exact quartic ideal multiplication
then proves all 152 principal ideal equalities; determinant norms independently
prove the corresponding 152 norm equalities.

The coordinator authenticates immutable accepted, C5, and C6 owners, the W0
digest, and the prepared-number-field authority.  C5 and C6 digests are
injected command-line inputs.  Publication is atomic, idempotent, mode 0444,
and content addressed.  The focused checker performs two cold replays, checks
the full `RT` and `RQ` equations again in JavaScript, and rejects mutations of
`T`, `Q`, `R`, a factor ideal, a principal generator, the W0 tensor, C5 unit
state, C6 ancestry, and an upstream digest.  The emitted assumptions retain
`publicCompletion: false` and `c6Materialization: "not_given(PRECI)"`.
