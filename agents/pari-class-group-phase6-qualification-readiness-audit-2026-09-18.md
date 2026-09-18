# Phase 6 qualification readiness: v2 fail-closed correction

This audit supersedes the earlier 13-row matched-readiness claim. It is a
read-only admission result, not a timing result. No long pair workload was run,
no reserve was opened, and execution remains disabled.

## Corrected readiness

Exactly **zero** development rows are currently matched-ready for Phase 6.
Rows `0,1,3,4,8,10,11,14,16,18,19,20,23` still have useful underlying
Sage.js/PARI implementation modules and frozen metadata, but they are listed as
`diagnostic-only`. Rows `6,13,21` do not have entries in the central inventory.
Consequently all 16 development rows are in `missingDevelopmentRows`.

The earlier registry admitted rows from module/export existence plus a shallow
common projection. Its wrapper then cloned that projection as replay, copied
static expected work values as counters, and supplied fallback mathematical-call
counts. Those operations do not prove representation-neutral matched class and
unit output. The v1 matched-readiness claim and receipts based on that claim
must not be used as qualification evidence.

The fresh-prepared 16-row correctness aggregate and the pinned PARI 2.17.4
artifact authentication remain separate diagnostic/correctness evidence. They
do not satisfy the Phase 6 matched-timing admission contract.

## V2 admission contract

A row can enter the matched inventory only through an entry committed to the
central `TRUSTED_V2_ADMISSIONS` authority. That allowlist is empty. A registrant
cannot inject evidence/verifier paths, hashes, or coverage: its entire capability
must deep-match the centrally reviewed entry for that row. The row-specific
evidence schema is bound exactly to the registration panel index. Only then may
the registry authenticate the evidence and verifier files, call the evidence
verifier, and require a separate live-sample verifier export. Admission must
cover every one of these capabilities:

1. class invariants;
2. generator ideals, generator orders, and principal witnesses when the class
   group is nontrivial;
3. a compact/factored unit basis, or an exact mutually matched `not_given`
   state;
4. regulator value and log-lattice semantics;
5. torsion;
6. terminal, precision, and retry state;
7. independent replay that is distinct from output;
8. mutation coverage of the replay/evidence families;
9. independently observed work counters;
10. independently observed native-call counters;
11. source and provenance hashes.

The first capability is the row-specific evidence/verifier itself. Missing any
capability leaves the row diagnostic-only. Expected metadata in the registry is
explicitly named `expectedWorkMetadata`; it is never emitted as an observed
counter.

The runtime wrapper no longer down-projects shallow metadata, constructs replay,
or normalizes hardcoded/fallback counters. It refuses diagnostic-only rows
before resident preparation. For a future admitted row, it delegates sample
construction to the authenticated row-specific live-sample verifier and rejects
a replay equal to the output. The central post-verifier validator additionally
requires the exact worker sample shape; distinct output/replay schemas and
authenticated digests; `independentReplay=true`; exhaustive named mutation
coverage; complete class, generator, unit, regulator/log-lattice, torsion, and
terminal/precision/retry state; positive observed work/native-call counters;
and source, adapter, core, and cache hashes matching the trusted capability.
The row verifier returns its observations separately, and the validator binds
the published counters and provenance back to those observations.

The historical `check_phase6_generic_pari_wave_smoke.cjs` entry point is also
retired fail-closed. It reads only the diagnostic inventory, reports the v2
capability gap in its error, and exits before loading the arm worker, preparing
a resident, starting PARI, or writing a shallow smoke receipt.

Row 14's `compareWithPari` path is the strongest existing comparison model, but
it has not been verified against this complete v2 contract. Row 14 therefore
remains diagnostic-only with the same missing-capability list as the other 12
inventory entries.

## Exact blockers

- All 13 inventoried pairs lack a v2 admission capability and each reports all
  12 missing capabilities.
- Rows `6,13,21` have no central diagnostic registration.
- All eight final-reserve fields remain sealed.
- `executionEnabled=false` and `reserveOpeningEnabled=false` remain mandatory.
- This process is not a human-approved quiet timing authority.

The absence of v2 admission is independently sufficient to prohibit a Phase 6
campaign. Existing unqualified smoke receipts remain diagnostics only.

## Focused audit commands

These commands perform no heavy matched pair workload:

```sh
node --test test/pari-class-group-prepared-adapter-registry.cjs
node bench/pari-class-group-port/check_phase6_qualification_readiness.cjs
```

The second command authenticates the locally pinned PARI artifacts and prints
the exact per-row missing capability lists. Supplying the prepared corpus and
aggregate receipt additionally reauthenticates the correctness aggregate, but
does not change the zero-row matched-readiness result.
