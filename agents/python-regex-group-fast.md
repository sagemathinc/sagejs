# Regex capture retrieval in the pinned packaging workload

The source-current `packaging==26.2` workload repeatedly calls `Match.group`
on its version regular expression. The previous `group()` implementation
always called `_resolve()`, which retrieves capture indices even when the
caller requests only the captured text. Zero- and one-group calls now read
the capture value directly; multi-group calls and `start`/`end`/`span` keep
their prior path.

The audit also found that an unknown named group returned `None` rather than
raising `IndexError`. Passing JavaScript `undefined` as `_property`'s explicit
fallback was treated as an omitted argument. Both named lookup paths now
check property existence before reading the value. A present but unmatched
optional named group still returns `None`, as CPython does. Node's native
named-capture map has a null prototype, so `Reflect.has` distinguishes these
states without inherited-property ambiguity. Focused tests cover no-argument,
numeric, named, unmatched optional, multiple, out-of-range and missing-name
calls, plus `span` behavior. The permanent
`test/python-regex-group-fast.cjs` differential compares those cases with
CPython 3.14.4 and matched the rebuilt Sage.js output.

`pnpm build`, `pnpm test`, `pnpm format:python:check`, and
`pnpm architecture:packages` passed on Linux x64. The `python-stdlib` package
is 721,185 / 1,050,000 source bytes and core-runtime stays at
911,997 / 912,000 bytes. Browser and other-platform CI are left to the PR.

In one warm Node microbenchmark using the pinned version regex, 100,000 calls
to `group("release")` changed from 988 to 694 ms; 100,000 `group(2)` calls
changed from 1,493 to 1,166 ms. CPython took about 8.6 and 7.5 ms,
respectively, so these remain major cliffs. The full isolated-cache pinned
package-phase runner passed behavior and source-current qualification on both
revisions with seven samples each. Relative to PR #330, the warm 1,000-call
batch changed from 2,120 to 2,032 ms (4.2% faster), still 168.8 times
CPython's 12.04 ms and classified as a critical performance cliff. Cold import
remained about 3.6 seconds, or 146 times CPython. The phase runner labels
both runs `provisional-single-run`; no cross-host performance claim is made.

Remaining costs include regex object construction on `fullmatch`, general
argument binding and `Version.__init__`, iterator wrappers, stringification,
and native stack formatting on internal `StopIteration`.
