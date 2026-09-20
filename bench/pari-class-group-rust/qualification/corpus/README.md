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
- `corpus_tool.py` validates these files, regenerates the layout, and selects a
  complete panel from a private oracle candidate pool.
- `generate_candidate_pool.py` deterministically constructs an oversampled
  neutral input pool and qualifies it with the pinned PARI 2.17.4 executable.
  It refuses to write answer-bearing output anywhere in this repository.
- `neutral-candidate-inputs-v1.json` freezes 360 answer-free candidate inputs,
  72 for each degree 2 through 6. Reducible candidates are expected to be
  rejected during private qualification; oversampling leaves room for that
  rejection and for deterministic quota selection.
- `pari-2.17.4-oracle-identity.json` records the exact executable and library
  hashes used by the qualification generator.
- `pari-buchall-debug-trace-v1.json` freezes source-backed debug counters for
  relation-search continuation and actual precision restarts.
- `FROZEN-SHA256SUMS` freezes the R0 artifacts before implementation tuning.

The initial panel is intentionally incomplete. It contains the existing small
class-number 1, 2, 3, 4, and 6 examples, H1, the row-1 equation-index-3 cubic,
and row 6. Degrees 2, 4, 5, and 6 are represented by unfilled slots until the
full candidate pool is generated independently.

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

Selection is deterministic:

1. Reject malformed, reducible, duplicate, or oracle-incomplete candidates.
2. Reserve the nine mandatory existing fields in the open partition.
3. Within each partition, fill exactly 12 cases of each degree 2 through 6.
4. At each step choose the candidate that reduces the frozen signature,
   timing-stratum, and feature deficits most; break ties with the pinned
   SHA-256 seed order.
5. Validate all quotas. A deficient pool fails instead of changing a quota.
6. Write public open inputs with answers, public held-out inputs without
   answers or oracle metadata, and private held-out answers to a path outside
   the repository.

Example (the input pool and private output paths are illustrative):

```bash
python3 corpus_tool.py select \
  --candidate-pool /secure/class-group-candidates-v1.json \
  --open-output /tmp/open-qualification-v1.json \
  --heldout-output /tmp/heldout-inputs-v1.json \
  --private-heldout-answers /secure/heldout-answers-v1.json
```

The script refuses a private-answer destination under the repository root. A
human custodian then freezes hashes of all three outputs. Development agents
receive the open file. The held-out runner receives the input file and compares
results inside a restricted test process; it reports case IDs and pass/fail
diagnostics, not expected mathematical answers. A fix motivated by a held-out
failure requires a newly selected confirmation set under a new seed/version.

Validate the committed R0 artifacts with:

```bash
python3 corpus_tool.py validate
python3 corpus_tool.py emit-layout --check
sha256sum -c FROZEN-SHA256SUMS
```
