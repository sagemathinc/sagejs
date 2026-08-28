# Optimizer evidence trust boundary

Optimizer evidence is divided by who can observe it and what the observation
can prove.

## Authorities

`host-workload-runner-phase-only` may report authentic workload inputs,
outputs, phase timings, counters, and resources. It cannot claim that a static
optimizer decision ran. Its sampling kind is `phase-only`, runtime route
authority is `unavailable`, and its route event set is empty.

`host-collector-with-private-evaluator-evidence` may additionally report
sampling and evaluator route events. The evaluator installs its observer in a
randomized lexical closure passed to the compiled program. It must not expose a
user-visible global hook. Route events are still joined to current semantic
regions by the validator; evaluator output does not override static compiler
truth.

V8 CPU profiles have two independent evidence channels. `samples[]` contributes
function self-sample counts by node ID. `positionTicks` contributes generated
line ticks. The totals need not agree and are never converted into one another.
Every attributed mapping requires bytes authenticated by exact inspector
`scriptId`; same-URL scripts with different bytes are rejected. Runtime, GC,
external, lazy, and rejected-script observations remain explicit and
`unmatched` so the receipt conserves all observations.

## Integrity versus authority

Canonical JSON and SHA-256 content identities detect accidental mutation and
make joins deterministic across checkout paths. They do not prove who created
a file. Any process that can write the workspace can forge an unsigned JSON
document. Promotion therefore reruns validators and relevant workloads in the
trusted integration environment and binds the receipt to the current clean
checkout, build outputs, source closure, production artifact, and independently
validated browser receipts.

Unknown fields, versions, reason codes, targets, mappings, or identities fail
closed. Stale and ambiguous evidence may be retained for history but cannot
rank or promote the current checkout. Missing required evidence produces an
inconclusive or rejected promotion decision; it never silently becomes a pass.

## Code and generated output

Evidence documents are untrusted data. Consumers must not evaluate source
excerpts, generated JavaScript, optimizer IR text, commands, or environment
values found in them. Runner paths are repository-relative and arguments are
data passed to a reviewed runner. The workload catalog—not a dossier or agent
claim—authorizes execution.

Promotion is a decision over evidence, not permission to merge generated code.
A human or integration lane owns shared schemas, pass ordering, evaluator
telemetry, runtime guards, and promotion policy.
