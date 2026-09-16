# Frozen development panel: PARI language experiment

`panel.json` fixes 24 field identities before translation tuning: eight totally
real cubics, eight signature `(2, 1)` quartics, four complex cubics, and four
quintics. Sixteen are tuning inputs; eight marked `final-reserve` must remain
unused for port tuning and receive the final unchanged check. The reserves
comprise three real cubics, three mixed quartics, one complex cubic, and one
quintic. All 24 have original corpus role `development`; these are not M0
holdouts. The quintics include unit ranks two, three, and four.

The experiment's source and comparator target is **PARI 2.17.4**, overriding
the older version in the planning document. This panel contains **no new
timings**. Its historical PARI 2.15.4 discovery costs serve only to select
different difficulty strata. They are neither 2.17.4 baselines nor matched
prepared-field or translated-segment timings. No CAS was run to select this
panel, and no M0 timing host or running campaign was touched.

## Selection and coverage

The supplied existing coverage file was joined to the historical discovery-cost
summary by exact field ID, filtering to `role == "development"` before
selection. The rank-two choices span small discovery costs, intermediate costs,
and seconds-scale costs, with noncyclic groups and nontrivial equation-order
indices represented. Complex cubic controls include three small nontrivial
class groups and one large-discriminant historical seconds-scale example.
Quintic controls cover three signatures, nontrivial indices and a noncyclic
group. Selection did not depend on port success; no port results were available.

| Requested stratum | Frozen panel |
| --- | ---: |
| Nontrivial class group, at least 6 | 16 known |
| Noncyclic class group, at least 1 | 6 known |
| Equation-order index greater than 1, at least 2 | 8 known |
| Historical PARI cost above 1 second, at least 6 | 11 |
| Historical PARI cost above 10 seconds, at least 2 | 6 |

No requested numerical stratum is missing in the historical metadata. Two
quintics have no historical timing in this summary. The large complex cubic
has unknown class number and invariant factors in the coverage metadata.
Unknowns remain null: new PARI 2.17.4 reference runs must fill separate result
artifacts, not silently modify or replace the selected inputs. The panel does
not establish how many cases will remain seconds-scale for the new comparator
or selected segment. In particular, historical seconds-scale discovery costs
do not establish that an isolated translated segment is expensive.

Reference class numbers, invariant factors, discriminants and equation indices
are copied source metadata, not independent certificates. Invariant factors
retain the source ordering; comparisons should normalize ordering and remove
unit factors. The coefficient arrays are ascending, exact decimal integers.
Their stored polynomial hashes are copied from the coverage manifest. The
separate `coverage_line_sha256` hashes each exact original JSONL line without
its newline, preserving a direct extraction check.

## Source provenance and integrity

The two source artifacts listed and hashed in `panel.json` are relative to:

`/home/user/sagejs-worktrees/class-unit-rank-two-frontier/build/general-frontier/`

Individual historical discovery-report paths are relative to that same root.
The compact panel retains field source kind and URL where available, rather
than duplicating acquisition pools or raw measurements. No external acquisition
was needed. The 24 exact IDs and per-row phases in the JSON are the selection
authority; a later implementation must not reselect by sorting measured costs.

An initial header inspection of the combined coverage file displayed two
pre-existing holdout metadata rows incidentally. Neither was selected or used
for the panel; subsequent queries filtered development rows before displaying
or selecting candidates. No separate sealed holdout inputs or results were
opened, and no holdout computations were performed.

Verification checked exact source hashes, every selected source row and
polynomial hash, original development roles, coefficients, signatures, unit
ranks, distinct IDs and polynomials, group invariant products, the 8/8/4/4
degree/signature partition, the 16/8 split, and all reported coverage counts.
These are manifest consistency checks, not new mathematical verification or
benchmark qualification.
