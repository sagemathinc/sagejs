# Rust class-group backend experiment

This is a Linux-only research arm for the PARI 2.17.4 class-group port.  It
answers a deliberately narrow question: does ordinary, memory-explicit Rust
remove the language/runtime overhead seen in the compiled-Python H1 graph?

The first executable boundary is the exact 66 by 73 relation presentation for
`x^3 - 20018*x + 20034`.  The presentation is produced by the real translated
collector, not invented by this crate.  Rust computes its Smith invariants by
unimodular row and column operations and requires all 66 invariants to be one.
JSON parsing, input conversion, workspace reset, and verification are outside
the reported kernel samples.

This suffix is an intermediate result, not an end-to-end timing.  It becomes a
full prepared-prefix experiment only when relation collection moves into Rust.
It links GMP through `rug`, but does not link or invoke PARI.

The translated algorithm and fixture provenance are GPL-2.0-or-later and are
generously attributed to the PARI group.  This experiment carries the same
license and no warranty.

```bash
node ../pari-class-group-port/export_h1_rust_checkpoint.cjs \
  /path/to/frozen/inputs.json /tmp/h1-rust-seam.json
/home/user/.cargo/bin/cargo run --release -- /tmp/h1-rust-seam.json
```

