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

## Historical blocker and closure

The first version of this audit stopped honestly at the degree-five ranked
preparation boundary: integer rank, LLL selection, FLATTER, and ranked-basis
code accepted only degrees three and four. That blocker has since been closed.

`check_honesty_success_live_first_probe.cjs` now sends only prepared field,
factor-base, ideal, and scheduler owners to the Sage-side computation. The
translated degree-five collector computes all six successful observations
afresh, and the translated scheduler consumes them without receiving PARI's
status vector or frozen branch answers. Exact attempt counts are
`[35,157,41,1,3,23]`; all six statuses are one, three transient `KCZ`
increments occur, and the terminal path restores `KCZ` from six to three.

The connected checker retains the earlier transactional rejection controls and
adds a failed-observation mutation proving that scheduler progress depends on
the live collector result. See `honesty_success_live_first_probe_audit.md` for
the authenticated source hashes, native backend checks, and remaining scope:
this closes the selected unequal-bound immediate-success path, not general
automorphism or failure/retry honesty.
