# Authenticated field-3 C4 owner

## Boundary

`field3_accepted_c4_owner.py` closes the production C4 gap for

```text
x^4 - 2000022*x - 2000042.
```

The `derive-inputs` operation first constructs the field and catalog owners;
they are not caller-shaped declarations. It authenticates the exact frozen
authority (`246bfe...954c`), initial collector (`81b9d3...6fe`), and prepared
embedding identity (`bc0dfb...7cf`). From these it derives:

- the polynomial, signature, and integral multiplication tensor;
- the absolute discriminant as the exact determinant of the tensor's trace
  pairing;
- roots of unity from the real signature; and
- the complete prime decomposition catalog through the analytic bound,
  including the required sentinel prime beyond the bound.

The frozen collector's `admission_prime_offsets`, `admission_prime_counts`,
and `admission_group_*` arrays are deliberately not treated as that catalog.
They describe the sparse factor-base admission schedule: its first live prime
is 5, after the preinstalled 2/3 factor-base prefix, while the terminal
relation authority begins 2, 3, 3, 5. Production reuses only the authenticated,
increasing rational-prime stream. It recomputes ordinary residue-degree
patterns from the defining polynomial through the source-transparent
`pari_prime_degree_catalog`. The defining equation has index 37, so the
polynomial-mod-37 path is invalid; the three exact authority packets above 37
have norms 37, 37, and 1369 and independently yield grouped degrees
`1^2, 2^1`. Their authenticated ramification weights must sum to degree four.
No expected analytic catalog fixture participates in publication.

The acceptance operation then authenticates four immutable, content-addressed
predecessors:

1. `field3-full-terminal-ancestry-v1`, including the terminal two-by-two HNF;
2. `field3-high-precision-A-v1`, including the 273-cell packed logarithm
   matrix and its exact 301-by-13 transform;
3. `field3-analytic-field-v1`, containing only polynomial, discriminant,
   signature, roots of unity, and prepared-field identity; and
4. `field3-analytic-prime-catalog-v1`, containing the prime decomposition
   catalog and a digest link to the field owner.

The coordinator checks every mode-0444 file and SHA-256 digest before invoking
Python. Python re-reads each file, verifies the digest again, rejects duplicate
JSON keys, validates exact field/run/shape identities, checks that the C3
transform is the prefix of the full terminal transform, and checks every
packed scalar's kind, normalization, and precision.

## Live derivation

There is no accepted-answer input. The source-transparent computation:

1. recomputes two catalog latches;
2. derives PARI's residue bound, inverse residue, and normalized inverse-hR;
3. derives the regulator multiple and 2-by-13 coordinate matrix directly from
   the authenticated C3 logarithms;
4. derives the tentative class number from the terminal HNF determinant;
5. derives `h * invhr`, the `bestappr` bound, denominator, exact relation HNF,
   regulator, and `bad_check` decision; and
6. publishes only if `compute_R` returns `fupb_NONE`.

The mathematical implementation is the existing ordinary, CPython-parseable
source in `field3_analytic_acceptance.py` and its imported PARI-2.17.4 ports.
This owner adds authentication and orchestration, not a second implementation.
As elsewhere in this experiment, PARI's GRH and analytic-bound policy is
explicitly assumed rather than independently proved.

## Retry and publication semantics

A genuine `compute_R` `fupb_PRECI` is not an accepted result. The live
`myprecdbl` transition is surfaced as `Field3AcceptedC4Retry`; for example the
qualified low-precision control requests 64 to 128 bits. RELAT also fails
closed. Neither case creates a result file. A later C6/getfu PRECI is outside
this C4 producer and remains terminal rather than restarting Buchall.

The production identity requires exactly 153,088 bits. Low-precision
qualification uses schemas prefixed by `test-field3-` plus a
`synthetic-c4-low-*` run identity and `testOnly: true`. Those owners cannot
publish either production output schema.

Successful publication creates a canonical newline-terminated JSON file named
by its SHA-256, then atomically renames and chmods it to mode 0444. Repeating an
identical run is idempotent and verifies the existing bytes and mode.

The primary schema is
`sagejs.pari-class-group/field3-accepted-c4-v1`, consumed by C5. It contains
the accepted regulator, relation matrix, class number, denominator, complete
analytic and compute states, and all four predecessor digests.

C7 historically expects
`sagejs.pari-class-group/field3-analytic-accepted-owner-v1`. The coordinator
therefore derives a second content-addressed view from the authenticated
primary owner. Before projection it reopens all four predecessors and
recomputes C3 content-address words, C3 latches, analytic-preparation state,
regulator-multiple state, and the final acceptance latches. It then replays
the complete C4 computation and requires exact semantic equality with the
supplied accepted owner, covering class number, zeta factor, regulator,
relations, and denominator as well as every state field. The view exposes
those latches and all five ancestry digests for C7's own cross-check. Both
outputs are computed before publication by `--operation accept`; projection
can also be invoked independently with `--operation project-c7`.

## CLI

```text
node field3_accepted_c4_owner_coordinator.cjs --operation derive-inputs \
  --profile production \
  --prepared-owner FILE --prepared-sha256 SHA256 \
  --initial-owner FILE --initial-sha256 SHA256 \
  --authority-owner FILE --authority-sha256 SHA256 \
  --output-dir DIRECTORY

node field3_accepted_c4_owner_coordinator.cjs --operation accept \
  --full-terminal-owner FILE --full-terminal-sha256 SHA256 \
  --c3-owner FILE --c3-sha256 SHA256 \
  --field-owner FILE --field-sha256 SHA256 \
  --catalog-owner FILE --catalog-sha256 SHA256 \
  --output-dir DIRECTORY

node field3_accepted_c4_owner_coordinator.cjs --operation project-c7 \
  --accepted-c4-owner FILE --accepted-c4-sha256 SHA256 \
  --full-terminal-owner FILE --full-terminal-sha256 SHA256 \
  --c3-owner FILE --c3-sha256 SHA256 \
  --field-owner FILE --field-sha256 SHA256 \
  --catalog-owner FILE --catalog-sha256 SHA256 \
  --output-dir DIRECTORY
```

The first operation prints an envelope with `acceptedC4` and
`analyticAccepted` path/digest records. The second prints the C7 projection
record directly.

## Qualification

`check_field3_accepted_c4_owner.cjs` constructs explicit test-only source
authorities from a freshly compiled, UBSan-enabled PARI 2.17.4 source oracle,
then exercises `derive-inputs`; it never handcrafts an accepted analytic
owner. A
focused production-shaped regression separately exercises the ordinary-prime
factorization/index-prime packet join and rejects altered packet norms,
ramification, relation-prime authority, and rational-prime order. A
generated 64-bit rank-two C3 control and generated terminal HNF exercise the
complete accepted path. The test checks both schemas, digest ancestry,
mode-0444 publication, idempotency, and the independent projection CLI.

Thirteen fail-atomic cases cover genuine PRECI, detached field/catalog ancestry,
wrong caller digest, detached terminal/C3 transform, a rejected analytic
projection mutation, a forged production identity, a mutated C3 latch, and
one mutation of each of the five candidate outputs, plus mutable input mode.
The output directory remains byte-for-byte unchanged after every rejection and
contains no temporary publication.

No 153,088-bit arithmetic or heavy native build is run in this lane. The
authentic invocation must use the eventual production C3, full-terminal,
field, and catalog owners and remains subject to the normal 600-second/4-GiB
process-tree gate.
