# Row-21 unequal-bound fresh honesty transaction audit

## Outcome

The bounded Phase-5 honesty gap is closed for its explicitly selected
correctness fixture. A separate fresh transaction now starts with the frozen
row-21 prepared number field, creates the ordinary same-run Sage factor-base
owner, derives the custom `C1=5,C2=31` factor-base owner from its live prime
descriptors, computes all six collector statuses in Sage, and feeds those live
statuses to the existing translated successful honesty scheduler.

The retained transcript records:

- statuses `[1,1,1,1,1,1]`, with no PARI status or branch result accepted as a
  runtime input;
- six probe publications and consumptions;
- three transient `KCZ` increments;
- exactly one restoration from transient `KCZ=6` to `KCZ=3`; and
- the driver call site's one-shot transition `KCZ2=10 -> 0` before unit
  reconstruction.

The transaction publishes its honesty owner atomically at a content-addressed
path. A second entirely fresh execution produces the same owner and exercises
the idempotent existing-file path. Cold replay recomputes the six collectors
and scheduler in a separate Python process. It rejects independently forged
custom bounds, a live probe status, the restoration state, and the final
`KCZ2=0` state.

The verified identities are:

```text
custom factor owner  dba4935528e3bffe17eb50dc1d8642df27aa7a36e0e9f399791ba08d6dd6c18d
honesty owner         fa54ecfcd1c4d0d3dcda1985fcf40377dc09d83e41a905c431e65e2586f55e14
payload               636d4e603008d6edd182a87c9b7f1cf7c45c06d26ca648b2e318a5f251d88e38
transcript            8b612c4bdfede60eada2c44e712f15eda3ac595e89e3b3b72cae26458df7e2b3
```

## Source boundary

The checker authenticates pristine PARI 2.17.4 and the two relevant source
cuts:

```text
pari-2.17.4.tar.gz                         02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53
src/basemath/buch2.c                       904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac
buch2.c:2801-2864 immediate success        8446e0006c4cbf29f54fa79ae722a1bbbd2b0dddc34c87b6335ca65bc2a5f896
buch2.c:4134-4140 driver call site         a18e59372b6b4f9daa6dd15643caa27244107acab1132e99cff9a0be977913ef
```

This is intentionally only the source-identical no-automorphism,
immediate-success corridor. It makes no claim about automorphism orbits,
failed-probe random products, `Q_primpart`, `idealred`, or restart behavior.

PARI's `recover_partFB` retains a source `Vbase` ordering that is different
from the ordinary relation owner's sorted descriptor order for the three
primes over 29. The transaction admits the already frozen fixture only as a
structural ordering authority, authenticated by
`f90ff02e7c0f8e08282d13e3d73193d6a2751420988d502482ce294f7562f35c`.
Every selected ideal must be a unique same-run Sage owner with the matching
hash. The fixture's statuses, branch counters, and result are not inputs. This
recovers the exact prior live collector sequence, including candidate-attempt
counts `[35,157,41,1,3,23]`; the existing independent differential checker
still reports its original transcript
`72abc2ff0593473ec2b4988389e47c654f6c71eba6705a1e2fad9fe8e1393efe`.

## Population separation

This new transaction is an additional correctness outcome. It does not edit
`row21_fresh_prepared_transaction.cjs`, does not change the frozen 16-row
aggregate, and does not relabel its ordinary equal-bound row-21 run. The
checker proves that the default factor coordinator still rejects unequal
bounds and that the default transaction has no dependency on the new honesty
files. No reserve or new field is used.

There is no timing result or performance claim here.

## Files and validation

- `row21_honesty_factor_owner.cjs` derives and authenticates the custom owner.
- `row21_honesty_resident_root.py` joins the live collector, successful
  scheduler, and caller state transition.
- `row21_honesty_fresh_prepared_transaction.cjs` provides fresh ownership,
  replay, mutation checks, and atomic publication.
- `check_row21_honesty_fresh_prepared_transaction.cjs` is the end-to-end gate.

Run:

```bash
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache \
node bench/pari-class-group-port/check_row21_honesty_fresh_prepared_transaction.cjs \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1 \
  /home/user/upstream/pari-2.17.4.tar.gz
```

The gate passes with two fresh executions, independent cold replay, four
mutation rejections, source authentication, wrong-field rejection, and an
unchanged default equal-bound transaction.
