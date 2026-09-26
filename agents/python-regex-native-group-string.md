# Return native regex capture strings directly

ECMAScript `RegExp.exec` supplies capture values as strings or `undefined`.
`MatchObject.group` already converts missing values to `None`; converting
present capture strings through Python `str()` again adds dynamic module-name
and builtin-call overhead without changing their value. The zero-, single-,
and multi-group paths now return those native strings directly. Other match
properties and methods are unchanged.

The CPython differential in `test/python-regex-group-fast.cjs` now also covers
an empty capture, a Unicode capture, and both resulting Python types. The
local full build, routine suite, focused differential, formatting checks,
and unchanged package budgets pass. Core-runtime source remains
911,913 / 912,000 bytes; lazy python-stdlib is 721,593 / 1,050,000 bytes.
Browser and other-platform qualification remain PR checks.

On pinned `packaging==26.2`, same-host 100,000-call microbenchmarks changed
from 710 to 577 ms for a named group and 1,153 to 1,012 ms for a numeric
group. CPython took 8.8 and 7.7 ms; this remains a substantial cliff. The
repository's source-current isolated-cache, seven-sample package phase run
passes behavior and changes its warm 1,000-call batch from 1,407 to 1,385 ms
against the #333 parent (about 1.5%). Cold import remains about 3.6 seconds.
The warm workflow is still about 115 times CPython and classified as a
critical cliff. This small end-to-end difference is `provisional-single-run`
evidence, not a cross-host or statistically decisive performance claim.
