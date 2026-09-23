# Row-19 terminal continuation

Status: separately bounded live continuation from the authenticated first-HNF
owner; class/unit witness construction remains outside this cut.

The worker authenticates and consumes the immutable first-HNF owner, replays
its live prepared relation/HNF ancestry, and requires every retained exact
owner to agree before continuing.  It then executes the derived seven-ideal
search, appends relations 423 through 430, runs `pari_hnfadd`, derives the
analytic inverse-`hR` from prepared maximal-order degree data, and executes the
existing regulator acceptance path.  No W0 answer event is a runtime input.

The durable `/scratch` owner retains all 430 exact relations, raw logs,
generators and provenance, terminal `W/dep/B/C/permutation`, append HNF
ancestry and transform, analytic authority, regulator reconstruction states,
and accepted class number/regulator.  Answer-bearing W0 terminal HNF and
acceptance events are read only after the bounded worker exits.

Reproduce with:

```sh
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache-row19-terminal/final-cache \
SAGEJS_NATIVE_CACHE_ROOT=/scratch/sagejs-native-cache-row19-terminal/final-root \
  node bench/pari-class-group-port/check_row19_terminal_continuation.cjs
```

The legacy append entry stops honestly at its documented rectangular-CUP
frontier.  `row19_hnfadd_cup_suffix.py` resumes from the already constructed
joined relation/log owners, uses the existing explicit-workspace CUP kernel,
and then re-enters the unchanged `hnffinal` and acceptance paths.  Its CUP
arena is derived from the live 16-by-16 shape.

## Authenticated receipt

The successful run produced terminal state
`[9,15,415,0,6,7,0,430,0]`, append/acceptance state `[3,0,0,430]`, and
accepted class number `39366`.  The exact regulator is represented by

```text
[5388120023234602342042490535509591588773977815526887434923, 192, 21]
```

The content-addressed read-only owner is:

```text
/scratch/sagejs-row19-terminal-continuation/row19-terminal-continuation-f33fb0d7861a38f36b0b83249cd84598681949cc64362d670df8aef9908ebb76.json.gz
compressed sha256 bfa7c4a68a2571e5c2663fb43b672d7dcaae36905262b0256a318e44221123dd
```

It is 1,030,839 bytes uncompressed and 119,308 bytes compressed.  The worker
completed in 363,447,433,789 ns with 835,536 KiB maximum RSS and a
505,170,392-byte explicit-owner upper bound.

This receipt was produced with a fresh lane-private native cache.  It exactly
reproduced the mathematical states and SHA-256 projections from the preceding
warm-cache run; retained execution metrics account for the distinct owner
digest.
