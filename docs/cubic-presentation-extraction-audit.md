# Borrowed full relation presentation

This extraction starts from `813e77a1d108a7da5f37a05726f3b8a514f6e3a6`.
Its original boundary is lines 8588–8737 of
[`cubic_class_number_native.py`](../src/lib/sagejs/number_fields/cubic_class_number_native.py):
the postcollection prefix copy, HNF/rank, Smith quotient, and trivial-result
publication, ending before proof-support selection. Relation discovery,
recovery, unit reconstruction, and analytic certification are not changed.

## Ownership and helper boundaries

Let $m$ be the number of retained principal rows and $n$ the factor-base size.
The root has already handled the empty factor base, so $n>0$ here.

| Helper | Borrowed inputs | Borrowed writable state | Result |
| --- | --- | --- | --- |
| `_cubic_prepare_full_relation_presentation` | Raw candidate matrix, retained online HNF, $m,n$, online-reuse predicate, independently established full-rank predicate | Relation matrix with live shape $m\times n$, HNF with live shape $r\times n$, diagnostic output | Status and exact rank |
| `_cubic_finish_full_relation_presentation` | Copied full-rank relation prefix, $m,n$ | Smith matrix with live shape $m\times n$, phase-local invariant slots in `workspace`, diagnostics | Status, upper class number, invariant count |
| `_cubic_publish_trivial_relation_presentation` | Index-one relation prefix and principal elements, factor-lattice workspace, proof mode and existing receipt metadata | Detached factor/row/element transcripts and scalar receipt output | Publication success |

Here $r=n$ when reusing the synchronized online HNF and $r=m$ otherwise.
The root's existing reuse predicate remains unchanged: no cheap-unit witness,
online quotient enabled, and equal online/raw row counts. This predicate
establishes which HNF is current; it does **not** by itself prove full rank.

All matrices remain owned by the root arena. Preparation does not alter the
raw candidates or online HNF. HNF and Smith operations receive the explicit
logical prefix, not the allocated capacity. Only that prefix is written;
poisoned capacity rows and columns cannot become extra relations. The helpers
have no arena constructors, owned allocations, escaping resources, or host
callbacks. Foreign-library temporary allocations remain subject to the root
checkpoint.

Splitting preparation from Smith computation preserves the existing
one-shot allocation barrier: the root allocates exact-sized relation/HNF
owners, establishes full rank, and only then allocates an exact-sized Smith
owner. Support, dependency, recovery, and analytic allocations remain later
and lazy. A future bounded staged caller may instead allocate its owners once
outside a retry loop and invoke the same helpers with changing logical shapes.
This change does not enable that loop or authorize any new root retry.

## Exit classification

The original root mapped all these failures to `False`. It still does so.
The private helper results now retain the distinction needed by a later
mathematically justified scheduler.

| Original check | Classification |
| --- | --- |
| $m<n$ | Insufficient relations, unless an independent full-rank witness makes this inconsistent |
| Exact HNF rank $<n$ | Insufficient relations, unless it contradicts independently established full rank |
| Exact HNF rank $>n$ | Inconsistent evidence; never a collection retry |
| HNF/SNF FFI failure or invalid prefix/alias | Invalid resource or computation; never mathematical insufficiency |
| A zero Smith diagonal after full-rank preparation | Inconsistent evidence |
| Smith entries fail the divisibility chain | Inconsistent evidence |
| More than eight nontrivial Smith invariants | Unsupported publication capacity; not permission to collect more rows |
| Factor transcript has the wrong exact length | Publication failure |
| Relation/element transcripts have the wrong exact lengths | Publication failure |
| Arena/foreign construction or checkpoint exhaustion | Resource failure through the existing error path; not a mathematical retry |
| Upper quotient has index one and publication succeeds | Accepted trivial class group under the already established generator theorem |
| Upper quotient has index greater than one | Presentation ready, but not yet an accepted class group; continue the existing proof suffix |

Preparation returns `(1, rank)` for full rank, `(0, rank)` for insufficiency,
and `(-1, rank)` for inconsistency. The root supplies an explicit
`established_full_rank` flag from the initialized modular-rank ledger, or from
an exact online index-one status for the synchronized prefix. Merely tracking
the same number of rows is insufficient. An insufficient-row-count exit does
not compute a rank and returns zero in its rank slot.

Smith finishing returns `(1, upper_index, invariant_count)`, `(-1, 0, 0)` for
invalid evidence, or `(-2, 0, 0)` for the publication envelope. Success stores
only the nontrivial invariants in the existing row-scratch prefix. A failed
attempt's partial scratch is not publishable; a future resumed collector
must recompute the presentation rather than use those slots as retained
evidence. Existing smooth-row construction already clears its row scratch
before admitting a new relation.

## Publication and correctness scope

The scalar layout, proof-kind choice, compound/generator settings, identity
coordinates, order/equation discriminants, equation index, denominator,
search-box metadata, and private adjacent/online counts are unchanged.
Transcript shape checks precede the output clear and accepted marker. A later
transcript failure may leave an earlier transcript buffer written, as before,
but does not produce an accepted scalar receipt.

The mathematical reasoning is unchanged: the theorem-qualified factor base
generates the class group, and verified principal rows give an upper quotient
surjecting onto it. A trivial upper quotient therefore establishes triviality
without a unit or analytic calculation. A nontrivial upper quotient does not
establish its own completeness and still requires the existing suffix.

## Focused evidence

`test/number-field-cubic-presentation.cjs` exercises the actual helper bodies:

- Independent coordinate-lattice expectations for Smith invariants, including
  signed and promoted exact integers, through JavaScript, GMP, and fmpz with
  real FLINT arithmetic.
- Repeated growing/shrinking prefixes, tall and reused-online HNF, poisoned
  unused capacity, and unchanged discovery state.
- Rank deficiency with and without an independent full-rank claim, zero/small
  prefixes, and a 44-row workspace with nine nontrivial invariants.
- Trivial publication with both generator-proof modes, exact transcripts,
  malformed transcript lengths, and preserved scalar layout.
- Actual-source CPython defensive-branch checks with explicitly injected
  malformed FFI results. These injections test classification, not arithmetic
  correctness; real arithmetic is covered by the three execution backends.
- Root AST verification of lazy Smith allocation, and current full-closure
  lowering confirming all helpers remain private direct fmpz callees.

The extraction makes no new field, holdout, performance, full-production-build,
or cross-platform qualification claim. Those remain integration work.
