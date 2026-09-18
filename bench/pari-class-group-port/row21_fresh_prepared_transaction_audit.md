# Row 21 fresh prepared-input transaction

`row21_fresh_prepared_transaction.cjs` is a single invocation from the
authenticated normalized row-21 prepared number-field record to an
`ImmutableClassUnitCorrespondenceResult`.  Its only public runtime inputs are
the prepared record and the output directory.  The request shape rejects
factor-base, relation, HNF, acceptance, unit, final-envelope, and W0 injection.

The transaction authenticates prepared authority
`63378e8424e81d0d5653d965ef18a518b78ec7f78b66f57afcc55052849ac95f`
before starting.  It then runs, in order, the existing live row-21 factor-base,
initial relation frontier, first HNF, analytic/regulator acceptance, exact
rank-three unit, final `buchall_end`, and field-neutral adapter stages.  Stage
owners are returned directly to the next stage in the same invocation.  The
coordinators' required filesystem forms are written only below a mode-0700
transaction directory and that directory is removed in `finally` before the
receipt returns.  No prior retained owner can enter the transaction.

The final Python assembler is still the ordinary CPython-parseable
`row21_final_result.py`.  It consumes transaction-local serializations, derives
the exact class-number-one right inverse, checks all three exact units and
their inverses/norms, and emits its canonical immutable envelope.  Detached
cold replay authenticates that envelope before the neutral adapter seals and
publishes it.  The returned hidden `verifiedResult` is an actual
`ImmutableClassUnitCorrespondenceResult`; the enumerable receipt contains only
its content-addressed immutable publication metadata and terminal summary.

The receipt is branded in a module-local `WeakSet`.  Copies, reconstructed
objects, and proxies do not acquire that brand.  This lets the integration
registry admit only the object returned by this invocation.  The transaction
does not edit or weaken the shared registry or qualification core.

`check_row21_fresh_prepared_transaction.cjs --focused` performs no mathematical
run.  It rejects seven prepared-input mutations, rejects owner injection at
the exact request boundary, and rejects two synthetic receipt-identity
attacks.  The full checker executes the genuine transaction in a bounded
worker, verifies the immutable neutral artifact and hidden result type, and
checks the class group, exact-unit count, torsion, and terminal tier.  Only
after publication does it open W0 as a differential oracle.

Reproduce the focused wiring checks with:

```sh
node bench/pari-class-group-port/check_row21_fresh_prepared_transaction.cjs \
  --focused /scratch/sagejs-row21-first-hnf-inputs/prepared.json
```

Run the genuine transaction with:

```sh
node bench/pari-class-group-port/check_row21_fresh_prepared_transaction.cjs \
  /scratch/sagejs-row21-first-hnf-inputs/prepared.json \
  /tmp/sagejs-row21-fresh-prepared-transaction \
  /scratch/sagejs-pari-development-panel-a998/panel-21-6966124ec38a3af1.json
```

W0 is not a runtime input.  The checker reads it only after the result exists
and has passed digest, byte-length, mode, and terminal checks.  This work makes
no timing, speedup, memory-reserve, or capacity-reserve claim.  It preserves
the existing explicit assumptions, so `correspondenceComplete` is true while
`publicComplete` remains false.
