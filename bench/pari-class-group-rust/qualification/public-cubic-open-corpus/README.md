# Public cubic open-corpus qualification

This lane runs the complete frozen **open degree-three partition** through the
coefficient-only Rust class-group boundary. It selects all 12 cubics from
`qualified-neutral-panel-v1.json`; it never chooses cases according to their
result.

The child process receives only four polynomial coefficients, a conditional-GRH
proof request, and one global resource profile. It receives no prepared field,
class number, relation, retry schedule, or PARI value. The runner does not start
PARI. It verifies each returned sealed result and rejects any receipt that says
PARI, a prepared fixture, or field answers were used as input.

Run from the repository root:

```bash
python3 bench/pari-class-group-rust/qualification/public-cubic-open-corpus/run.py
```

This builds the public executable once with `cargo build --locked --release`,
validates the frozen corpus and selection receipt, runs each field in a fresh
process, enforces the frozen 600-second and 4-GiB external limits on Linux, and
writes `receipt.json` atomically.

The checked-in panel deliberately omits per-field oracle answers. Consequently,
this receipt proves that the Rust path completes and replays its own sealed
evidence without PARI at runtime; it is not an independent differential oracle.
Qualification-grade answer comparison must happen in the restricted verifier
against the private evidence bound by `privateEvidenceSha256`, without passing
those answers to the Rust process. The held-out partition is intentionally not
executed here.
