# Row 19 raw-relation Smith proof

The retained row-19 state is sufficient to prove a Smith presentation for the
actual 430-by-424 raw relation matrix; no 9-by-9 matrix is relabelled.

Let `R` be the raw relation matrix and let `T` be the retained 430-by-430
principal-relation ancestry. Exact sparse replay proves

```text
T^t R P^t = [ 0   0 ]
              [ W^t 0 ]
              [ B^t I ]
```

with six zero rows, the authentic 9-by-9 terminal class block, and a
415-by-415 identity block. Here `P` is the retained factor-base permutation.
The existing exact Smith machinery already supplies `U W V = D`. Explicit
block operations clear `B`, apply `V^t` and `U^t`, put the identity block
first, normalize the class diagonal, and put the six dependencies last. This
constructs full matrices of shapes 430-by-430, 424-by-424, and 430-by-424 and
proves `U_raw R V_raw = D_raw`.

The diagonal is 415 copies of 1 followed by eight copies of 3 and one copy of
6. Its nontrivial product is 39366. The checker independently replays every
cell of the retained ancestry factorization from the raw sparse relations,
replays the exact small Smith identity, authenticates the full emitted matrix
hashes, and rejects source mutation. This is an exact output proof, not a
timing claim or an independent certification of PARI's assumed bounds.

Run:

```bash
node bench/pari-class-group-port/check_row19_raw_relation_smith_proof.cjs \
  /scratch/sagejs-row19-fresh-transaction-check/row19-class-unit-result-a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66.json
```
