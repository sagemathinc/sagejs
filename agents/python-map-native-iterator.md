# Resumable native `map` iteration

The previous `map` implementation built a Python generator, then wrapped its
native `next` method to translate callback `StopIteration` into JavaScript
iterator completion. That incurred generator resumption and method-adapter
work for every element. It also closed the mapping permanently when a callback
raised an ordinary exception.

`map` now eagerly obtains all source iterators, as CPython does, and returns a
small JavaScript host iterator. Its native `next` is used by `for` loops and
collection constructors; Python `__next__` preserves a source iterator's
`StopIteration` argument. Neither source nor callback exceptions permanently
close the mapping: a source iterator that later yields again can resume. A
callback that raises `StopIteration` ends the current JavaScript iteration,
but the mapping remains resumable. Exact host functions bypass repeated
callable resolution; callable objects still resolve their type-level
`__call__` on each item, so class mutation remains visible. The adapter is a
shared host-runtime primitive, including in browser builds, not a mathematical
algorithm or a new Wasm ABI.

The built-in imports the helper from `bootstrap_shared` directly. Exporting it
through `sagejs.runtime` changed `runtime.py`, a file pinned by the qualified
NLopt public-semantics bundle, and caused Chromium CI's numerical reactor
build to fail before browser tests ran. Direct bootstrap import keeps that
pinned file byte-for-byte unchanged; all 21 pinned source hashes match the
manifest. No NLopt qualification budget or digest was revised.

`test/python-map-exhaustion-fast.cjs` differentially checks CPython for eager
source setup, valued and transient stops, callback and source errors,
resumption, multiple inputs, and callable-class mutation. The full 508-case
Python conformance corpus matches its existing baseline. The Linux routine
gate passes, including the unchanged startup and package-source budgets;
core-runtime is 911,864 / 912,000 bytes. Browser and other-platform CI remain
PR checks.

On Linux x64 with Node 26.10.0 and CPython 3.14.4, the pinned
`packaging==26.2` warm 1,000-workflow median was 1,071 ms on the #340 parent
and 892 / 905 ms in two independent seven-sample runs here (about 16% less).
CPython was approximately 12 ms, so this remains a critical 74–76× cliff.
Cold import remains approximately 3.34 seconds versus CPython's 25 ms.
Each repository report calls its result `provisional-single-run`; the two
independent reports confirm the local direction, not cross-host performance.

The short `list(map(str, (1, 2, 3)))` diagnostic dropped from 176 to 67 ms
per 10,000 operations on the same host. The reproducible
`bench/python-map-iterator.py` shows 56 ms for 10,000 short maps with `int`
against CPython's 2.5 ms, with two-input and polymorphic cases included. These
microbenchmarks diagnose overhead; the pinned package workflow is the
application-level comparison.
