# Restricted open-cubic oracle comparison

This lane independently compares the exact 12-case public cubic receipt made
at commit `1f4237449` with the answer-bearing qualification evidence retained
outside the repository. It is intentionally separate from the coefficient-only
Rust run: the Rust process has already exited before this verifier opens the
private evidence, and the verifier never launches the Rust executable.

The configuration binds all three inputs by SHA-256:

- the public receipt and its clean source-closure/commit identity;
- the private 60+60 qualification evidence;
- the PARI 2.17.4 oracle-build identity.

For each of the 12 open cubics it compares every independently available exact
result field: polynomial identity, signature, equation-order index, field
discriminant, class number, invariant factors, and the signature-determined
unit rank. Both the candidate and completed class-group answers must match the
oracle. The restricted receipt contains case IDs and check names/statuses, but
does not copy expected or actual mathematical values from either input.

Run from the repository root, supplying the private evidence explicitly:

```bash
python3 bench/pari-class-group-rust/qualification/public-cubic-open-oracle/verify.py \
  --private-evidence /secure/qualified-panel-evidence-v1.json
```

The command fails closed before parsing private content if its digest differs
from the published selection receipt. It writes `receipt.json` atomically even
when a mathematical comparison fails, preserving each case's failure status
instead of silently dropping failures. Structural or hash-binding failures do
not produce a qualification receipt.

`receipt.json` is generated restricted evidence. Review it before publishing:
although it contains no answers, case-level failure information can reveal
facts about a previously secret qualification set. The held-out partition is
never read beyond validating the private evidence container shape.
