# Untouched cubic confirmation inputs

This directory was materialized after the original blind 12-case held-out run
but before any failure-motivated core change. The original policy was only an
uncommitted worktree file and therefore was **not preregistered**. Its 3/12
receipts remain historical blind evidence, not a confirmation gate.

`policy.json` is the replacement v2 policy. It deterministically selects twelve
unused degree-three inputs from the private qualified candidate pool using only
an answer-free projection: field ID, polynomial, polynomial digest, degree, and
the independent irreducibility boolean. Selection does not inspect expected
answers, signature, timing, traits, construction evidence, or runtime output.
Every identity and polynomial in the original 120-case panel is excluded.

`inputs.json` contains public polynomials but no expected values. It was frozen
and intentionally unexecuted until the original twelve-case regression set
passed after the failure-motivated fixes. The original twelve cases remain
regression evidence; qualification additionally requires this untouched set.
If this set motivates another fix, a new policy version and seed are required.

Execute the answer-free confirmation set, writing answer-bearing process output
only outside the repository:

```bash
private_dir=$(mktemp -d /tmp/sagejs-cubic-confirmation.XXXXXX)
python3 bench/pari-class-group-rust/qualification/public-cubic-heldout-confirmation/run.py \
  --private-results "$private_dir/rust-results.json"
```

Only after the executor terminates, compare against the externally held private
candidate pool. The checked-in comparison receipt contains case identities and
named pass/fail information, never expected or actual mathematical answers:

```bash
python3 bench/pari-class-group-rust/qualification/public-cubic-heldout-confirmation/verify.py \
  --private-results "$private_dir/rust-results.json" \
  --candidate-pool /secure/qualified-candidate-pool-v1.json \
  --private-binding /secure/heldout-cubic-confirmation-binding-v1.json
```

Regenerate from the repository root without printing selected values:

```bash
python3 bench/pari-class-group-rust/qualification/public-cubic-heldout-confirmation/select.py \
  --candidate-pool /secure/qualified-candidate-pool-v1.json \
  --private-binding /secure/heldout-cubic-confirmation-binding-v1.json
```

Use `--check` with the same arguments to verify that committed artifacts are
canonical. The mode-`0600` external binding records the candidate-pool digest;
that private digest is deliberately not published here.
