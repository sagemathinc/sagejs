# Registered neighbors for the rank-pending cubic campaign

Recorded 2026-09-06 before executing these fields in Sage.js or PARI. Candidate
source is under validation and must be frozen by commit/runtime closure before
execution. This cohort is conditional on retaining target `3.1.12716.2`;
otherwise leave it unused and register a new protocol for the new target.

## Selection and exposure boundary

Use the same mathematical population and deterministic ordering as
[the earlier neighbor protocol](cubic-staged-neighbor-protocol.md): complex
cubics with class group $C_3$, equation-order index $3$ computed from the
polynomial discriminant, $10^4\leq |D_K|\leq10^5$, recorded regulator and
unconditional LMFDB class-group metadata. Order by distance from $12716$,
then absolute discriminant, then ASCII label; take twenty after exclusions.
No measured speed, native acceptance or regulator magnitude enters selection.

The original 1,412 labels were recovered with a labels-only projection of the
frozen SQL. In original discriminant/label order their SHA-256 equals the
manifest's `a355225b325352f6e14cf844f3677007be4a74278f69031e6ea66813d550b769`.
No old holdout polynomial or result records were opened for this recovery.
The union with the original exclusions and three additional labels reproduces
the previous 3,220-label digest exactly.

Conservatively also exclude all twenty previously registered neighbors,
regardless of whether their execution can be reconstructed, and every string
matching `3\.[13]\.[0-9]+\.[0-9]+` in tracked files at parent `67c3b3084`.
This intentionally over-excludes incidental strings: the resulting 3,259
unique labels are not a claim that that many fields were benchmarked.
Sorted exclusion strings with terminal LF have SHA-256
`b7dc806d98b62f02950f5273c9f50d4126ef9f93a67b1b1c9623f96d0ed4a188`.
The scope is the audited campaign and tracked evidence, not every unrecorded
computation by other sessions.

The unchanged read-only query and all 1,913 source rows reproduce the earlier
query digest `7e253d6057f39743cd5b922e4197c8ca214b437108d440cfbb434b7e6f5e274b`
and canonical source-array digest
`fc8ec006c8595af0909254197c083653e0406a66ad3bc4c779d9a9199049fcbf`.
There are 367 eligible unexcluded fields. Archive query, complete source rows,
exclusions and selection metadata as external evidence, not bulk Git data.

## Frozen selection

Coefficients are ascending $(d,c,b,1)$. All expected groups are $C_3$; these
expectations are comparator data, never algorithm inputs or dispatch rules.

| Order | Label | Coefficients |
| --- | --- | --- |
| 1 | 3.1.10015.1 | $(-45,24,-1,1)$ |
| 2 | 3.1.10015.4 | $(-59,14,-1,1)$ |
| 3 | 3.1.15660.2 | $(-74,-12,0,1)$ |
| 4 | 3.1.15987.1 | $(-73,0,0,1)$ |
| 5 | 3.1.16023.2 | $(-63,21,0,1)$ |
| 6 | 3.1.16072.1 | $(-62,26,-1,1)$ |
| 7 | 3.1.16268.1 | $(-27,33,-1,1)$ |
| 8 | 3.1.16335.2 | $(-11,33,0,1)$ |
| 9 | 3.1.16627.2 | $(-72,21,-1,1)$ |
| 10 | 3.1.17131.4 | $(72,9,-1,1)$ |
| 11 | 3.1.17399.2 | $(-81,-24,-1,1)$ |
| 12 | 3.1.18392.1 | $(90,-18,-1,1)$ |
| 13 | 3.1.18555.2 | $(-8,35,-1,1)$ |
| 14 | 3.1.18772.1 | $(-50,32,-1,1)$ |
| 15 | 3.1.18819.1 | $(-79,6,0,1)$ |
| 16 | 3.1.19187.2 | $(-80,-19,-1,1)$ |
| 17 | 3.1.19628.3 | $(-77,23,-1,1)$ |
| 18 | 3.1.19919.2 | $(-101,-34,-1,1)$ |
| 19 | 3.1.20655.2 | $(-99,-27,0,1)$ |
| 20 | 3.1.20844.2 | $(-70,24,0,1)$ |

Ordered labels with terminal LF have SHA-256
`0bcb3aec7a36a97b575d8d7c79f0cdceaa940d93b42bb8b872fab69aec852533`.
The selected complete source-row canonical array has SHA-256
`fd05fae340640e4e25b51e488a04596c8ab2c39945703e804c982af430f8f27e`.

Retain every failure and regression with no substitutions. Use identical
explicit conditional-GRH contracts, authenticated native receipts, independent
exact replay, and controlled public-call comparisons on `opt`. Database
unconditional metadata does not make the timed algorithms unconditional.
