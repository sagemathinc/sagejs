# Row 6 fresh prepared transaction audit

The row-6 transaction now has one mathematical runtime input: authenticated,
normalized prepared-number-field data.  Callers cannot provide factor-base,
initial-relation, or Gate-C owners or paths.  The transaction creates all
three privately, invokes the existing prepared factor-base and
initial-relation native roots, executes `runPreparedGateC`, and then executes
`runPreparedComplete`.  Its private directory is removed on success or
failure; only the final neutral correspondence envelope is published.

## Authority correction

Earlier row-6 terminal code treated the byte identity of retained owners as
mathematical authority.  Those bytes included `elapsedNs` and `maxRssKiB`, so
a genuinely fresh equivalent computation could never enter the terminal
path.  `row6-semantic-authority-v1` hashes the complete owner after excluding
only those two untrusted measurements and the temporary in-memory
`ownerSha256` transport annotation.  Backend, call count, resource policy,
prepared authority, source/compiler provenance, capacities, every relation,
every exact log, and all mathematical states remain authenticated.

The measurements remain available inside the transaction as untrusted
telemetry but are absent from the branded public receipt.  Downstream row-6
ancestry compares the versioned semantic identities; its mathematical
replays, ideal authentication, class witnesses, unit reconstruction, and C7
correspondence checks are unchanged.  C7 also cross-checks the independently
derived ancestry presentation against the class owner, so replacing frozen
whole-object hashes did not weaken that mutation boundary.

## Validation

Run:

```sh
node bench/pari-class-group-port/check_row6_fresh_prepared_transaction.cjs
```

The checker authenticates the prepared projection before spawning the capped
worker, rejects seven prepared-data mutations plus a caller attempt to inject
an owner path, verifies the immutable final result and a byte mutation, and
only then opens W0 as an external differential oracle.  W0 is never resident
in or visible to the fresh transaction.  The branded receipt records:

- `freshPreparedExecution: true`;
- `retainedRuntimeInputs: false`;
- `frozenW0RuntimeInput: false`;
- class group `[2, 2]` of order 4;
- `not_given(LARGE)` unit materialization;
- `correspondenceComplete: true` and `publicComplete: false`.

The verified immutable neutral envelope is 6,746,371 bytes with SHA-256
`b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73`.
The stable semantic factor, initial-relation, and Gate-C identities are,
respectively,
`b5003c003eec833d18d85e7c9b74104ad17e931780944841ef37898d200d5669`,
`36a7779e106cfdf75a1768fdc935578f79dcf26962f4ec06bef8102646eeb165`,
and `a657bc38fbcb45fd5c01b44e64ec8247f6e313abc7e3cb60f06389b94a054fb3`.
The terminal host rejected all eight mathematical owner mutations, while the
external checker rejected the seven prepared mutations, caller owner-path
injection, and final-byte mutation.

Native artifacts use the worktree's ignored `.sagejs-native-kernels` symlink,
whose resolved target is the scratch cache under `/scratch/sagejs-runtime`.
No performance claim is made by this transaction or audit.
