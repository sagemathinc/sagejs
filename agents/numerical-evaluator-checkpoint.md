# Prepared numerical evaluator foundation

Development checkpoint, 2026-09-05, based on the #158 floating-transfer stack.
This advances N4 of the [performance program](numerical-computing-performance-plan.md),
but **does not complete N4 or enable a public accelerated solver**.

## Implemented scope

`sagejs.numerics._evaluation_core.evaluate_program` is an ordinary typed Python
instruction evaluator. Its exact source lowers to the isolated native core,
generated JavaScript and a prefix-free binary64 Wasm pack. The initial nine
operations are constant/input, negation, absolute value, square root and the
four elementary arithmetic operations. Operands refer only to prior results;
there are no loops in the program or host-call instructions. The interpreter
loop has an explicit one-million-instruction ceiling and checks storage,
indices, domains and nonfinite results. Failure leaves the output unchanged;
scratch may be partially written and must be discarded. The private caller
must exclusively own nonaliasing buffers. This is not an untrusted public API.

The compiler now admits read-only `UInt64Buffer` control data alongside packed
binary64 arguments, retaining all 64 operand bits. Unsigned writes in this
kernel kind still fail compilation. No handwritten mathematical C, new library,
automatic dispatch policy, exact-library dependency or release change is added.

## Current evidence

- Three evaluator tests cover ordinary Sage.js forced-dynamic execution,
  source isolation/read-only effects, and differential CPython/native/generated
  JavaScript/Node-Wasm execution. The local Wasm toolchain was available and
  the pack was built with all exact prefixes deliberately absent. Imported
  host functions throw if called.
- Corpus includes all operations, 128 independently computed integer-valued
  polynomial cases, invalid/forward/maximum-uint64 operands, short arrays,
  NaN/infinity, division by zero, square-root domain failure, overflow,
  subnormal underflow and signed zero.
- Six existing exact-uint64/bitwise tests pass using the existing validated
  native prefix. The initial invocation without that prefix failed setup;
  no dependency rebuild or weakened check was necessary.
- Strict Python passes: 372 modules, zero errors. Package ownership and its
  explicit native-interface dependency are recorded in the architecture graph.

`node bench/numerics/performance/evaluator-core.cjs` reproduces a deliberately
narrow microbenchmark: 10,000 four-instruction evaluations, prepared buffers,
three warmups and seven samples, alternating native/JavaScript block order,
with an independent CPython batch and checked sums. The initial local medians
were approximately 15.9 ms native, 70.8 ms generated JavaScript and 9.1 ms
CPython; fresh compilation was approximately 763 ms. These are exploratory
kernel-plus-host-adapter observations, not frozen public performance receipts.
They do not establish any program target. In particular, repeated tiny host
crossings remain more expensive than keeping the computation inside a solver.

## Next required work

The separate `perf/numerical-evaluator-calls` follow-up implements direct
binary64 helper calls through the typed source closure, propagates buffer
writes (including aliases and condition evaluations) and exceptions, and
rejects recursion and opaque calls. Its CPython/native/JavaScript/Wasm witness
passes, as do 21 combined compiler/evaluator/reduction regressions. It is a
compiler boundary, not yet the root-solver integration or a speedup claim.

1. Source-transparent typed binary64 helper calls, including transitive
   effects, status propagation, full call-graph isolation and rejection of
   unsupported recursive graphs. Do not duplicate the evaluator body into a
   solver merely to work around missing compiler support.
2. A prepared-expression public contract over the existing multilingual
   expression tree, with validated immutable program ownership, separate
   parameters, bounded work and explicit unsupported operations. Arbitrary
   Python callbacks must retain their semantics, not be silently substituted.
3. Complete scalar-root method and evaluator in one compiled call, independent
   final checks, route evidence and preparation-plus-solve measurements.
4. Actual browser/four-platform qualification, derivatives/vector programs,
   cancellation boundaries and the qualified external-solver integration.

Transcendentals beyond square root, power, gradients, vector residuals, public
cache/aliasing contracts and solver integration remain open. The private core
does not justify claiming any of those capabilities.

## Bounded root core follow-up

`perf/numerical-prepared-roots` adds private `_evaluation_root.py`: bisection
and the explicitly imported evaluator lower into the same source-bound native
or Wasm graph. The program mutates only owned work/input buffers and publishes
a complete candidate transactionally. A separate work slot records attempted
evaluations even on failure. It caps iterations at 1024 and total instruction
visits at one million; it does not pretend to poll browser timers while inside
a synchronous compiled call.

This is a residual-and-width checked bisection variant, not a silent replacement
of the existing public root routine. Its finite candidate is not a rigorous
root certificate. Public integration must retain independent final checks and
document the stopping policy and real cancellation boundaries.

Eight cases match CPython/native/generated JavaScript/Node-Wasm, including
endpoint roots, a pole, invalid brackets and resource refusal. The same pack
and authenticated loader pass those cases in real Chromium, Firefox and WebKit
workers with any attempted imported host callback configured to throw. This is
an isolated worker witness, not the public browser product or four-host receipt.
Strict Python passes with 373 modules and zero errors.
The five helper/root tests also pass on the supported Node 22.22.2 floor.

The [local raw microbenchmark](../bench/numerics/performance/results/n4-root-core-development-2026-09-05/local.json)
records 1000 repeated roots, three warmups and seven samples. Medians are about
2.9 ms native, 237 ms generated JavaScript and 37 ms CPython; fresh compilation
is about 1.0 second. Run `node bench/numerics/performance/evaluator-core.cjs --root`.
These timings include one host boundary per root but exclude public preparation,
planning, independent validation, diagnostics and structured results. They show
the opportunity from keeping the evaluator resident inside the solver, not a
passed public latency target. Persistent-host replication remains open.
