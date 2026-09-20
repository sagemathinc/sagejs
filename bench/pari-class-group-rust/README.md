# Rust class-group backend experiment

This is a Linux-only research arm for the PARI 2.17.4 class-group port.  It
answers a deliberately narrow question: does ordinary, memory-explicit Rust
remove the language/runtime overhead seen in the compiled-Python H1 graph?

The end-to-end experimental boundary starts from the prepared polynomial and
integral basis for `x^3 - 20018*x + 20034`.  Rust derives the 66-prime-ideal
factor base, seeds the initial relation cache, numerically prepares and
enumerates 16 ideal lattices, admits and values smooth elements, constructs a
66 by 73 relation presentation, and computes its Smith invariants.  All 66
Smith diagonal entries are one, so the resulting class group is trivial.

The presentation is produced by the translated collector, not copied from an
oracle.  The natural exact-Rust LLL and 320-bit Gram--Schmidt path chooses a
slightly different valid candidate order from PARI, so its presentation is not
byte-identical to PARI's; the semantic terminal counters and class-group result
agree.  JSON parsing, oracle comparison, and result serialization are outside
the reported samples.

This is an end-to-end **class-group relation and invariants** experiment, not a
complete BNF implementation.  Unit reconstruction, regulator work, and PARI's
final BNF object construction remain outside the Rust boundary.  The crate
links GMP and MPFR statically through `rug`, but does not link or invoke PARI.

The translated algorithm and fixture provenance are GPL-2.0-or-later and are
generously attributed to the PARI group.  This experiment carries the same
license and no warranty.

```bash
node ../pari-class-group-port/export_h1_rust_phase_checkpoints.cjs \
  /path/to/frozen/inputs.json /tmp/h1-rust-phase-checkpoints.json
/home/user/.cargo/bin/cargo run --release -- \
  class-group /tmp/h1-rust-phase-checkpoints.json
```

The checked development receipt records the exact timings, binary sizes,
toolchain, and comparison-boundary caveats.

The current `rug`/`gmp-mpfr-sys` dependency does not cross-compile directly to
`wasm32-wasip1`; its build script rejects that host/target pair unless an
experimental forced cross-build is requested.  The algorithms themselves are
not tied to Linux, but a Wasm backend needs a deliberate integer/float strategy
rather than an accidental GMP cross-build.
