# Development row 3 C7 result audit

The row-3 C7 join consumes three immutable owners through synchronous detached
replay capabilities:

- presentation `200190446c7128e2fe8d549924f76c1ddfce205f857a0d55a1d523d287dd868b`;
- exact class witness `022ee736560ad2ae25f2f2aa2d121b8b2d20224d0625d935e41bf322fa27842e`;
- compact rank-two unit authority `cf7a29bda7ca397d475d2851d1fca88d05fe5274e08a4d29d7e8bf5f5218aafb`.

The sealed result records class group `Z/6Z`, the exact compact order-six
generator witness, two exact factored units with norms `+1` and `-1`, the
accepted regulator, torsion generator `-1`, and PARI's faithful flag-zero
`not_given(LARGE)` materialization status.  It does not read or execute the
pristine trace: the raw-log dependence is inherited explicitly as
`frozenW0UsedAsInput=true`, `inputBoundaryComplete=false`, and
`qualifiedTiming=false`.

The focused checker replays every component authority, replays the final
payload through a separate publication authority, rejects 14 authority,
semantic, resealing, and completion mutations, and publishes idempotently.
Its capped run took 3.91 seconds.  The immutable 32,647-byte result has
SHA-256
`45a4b2cd4e967b8d58ffdc3247663df2d74771641478fc5c5e1bdb73cc7f18a1`;
the joined mathematical authority has SHA-256
`f9ea8219ef2e2d4a52ec268c8ee5e4e3c8eaedef98a4cb572111f653f0f4c636`.

This is internally correspondence-complete and deliberately public-incomplete.
PARI's GRH/factor-base policies and correspondence remain assumed, expanded
fundamental units are legitimately absent, and the frozen W0 raw-log boundary
prevents a prepared-input completeness claim.
