# Upstream-assumed diagnostic envelope and cold replay

This is the smallest field-neutral publication boundary that is useful before
the PARI 2.17.4 port has a connected `buchall_end` result. It complements the
stronger row-6 and row-14 C7 envelopes: unlike those field-specific joins, it
can retain partial live or frozen diagnostics from rows 19, 21, and 23 without
pretending that their individually successful stages form one computation.

The envelope contains only field identity, explicit upstream assumptions, a
sorted list of detached components, and a terminal status. A component is a
name, schema, status (`live-authenticated`, `frozen-diagnostic`, or
`derived-diagnostic`), provenance digest, payload digest, and canonical JSON
payload. Exact mathematical integers should remain decimal strings. The
boundary does not reinterpret a diagnostic's internal representation.

## Authority and immutability

An envelope cannot authorize itself. `verifyDiagnosticEnvelope` requires an
opaque authority created out of band, pins the complete envelope digest and
field identity, and requires one independent replay callback for every retained
component. Each callback receives a detached payload and immutable descriptor;
its receipt must bind the component name, field, payload digest, replay schema,
and an independent evidence digest. Missing, extra, or rejected callbacks fail
closed.

Successful verification returns an immutable byte owner. Accessors return
copies, so changes to live owners, callback inputs, decoded payloads, or returned
buffers cannot modify a published result. Repeated equal publication is
idempotent; a different terminal byte string conflicts. This replay is cold and
untimed. It must not be invoked inside a matched class-group kernel clock.

## Deliberately impossible completion claims

The schema fixes all three completion claims to false:

```json
{
  "buchallEndEquivalent": false,
  "classUnitComputationComplete": false,
  "publicComplete": false
}
```

It is not an instance of `ClassUnitComputation`, does not pass through the
standard class-group adapter, and cannot be promoted by supplying more
component names. The status remains `upstream-assumed-diagnostic-only` even
when every presently available diagnostic is included.

For an actual `buchall_end`-equivalent publication, one authenticated run must
still supply and cross-link all of the following—not merely similar values from
separate frozen fixtures:

1. the accepted relation matrix, HNF/dependent block, transformed logarithms,
   permutation, and principal relation generators;
2. full HNF/Smith transformations, inverses, and provenance back to the raw
   relations (`M1` and `M2` included);
3. reduced class-generator ideals and exact principal witnesses for each
   generator-order relation (`Ga` and `Ge`);
4. the source archimedean cleanup and final `GD`, `ga`, and `clg2` state;
5. fundamental-unit factor provenance, the source `getfu` result, and the exact
   expanded-unit or legitimate PARI `not_given` materialization status;
6. torsion, regulator, working precision, and accepted cleanarch/analytic
   evidence;
7. honesty, retry, precision-restart, and terminal source state; and
8. a transactional final assembly whose cold verifier replays every link above
   from the prepared field and retained exact owners.

Even that would establish only the explicitly upstream-assumed PARI
correspondence result. A public `ClassUnitComputation(complete=True)` separately
requires the repository's exact class witnesses, rigorous regulator enclosure,
unit index-one/saturation evidence, and the promised GRH-conditional or
unconditional proof payload.

## Focused mutation test

Run:

```bash
node bench/pari-class-group-port/check_upstream_assumed_diagnostic_envelope.cjs
```

The test retains eleven component kinds currently represented somewhere in the
campaign: prepared field, factor base, relation presentation, HNF/SNF, class
generator witnesses, compact unit lattice, exact unit reconstruction,
regulator acceptance, torsion, honesty, and terminal candidate. It coordinates
a fresh transport digest after mutating each component, then proves that the
independent component replay still rejects it. It also rejects descriptor,
completion-label, and missing-input-list changes and checks detached ownership
plus idempotent publication.
