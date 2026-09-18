# Frozen 16-row fresh-prepared aggregate gate

## Claim

`run_fresh_prepared_aggregate.cjs` is a correctness-only aggregate gate for the
exact 16 non-reserve development roots. It does not benchmark them and cannot
publish qualified timings.

The gate derives its population from `phase5_development_roots.cjs`, requires
the corpus manifest and materialized corpus index to name the identical ordered
population, and probes `fresh_prepared_development_registry.cjs` before starting
any mathematical execution. The current gate remains closed until every one of
the 16 roots has a registered fresh-prepared runner.

## Execution boundary

Each row executes sequentially in a new Node process beneath Linux `prlimit`.
The child has explicit address-space, CPU, file-size, open-file, process-count,
and parent-enforced wall bounds. A private mode-0700 directory contains that
row's logs, published neutral result, and child receipt.

The field transaction, transaction-local receipt verification, registry
admission, and registry-local fresh-execution verification all occur in that
same child. This is necessary because neither private `WeakSet` brand can be
serialized honestly. The parent accepts only the child's immutable receipt and
checks every frozen identity and input authority again.

The aggregate removes its complete temporary tree on success or failure. Child
logs are diagnostics only and are never copied into the aggregate receipt.

## Receipt boundary

The deterministic aggregate receipt records:

- the frozen source-manifest, corpus-manifest, and corpus-index digests;
- the exact ordered development population;
- each prepared-input authority, neutral-result digest, and detached-payload
  digest;
- positive fresh-execution and same-process registry-admission claims; and
- negative public-completion, W0-runtime-input, retained-runtime-input, and
  qualified-timing claims.

It records no elapsed time, CPU time, RSS, or per-stage telemetry. Its aggregate
digest is computed from recursively key-sorted canonical JSON, and the final
pretty-printed receipt is written once and made mode 0444.

## Fail-closed probe

The registry intentionally does not expose its private runner map. The child
therefore calls the public `runRegisteredFreshPrepared` boundary with an invalid
`outputDirectory`. Registry membership is checked before that public argument
check: a registered root rejects the invalid directory, while an unregistered
root rejects because no runner exists. No row implementation is entered.

This focused probe currently reports the registered and missing subsets. A
real aggregate run refuses to create its temporary execution tree unless the
registered subset equals the exact ordered 16-row population.

## Focused validation

Run without launching a mathematical row:

```sh
node bench/pari-class-group-port/check_fresh_prepared_aggregate.cjs \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1
```

After an aggregate execution, give its receipt as the second argument to make
the checker independently rebind all 16 row identities and prepared authorities,
reject timing telemetry, and recompute the canonical aggregate digest.

After all 16 runners are registered, the explicit expensive invocation is:

```sh
node bench/pari-class-group-port/run_fresh_prepared_aggregate.cjs --run \
  /scratch/sagejs-pari-fresh-prepared-corpus-v1 \
  /scratch/fresh-prepared-development-aggregate-v1.json
```

The destination must not already exist. The runner deliberately has no implicit
or default execution mode.
