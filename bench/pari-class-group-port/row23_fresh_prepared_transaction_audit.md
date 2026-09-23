# Row 23 fresh prepared transaction audit

## Boundary

`row23_fresh_prepared_transaction.cjs` accepts exactly `prepared` and
`outputDirectory`. The mathematical input is the authenticated 22-field row-23
prepared-number-field projection with authority
`0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299`.
Extra prepared fields and caller-supplied factor, relation/HNF, acceptance,
class, correspondence, unit, or W0 inputs are rejected before mathematical
execution.

The returned frozen receipt is branded by a module-local `WeakSet`; a copied
receipt is not authentic. Its verified
`ImmutableClassUnitCorrespondenceResult` is non-enumerable. Only the final
row-specific source envelope, the field-neutral envelope, and the receipt
metadata cross the invocation boundary. Intermediate immutable file adapters
are confined to a mode-0700 temporary directory and removed in `finally`.

## Same-invocation chain

`row23_fresh_prepared_pipeline.cjs` performs, in order:

1. live factor-base construction from authenticated prepared data;
2. the connected 40-relation first HNF and analytic acceptance;
3. cyclic class-witness composition from that exact live HNF;
4. degree-five expanded correspondence through
   `row23_degree5_correspondence_coordinator.cjs::compose`;
5. the live rank-four bridge and exact unit reconstruction;
6. immutable `row23_final_result.py` construction and cold replay; and
7. the row23 terminal adapter and detached neutral replay, yielding an
   `ImmutableClassUnitCorrespondenceResult`.

The retained final composer continues to require its historical pinned
correspondence and unit owners by default. The same-run path supplies
`FreshRow23CorrespondenceAuthority` and `FreshRow23UnitAuthority`, each with
both the exact newline-terminated owner digest and the exact canonical embedded
content digest. This is necessary because source provenance is part of the
correspondence owner: even a docstring-only composer edit correctly produces a
new owner rather than silently matching the historical pin. Final construction
and every cold replay require those same four out-of-band digests; all existing
exact ideal, unit, inverse, norm, sign, regulator, and ancestry checks remain
active. The historical no-authority path remains pinned and fail-closed.

The degree-five coordinator's `run` entry point is never used because that
entry point opens W0 after publication. This transaction has no W0 path,
reader, or oracle step. Every factor/relation/acceptance/class/correspondence/
unit owner consumed by final assembly was created earlier in the same call.

## Focused checks and qualification

`check_row23_fresh_prepared_transaction.cjs` uses a synthetic mathematical
pipeline to test the narrow request boundary without initiating the expensive
genuine computation. It rejects seven owner/W0 injections, an extra prepared
field, and a copied receipt; checks immutable publications and recursive
receipt freezing; and statically confirms degree-five `compose` rather than
`run` wiring. It also confirms that the same-run correspondence authority is
forwarded into final construction and cold replay.

This audit makes no latency, memory-reserve, or production-readiness claim. A
genuine run should be attempted only with the authenticated prepared row-23
projection and suitable host resources after the focused wiring check passes.

One genuine prepared-only invocation completed the entire chain without W0
after the correspondence-authority repair. It authenticated prepared authority
`0bb8aa6665e3cfdb5184f53cb4ded97655007da9d08e9969c052f81a3640a299`,
published same-run correspondence owner
`169747a10b57a41ce647351d8798d653892a6ada1ef3f4390b02061da18f2cc1`,
then published final source
`e7b3859792692a5491a9d68315cdbd080c95dcda1f6996b4710ede1a43e5f286`
and neutral result
`027677c94d217d600cf88b9e743627ad63d3c0d5b2a0116b1d8ea436b025c2b5`.
The branded receipt's hidden value is an
`ImmutableClassUnitCorrespondenceResult`. The historical pinned final path
still independently replays byte-for-byte as
`fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318`.
