# Native source compression driven by cubic class groups

Implementation checkpoint (2026-09-05): both language features now have
fallback/native implementations and focused regression tests. CPython,
ordinary Sage.js, generated JavaScript, GMP and fmpz witnesses pass. Bundle
erasure matches explicit-argument executable IR; allocation probes have equal
checkpoint peaks and counts. Sanitizer failure/recovery witnesses pass.
Controlled paired opt measurements are within about 0.5% of explicit code
after correcting redundant slice literal temporaries. Nine cubic store blocks
have been migrated; the staged proof helper has a 38-owner bundle, reducing
73 source parameters to 36. Both final 39-family production rebuilds and all
seven cubic public/closure tests pass, including independent exact replay and
large-regulator witnesses; the production-pack suite also passes. Strict Python,
the broad native compiler suite and root architecture checks pass. Broader
platform CI is queued; final evidence publication and staged handoff remain open.
See `docs/native-source-compression.md` for the contract and evidence.

Goal: implement and qualify fixed-length slice assignment, then borrowed
workspace bundles; migrate real mathematical source with no measured speed
regression. These are reusable language features, not cubic-name intrinsics.

## 1. Fixed-length slice assignment

First motivating form:

```python
workspace[base : base + 10] = (prime, 1, 2, 0, 0, 0, 0, group_count, 1, 0)
```

Start with fixed-capacity exact vectors, an explicit contiguous range, and a
literal tuple whose arity is known statically. Preserve Python RHS-before-LHS
evaluation and snapshot semantics: overlapping reads must observe the old
values. No resizing, implicit clipping, extended slices or arbitrary iterable
materialization should enter the first native contract. Unsupported native
forms must fail compilation rather than call the host. Document restrictions
as those of the fixed-capacity native container, not changes to Python lists.

Lower to scalar temporaries, checked range validation and existing exact stores
where possible. Do not introduce a heap tuple. Exact scalar temporaries may
require limb space; measure this and only eliminate snapshots when alias/effect
analysis proves that safe. Validate RHS types and the complete destination
range before stores. Define allocation-exhaustion behavior explicitly rather
than accidentally promising transactional arithmetic allocation.

Required checks:

- CPython same-source fallback, generated JavaScript, GMP and fmpz agreement.
- Aliased RHS, permutations, repeated values, empty ranges, boundary indices,
  invalid widths, closed owners, promoted integers and capacity exhaustion.
- Evaluation-order witnesses with side effects where the language permits them.
- No host callbacks or temporary container allocation in emitted core.
- Compare explicit-store and slice witnesses with equivalent semantics, both
  generated code and controlled execution/allocation measurements.
- Migrate actual repeated cubic initializations; rerun arithmetic and receipt
  regressions. Report source bytes/lines removed without changing budgets.

## 2. Borrowed workspace bundles

Use the staged proof helper's dozens of matrix/vector arguments as the real
consumer. First inspect existing `NativeRecord` contracts before choosing a new
surface API. A bundle groups borrowed references; it does not own or copy the
matrices and must not open another arena. Binding fields should be immutable
in the initial model while referenced matrices remain mutable.

The implementation must track each member's owner and lifetime through helper
calls. Reject escape through returns, public ABI, containers or longer-lived
storage; reject unqualified nesting and rebinding. Do not erase alias identity.
Prefer compile-time field projection and argument flattening if they preserve
the existing core ABI and avoid aggregate runtime allocation.

Required checks:

- Same-source construction/projection/call behavior and expired-owner errors.
- Shared-member aliases, nested helper calls, multiple owners and negative
  escape/lifetime tests, including all error exits.
- Exact generated call graph, no child checkpoints, copies or hidden host calls.
- Compare explicit arguments versus bundles under sanitizer and allocation
  instrumentation, then benchmark on the dedicated opt VM.
- Migrate the staged proof workspace, remove redundant argument plumbing and
  rerun the exact mathematical tests and independent replay.

## Release and evidence

Keep each feature in coherent commits with focused regressions. Run strict
Python, architecture and applicable compiler/platform gates. Record baseline
and candidate identities, compiler/dependency versions, generated sizes,
resource peaks and controlled timings. Passing a size manifest is not review.

Keep the existing dirty staged mathematical work separate from compiler
changes until qualified. Its public receipt tests currently have failures;
record and resolve their causes before attributing a failure to either feature.
Do not treat the older standalone arithmetic successes as full public replay.
