# Row 14 raw-relation Smith proof gap

The fresh row-14 result retains substantially more raw Smith evidence than the
initial output-v2 assessment exposed.  From its authenticated owners one can
construct, with no new mathematical assumption:

- the complete `806 x 799` Smith diagonal, with 797 copies of 1 followed by 8
  and 24;
- the complete unimodular `799 x 799` right transform, using the retained
  terminal permutation, `796 x 3` `B` block, and the exact Smith decomposition
  of the authentic `3 x 3` class block; and
- ten exact rows of the final `806 x 806` left transform: the three normalized
  class rows and seven relation-kernel rows.

The checker multiplies those ten full-size rows through the authentic sparse
`806 x 799` relation matrix and the reconstructed right transform, checking all
7,990 corresponding cells of `U R V = D`.

The exact smallest missing owner is not another small Smith calculation.  It
is the other 796 rows of the square left ancestry, i.e. 641,576 integer
coefficients.  The production `hnfspec`/`hnfadd` run computed these ancestry
columns transiently but deliberately retained only seven kernel columns and
three class columns.  A future producer must retain or regenerate final HNF
ancestry columns 10 through 805.  Until then, a complete raw Smith identity
must remain false; the valid `3 x 3` presentation may not be relabelled as it.

A generic reconstruction is not an acceptable substitute under the plan's
resource envelope.  On this exact authenticated matrix, both
`matrixSmith(R)` and `matrixHermiteTransform(R)` in the existing FLINT adapter
exhausted the 4 GiB address-space limit after roughly 34 seconds because of
coefficient swell.  This is diagnostic evidence only, not a timing claim.  It
also explains why regeneration should use the existing staged production
ancestry rather than a generic dense transform.

Run:

```bash
node bench/pari-class-group-port/check_row14_raw_relation_smith_gap.cjs \
  /scratch/sagejs-row14-fresh-registry-7wM3U3/\
row14-prepared-complete-edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2.json
```
