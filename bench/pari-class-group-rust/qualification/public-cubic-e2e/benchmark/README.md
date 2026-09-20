# Public cubic sealed-result benchmark

This directory contains the frozen first performance campaign for the genuine
coefficient-only cubic route. The panel contains `x^3-x-1` and the first open
class-number-two field `x^3-8*x^2-30*x-29`. It was closed before timing and
requires 15 alternating pairs per field.

The Rust boundary starts with four public coefficient strings and ends when
the v2 sealed conditional class-group result has been constructed and checked.
The PARI boundary is the authenticated pristine PARI 2.17.4 public call:
`nfinit0(polynomial,...)` followed by `bnfinit0(nf,0,...)`. Both internal
clocks exclude process startup, input decoding, result projection, and JSON
serialization. PARI's flag-zero BNF computes class-group, unit, and regulator
data. Rust's result is explicitly GRH-conditional, so the comparison is a
performance comparison of the complete public routes, not a claim that their
proof assumptions are identical.

Before measured pairs, the harness performs one excluded warm-up of each arm
for each field. Pair order alternates (`Rust, PARI`, then `PARI, Rust`). Every
warm-up and measured result is checked exactly against the frozen field data;
the Rust check additionally requires all sealed-evidence, provenance, rank,
and authority flags. The receipt contains raw clocks, total and per-stage
medians, source-closure hashes, two clean-target release binary hashes, the
authenticated PARI identity, and the observed Git state. A dirty reachable
source closure is labeled diagnostic and cannot be a promotion result.

Build the pinned control if needed, then run:

```sh
bench/pari-class-group-rust/qualification/pari-control/build.py
python3 bench/pari-class-group-rust/qualification/public-cubic-e2e/benchmark/run.py
```

The checked-in `receipt.json` is the reviewed clean campaign for the commit it
names. Diagnostic or dirty-source reruns must not replace it; write those to a
temporary path or restore the reviewed receipt afterward.
