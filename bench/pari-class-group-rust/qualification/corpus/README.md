# Rust class-group qualification corpus

This directory freezes the R0 corpus contract for the Rust class-group trial.
It deliberately separates public inputs from answer-bearing oracle data.

Files:

- `qualification-corpus-spec-v1.json` fixes the panel size, quotas, seeds,
  canonicalization, selection procedure, and answer-isolation rules.
- `qualification-layout-v1.json` is the generated list of 60 open and 60
  held-out slots. Unfilled slots are explicit and carry no polynomial or answer.
- `initial-open-development-v1.json` records the nine existing public cubic
  cases used to begin R1/R2 development.
- `initial-open-development-v1-corrections.json` is an explicit correction
  overlay for four signatures that were incorrectly labeled totally real in
  the frozen source. The source stays byte-for-byte frozen; qualification
  consumers must apply the overlay.
- `corpus_tool.py` validates these files, regenerates the layout, and selects a
  complete panel from a private oracle candidate pool.
- `generate_candidate_pool.py` deterministically constructs an oversampled
  neutral input pool and qualifies it with the pinned PARI 2.17.4 executable.
  It refuses to write answer-bearing output anywhere in this repository.
- `neutral-candidate-inputs-v1.json` freezes 360 answer-free candidate inputs,
  72 for each degree 2 through 6.
- `neutral-candidate-inputs-v2.json` freezes a second 360-input pool at
  admissible scales. It fills signature and timing deficits without relying on
  pathological, over-30-second high-degree cases.
- `neutral-eligibility-v1.json` binds those inputs to an exact independent
  SymPy-over-QQ irreducibility screen. All 360 currently pass. This is why the
  provisional runtime inputs may truthfully set `field.irreducible` to true;
  the construction recipe alone is not treated as proof.
- `neutral-eligibility-v2.json` is the corresponding exact screen for the v2
  pool. Reducible candidates remain visible and are excluded rather than
  silently regenerated.
- `balanced-neutral-panel-v1.json` assigns 60 open and 60 held-out runtime
  inputs, exactly 12 per degree in each partition. It contains no answers and
  is explicitly provisional for the signature, timing, and feature quotas;
  it does not replace the frozen unselected qualification layout.
  Its first qualification request is conditional-GRH; an unconditional result
  is a later, separately evidenced claim rather than an input-side assertion.
- `qualified-neutral-panel-v1.json` is the canonical 60 + 60
  runtime panel selected from fully qualified evidence. It contains neither
  answers nor per-field signature, timing, trait, or oracle metadata.
- `qualification-selection-receipt-v1.json` binds that runtime
  panel to the qualified private-pool and private-evidence hashes. It publishes
  aggregate quota counts only; the field-to-answer mapping stays outside the
  repository.
- `qualified-neutral-panel-v1.schema.json` and
  `qualification-selection-receipt-v1.schema.json` are closed JSON schemas for
  the two committed qualification outputs.
- `corpus_adversarial_tests.py` exercises structural and schema validation
  against identity, shape, request, resource, randomness, answer-injection,
  retry-schedule, receipt-binding, and unknown-key mutations.
- `pari-2.17.4-oracle-identity.json` records the exact executable and library
  hashes used by the qualification generator.
- `pari-buchall-debug-trace-v1.json` freezes source-backed debug counters for
  relation-search continuation and actual precision restarts.
- `FROZEN-SHA256SUMS` freezes the R0 artifacts before implementation tuning.

The initial development panel remains intentionally incomplete. It contains
the existing small class-number 1, 2, 3, 4, and 6 examples, H1, the row-1 equation-index-3 cubic,
and row 6. Degrees 2, 4, 5, and 6 are represented by unfilled slots until the
full candidate pool is generated independently. The qualified neutral panel is
the separate, complete runtime corpus and does not rewrite this historical
development input.

This incompleteness is intentional and machine-visible: no timing stratum or
execution-path trait is guessed merely to fill a quota. `precision-restart`
and `relation-continuation` are assigned only from the frozen source-backed
PARI debug counters, never from elapsed time or answer shape.
The `ramified-factor-base-prime` trait is structural: it is assigned only when
a prime below 100 divides the independently checked field discriminant, under
the frozen policy that such ramified primes are included in the factor base.

## Canonical public field input

Each polynomial is monic, irreducible, integral, and encoded by decimal
coefficient strings in ascending order. Its identity is

```text
sha256(UTF8(JSON([c0,c1,...,cn], separators=(",", ":"))))
```

where every coefficient is a canonical decimal string (`0` or an optional
minus sign followed by a nonzero digit and then decimal digits). The runtime
qualification input consists of this polynomial plus declared resource and
proof policy. Integral bases, relations, retry schedules, class numbers,
invariants, units, and timing results are not runtime inputs.

## Completing the 60 + 60 panel

Generate a private candidate pool with pinned PARI 2.17.4 and at least one
independent check where practical. Each private candidate supplies neutral
input metadata, selection metadata, and an `expected` object. The schema is
validated by `corpus_tool.py`; run `python3 corpus_tool.py candidate-template`
for an example.

