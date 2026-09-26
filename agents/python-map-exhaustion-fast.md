# Avoid exceptions at normal `map` exhaustion

`map` previously called `next(iterator)` inside a `try` block for every
element. Normal exhaustion raised `StopIteration`, which can capture a native
stack and then be caught merely to end the mapping. Use
`next(iterator, sentinel)` and an identity check instead. This also matches
CPython when a custom iterator raises `StopIteration(value)`: the mapping
ends without exposing the value. The callback's separate `StopIteration`
handling is unchanged.

`test/python-map-exhaustion-fast.cjs` compares Sage.js with CPython for a
valued stop, `None` elements, shortest-input termination and callback
side effects, and a generator with a return value. The local full build,
focused differential, Python formatting check, and unchanged package graph
budget pass. The generated core-runtime source is 911,913 / 912,000 bytes,
down 84 bytes from the #332 parent. Other-platform and browser CI are PR
checks.

On the pinned `packaging==26.2` workflow, the repository's isolated-cache
seven-sample phase runner passes behavior and source-current qualification.
Its warm 1,000-call batch improves from 1,946 to 1,407 ms against #332,
about 28% faster, but remains a critical 118-times-CPython cliff. Cold import
is unchanged at approximately 3.6 seconds, about 149 times CPython. These
reports are `provisional-single-run`, not cross-host performance
qualification. A separate warm 10,000-call `join(map(str, (1, 2, 3)))`
microbenchmark fell from approximately 751 to 255 ms, while CPython was
approximately 4 ms. The microbench is diagnostic, not a package-level gate.
