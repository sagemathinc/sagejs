# Primitive NaN truth semantics

On clean `ecd8fa14c`, `bool(float('nan'))` incorrectly returns false in Python
and Sage modes. Parsing NaN and nonfinite arithmetic produce primitive host
numbers; the bootstrap truth primitive used JavaScript `!!NaN`, unlike Python's
nonzero rule. Handle native numbers with strict nonzero testing before the
generic primitive branch. This does not coerce objects or invoke comparisons.

Remove the later redundant object-or-function guard: every reaching path has
already passed the opposite primitive-return test, and `value_type` is never
reassigned. All boxed-number, array, user-hook and validation logic remains in
the same order. The reduction makes room without increasing the source ceiling.

Focused fixtures cover NaN parsing and arithmetic, infinities, signed zero,
conditionals and short-circuiting, container any/all, comparison results and
custom truth hooks. Both original fixture programs pass pinned CPython 3.14.4.
Baseline custom float-subclass hooks and errors also pass in Sage.js; inherited
float truth with a subclass `__len__` does not. That separate native-subclass
representation/dispatch limitation remains open and is not claimed repaired.

Architecture and routine validation pass (10m 31s including rebuild/startup),
as do all eleven focused numeric/Boolean/lowering checks. The source-current
536-case outcome vector is unchanged: 522 passes, three reviewed differences,
eleven existing required failures. The unchanged-input guard passes; the full
gate remains unqualified. Package results retain eight of eleven workflows
plus seven passing Tomli upstream tests. The core source count is 910170 bytes,
26 fewer than the parent, below the unchanged 910200-byte ceiling.

The same twelve-workload diagnostic is retained byte-for-byte in
`evidence/python-truth-after-nan.json`, using the preceding Boolean PR's driver
and exact program hash. Compared with its Boolean-only candidate, most local
median times increased roughly 1–14%, while custom-Boolean branch time improved
about 2%. All twelve remain below the original pre-fast-path baseline. These
small workload measurements do not establish the cause or independent
reproducibility of the slowdown; retain them rather than claiming a free
optimization. This slice fixes correctness and makes no performance-cliff
closure or four-platform qualification claim.
