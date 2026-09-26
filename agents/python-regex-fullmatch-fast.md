# Direct regex full-match validation

`RegexObject.fullmatch` previously called `match`, which called `search`,
constructed a `MatchObject`, then queried its start and end indices. The
full-match path now executes the same native regex directly, checks the
zero-th capture's start/end indices, and constructs a `MatchObject` only when
the full bounds match. It still resets `lastIndex` to `pos` on every search
and uses the current pattern and flags, so repeated calls and field changes
do not reuse stale native regex state. No change was made to `search`,
`match`, or multi-group retrieval.

A permanent unit-tier CPython differential in
`test/python-regex-fullmatch-fast.cjs` covers full and prefix matches, nonzero
`pos`, explicit `endpos`, a rejected reversed interval, optional captures,
and a zero-width match at the end of the string. The rebuilt Sage.js output
matches CPython 3.14.4. `pnpm build`, `pnpm test`,
`pnpm format:python:check`, and `pnpm architecture:packages` passed on Linux
x64. Core-runtime remains at 911,997 / 912,000 source bytes; the lazy
python-stdlib package is 721,525 / 1,050,000 bytes. Other-platform and
browser CI remain PR checks.

On the pinned `packaging==26.2` version regex, one warm Node measurement of
10,000 `fullmatch` calls changed from 727 to 411 ms (1.8 times faster), while
CPython took about 9 ms. The repository's full isolated-cache package-phase
runner passed behavior and source-current qualification on both revisions
with seven samples each. Relative to PR #331, warm throughput changed from
2,032 to 1,946 ms per 1,000 calls (4.2% faster), still a critical
163.6-times-CPython cliff. Cold import remained approximately 3.6 seconds,
or 146 times CPython. The phase reports mark these
`provisional-single-run`, not cross-host performance qualification.

Remaining measured hot paths include general `Version.__init__`, method
binding, iterator wrappers and internal `StopIteration` stack capture,
and version stringification. A guarded native-iterator `map` experiment was
not promoted: its first implementation exceeded the unchanged core-runtime
source budget, so it was reverted without a PR. The map/stringification
cliff remains open.
