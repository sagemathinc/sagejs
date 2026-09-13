# Integrating a numerical domain corpus

A domain owns its corpus and adapter beside its implementation or benchmark.
There is no central JavaScript registry to edit. The integration lane discovers
any number of `*.corpus.json` files from supplied directories, or passes their
paths directly to the collector. This lets sibling lanes add corpora without
conflicting in shared source, package manifests, or a registry file.

## Corpus contract

Each corpus uses `sagejs.numerical-qualification-corpus/v1` and provides:

- a stable semantic ID plus an integer version;
- the mathematical domain and description;
- the P0-P8 roadmap phases represented by its cases;
- the repository-relative source closure whose bytes define the mathematical
  implementation under test;
- cases classified by correctness layer and workload tier;
- fixed, seeded deterministic-fuzz, metamorphic, fault-injection, or
  long-duration campaign metadata;
- JSON input independent of a backend;
- required capability IDs;
- an expected success or exact structured failure code;
- named correctness and validation checks; and
- explicit warmup and sample counts.

The generic checks are exact deep equality, finite-number validation,
absolute/relative approximate equality, and numeric upper/lower bounds. Both
the actual value and an expected pointer use RFC 6901 JSON pointers into the
adapter observation. A literal expected value is also supported.

Validate one corpus and discover a set without editing a registry:

```sh
node scripts/numerical-computing/qualify.cjs corpus validate bench/DOMAIN/domain.corpus.json
node scripts/numerical-computing/qualify.cjs corpus discover bench/DOMAIN bench/OTHER-DOMAIN
```

Discovery is deterministic, recursive, and selects only `*.corpus.json`.
Duplicate `id@version` entries fail.

## Adapter protocol

An adapter is a CommonJS module with this shape:

```js
module.exports = {
  protocol: "sagejs.numerical-qualification-adapter/v1",

  async initialize(context) {
    // Inspect or load context.artifacts. Return only runtime facts actually
    // observed here and capability IDs actually available in that runtime.
    return {
      subject: {
        kind: "node",
        name: "node",
        version: process.version,
        engine: null,
      },
      capability_ids: ["domain.operation"],
    };
  },

  async runCase({ id, program_phase, layer, workload_tier, campaign, input, sample_kind, sample_index }) {
    return {
      outcome: { kind: "success", code: null },
      values: {
        result: compute(input),
        independent_oracle: oracle(input),
        residual: residual(input),
      },
      metrics: {
        phases_ms: { conversion: 0.1, kernel: 1.2, validation: 0.2 },
        counters: { evaluations: 12 },
      },
    };
  },

  async close() {}, // optional
};
```

`initialize` receives the absolute repository root, bound backend and subject
draft, exact artifact paths/digests/bytes, and capability entries. `runCase`
receives the case ID, phase/layer/workload/campaign metadata, backend-neutral
input, and sample coordinates. It does not receive expected answers or checks.
The observation must contain an
outcome, a JSON object of values, and nonnegative phase/counter maps. It is
limited to 16 MiB.

For a deterministic fuzz case, put the stable seed and trial count in the
campaign contract, pass any backend-neutral generator inputs under `input`, and
return checked values such as `trials`, `violations`, minimized-counterexample
digests, or invariant residuals. A fuzz label without a seed, repeated trials,
and corpus checks is rejected. Every non-fixed campaign names the validation
check IDs that witness its execution. Metamorphic cases use a separate layer
and should expose the number of transformations plus the relation error or
exact invariant result.

For an expected failure, return
`{kind: "failure", code: "domain.specific-code"}` and the diagnostic evidence
under `values`. Catch a backend's ordinary domain exception inside the adapter
and translate it to that declared code. An exception which escapes the adapter
is collector failure evidence, never an accepted mathematical failure.

Adapter phase times and counters are useful diagnostic telemetry, but they are
not trusted as harness wall-clock measurements. Expensive domain-specific
validation should still be performed through an independent route and exposed
as values which corpus checks compare.

## Capability binding

Author a draft containing claims, but no hashes or content ID:

```json
{
  "schema": "sagejs.numerical-capability-manifest/v1",
  "backend": { "id": "domain-backend", "version": "UPSTREAM-AND-ADAPTER-VERSION" },
  "subject": { "kind": "node", "name": "node", "version": "ACTUAL-NODE-VERSION", "engine": null },
  "capabilities": [
    {
      "id": "domain.operation",
      "status": "available",
      "reason": null,
      "case_ids": ["normal", "conditioned", "expected-failure"],
      "envelope": { "precision": "binary64", "maximum_dimension": 1000 }
    }
  ]
}
```

Unavailable capabilities use `status: "unavailable"`, a nonempty reason, and
an empty case list. Do not mark a capability available merely to make a matrix
green.

Bind the authored draft on the exact host/artifact checkout:

```sh
node scripts/numerical-computing/qualify.cjs bind-capabilities --corpus bench/DOMAIN/domain.corpus.json --adapter bench/DOMAIN/domain-adapter.cjs --artifact solver=build/domain/solver.wasm --artifact solver-gzip=build/domain/solver.wasm.gz --draft build/domain/capability-draft.json --output build/domain/capabilities.json
```

The output binds the corpus file, mathematical source closure, adapter, and all
artifact closures. The command will not overwrite an existing manifest.

## Integration request

When a sibling lane hands off a corpus, the integration lane only needs these
four facts:

1. repository-relative corpus path;
2. repository-relative adapter path;
3. artifact arguments (`NAME=PATH`); and
4. the capability-draft generation command for each runtime.

No `package.json`, package graph, shared numerical source, or central registry
change is required. If command aliases are desired, the integration lane may
add these exact package scripts after review:

```json
{
  "numerics:qualify": "node scripts/numerical-computing/qualify.cjs",
  "test:numerics:evidence": "node --test test/numerics/evidence/qualification.cjs"
}
```

The tooling itself does not depend on those aliases.
