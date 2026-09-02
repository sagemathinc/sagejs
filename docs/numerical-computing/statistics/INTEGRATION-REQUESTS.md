# Statistics integration record

> Historical handoff, resolved during P5 integration.

The statistics package now has live capability registration, lazy package-graph
ownership, strict Pyright coverage, and test discovery through
`pnpm test:numerics`. Its canonical public API remains
`sagejs.numerics.statistics`; selected names were not flattened into the
parent package merely to satisfy the original lane handoff.

The checked fixtures and product corpus use independent identities, pinned
SciPy references, distribution identities, metamorphic checks, residuals, and
failure cases. `test/numerics/statistics/oracle.R` remains a useful secondary
oracle source for future campaigns; an unexecuted R source is not represented
as a retained release receipt and is not required to claim the currently
supported surface.

There is no active shared integration request in this file. New statistics
claims must extend the package-local capability matrix and executable evidence
before entering the generated surface.
