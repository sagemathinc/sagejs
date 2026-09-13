# Array-like tag classification

`ρσ_arraylike` keeps its existing early checks for arrays, primitive strings,
`null`, and `undefined`. Other values are classified by one call to
`Object.prototype.toString`, followed by membership in a private native `Set`
constructed once through the existing `sagejs.runtime` boundary. No new native
helper or dependency is introduced. The formatted runtime source grows by 203
bytes.

The 15 recognized tags are unchanged: 11 typed-array tags and `HTMLCollection`,
`NodeList`, `NamedNodeMap`, and `TouchList`. This deliberately preserves foreign
realm values and spoofed `Symbol.toStringTag` values, including getter side
effects and exceptions. It does not substitute `ArrayBuffer.isView`, which
would change these semantics. Native string equality is sufficient because the
tag call returns a primitive string and every member is a fixed string.

Run `node test/python-arraylike-tag-set.cjs` after building. The regression
compiles the actual source slice, compares it with the preceding list-membership
implementation and the shipped runtime, and pins all 15 tags. It covers real
local and foreign-realm typed arrays, DOM-tag spoofs, rejected values, changing
and throwing getters, non-string tag properties, revoked proxies, and the array
short circuit. Browser DOM instances are represented by their observable tag
contract; the test does not claim a real-browser DOM run.

For a reproducible diagnostic microbenchmark, append `--benchmark`: three warmup
rounds followed by nine alternating old/new pairs of 30,000 calls per workload,
with output equality checked and every timing reported alongside host details.
The old variant is compiled from the identical function with the previous fixed
list initializer and membership expression. Both variants use the same compiler
and runtime. `SAGEJS_ARRAYLIKE_COMPILER_ROOT` optionally selects a read-only
compiler seed for pre-build diagnostics; routine validation uses local artifacts.
Shared-host measurements are diagnostic, not controlled performance evidence or
a claim about package import/startup speed. The motivating cold mpmath profile
identified generic list membership in this path, but a profile alone cannot
establish end-to-end improvement.
