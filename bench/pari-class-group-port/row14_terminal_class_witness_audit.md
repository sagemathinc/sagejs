# Row 14 terminal class-witness boundary

This cut implements the exact terminal quotient and minimal-order verifier for
the mixed quartic `x^4 - 200000002*x - 200000002`. It proves orders 24 and 8
by testing every positive multiple below the claimed order for membership in
the live three-column presentation. It also checks the presentation's Smith
minor gcds and all 192 combinations of the two mapped quotient vectors, so
the generators are independent and exhaust the quotient. The resulting presentation relations are
then transported through the live raw-to-presentation transform and replayed
against all 799 factor-base coordinates.

The input contract is intentionally fail-closed. It requires the future live
806-relation owner to retain the raw relation matrix, the 799-by-3 factor map,
the 806-by-3 raw transform, and a nonempty compact principal factorization for
every raw relation. The output principal witnesses are signed products of
those retained factorizations; they are not expanded, and no approximate
`getfu` result is involved.

The original focused checker uses generated protocol data to establish the
matrix orientation, the exact relations `(1, 0, 0)` and `(0, 1, -4)`, all 32
minimality checks, 192 independence checks, and rejection of mutations to
every evidence boundary.  The later terminal coordinator now supplies the
authentic input that checker was waiting for:

- `row14_terminal_class_witness_coordinator.cjs` re-executes the source
  `hnfspec`/`hnfadd` schedule at 802, 804, 805, and 806 columns;
- `relation_column_ancestry.cjs` reverses the actual cleanup and HNF column
  operations only for the seven unit-kernel and three presentation columns;
- every integer identity is replayed against the complete 799-by-806 raw
  relation matrix, rather than recovering a new answer with a generic HNF;
- each source-stage packed-log owner is authenticated in the order in which
  the source computed it.  Packed logarithms are path-dependent, so a
  one-shot raw transform is deliberately not treated as log authority;
- `row14_terminal_class_owner.py` authenticates all 806 principal equations,
  the 799 factor-base ideals and their multiplication table, and then invokes
  the exact quotient/order verifier from this cut.

The final hardened capped replay published immutable owner
`c9186b96f7c4845957ad4e6bb002a1d00862f95a4ed26a8d242ed07ce36fb47f`.
It records 4,858 nonzero raw relation entries, 4,962 checked ideal products,
and maximum raw exponent 10.  The order-24 and order-8 witnesses use 617 and
621 signed source-relation factors respectively.  Publication is idempotent
and the resulting 370,211-byte file is mode `0444`.  The owner validates the
complete staged packed-log provenance against the accepted owner's checkpoint
hashes and rejects eight coordinated provenance mutations before publication.

The final cached coordinator took 27.269 seconds and sampled 651,196 KiB
maximum RSS under a 4-GiB address-space/RSS cap.  The first fresh-cache
initial-HNF audit took 65.624 seconds at 673,104 KiB and reconstructed all
three published 802-column outputs.  Stage-local audits then replayed:

- 802 to 804: shape `(5,2,5,792)`, four published columns, 23.099 seconds,
  637,108 KiB;
- 804 to 805: shape `(5,1,5,793)`, two published columns, 22.737 seconds,
  641,200 KiB;
- 805 to 806: shape `(3,0,3,796)`, three published columns, 24.166 seconds,
  638,004 KiB.

Each stage verifies both the local source operation and the fully composed raw
relation ancestry.  These are correctness/replay costs, not matched PARI
timings and not the relation-collection timing boundary.  The reproducible
entry point is:

```bash
node bench/pari-class-group-port/row14_terminal_class_witness_coordinator.cjs \
  ACCEPTED_OWNER.json.gz FACTOR_METADATA.json OUTPUT_DIRECTORY
```

Appending `--audit-initial` or `--audit-append-804`, `-805`, or `-806` runs the
corresponding stage-local proof without publishing a class owner.

Frozen W0 evidence was used only to map the expected source schema during
development. It is not read by the implementation or coordinator and supplies
no relation, transform, principal factor, or acceptance value.  The terminal
owner begins with the immutable accepted-relation owner produced by the live
row-14 collection/HNF path and the independently authenticated factor-base
metadata.  Its exact certification child uses ordinary CPython; all expensive
HNF ancestry arithmetic remains generated native code, while the child checks
quartic ideal/principal equations and composes the immutable evidence outside
the timed source kernel.  `publicComplete` remains `false`: PARI's analytic and
factor-base assumptions are still upstream assumptions rather than independent
Sage.js certification.
