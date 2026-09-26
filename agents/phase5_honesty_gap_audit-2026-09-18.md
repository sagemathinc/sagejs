# Phase 5 unequal-bound honesty gap audit

The executable audit is
`bench/pari-class-group-port/phase5_honesty_gap_audit.cjs`. It changes no
implementation, fixture, frozen field, registry, or reserve.

## Result

The selected row-21 correctness fixture is mathematically genuine. With custom
bounds `C1=5`, `C2=31`, Sage computes all six collector results from prepared
owners, receives no PARI status as a runtime input, performs three transient
`KCZ` increments, restores `KCZ` exactly once, and matches pristine PARI
2.17.4. Its connected transcript is
`72abc2ff0593473ec2b4988389e47c654f6c71eba6705a1e2fad9fe8e1393efe`.

That fact does **not** establish that Phase 5's conditional resident branch is
integrated. The named `resident_honesty_root.py` still returns
`unsupported-success-continuation` after a successful unequal-bound probe. The
source-identical `@native` success scheduler lives separately in
`honesty_success.py`. Neither that scheduler nor the resident root is called by
`row21_fresh_prepared_transaction.cjs`.

The already-published 16-row fresh-prepared aggregate is independently valid,
and row 21 is genuinely one of its rows. But its default prepared factor base
has equal bounds (`C1=C2=57`, `KCZ=KCZ2=15`); the coordinator rejects unequal
bounds, and the final adapter records `outcome: "not-required"`. Therefore the
aggregate does **not** execute the custom unequal-bound success branch. This is
consistent with the frozen ladder, which declares honesty absent from the
performance population and treats the custom-bound run as correctness-only.
The same polynomial is not the same execution policy.

## Exact bounded next task

No new field and no reserve are needed. Add a separate correctness-only fresh
transaction for frozen row 21 with authenticated custom `C1=5,C2=31`
factor-base owners. At the translated equivalent of pristine `buch2.c`
4134--4140, join the existing live collector and `honesty_success` scheduler
behind one conditional resident root, publish a replayable honesty owner before
unit reconstruction, and mutation-check the bounds, probe result, restoration,
and one-shot `KCZ2=0` state. Admit this as an additional correctness outcome;
do not replace or relabel the default 16-row performance transaction.

That bounded task needs only the already-exercised no-automorphism,
immediate-success portion of `be_honest` (`buch2.c` 2801--2864) and its driver
call site (4134--4140). It does not require the remaining general source cuts:

- automorphism construction, permutations, and orbit removal (2680--2798);
- failure followed by random ideal products (2837--2860);
- `Q_primpart` after a retry (2857); or
- high-bit `idealred` after a retry (2858).

Those four corridors remain a later generalization campaign. They should not
be silently counted as part of the selected Phase-5 fixture.

Run the audit with:

```bash
node bench/pari-class-group-port/phase5_honesty_gap_audit.cjs \
  /home/user/upstream/pari-2.17.4 \
  /home/user/upstream/pari-2.17.4.tar.gz \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1 \
  /scratch/fresh-prepared-development-aggregate-v1-20260918.json
```

The output authenticates the pristine source cuts, executes the selected live
arithmetic, verifies the frozen aggregate receipt without rerunning its rows,
and reports the integration result explicitly as
`phase5ConditionalResidentBranchComplete=false`.
