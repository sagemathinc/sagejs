# Row 14 unqualified paired diagnostic

This runner is an exploratory measurement, not Phase 6 qualification.  It
fixes the frozen row-14 sentinel and measures the authenticated prepared
`nfinit` boundary through the matched flag-zero class-and-unit projection.

Authentication, compilation, resident-handle construction, the private PARI
2.17.4 helper build, warmup, replay, hashing, and serialization occur outside
the retained clocks.  The retained schedule has seven alternating AB/BA pairs,
one fresh computation per arm, and at least one second per arm.  The process
must be pinned to exactly one CPU and the OpenMP, OpenBLAS, and MKL thread
variables must all equal one.

The receipt hardcodes:

- `diagnosticOnly: true`;
- `qualifiedTiming: false`;
- `finalTimingRun: false`;
- `ratioClaimPublished: false`;
- `outcomeClaim: null`;
- zero reserve fields opened.

Sage's seven existing mutually exclusive leaves close exactly to its inclusive
root.  PARI remains a whole-root residual.  Consequently this evidence cannot
claim the four-way Phase 6 attribution: the current
`relationCollectionAndHnf` leaf crosses the required relation/HNF boundary.

The synthetic checker covers 14 arms and rejects ten mutations involving
qualification, reserves, order, duration, freshness, exact output identity,
stage closure, and attribution.  No real timing series has yet been run.