The reproducible generator first verifies both the PARI version banner and the
SHA-256 digest of the pinned executable. For every accepted polynomial, SymPy
independently checks irreducibility, signature, and the exact identity

```text
polynomial discriminant = field discriminant * equation-order index^2.
```

Generate answer-free inputs freely, but keep qualified evidence outside the
repository:

```bash
python3 generate_candidate_pool.py verify-oracle
python3 generate_candidate_pool.py neutral-inputs --output /tmp/neutral-inputs.json
python3 generate_candidate_pool.py qualify \
  --output /secure/private-candidate-pool-v1.json
```

`qualify` checkpoints after every candidate and records all 15 raw PARI public
timing observations. GP's timer has millisecond resolution; a zero-duration
observation is preserved conservatively as one positive nanosecond rather than
inventing sub-millisecond precision. The generated private pool is then the
input to `corpus_tool.py select` shown below. Long runs can be continued with
`--resume`; the tool refuses a checkpoint made with another seed or GP binary.
The default ten-minute per-candidate timeout covers 15 repetitions throughout
the admitted 30-second public timing range while bounding pathological fields.
The fifteenth repetition enables PARI debug level 1. The exact same `bnfinit`
call emits source-backed relation-batch and precision-restart events to stderr;
its answer must agree with all fourteen non-debug repetitions. The trace
contract pins the emitting `buch2.c` hash and fails closed if the two independent
precision-event strings disagree.

### Staged qualification

Running 15 public calls on all 360 candidates is intentionally unnecessary:
one admitted degree-six call can take tens of seconds. The resumable staged
route keeps every answer-bearing artifact outside the repository:

```bash
python3 generate_candidate_pool.py screen \
  --output /secure/private-screen-v1.json --resume
python3 generate_candidate_pool.py shortlist \
  --screen-pool /secure/private-screen-v1.json \
  --per-degree 30 \
  --output /secure/private-shortlist-v1.json
python3 generate_candidate_pool.py qualify \
  --ids-from /secure/private-shortlist-v1.json \
  --output /secure/private-candidate-pool-v1.json --resume
```

Screening performs one real PARI call, the independent mathematical checks,
and the source-backed trace collection. The shortlist preserves every legal
signature first, then reduces provisional timing and trait deficits, then uses
the frozen seeded hash tie-break. It contains the nine mandatory open IDs and
30 candidates per degree, leaving six spares per degree beyond the final two
12-case partitions. `qualify` upgrades only those IDs to 15 samples. Final
selection still uses the full validator and fails if stable 15-sample timing
strata or any other quota changes invalidate the shortlist; additional screened
spares are then upgraded deterministically. A one-sample stratum is never
published as a qualification result.

The frozen v1 greedy selector was not changed to accommodate the observed
panel. Its first 150-case fully sampled pool left the held-out 5–100 ms stratum
one case short. The reproducible `extend-shortlist` command upgraded all 51
remaining screened degree-three 5–100 ms spares; the resulting 201-case private
pool satisfies the frozen selector without changing its weights, degree order,
or seeded tie-break.

The completed campaign may merge deterministically screened candidates from
multiple answer-free profiles before shortlisting. The frozen selector still
sees one validated private pool: profile mixing cannot change the selection
seeds, quota checks, 15-sample requirement, or mandatory development inputs.

Selection is deterministic:

1. Reject malformed, reducible, duplicate, or oracle-incomplete candidates.
2. Reserve the nine mandatory existing fields in the open partition.
3. Within each partition, fill exactly 12 cases of each degree 2 through 6.
4. At each step choose the candidate that reduces the frozen signature,
   timing-stratum, and feature deficits most; break ties with the pinned
   SHA-256 seed order.
5. Validate all quotas. A deficient pool fails instead of changing a quota.
6. Write the legacy open evidence and held-out inputs to staging paths, write
   all per-field answer-bearing evidence outside the repository, and write one
   answer-free neutral runtime panel plus its aggregate receipt.

Example (the input pool and private output paths are illustrative):

```bash
python3 corpus_tool.py select \
  --candidate-pool /secure/class-group-candidates-v1.json \
  --open-output /tmp/open-qualification-v1.json \
  --heldout-output /tmp/heldout-inputs-v1.json \
  --private-heldout-answers /secure/heldout-answers-v1.json \
  --neutral-output qualified-neutral-panel-v1.json \
  --private-all-evidence /secure/qualified-panel-evidence-v1.json \
  --receipt-output qualification-selection-receipt-v1.json
```

The script refuses either private-answer destination under the repository root.
The committed runtime panel is answer-free for both partitions. A human
custodian retains the private evidence whose digest appears in the receipt.
The held-out runner compares results inside a restricted test process; it
reports case IDs and pass/fail diagnostics, not expected mathematical answers.
A fix motivated by a held-out failure requires a newly selected confirmation
set under a new seed/version.

Validate the committed R0 artifacts with:

```bash
python3 corpus_tool.py validate
python3 corpus_tool.py emit-layout --check
python3 corpus_tool.py emit-neutral-panel --check
python3 corpus_adversarial_tests.py
sha256sum -c FROZEN-SHA256SUMS
```
