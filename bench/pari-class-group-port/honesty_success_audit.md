# Quintic honesty collector audit

This lane tests whether the six successful observations used by the frozen
unequal-bound honesty fixture can be produced by the Sage.js collector rather
than copied from PARI's answer.

## Frozen identity and oracle

The input is performance-panel row 21,
`36 + 930*x - 305*x^2 - 90*x^3 + x^5`, with `C1 = 5` and `C2 = 31`.
`check_quintic_collector_fixture.cjs` builds a small oracle against pristine
PARI 2.17.4 and authenticates both the release archive and `buch2.c`. It calls
the actual `FBgen`, `subFBgen`, and `Fincke_Pohst_ideal` routines. The exact
schedule is `(11,1), (11,2), (11,3), (13,1), (29,1), (29,2)`; all six PARI
calls return success.

The exporter now provides the complete raw input accepted by
`pari_collect_unreduced_ideal`: prepared number-field matrices, factor-base
groups and offsets, prime ideals, norms, support product, prime tables, and
fresh disjoint workspaces. No scheduler observation is derived from the PARI
answer.

## Exact blocker

Each fresh CPython call reaches `pari_ranked_ideal_preparation`, which rejects
degree five with `ValueError("invalid ranked ideal preparation input")` before
executing a collector probe. The calls are transactional: every observable
input and workspace is byte-for-byte unchanged after rejection.

This is a connected primitive boundary, not one guard that can safely be
deleted:

- `ideal_ranked_preparation.py` rejects `n > 4`.
- `lll_rank.py::pari_initial_integer_rank` rejects `n > 4`.
- `lll_selection.py::pari_lll_select_full_rank` accepts only degrees 3 and 4.
- `flatter.py::pari_flatter` accepts only degrees 3 and 4.

Consequently the six inputs in `honesty_success.py` have **not** been replaced.
Doing so would make PARI's observed answers into runtime probe bits, violating
the experiment's independence requirement. Native compilation was not attempted
after the ordinary same-source Python path proved unable to enter the collector.

The next implementation unit is therefore a degree-5 generalization of the
ranked integer-rank, LLL selection, FLATTER, and ranked-basis graph, tested first
against the exported row-21 preparation. Only after that graph produces six
actual Sage.js collector observations may they be connected to the honesty
scheduler.
