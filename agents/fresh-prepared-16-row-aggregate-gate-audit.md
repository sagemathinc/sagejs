# Frozen 16-row fresh-prepared aggregate gate

## Claim

`run_fresh_prepared_aggregate.cjs` is a correctness-only aggregate gate for the
exact 16 non-reserve development roots. It does not benchmark them and cannot
publish qualified timings.

The gate derives its population from `phase5_development_roots.cjs`, requires
the corpus manifest and materialized corpus index to name the identical ordered
population, and probes `fresh_prepared_development_registry.cjs` before starting
any mathematical execution. All 16 roots now have registered fresh-prepared
runners, and the first complete bounded aggregate passed on 2026-09-18.

## Execution boundary

Each row executes sequentially in a new Node process beneath Linux `prlimit`.
The normal campaign limits are pinned to 4 GiB of address space, 600 CPU
seconds, a 1 GiB output-file limit, and a parent-enforced 600-second wall
bound; open-file and process-count limits are explicit as well. A private
mode-0700 directory contains that row's logs, published neutral result, and
child receipt.

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
instead passes each immutable corpus file through the explicit
`validateRegisteredFreshPrepared` boundary. That boundary accepts the same raw
normalized object as the real runner, requires exactly the 22 reviewed keys,
runs the full prepared-NF mathematical authenticator, and binds its authority
digest to the selected registered row. It does not create output directories or
enter any row computation.

The real `runRegisteredFreshPrepared` path performs this same admission before
entering the row runner and checks that the branded result reports the identical
prepared authority. The runner may repeat its own private validation; the
registry check is an independent common fail-closed boundary.

The focused probe reports registered, missing, and independently authenticated
subsets. A real aggregate run refuses to create its temporary execution tree
unless all three agree with the exact ordered 16-row population. The focused
checker also proves that an added answer-bearing key and changed mathematical
content are rejected.

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

## First complete receipt

The 2026-09-18 execution used the exact frozen population
`[0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23]`. All 16 rows
authenticated their prepared inputs, ran in distinct bounded children, published
correspondence-complete and public-incomplete neutral results, and declared no
W0 or retained mathematical runtime inputs. The aggregate producer wrote:

- receipt: `/scratch/fresh-prepared-development-aggregate-v1-20260918.json`;
- file SHA-256:
  `7c8b9ca9cf8db44a7a1860c0a702c3d6bceb73af2578a85b665d848f2604471e`;
- canonical aggregate SHA-256:
  `8eb14e33dff10ea7c9e99e7c619d8b4cc43dc2cbf18c7bda1f10fe1523be041c`.

The focused checker independently rebound the corpus identities and prepared
authorities, recomputed the canonical aggregate digest, and reported
`aggregateReceiptVerified=true`. This is a correctness gate only: neither the
receipt nor this audit makes a timing, qualification, public-completion, or
independent-certification claim.
