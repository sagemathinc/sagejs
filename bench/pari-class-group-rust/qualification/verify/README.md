# Independent relation-witness verification

This directory contains a test-only correctness boundary for the Rust cubic
class-group experiment. The Rust executable first receives only a neutral
polynomial, integral basis, and resource parameters. After it has completed,
it may emit its factor base, relation rows, and algebraic-element witnesses.
`verify_relations.py` then opens those artifacts in a separate Python process
and asks PARI to reconstruct and factor every principal ideal.

The verifier checks that:

- the result still agrees with the neutral input and declares that PARI was
  neither linked nor used as runtime input;
- every emitted prime ideal is defined consistently by its `(p, generator)`
  pair and by its HNF, and occurs uniquely in PARI's prime decomposition with
  the emitted ramification index, residue degree, and norm;
- `idealfactor` gives exactly every emitted valuation in every relation row,
  with no prime ideal outside the factor base; and
- the exact element norm equals the product implied by the relation row.

This proves that the emitted rows are relations. It does not prove that they
generate the complete relation lattice, validate Smith transformations, or
certify a class group. Those require separate completion and linear-algebra
checks in the qualification plan. The emitted `tau` acceleration matrices are
also outside this harness; their arithmetic operations need direct tests.

## Dependencies and oracle boundary

The single-result verifier requires Python 3.10 or newer and `cypari2`. The
corpus runner additionally requires Cargo and the Rust toolchain. Its report
records both the cypari2 package version and the linked PARI version. Formal
qualification should use `--require-pari-version 2.17.4`; omitting it is useful
for development with another recorded PARI 2.17.x build.

PARI is only a test oracle after Rust has produced its result. The corpus
runner derives runtime input from the existing neutral files under `corpus/`
by adding only `includeWitnesses=true` and `samples=1`. It never copies class
numbers, relation rows, prime ideals, successful schedules, or expected
outputs into the Rust input.

Verify one existing result:

```sh
python3 qualification/verify/verify_relations.py \
  --input corpus/class-number-2.json \
  --result /tmp/rust-class-number-2.json
```

Generate and verify every current corpus example:

```sh
python3 qualification/verify/run_corpus.py \
  --require-pari-version 2.17.4 \
  --receipt /tmp/rust-relation-verification.json
```

Run the integration tests, which generate one fresh Rust result and confirm
that valid rows pass while modified relation and HNF entries fail:

```sh
cd qualification/verify
python3 -m unittest -v test_verify_relations.py
```
