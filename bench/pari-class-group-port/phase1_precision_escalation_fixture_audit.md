# Phase 1 precision-escalation correctness fixture

## Disposition

`phase1-precision-escalation-fixture.json` closes the bounded
correctness-only precision-escalation corridor for the authentic totally real
cubic H1 input `x^3 - 20018*x + 20034`. It consolidates evidence that was
already present; it does not create a new arithmetic or performance claim.

The observed attempt sequence is

```text
192 PRECI -> 384 PRECI -> 768 PRECI -> 1536 PRECI -> 2304 success
```

The wording `192 -> 2304` is therefore only a shorthand for the complete
five-attempt corridor. It is not a direct transition. The first four next
precisions follow the pinned PARI 2.17.4 unflagged `myprecdbl` policy. Success
at 2304 is a live translated-leaf observation, not a constant in the retry
driver and not a prediction made by the fixture.

## Evidence boundary

The consolidated fixture binds three existing layers by SHA-256:

1. The frozen panel identity and authentic 73-relation resident owner fixture.
2. The pristine-PARI `bnfnewprec`/`getfu` differentials that rebuild p2176
   logs and the p2240 embedding with p2304 working capacity, matching CPython,
   generated JavaScript, GMP, and tagged execution on exact outputs.
3. The answer-independent H1 retry driver and unified native root, which
   execute the source-policy schedule, preserve exact-owner identity, publish
   only after success, stop transactionally at a 2048-bit resource cap, and
   reject exact-owner and logical-dimension mutations.

This is enough for the Phase-1 correctness-fixture acceptance contract: the
pristine source and input identity are pinned; branch inputs, decisions,
rebuilt numeric owners, terminal decision, and publication state are retained;
translated execution is differentially checked; and cap, mutation, malformed
dimension, and partial-publication failures are exercised.

It does **not** change the performance-population finding. All sixteen frozen
default-driver traces still remain at 192 bits, this fixture is not a timing
input, no reserve field is opened, and the separate successful full-honesty
fixture remains missing.

## Executable gate

The fast read-only gate checks all evidence hashes, rederives the four policy
transitions, validates the frozen panel and PARI identities, rejects timing
fields, and verifies that the retry driver contains no 2304-bit terminal
literal:

```sh
node bench/pari-class-group-port/check_phase1_precision_escalation_fixture.cjs
```

To rerun the authentic native H1 producer and compare its receipt with the
consolidated fixture, use:

```sh
node bench/pari-class-group-port/check_phase1_precision_escalation_fixture.cjs --live
```

An optional resident-output path may follow `--live`. Generated replay output
belongs under `/scratch`; neither command records timings.
