# Phase-5 development-root registry

This registry is a development-only identity and publication boundary. It does
not run a prepared class/unit kernel, discover retained inputs, open scratch
artifacts, invoke PARI, acquire a timing lock, produce a qualification receipt,
or admit any final-reserve field.

`phase5_development_roots.cjs` binds every one of the sixteen frozen development
rows to its exact manifest ID, ascending defining polynomial, polynomial digest,
degree, signature, stratum, and role. It records sixteen committed internally
complete roots. Thirteen roots originally produced the field-neutral
`ImmutableClassUnitCorrespondenceResult`; committed adapters now bring rows 19
21, and 23 to the same boundary, so all sixteen roots are neutral-ready.

## Interface

- `buildDevelopmentRootRegistry({manifest, panel})` validates the frozen field
  identities and returns immutable, data-only entries. Entries name producer
  modules and exports but contain no artifact paths.
- `developmentRoot(panelIndex)` resolves development rows and rejects reserve
  rows before returning an entry.
- `verifyDevelopmentRoot({panelIndex, raw, authority, sourceMetadata})` invokes
  the existing branded neutral verifier, then checks the payload polynomial,
  degree, internal field identity, and normalized source status against the
  registry.
- `normalizeVerifiedDevelopmentRoot(...)` accepts only the neutral immutable
  result brand and returns one `phase5-development-root-v1` record. It always
  records `freshPreparedExecution=false` and `qualifiedTiming=false`.

Rows 0 and 10 have historical internal polynomial labels that differ from the
generated manifest IDs. The registry permits those two explicit labels only
after binding their coefficients and polynomial digest to the manifest field.
All other roots use the manifest field ID directly.

## Coverage and remaining gaps

Neutral-envelope-ready rows are 0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19,
20, 21, and 23. Rows 6, 13, 16, 18, and 20 still need small publication wrappers
around their existing payload/preparation exports; this registry deliberately
does not manufacture their out-of-band mathematical authorities.

Row 19 is internally complete at commit `7e963b4ee`; the registry now binds
`row19_class_unit_result_adapter.cjs` and its
`prepareRow19ClassUnitResult`/`publishPreparedRow19ClassUnitResult` interface.
It retains `sagejs.pari-class-group/row19-buchall-end-result-v1` as the source
schema. Row 21 binds `row21_terminal_neutral_adapter.cjs` and its
`prepareRow21NeutralResult`/`publishPreparedRow21NeutralResult` interface while
retaining `sagejs.pari-class-group/row21-final-buchall-end-v1` as its source
schema. Row 23 binds `row23_terminal_neutral_adapter.cjs` after exact
degree-five ideal reduction, expanded ideal-product replay, and full `clg2`
correspondence closed its former gap. Its source schema is
`sagejs.pari-class-group/row23-final-buchall-end-v1`.

The focused checker covers registry counts, a successful branded neutral
result, generated-ID/internal-ID normalization, polynomial and signature
identity changes, unsupported terminal status, an unbranded authority, a wrong
result brand, inconsistent source metadata, row-23 registration, and reserve
rejection. It makes no scratch reads and performs no timed or fresh mathematical
computation.

## Untimed development execution

The qualification manifest now has a separate
`developmentExecutionEnabled=true` gate. The broad `executionEnabled` and
`reserveOpeningEnabled` gates remain false. This admits only the Sage-side,
untimed correctness route; it does not admit `--run`, alternating PARI timing,
host approval, receipt generation, or reserve opening.

`qualification_execution_core.cjs` exposes
`runDevelopmentCorrectnessPath({root, invoke})`, or the equivalent explicit
`{root, result, replay}` form. The supplied root must be the exact immutable
registry entry. The invocation must return a branded, already verified
`ImmutableClassUnitCorrespondenceResult`, normalized source metadata, and a
detached replay record binding the result digest, payload digest, and field
identity. The returned `development-correctness-execution-v1` record contains
only result/replay/payload digests and terminal status. It has no clock,
calibration, repetitions, blocks, host declaration, or qualification receipt.

The CLI accepts:

```text
node bench/pari-class-group-port/run_class_unit_qualification.cjs \
  --run-development descriptor.json
```

The descriptor names an explicit caller-supplied driver module/export and an
opaque input object containing whatever paths and authority material that
driver requires. The runner never derives artifact locations from a row or
searches scratch storage. It validates the descriptor and manifest gate, then
rejects reserve fields before resolving or loading the driver. Available-field
drivers remain responsible for explicitly opening
and authenticating their heterogeneous inputs and returning the required
verified result plus detached replay.
