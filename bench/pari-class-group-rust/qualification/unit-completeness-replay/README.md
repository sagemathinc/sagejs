# Row-6 unit, regulator, and completeness replay

This isolated qualification binary consumes the existing prepared row-6 v2
evidence and its answer-free neutral prepared-field input. It independently:

1. replays every compact unit as an exact dependency of the complete sparse
   relation presentation;
2. regenerates and compares every descriptor in the ordered 1,130-column
   maximal-order factor-base catalog;
3. reconstructs all 1,137 principal ideals from exact integral-basis
   multiplication, independently multiplies their 7,136 retained nonnegative
   prime-ideal factors in canonical row HNF, and checks equality relation by
   relation;
4. reproduces the compact class-lattice certificate and requires its exact
   hash to match the independently replayed Sage.js certificate, whose replay
   directly recomputed the 1,130-by-1,130 square relation determinant;
5. expands each fundamental unit's integer combination of those dependencies
   and checks its compact principal-element representation exactly;
6. recomputes the 4,096-bit directed Arb regulator enclosure from those exact
   compact units;
7. regenerates all cubic splitting types from the neutral field, rebuilds the
   Belabas--Friedman and Belabas--Diaz-y-Diaz--Friedman schedules, and
   recomputes their directed Arb enclosures; and
8. proves that the analytic class/unit-index interval contains the unique
   positive integer `1` and that the factor-base-generation margin is strictly
   positive, under the two hypotheses named in the receipt.

PARI is not linked or invoked. PARI 2.17.4 remains an external test oracle for
the source artifact only.

Generate the retained evidence from the answer-free neutral input (the final
two arguments are the relation-collection packet limit and scan budget):

```sh
cargo run --release --manifest-path \
  bench/pari-class-group-rust/qualification/row6-candidate/Cargo.toml -- \
  small-norm-unit-kernel-prepared \
  bench/pari-class-group-rust/qualification/row6-candidate/inputs/row6-neutral-prepared-field.json \
  2000 600000 > /tmp/row6-prepared-v2.json
```

The class-index step additionally has a required independent Sage.js
prerequisite. Its durable receipt is
`../candidate/row6-sagejs-compact-replay-receipt.json`; reproduction commands
are documented in the candidate README and adapter. This binary embeds and
hash-validates both that receipt and the exact adapter source. The accepted
certificate digest is
`sha256:ce85dcbcfdae9e73f6fe789f8712c463765295c7f41749c0d6950f53127cfaf2`.
The adapter recomputes the large square determinant; the Rust certificate
producer by itself treats the prepared square determinant as an input.

```sh
cargo run --release --manifest-path \
  bench/pari-class-group-rust/qualification/unit-completeness-replay/Cargo.toml -- \
  verify /tmp/row6-prepared-v2.json \
  bench/pari-class-group-rust/qualification/row6-candidate/inputs/row6-neutral-prepared-field.json

cargo run --release --manifest-path \
  bench/pari-class-group-rust/qualification/unit-completeness-replay/Cargo.toml -- \
  counterfeit-suite /tmp/row6-prepared-v2.json \
  bench/pari-class-group-rust/qualification/row6-candidate/inputs/row6-neutral-prepared-field.json
```

This is conditional-GRH, prepared-field evidence for row 6. It deliberately
does not claim an unconditional proof, general fields, or a public Sage.js
result. The exact ideal arithmetic is authenticated by the allowlisted row-6
prepared maximal-order boundary; Rust does not yet independently prove
maximality for this nonsquarefree-discriminant fixture.

`results/row6-replay-receipt.json` records a successful retained-artifact
replay from the preceding unit/completeness stage. It is intentionally marked
as requiring an integration commit and must be regenerated after the exact
algebra replay code has a code-bearing revision; this qualification lane does
not promote or rewrite that final receipt prematurely.
