# Complete prepared-H1 adapter

`h1_outcome_c_live_adapter.cjs` now invokes
`pari_unified_complete_h1_root` directly. It no longer composes the old
candidate and bridge prefixes on the host. The root receives the 351 sanitized
prepared owners followed by fixed-shape, zero-initialized private work owners
and a caller policy precision cap. Its successful output is serialized as one
standard internal result containing the exact polynomial, presentation and
Smith transformations, relation maps, compact-unit provenance, exact units and
norms, regulator ball, torsion, and the terminal publication state.

The adapter authenticates the prepared number field before entering the root
using `authenticatePreparedNf`. The authority digest is embedded in the result
and passed to any replay consumer, so a replay receipt cannot silently be
reused for a different prepared field.

`preparePreparedH1` compiles the kernel and performs that authentication before
the worker starts its clock. It returns an adapter-private capability bound to
the field identity, owner ABI, and authority digest. A direct caller that omits
the capability is still safe, but pays for preparation authentication inside
its call. Forged capabilities fail closed.

## Deliberately split authorities

Native publication is necessary but is not independent verification. The root
therefore leaves its internal correspondence bit false until a detached replay
authority exists. Consequently the default adapter returns:

- `correspondenceComplete: false`;
- terminal status `native-final-publication-awaiting-cold-replay`; and
- a `cold-replay-required` record bound to the result digest.

An integration may inject `authenticateFinalPublication(publication)`. In
addition to the standardized result and prepared-field authority, the
publication contains a frozen map of borrowed numeric `replayOwners`: all live
relation records and principal generators, relation/HNF transforms, class
maps, exact units/logs, regulator state, and torsion state needed by the cold
snapshot lane. The hook must synchronously capture their logical prefixes; the
adapter does not perform a second enormous host copy. The hook must cold-replay
the material result state (relations/presentation/Smith maps, exact units,
regulator, torsion, and assumptions) and return exactly:

```text
{
  status: "cold-replay-authenticated",
  resultSha256: <digest of the supplied standardized result>,
  authoritySha256: <digest of the independent replay authority>
}
```

Only after this receipt is checked does the adapter return
`correspondenceComplete: true` and the worker-compatible terminal status
`pari-correspondence-complete-internal-h1`. Public completion remains false in
both cases. The cold replay implementation is intentionally not duplicated in
this adapter; the terminal-snapshot/cold-verifier lane owns it.

## Timing boundary

The adapter exports `stageMode: "whole-root-only"`. The 564-argument compiled
root is one native call, so inventing host callbacks between its internal
phases would produce false exclusive timing. Until the root exposes honest
native leaf counters, all elapsed time is reported as the explicit
unattributed remainder.

The focused check uses a mechanically faithful fake root ABI to verify full
argument construction, standardized publication, prepared-authority binding,
the replay gate, detached-receipt rejection, failed/unpublished roots, and a
replayed unit mutation:

```text
node bench/pari-class-group-port/check_h1_outcome_c_live_adapter.cjs
```

The complete native mathematics itself remains covered by
`check_pari_unified_complete_h1_root.cjs`; this adapter check does not replace
that oracle.
