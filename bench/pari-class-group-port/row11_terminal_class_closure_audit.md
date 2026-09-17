# Row 11 terminal class closure

This lane closes the exact class-witness gap for development-panel row 11,
the mixed quartic

```text
x^4 - 2000010*x - 2000018
```

with signature `(2,1)`.  Its only frozen input is the 28 MiB W0
`panel-11-ce2bfa61425aa681.json`, authenticated at SHA-256
`6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165`
and joined to the committed row-11 presentation boundary before any new owner
is published.

## Bounded source replay

The coordinator natively replays the existing source-transparent
`hnfspec_complete.py` and `hnfadd.py` kernels across the authentic schedule:

```text
427 relations: [2,9,418,1,7,45,0,427,0]
428 relations: [3,10,418,0,7,0,0,428,0]
430 relations: [2,11,419,0,9,1,0,430,0]
```

At every checkpoint it compares exact `W`, `dep`, `B`, packed `C`, and the
factor-base permutation with W0.  It reverses only the local source HNF
operations for eleven selected terminal columns.  The published transform is
therefore `430 x 11`: nine kernel columns and two class-presentation columns.
A generic `430 x 430` global transformation is never materialized.

The exact identities are

```text
R * Tunit  = 0
R * Tclass = perm^-1(diag(2,2)).
```

## Exact relation and class witnesses

The ordinary-Python closure owner reconstructs all 421 quartic prime ideals
from the prepared multiplication tensor and factor descriptors.  It then
replays every one of the 430 retained principal relations and its exact norm;
the authentic run requires 2,537 bounded quartic ideal multiplications.

The first two terminal factor-base positions are source indices 1 and 6
(zero-based), of norms 9 and 17.  Their compact order relations contain 336
and 330 nonzero signed retained-relation factors respectively.  For each one,
the lane computes the small ideal square directly and proves its exponent
vector by the corresponding `Tclass` column.  The presentation `diag(2,2)`
rejects the only proper positive divisor, 1.  Enumerating all four quotient
coordinate pairs proves the two classes independent and exhaustive, so the
derived class group is exactly

```text
Z/2Z x Z/2Z, class number 4.
```

The enormous signed products of algebraic generators are deliberately not
expanded.  Each compact factor is safe because its underlying principal
relation was replayed exactly before publication.

## Boundary

This owner completes the source-derived presentation and both exact compact
class witnesses.  It also publishes the nine authentic kernel columns needed
by a later rank-two unit lane.  It does not read the terminal PARI class
generators as authority, does not use the frozen `fundamental_units.U/A`
matrices as input, and makes no unit or public-completion claim:

```text
presentationComplete=true
classWitnessesComplete=true
unitsComplete=false
correspondenceComplete=false
publicComplete=false
```

## Validation

Run the focused checker under the declared resource envelope:

```sh
timeout 600s prlimit --as=4294967296 --rss=4294967296 --cpu=600 -- \
  node bench/pari-class-group-port/check_row11_terminal_class_closure.cjs
```

The checker performs two cold authentic replays, verifies atomic idempotent
mode-`0444` publication, independently checks all 4,631 compact matrix cells,
matches both sparse witness products to their class columns, and rejects
mutations at the authority, transform, relation, ideal, witness, replay, class,
comparison, and completion boundaries.  The final two-pass run completed in
38.884 seconds, rejected 11 mutations, and reproduced immutable owner SHA-256
`46d74e9bcecc768bf90e61bdee702a240fde22f75e213a7fec0b9b5212618879`.
