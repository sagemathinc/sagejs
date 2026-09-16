# CUP integration into the initial integer rank prefix

Read-only audit of the PARI 2.17.4 boundary; no performance claim. Reference
archive SHA256:
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
Paths and line numbers below refer to that release source. This is an extension
of the existing bounded prefix, not a proposal to accept probable rank.

## Exact dispatch and prime schedule

`src/basemath/Flv.c:250,840–845` selects CUP precisely when **both** matrix
dimensions are at least 8. Smaller rectangles use `Flm_gauss_pivot`.
`Flm_pivots_CUP` at 827–837 obtains rank and the row/column permutations from
`Flm_CUP_pre`, then initializes a zero pivot vector of column length and sets
`d[P[i]] = R[i]` for `i=1,...,rank`. Both indices are one-based. Returning
only a numerical rank is not sufficient for the subsequent row-rank profile.

The separate integer-level schedule in `src/basemath/alglin1.c:3805–3864`
uses `nn=min(rows,columns)`. Its loop starts at `i=0`, tests the current prime,
then breaks when `i >= imax`. Therefore:

| Smallest dimension | Modular algorithm | imax | Maximum initial trials |
| --- | --- | --- | --- |
| 1–7 | Gaussian | 1 | 2 |
| 8–15 | CUP | 1 | 2 |
| 16–63 | CUP | 2 | 3 |
| 64 and above | CUP | 3 | 4 |

Empty/all-zero matrices return before this schedule. Maximal rank can also
return after any individual trial.

On the pinned 64-bit build, `src/language/forprime.c:785–820` initializes the
small modular sieve at `2^31+1`. The first four primes, in exact source order,
are:

```text
2147483659, 2147483693, 2147483713, 2147483743
```

An independent integer trial-division enumeration starting at `2147483649`
verified these values (0.043852 metered child CPU seconds). All divisions and
products in that diagnostic are exact JavaScript integers below `2^53`.
The integration checker should additionally assert the first four values from
PARI's actual `init_modular_small`/`u_forprime_next`, as its earlier checker
implicitly did for the first two. These constants describe this 64-bit
experiment, not the distinct 32-bit source schedule.

## Smallest safe implementation change

The current `hnfspec_rank_prefix.py:78–104` intentionally stops before CUP and
runs exactly two trials. Removing that stop alone is insufficient.

1. Dispatch to the literal CUP pivot wrapper at the source threshold. Keep
   the Gaussian path for smaller rectangles, including its existing mutation
   contract. CUP need not leave the same scratch-matrix mutation as Gaussian;
   compare each path with its own source behavior.
2. Extend the loop to `range(imax + 1)` and select the four pinned primes in
   order. Recompute residues from the original integer matrix each trial.
3. Preserve the exact early acceptance condition
   `nullity == max(number_of_exact_zero_columns, columns - rows)`.
4. Preserve **strict** best improvement, including the matching pivot vector.
   A later worse or equal result must not replace `best`. A nonzero original
   matrix divisible by all visited primes may leave `has_dbest=0`; that is
   not an invitation to manufacture a profile.
5. At schedule exhaustion return the existing explicit `-1` verification
   frontier. Do not turn repeated modular agreement into certification.
   Keep the output profile untouched and its state dimensions at `-1`.

The early acceptance is rigorous: reduction modulo a prime cannot increase
rank over Q, while the row count and exact zero columns give the stated
upper bound on rank over Q. Equality closes both bounds. This certifies rank
and the source pivot profile, not the complete HNF or class group.

Known input owner capacities should be checked before entering the fused
cleanup pipeline. CUP capacity may instead be checked against the actual
reduced dimensions after cleanup to avoid reserving worst-case original-size
storage; that late failure must explicitly leave a partial checkpoint and
must not promise atomic rejection. Coordinate the CUP workspace capacity
formula with its owner; the existing rank signature does not have the
additional recursive owners. Do not silently allocate an
unbounded alternate decomposition or substitute Gaussian elimination on CUP
shapes under an equal-work claim.

## What remains after the modular prefix

The genuine lower-rank branch is `alglin1.c:3844–3861`:

1. `indexrank_all(m,n,rbest,dbest)` completes row and column permutations.
   Its implementation at 4370–4375 calls `indexrank0` and `perm_complete`.
2. Permute the original integer matrix, and transpose if columns exceed rows.
3. Split independent/dependent columns at `rk = columns-rbest`; extract the
   leading square block and solve with **exact** `ZM_gauss`.
4. Clear denominators via `Q_remove_denom`; multiply the remaining right-hand
   side by that common denominator when present.
5. Verify exact matrix equality `ZM_mul(M,X) == RHS`. Only then return the
   saved pivot profile.
6. If equality fails, continue the **same** prime iterator. In this second
   phase, stop the modular loop only upon a strict improvement of `rbest`
   (or maximal-rank early exit), then repeat exact verification.

Consequently, four pinned primes suffice for the initial prefix only. They
cannot implement the complete retrying `ZM_pivots` algorithm. The rational
solve/denominator/retry boundary should remain explicit until translated and
tested; a generic rational solver may be mathematically adequate but would
need a separate source-work-equivalence account.

## Regression cases before integration

- Shapes around 7/8, 15/16, and 63/64, in both tall and wide orientations.
- CUP matrices with first recursive block of rank zero, column swaps, and
  nontrivial second-block rank. Compare the complete pivot vector, not rank
  alone.
- Full-rank diagonal matrices with one entry divisible by the first one,
  first two, or first three schedule primes: acceptance should occur at
  trials 2, 3, or 4 when the dimension schedule permits.
- Permanently deficient matrices to consume all `imax+1` trials and return
  the verification frontier. Check that output profiles remain untouched.
- Better-then-worse modular ranks, all-zero input, and nonzero matrices
  vanishing modulo every initial prime; verify `has_dbest` ownership.
- A resident cleanup output that genuinely crosses into CUP, rather than
  only direct synthetic matrix inputs; compare source profile and downstream
  HNF state at the successful prefix boundary.

This audit modifies neither the rank source nor the compiler. It does not
claim the rational-verification branch or full HNF is implemented.
