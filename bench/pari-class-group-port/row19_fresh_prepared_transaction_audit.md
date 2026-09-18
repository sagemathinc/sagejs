# Row-19 fresh prepared transaction

`row19_fresh_prepared_transaction.cjs` is the prepared-input-only row-19
entry point. It authenticates normalized prepared number-field data before it
adds the non-answer-bearing authority digest. No W0 file, retained result
owner, class/unit answer, or reserve is an entry input.

The transaction derives the prepared prefix and analytic catalog, executes the
first collection/HNF, continues through relation 430 and terminal acceptance,
constructs the principal class owner, derives the compact and final live unit
owners, composes the final `buchall_end`-equivalent owner, and publishes an
`ImmutableClassUnitCorrespondenceResult`. Every intermediate compressed owner
is created below a mode-0700 temporary directory and removed in `finally`.
Only the verified neutral envelope is written to the requested output
directory.

The retained-owner APIs remain pinned to their reviewed fixed digests. The
fresh class and final entry points instead require the exact content and
compressed digests of the private owners just created. The Python class stage
substitutes that exact first-HNF digest only at its fresh entry point; its
cleanup, HNF, terminal relation, generator, transform, and principal-witness
fingerprints are unchanged.

The neutral adapter has a separate fresh preparation entry point. It brands
the exact prepared composition in a module-local `WeakSet`. Publication allows
`freshPreparedInput=true` only for that object identity, so cloning,
serialization, or reconstruction loses authority. The transaction receipt has
its own module-local `WeakSet` brand and exposes the already verified result as
a non-enumerable property.

The receipt explicitly records no retained runtime inputs, no W0 runtime
input, no qualified timing, and no reserve access. It publishes no elapsed,
RSS, CPU, or kernel timing fields.

Run the focused structural and anti-forgery check with:

```sh
node bench/pari-class-group-port/check_row19_fresh_prepared_transaction.cjs
```

The full transaction is intentionally a heavyweight specialized execution;
its sole runtime argument is authenticated prepared data plus an output
directory.
