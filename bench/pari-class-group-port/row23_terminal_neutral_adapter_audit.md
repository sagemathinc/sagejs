# Row 23 field-neutral terminal adapter

`row23_terminal_neutral_adapter.cjs` maps one explicitly supplied, immutable
row-23 final owner into `class_unit_correspondence_result.cjs`. It does not
search for an artifact, rerun preparation, or manufacture replay authority.
The caller supplies the canonical source bytes and a branded, out-of-band,
synchronous replay callback.

## Detached source replay

Before projection, the checker invokes
`row23_final_result.py:cold_replay_row23` in a separate Python process. The
receipt binds the complete source SHA-256, payload SHA-256, field identity,
class number 6, invariant factors `[6]`, four exact units, and the distinct
terminal facts `correspondenceComplete=true` and `publicComplete=false`.
Promises and copied/unbranded authority objects are rejected.

The authenticated source is:

```text
source SHA-256         fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318
source payload SHA-256 8deea1abbf8a6b36ab987d30ce0f200f2d561a4a88616786a7843b754c6f475d
source schema          sagejs.pari-class-group/row23-final-buchall-end-v1
field                  5.5.1002836007889.1
polynomial             [341,-970,772,-141,-2,1]
```

## Neutral projection

The neutral result preserves:

- class number 6, invariant `[6]`, the exact reduced generator ideal, full
  Smith presentation, compact/expanded principal witness, and `genback`
  evidence;
- all four integral-basis units, exact inverses and norms `[-1,1,1,1]`;
- packed regulator, torsion generator and inverse;
- three explicitly assumed PARI/GRH/analytic claims and remaining boundaries;
- the complete canonical source envelope as a storage owner.

Every structured object without a natural flat integer representation is
stored as canonical JSON bytes under a named, capacity-authenticated owner.
The neutral terminal state remains
`pari-correspondence-complete-internal`, correspondence complete and public
completion false.

The deterministic neutral envelope is:

```text
mathematical authority SHA-256 2966259e4b8bfdbef7d1a5ef6e29a96888037cb4e278607e9f26e053c4b50418
neutral envelope SHA-256       5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c
```

## Negative and transactional coverage

The focused checker rejects 11 independently resealed source mutations across
presentation, generator ideal, principal witness, units, inverses, norms,
torsion, regulator, assumptions, and both completion flags. It rejects 12
validly resealed neutral-payload mutations spanning field/class identity,
assumptions, every principal class owner, exact unit owners, regulator,
torsion, and retained source bytes. It separately rejects an unbranded source
authority, a wrong source digest, and a forged replay receipt.

Publication is fully replayed through a second detached neutral authority.
Equal republication is identity-preserving. A distinct, independently valid
envelope raises `ClassUnitResultConflict` without replacing the current result.

Reproduce with the explicit owner path:

```bash
node bench/pari-class-group-port/check_row23_terminal_neutral_adapter.cjs \
  /scratch/sagejs-row23-final-result-correspondence-v3/row23-final-fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318.json.gz
```

This adapter makes no timing claim and does not register a production public
API. Registry integration is intentionally deferred.
