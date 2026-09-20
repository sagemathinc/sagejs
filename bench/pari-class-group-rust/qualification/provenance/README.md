# Rust class-group provenance inventory

This directory is a qualification gate for the experimental Rust mathematical
core.  It answers three deliberately narrow questions:

1. Which handwritten files are in the Rust crate right now?
2. Which of those files are original work, behavioral reimplementations, or
   source translations/adaptations?
3. What pinned source and declared-license evidence is known for the upstream
   algorithms and linked dependency closures?

It does **not** make a legal conclusion.  SPDX expressions and upstream
license statements are inventory data, not advice about compatibility,
distribution, notice text, or satisfaction of obligations.  A translation or
adaptation remains classified as such even when it is written in another
language.

## Files

- `manifest.json` is the canonical, machine-readable inventory.
- `manifest.schema.json` closes the JSON shape and classification vocabulary.
- `check.mjs` validates the schema, source hashes, complete handwritten-source
  coverage, PARI source identities, the complete `Cargo.lock` package set, and
  the checked-in native dependency declarations.

Run from the repository root:

```bash
node bench/pari-class-group-rust/qualification/provenance/check.mjs \
  --pari-root /home/user/upstream/pari-2.17.4
```

`PARI_2_17_4_ROOT` may replace the command-line option.  The checker fails if a
new `.rs` or `.c` file is not classified, a recorded file drifts, a Cargo
package is added or changed, an upstream digest differs, a mapping claims
evidence without a known source record, or a missing mapping lacks an explicit
explanation.  It does not download source archives or infer licenses.

## Classification semantics

- `original`: designed and written for Sage.js.  It may call a library or use
  standard published mathematics, but no upstream source translation is
  presently identified.
- `behavioral_reimplementation`: written against observed behavior,
  mathematical specifications, tests, or a source-level algorithm boundary;
  source correspondence exists, but the file is not asserted to be a direct
  translation.
- `source_translation_adaptation`: source structure or operations were
  directly translated or adapted from identified upstream code.

`mapping_status` is independent of classification.  `complete` means the
manifest names all currently known relevant upstream cuts for that file;
`partial` means it names useful cuts but is known not to cover the whole file;
`missing` means a mapping is required but has not been established; and
`not_applicable` is reserved for original integration or adapter code for
which no source translation is claimed.

This inventory intentionally errs toward `partial` or `missing`.  Similar
names or mathematical purpose are not sufficient evidence for a source map.

## Current boundary and known gaps

The manifest covers every handwritten file under `bench/pari-class-group-rust/src`
and every package in the root `Cargo.lock`.  It also records the two foreign
arithmetic routes:

- ordinary `rug` builds use `gmp-mpfr-sys` and its bundled GMP 6.3.0 / MPFR
  4.2.2 sources;
- `flint-normal-form` additionally links the repository's pinned FLINT 3.6.0,
  OpenBLAS 0.3.33, GMP 6.3.0, and MPFR 4.2.2 archives.  Arb functionality is
  incorporated in FLINT 3.x; there is no separate `libarb` link in `build.rs`.

The source mapping remains incomplete.  In particular, broad modules such as
`factor_base.rs`, `ideal_arithmetic.rs`, `numerical_preparation.rs`, and
`class_group.rs` have useful PARI correspondence cuts but no function-by-
function derivation ledger.  `collector_schedule.rs` has clear behavioral
correspondence but no authenticated exact line map.  The standalone normal-
form implementations are currently classified as original, not silently
attributed to PARI merely because PARI also implements HNF/SNF.

Before promotion, a human provenance/license review must resolve every
`missing` and review every `partial` source map, verify upstream notice bytes
from the actual distributed source archives, decide the distribution
obligations of both arithmetic routes, and place required notices in the
product packaging.
