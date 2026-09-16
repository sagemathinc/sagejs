# Field-3 resident relation retry audit

This lane translates the first previously terminal retry corridor in
PARI 2.17.4 `Buchall_param`.  The fixture is the declared field

```text
x^4 - 2000022*x - 2000042
```

at the existing prepared number-field, factor-base, and analytic inverse-`hR`
boundary.  It does not claim field preparation, honesty, precision restart,
random-relation fallback, fundamental units, or user-facing maps.

## Source correspondence

The controlling source is pristine PARI 2.17.4
`src/basemath/buch2.c`, SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
The translated branches are:

- lines 4020--4040: append new relations through `hnfadd_i`, or restore
  `old_need` after an empty collection;
- lines 4041--4061: recompute ideal-lattice and unit-rank need after every HNF;
- lines 4062--4084: select a sorted dependent-row prefix or retain/rotate the
  full permutation after dimension closure;
- lines 4088--4117: compute the regulator multiple and continue for unit-rank
  defect, unchanged relation cache, or `fupb_RELAT`;
- lines 4124--4131: accept the class-number/regulator candidate.

`_pari_prepare_relation_search` owns the source `F.L_jid` decision.
`_pari_publish_appended_hnf` makes H, dep, B, C, and their dimensions one
transactional resident state.  The driver now treats its former `-201`
(dimension need), `-205` (empty append), and changed-H/B `-202` exits as
ordinary internal continuation.  Acceptance actions 3, 4, and 5 feed the same
loop.  Raw HNF, allocation, automorphism, honesty, precision, and random-
relation frontiers remain explicit.

## Exact replay

`check_prepared_class_group_resumable_field3.cjs` consumes independently
generated source fixtures from:

- `check_actual_initial_collector.cjs --field 3 --native`;
- `check_actual_hnfadd_inputs.cjs --field3`;
- `check_analytic_inverse_hr.cjs`.

The replay has six collector passes.  It starts with 293 relations and H/B
dimensions 4/282, performs the source-empty `j=1` pass, then publishes four
nonempty append transactions:

| columns | H rows | B columns | acceptance action |
|---:|---:|---:|---:|
| 293 | 4 | 282 | 3 (dimension need) |
| 293 | 4 | 282 | 3 (empty retry) |
| 295 | 5 | 283 | 5 |
| 299 | 3 | 285 | 5 |
| 300 | 3 | 285 | 5 |
| 303 | 2 | 286 | 0 |

CPython and the packed GMP native backend reproduce every source relation,
generator, weighted logarithm, final H/D/B/C entry, and the exact terminal
data:

```text
class group invariants = [2, 2]
class number = 4
regulator = (3618404972711092908566761403126723494180372471278477576742,
             precision 192, exponent 33)
```

The native replay uses the same ordinary Python entry and transitive graph;
the generated core contains no Python, N-API callback, or V8 call boundary.
Its measured resident packed-owner allocation is 447,802,836 bytes.  The
fixture is diagnostic and timing is not qualified.

## Remaining frontiers

The next relation-driver cuts are owner growth/reallocation, factor-base
enlargement and honesty, `rnd_rel`, and precision restart.  Completion beyond
class invariants still requires fundamental-unit extraction and public maps.
This lane intentionally does not turn any of those states into guessed
success.
