# Row 19 prepared-input native aggregate audit

Date: 2026-09-18

## Intended boundary

`row19_phase6_prepared_aggregate_root.generated.py` is the shortest connected
row-19 graph that starts at the authenticated prepared maximal order and ends
at the retained factored class-and-unit result.  It accepts no selected factor
base, index-prime descriptor, relation, analytic degree catalog, HNF, Smith
form, regulator, unit, class number, or witness.  Fixed-size zeroed storage and
four closed shape manifests are ABI metadata rather than mathematical result
owners.

The one native entry derives and connects, without a host owner boundary:

1. all five maximal-order index-prime descriptors;
2. the 6,543-prime degree catalog, GRH-bound factor base, subfactor base, and
   71 rational initial relations;
3. the independent 1,230-prime analytic degree catalog;
4. relation collection to 423 columns and the first HNF/CUP reduction;
5. next-pass control, seven further relations, terminal HNF append/CUP, and
   analytic acceptance;
6. the Smith class presentation, reverse-HNF saturated relation kernel,
   primitive compact unit and inverse; and
7. all nine exact factored principal witnesses.

`row19_phase6_prepared_aggregate_host.cjs` authenticates the prepared input,
compiles and binds the graph, and allocates/copies every owner and the frozen
argument vector before the clock. `invokeNative()` contains exactly one
already-bound `gmp(...)` call and returns the branded live context. Only after
the clock stops does `projectNative()` materialize JavaScript arrays and
decimal strings for publication. The measured invocation does not perform
native-artifact discovery, subprocess work, filesystem I/O, serialization, or
owner allocation.

## Validation receipt

Source generation is deterministic and fresh. The generator, generated
Python, factor root, host, and checker pass JavaScript syntax, Python syntax,
Ruff-format, and whitespace checks. The source-transparent lowerer retained a
414-function, 157-source-dependency native closure.

The authorized Linux build and execution used the row-private cache
`/scratch/sagejs-row19-phase6-prepared-aggregate/native-cache-v1` under a
four-GiB address/RSS and 600-second CPU gate. The successful receipt is
`/scratch/sagejs-row19-phase6-prepared-aggregate/check-v3.log`, whose SHA-256
is
`691967a04ddff1b05ac3069e6e5c4119b017ffb2d3f2cab4c553cfcb328c285d`.
The corresponding resource stderr log is
`/scratch/sagejs-row19-phase6-prepared-aggregate/check-v3.resource.log`; it is
empty (SHA-256
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`)
because neither `prlimit` nor the child reported a resource failure. The
compact receipt is
`/scratch/sagejs-row19-phase6-prepared-aggregate/receipt-v2.json` (SHA-256
`76a338080a1aa78a5de8a59d5b9e2de962041e10c69097deeda972710ae30066`).

The native entry reproduced class number 39,366, invariant factors
`[6,3,3,3,3,3,3,3,3]`, both HNF states, all terminal and acceptance states,
and these exact suffix digests:

- reverse kernel:
  `5f81c98cc8390401c9ec319b320a218141a959833b71ff8055d879633000207f`;
- dependency relation:
  `cc218d210f2a9e5400afa92c90365bfd528c9c14bb8e5e5255fa1b4807041343`;
- compact-unit inverse:
  `938f098a4c3d8347bc0290a0ee0d2c9189c499f50654bcaf8e744ea65d605abb`;
- principal-witness coefficients:
  `029449eb24fbf5654c4b3bb2dcec77aa012082674183fb244bf02e1a7fbf3c1c`;
- principal-witness valuations:
  `0f371fe920dfea58dee17f439eef453acd9c3c671284b62a9a36dfb2b5509d7c`.

The single native call took 10.230215760 seconds, with 982,188 KiB maximum
resident set, 10.192905 seconds user CPU, and 0.050186 seconds system CPU.
It owned at most 588,836,060 bytes by the conservative host accounting. The
timed boundary made one native call and no artifact lookup, subprocess,
serialization, filesystem operation, or allocation of an ABI owner.

The native cache occupies 296,312,253 bytes. Its cache key is
`5d4bbbc4cb6f986a3acc0123dd909894039171a7e2e95a376c5dcd9407aa88ac`;
the generated core C, manifest, and JavaScript binder are respectively
109,328,757, 129,152,308, and 13,854,336 bytes. Compilation completed under
the hard four-GiB address/RSS gate. No persisted sampler receipt supports a
more precise compiler peak claim.

This validates exact correspondence for the diagnostic prepared-input cut.
It remains explicitly `publicComplete: false` and `qualifiedTiming: false`:
the receipt is not a public API or qualified performance claim.
