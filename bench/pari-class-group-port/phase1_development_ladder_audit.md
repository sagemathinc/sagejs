# Phase 1 development-ladder audit

This identity and evidence audit began at integration commit
`1196fd4fdc5fdaa2a3fd1273d32c594bfb299ffa` and now incorporates the complete
untimed pristine-PARI development export based on `a998fc1bd`. It performs no
performance qualification. In particular, field metadata is never treated as
proof that a source branch ran; branch claims come only from the exact source
traces.

## Frozen population

`phase1-development-ladder.json` freezes the four sentinels and twelve
additional development fields already selected by
`class-unit-qualification-manifest.json`. The deterministic rule is:

1. the already-exercised real cubic (panel row 0);
2. the already-exercised mixed quartic (row 8);
3. the first remaining tuning row with a known nontrivial class group (row 1);
4. the remaining tuning row with maximum known class number, ties by field ID
   (row 14);
5. all remaining tuning rows retain panel order as additional development
   fields.

The checker independently recomputes steps 3--5. Each selected identity and
polynomial hash is compared with the frozen panel and the earlier qualification
manifest. The 24-row panel remains byte-identical at SHA256
`7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5`;
the eight final-reserve rows remain closed.

The oracle identity is pristine PARI 2.17.4: archive SHA256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`
and `pari-2.17.4/src/basemath/buch2.c` SHA256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

## Complete development trace evidence

The pristine-source driver checker now accepts an authoritative
`--panel-index=N` selector while retaining `--field0` through `--field3` for
the existing downstream controls. It rejects every `final-reserve` row before
compilation or execution. `export_pari_development_panel.cjs` selects exactly
the 16 `tuning` rows in frozen panel order:

`0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23`.

The exact diagnostic payloads occupy 608,340,929 bytes under `/scratch` and
are authenticated by `development-default-driver-manifest.json`. Only the
compact 20 KiB manifest is tracked. It records every payload's bytes and
SHA-256, plus separate hashes of prepared state, complete event sequence, and
terminal result. The exporter and manifest both keep qualification execution
disabled and report that zero reserve rows were opened.

Each payload contains neutral exact prepared state: polynomial, discriminant,
index, signature, roots of unity, integral basis and inverse, multiplication
tensor, exact mantissa/precision/exponent embeddings, rounded embeddings, and
runtime prime/product tables. The trace adds exact factor-base state, RNG,
selected ideals, smooth factorization candidates, accepted relation records,
HNF/archimedean matrices, regulator decisions, fundamental units, class-group
transformations, and the final PARI object. Runtime outputs are trace fields,
never preparation inputs, dimensions, capacities, or control decisions.

An independent payload verifier authenticated all 16 external files and their
neutral array dimensions. A fresh repeat of row 0 reproduced its payload,
prepared-state, complete-event, and terminal-result hashes byte for byte.

All 16 identities are therefore traced. Sentinel row 14 nevertheless takes a
single 192-bit driver pass, so the earlier metadata selection still does
**not** prove that this sentinel exercises precision or honesty work.

## Branch coverage audit

| required behavior | performance-population evidence | finding |
| --- | --- | --- |
| nonempty `W` | row 10 (`--field3`) | observed; the quartic retry retains nonempty append transactions |
| rank deficiency | rows 8 and 10 | observed; row 8 has an index-two unit-lattice shortage and row 10 begins with two missing ideal rows |
| random relations | none | absent from default performance traces; a forced correctness-only `rnd_rel` corridor is closed |
| precision escalation | none | absent; all 16 complete traces remain at 192 bits and avoid precision rebuild |
| honesty | none | absent from all 16 default traces (`extraRequired=false` throughout); the unequal-bound all-failure correctness corridor is closed |

### Closed correctness-only corridors

`rnd_relation_collector_fixture.json` now closes one authentic PARI 2.17.4
`rnd_rel` corridor for panel identity 10. The instrumentation's declared
control forces the first post-HNF collection through the literal source
branch. PARI itself then produces the RNG transition, search ideals, two new
relations, generators, logs, and changed HNF state; CPython and native replay
match those exact observables. This establishes the arithmetic and publication
contract of that frozen corridor. It does **not** establish that the unchanged
default policy naturally enters `rnd_rel` on row 10.

The unequal-bound honesty evidence is also stronger now. The original leaf
fixture records 51 failed no-cache probes and 50 `random_bits(4)` retry-ideal
sequences. `honesty_scheduler_fixture.json` connects every one of those ideals
to the translated no-cache collector, computes all 51 failures, publishes all
50 retries transactionally, and terminates with `KCZ=2`. This closes the
frozen all-failure scheduler corridor. The four-bit draws remain **unrelated**
to `rnd_rel`. Deliberately changed `C1=5,C2=31` means this is not a default
performance observation, and the all-failure result still does not cover
successful `KCZ` increments/restoration, nontrivial automorphism orbits,
outer primitive-part work, or the `idealred` threshold path.

Precision escalation and a successful full honesty corridor remain missing
correctness fixtures. None of these fixtures is a performance input, and none
may replace, enlarge, or open the frozen panel.

## Exact promotion policy

A **correctness-only corridor is accepted** when all four conditions hold:

1. pristine PARI 2.17.4 archive/source hashes and the exact input identity are
   pinned;
2. the complete branch-specific inputs, outputs, decisions, RNG state, and
   owner/publication state required for independent replay are retained or
   authenticated by hashes;
3. translated CPython/native execution matches every exact pristine-source
   observable; and
4. mutating corridors test malformed input, insufficient capacity, and
   partial-publication failures transactionally.

This qualification says that a bounded algorithmic corridor is correct. It
does not turn its polynomial into a performance case.

A branch may be promoted to **performance-population coverage** only when all
four additional conditions hold:

1. the identity is already one of the frozen sixteen development fields;
   correctness evidence cannot open or substitute a reserve;
2. an unmodified pristine-PARI default-driver run for the frozen polynomial
   and preparation policy enters the branch naturally, without forced control
   flow, custom bounds, injected resident state, or predeclared answers;
3. the Sage.js default public path enters the corresponding branch and agrees
   on the complete stage transcript and terminal mathematical result; and
4. after trace agreement, the unchanged field is measured on the locked host
   with the predeclared paired schedule, retaining failures in denominators.

Using the same polynomial is insufficient. The forced row-10 `rnd_rel`
corridor and custom-bound row-0 honesty corridor therefore remain
correctness-only even though both identities occur in the performance panel.
Promotion changes only the evidence status of an existing field; a fixture
itself can never become a new performance field.

## Reproduction

Run the read-only checker from the repository root:

```sh
node bench/pari-class-group-port/check_phase1_development_ladder.cjs
```

It hashes all frozen inputs and cited evidence, rederives the selection,
cross-checks all identities, verifies the pristine PARI pins embedded in the
existing driver evidence, and rejects any claim that the partial honesty
fixture supplies random-relation coverage.
