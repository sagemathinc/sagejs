# Divmod special-method dispatch checkpoint

This bounded change starts at released prepared checkpoint
`3b4e8f24ba61d7822f421af52ad42a42b81f5ef2`. It corrects dispatcher selection in
ordinary Python source; it does not change the safe-integer fast path or the
existing generic arithmetic fallback. No full build or performance result is
claimed at this source-level checkpoint. Final qualification is coordinated
with the annotation lane.

## Dispatch changes

Use the runtime's authoritative attribute owner instead of an instance's
mutable `constructor`. For distinct Python classes where the right class is a
subclass, look up the right reflected attribute and then the left reflected
attribute through descriptor-aware class access. Compare identity first and
only then rich inequality; classmethods and custom descriptor results cannot
be reduced to a raw stored-function identity comparison.

The optional class lookup suppresses AttributeError only. Every actual call
attempt selects the special method afresh, after class-descriptor comparison
or an earlier method call may have changed it. Same-class operands do not get
an extra reflected retry. No method-selection cache is added.

The dedicated CPython 3.14 fixture covers inherited/indirect/aliased slots,
same-type refusal, class/static/custom descriptors, identity and rich comparison,
class-lookup order, descriptor exceptions, instance shadows, forged constructor,
late class replacement/deletion, and mutations between dispatch attempts.

## Required unresolved gaps

Two original fixture cases still differ from CPython and remain required work:

- Metaclass `__getattribute__` hooks do not observe the reflected class lookups.
- Generic objects implementing only floor division and modulo are still accepted
  by the existing arithmetic fallback rather than rejected by Python divmod.

An additional numeric control exposed a pre-existing floating remainder defect:
`divmod(-7.5, 2.0)` gives `(-4.0, -1.5)` here versus CPython's `(-4.0, 0.5)`.
This dispatcher patch leaves that fallback unchanged. These are not intentional
incompatibilities or acceptance waivers. The focused test reports the two
dispatch-fixture gaps explicitly; setting `SAGEJS_DIVMOD_REQUIRE_FULL_COMPAT=1`
makes them fail the comparison rather than treating this as complete divmod
compatibility.

## Validation before batch build

```sh
SAGEJS_DIVMOD_COMPILER_ROOT=/path/to/released/prepared-worktree \
  node test/python-divmod-slot-dispatch.cjs
SAGEJS_DIVMOD_COMPILER_ROOT=/path/to/released/prepared-worktree \
  node test/python-divmod-slot-dispatch.cjs --hotpaths
```

The driver compiles the actual candidate Python source against the explicit
read-only seed, then compares 21 in-scope dispatch cases with CPython in both
Python and Sage modes. Ten native numeric controls per mode compare candidate
behavior with the unchanged seed function, not with a fabricated Python
compatibility expectation. The hotpaths mode executes the unchanged existing
14-test suite with the candidate source installed into each isolated session.
Neither mode rewrites the seed's sources or artifacts. With no override the
driver uses this checkout's build.

The initial dispatcher patch saves 374 UTF-8 core-source bytes. Final source
accounting and validation status must include any subsequent strict-check
cleanup and the coordinated batch source snapshot; this is not a final budget
or build receipt.

After the dispatch repair, the prototype-inspection helper has only three
documentation consumers. It now lives with those consumers in the existing
lazy `_documentation_search` module, with the same getter-free lookup rules.
The lane policy permits exactly that file, not an unrestricted library tree.
The resulting core source reduction is 963 bytes. Strict checks pass for 403
modules, and the unchanged 14 runtime-hotpath cases pass when the actual
candidate source is installed in each test session.

Documentation controls execute the relocated source and verify inherited data
lookup, absent values, shadowing getters, help rendering, and search without
evaluating getters. An initial test incorrectly expected the old helper to
inspect compiled lazy method getters; both old and new implementations exclude
those. The test now supplies a data-valued method and retains explicit
getter-nonexecution assertions. JavaScript undefined is the public Python call
ABI's missing-argument sentinel; the test asserts that rejection rather than
treating it as a Python null value.

This remains focused source qualification against an explicitly identified
compiler seed. A complete batched build with the independent annotation change
has not yet run; no merge-readiness claim follows from these checks.
