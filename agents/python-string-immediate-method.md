# Avoid binding strings for immediate method calls

The compiler captures an attribute lookup before evaluating call arguments.
For a native string, the public lookup already selects the Python string
method and honors the attribute hook, but it then creates a bound JavaScript
function. Immediate calls discard that bound object after one invocation.
The string lookup now fills the existing prepared-call context with the
selected method and receiver, so invocation can use them directly. Ordinary
attribute reads still create and return the same saved bound method.

The CPython differential covers positional and keyword method calls, saved
bound methods, a string subclass with a custom `__getattribute__`, receiver
evaluation once, and lookup-before-argument order. Existing
mutation/namespace method tests also pass. The source change
consolidates equivalent integer-parser checks to stay under the unchanged
core-runtime budget at 911,990 / 912,000 bytes.

On one host, 20,000 immediate `text.split('.')` calls fell from about 286 to
95 ms; saved bound and unbound calls stayed near baseline. In the repository's
isolated-cache, seven-sample pinned `packaging==26.2` workflow, the warm
1,000-call median fell from 1,351 ms on #335 to 1,237 ms on this branch,
about 8.4%. The sample ranges did not overlap. CPython took about 12.0 ms,
so the workflow is still roughly 103 times slower and remains a critical
performance cliff. Cold import remains about 3.6 seconds. These timings are
provisional single-host evidence, not cross-host qualification.

The local full build, routine suite, focused differentials, startup check,
and unchanged package budgets pass. Cross-platform and browser checks are PR
gates; no release is involved.
