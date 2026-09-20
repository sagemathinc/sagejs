# Authenticated PARI 2.17.4 control

This directory is a qualification-only control adapter. It dynamically links
the pristine local PARI 2.17.4 build under `/home/user/upstream/pari-2.17.4`.
It is not linked into, packaged with, or callable from the Sage.js product
path.

The build fails closed unless all of these agree with `pinned-identity.json`:

- the GP version is exactly 2.17.4 released;
- the GP executable and `libpari-gmp-tls.so.9` hashes;
- the pristine `buch2.c` hash used for class-group computation;
- PARI's version, generated configuration header, and build log hashes.

Each sample repeats the authentication through a build manifest containing the
compiler command, compiler version, adapter source hash, executable hash, PARI
archive hash, and the authenticated PARI file hashes. The native executable
also rejects any linked PARI version other than 2.17.4.

## Boundaries

The adapter accepts exactly three boundaries. They have different labels and
must only be paired with a Rust arm implementing the identical contract.

| CLI boundary | Exact timed interval | Excluded |
| --- | --- | --- |
| `algorithm-stage` | `bnfinit0(nf, 0, NULL, nbits2prec(192))` | polynomial decoding, `nfinit0`, getters, JSON |
| `prepared-field` | `bnfinit0(nf, 0, NULL, nbits2prec(192))` | polynomial decoding, `nfinit0`, getters, JSON |
| `public-call` | consecutive `nfinit0(polynomial, 0, ...)` and `bnfinit0(nf, 0, ...)` | polynomial decoding, getters, JSON |

The first two intentionally have the same native call interval but express two
different comparison contracts. `algorithm-stage` is suitable only when the
other arm also starts with an already prepared field and performs the complete
class/unit/regulator kernel. It is **not** a relation-only or Smith-only PARI
number. `prepared-field` is the end-to-end prepared-field contract. A benchmark
cannot substitute either for `public-call`, because the harness requires the
exact boundary label.

Every sample reports separate clocks for:

1. exact `nfinit0` polynomial-to-prepared-field work;
2. exact `bnfinit0` prepared-field-to-complete-BNF work;
3. result getters (excluded from all kernel boundaries).

PARI 2.17.4 flag zero computes strictly more than class invariants: its kernel
includes class-group, unit, and regulator work. The exact output fingerprint
currently covers the common representation-neutral projection—class number
and canonical invariant factors—so it can match the Rust qualification arm.

## Build and smoke test

```bash
cd bench/pari-class-group-rust/qualification/pari-control
./build.py
./smoke.py --boundary prepared-field
./smoke.py --boundary prepared-field --include-row6 > smoke.receipt.json
```

The checked-in smoke receipt runs all nine open cubic fields exactly once,
including row 6. It verifies results against the open corpus after computation;
expected answers are never passed to PARI.

Run one field directly with:

```bash
./run.py \
  --input ../corpus/initial-open-development-v1.json \
  --field-id small-class-number-6 \
  --boundary prepared-field \
  --seed 1
```

`benchmark-arms.json` contains reviewed arm fragments, all nine field records,
and identity commands for the alternating benchmark harness. Copy one arm into
a campaign only after a Rust adapter provides the exact same boundary. The
harness then enforces at least 15 alternating samples per arm. This smoke test
deliberately avoids that expensive row-6 campaign.

`prepared-field-campaign.template.json` is the complete 15-pair, nine-field
campaign shape. Its Rust executable is an intentional fail-closed placeholder;
replace it only with the reviewed Rust adapter for this exact prepared-field
contract. Do not relabel the current candidate relation-and-Smith executable.
