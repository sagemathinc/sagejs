# Rust class-group backend experiment

This is a Linux-only research arm for the PARI 2.17.4 class-group port.  It
answers a deliberately narrow question: does ordinary, memory-explicit Rust
remove the language/runtime overhead seen in the compiled-Python H1 graph?

The end-to-end experimental boundary starts from the prepared polynomial and
integral basis for `x^3 - 20018*x + 20034`.  Rust derives the 66-prime-ideal
factor base, seeds the initial relation cache, numerically prepares and
enumerates 16 ideal lattices, admits and values smooth elements, constructs a
66 by 73 relation presentation, and computes its Smith invariants.  All 66
Smith diagonal entries are one, so the resulting relation-lattice candidate
has trivial invariants.

The presentation is produced by the translated collector, not copied from an
oracle.  The natural exact-Rust LLL and 320-bit Gram--Schmidt path chooses a
slightly different valid candidate order from PARI, so its presentation is not
byte-identical to PARI's; the semantic terminal counters and class-group result
agree.  JSON parsing, oracle comparison, and result serialization are outside
the reported samples.

This is an end-to-end **class-group relation and candidate-invariants**
experiment, not a complete BNF implementation.  Unit reconstruction,
regulator work, completeness certification, class generators and maps, and
PARI's final BNF object construction remain outside the Rust boundary.  The crate
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

## Generic coefficient-box corpus

The independent coefficient-box collector also runs from a prepared monic
cubic polynomial and a unimodular maximal-order basis.  It is intentionally
simpler than PARI's LLL-guided collector and currently supports this narrower
field contract.  Six oracle-free Rust runs recover trivial, cyclic, and
noncyclic class groups:

| class invariants | Rust median | PARI 2.17.4 median | ratio |
| --- | ---: | ---: | ---: |
| `[]`, `x^3-x-1` | 4.158 ms | 0.519 ms | 8.01x |
| `[]`, discriminant 49 | 3.911 ms | 0.758 ms | 5.16x |
| `[2]` | 3.747 ms | 0.780 ms | 4.81x |
| `[3]` | 3.618 ms | 0.938 ms | 3.86x |
| `[2,2]` | 3.828 ms | 1.027 ms | 3.73x |
| `[6]` | 3.825 ms | 0.928 ms | 4.12x |

The comparison is deliberately conservative: the Rust time ends after Smith
class invariants, while each PARI sample runs complete prepared `bnfinit0`,
including units and regulator work.  Thus these are performance-regime ratios,
not matched-work ratios.  They show that plain Rust makes even an unsophisticated
collector reasonably fast, but PARI remains materially faster on tiny fields.
The checked corpus receipt contains every sample and the exact boundary notes.

On the larger H1 field, the generic coefficient-box path takes 119.721 ms,
while the faithful PARI-style Rust collector plus Smith computation takes
9.307 ms.  PARI's complete prepared-field computation takes 10.699 ms, and the
broader compiled-Python class-prefix boundary takes 1.635 s.  These are not
matched-work ratios—PARI includes units and the Python prefix includes extra
HNF and witness work—but the 12.9x difference between the two Rust paths is a
matched-language demonstration that algorithm and representation choices still
dominate after language overhead has been removed.

```bash
/home/user/.cargo/bin/cargo run --release -- \
  brute-force-cubic corpus/class-number-4.json
```
