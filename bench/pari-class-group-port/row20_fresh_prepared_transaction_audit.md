# Row 20 fresh-prepared transaction audit

## Scope

This lane implements the narrowest degree-five row-20 transaction rooted only
in the authenticated normalized prepared-number-field object. It deliberately
does not register the transaction or alter shared core code. The integration
lane owns those decisions.

The reviewed prepared authority is
`15ecf1209df2e48bd8a9e5ad75bc6dac0598d513bc6a06b7712ccfc255febbc6`.
The transaction rejects any extra prepared-field key and any request key other
than `prepared` and `outputDirectory` before mathematical work starts.

## Same-invocation owner chain

`row20_fresh_prepared_pipeline.cjs` creates every mathematical owner under one
private temporary directory and one invocation:

1. `row20_fresh_factor_base_coordinator.cjs` derives the degree-five factor
   base, including the index prime, from the authenticated prepared field.
2. `row20_fresh_first_hnf_host.cjs` runs relation collection and connected HNF
   closure, using the row-20-specific native kernels.
3. `row20_fresh_acceptance_host.cjs` performs analytic cataloging and regulator
   acceptance on the live HNF state.
4. `row20_fresh_units.py` reconstructs and proves the two exact units from the
   live compact logarithms, accepted lattice, regulator, and prepared field.
5. `row20_fresh_closure.py` adapts those live projections to the existing exact
   row-20 C7 replay. The legacy replay API requires a property named
   `pristineW0Sha256`; the adapter fills that compatibility property with the
   fresh prepared-input digest. It does not open or accept W0.
6. The exact closure is sealed as a neutral result and verified through a
   detached authority, producing a branded
   `ImmutableClassUnitCorrespondenceResult`.

The transaction publishes only immutable canonical result bytes. Its receipt
is deeply frozen, carries a module-local `WeakSet` brand, and keeps the verified
result on a non-enumerable property. Copies and caller-constructed lookalikes
therefore fail verification.

## Complex-place correction

The generic logarithmic embedding helper assumed place-major matrix rows:
all real rows, then all complex real parts, then all complex imaginary parts.
The prepared degree-five `nf_get_M` table is interleaved:

```
real, Re(z1), Im(z1), Re(z2), Im(z2)
```

One-complex-place corridors could not expose the distinction. Row 20 did.
`row20_log_embedding.py` now uses real offsets `[0, 1, 3]` and imaginary
offsets `[2, 4]`. With that correction, all 294 raw and 294 compact logarithmic
entries agree with the optional diagnostic oracle; without it, the real entries
agree but the complex entries and regulator acceptance do not.

## No retained-answer boundary

The transaction and mathematical pipeline contain no panel path and accept no
W0 argument. Factor, HNF, acceptance, unit, or closure owners cannot be injected
through the request. The focused checker verifies these properties before it
runs the genuine computation.

The checker can optionally open the known W0 only after the neutral result has
already been published. That read is diagnostic and is reported explicitly as
`openedAfterPublication`. It cannot influence the result bytes, authority,
receipt brand, or owner chain.

No timing qualification, speed claim, memory-reserve claim, or public-complete
claim is made by this lane.

## Validation

Focused boundary check:

```bash
node bench/pari-class-group-port/check_row20_fresh_prepared_transaction.cjs
```

Genuine run, with optional post-publication oracle in the final argument:

```bash
node bench/pari-class-group-port/check_row20_fresh_prepared_transaction.cjs \
  --genuine PREPARED_JSON OUTPUT_DIRECTORY [ORACLE_W0]
```

The genuine acceptance target is class number `1`, no nontrivial invariant
factors, two exact independent units, torsion order `2`, and HNF terminal state
`[0, 7, 7, 0, 7, 4, 0, 14, 0]`. The earlier acceptance-stage state is
`[0, 7, 1]`; the receipt reports the stronger terminal closure state.

The genuine run completed with:

- result SHA-256
  `95cb57bd732fe4e2f026568c1e040a0b8e31cfa1be339326775b4e76056d8dbd`;
- canonical result length `7293` bytes and immutable mode `0444`;
- mathematical-authority SHA-256
  `5ef8e9980843fb1742fe4b93e1e8d6cbc1078f18fadb69c8d53edfcda9953246`;
- raw-log SHA-256
  `81a3deef0c70930c064ef4f12febbc84ebf7e6b91202bf0f934c16bdec091b6c`;
- compact-log SHA-256
  `fc3799d890a0b6e8627cceb0e37e3372e4a89538869add1e163623e1665abdd1`.

The optional post-publication oracle had SHA-256
`6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468`.
It was opened only after the transaction returned and its neutral bytes were
published.
