# Mixed exact/binary64 prerequisite checkpoint

## Preserve machine-sized shift counts

Exact-integer shift IR now retains a `uint64` count instead of converting it
to an exact temporary that the GMP helper immediately decodes. GMP receives
the count by value; tagged execution preserves its small-count path. Exact
counts retain their original negative-count checks. Both paths preserve
zero/count-zero behavior, signed floor right shifts, saturation for enormous
right counts, the one-Mibit allocation cap, and Windows's narrower `ulong`.
Augmented shifts use the same path.

The focused tests exercise signed operands, unsigned counts through `2**64-1`,
the allocation boundary, augmented shifts and generated direct-helper calls.
The 228-case PARI short-product probe passes; its short timing is essentially
unchanged from the mask-only version. This removes a demonstrated boxing
round-trip, but is not claimed as a measured workload speedup.

## Exact integer bit masks

The PARI short-product experiment exposed rejection of ordinary Python
`(x >> k) & ((1 << 64) - 1)` for an exact mantissa: bitwise dispatch previously
required two `uint64` operands. Exact `&` and `&=` now lower to integer IR,
GMP `mpz_and` and JavaScript BigInt `&`. Tagged and machine-word paths preserve
signed two's-complement semantics; large tagged operands use GMP. Mixed exact
and checked-word operands promote to exact integers, while two bounded-word
operands retain their existing behavior. Other missing bitwise operators are
not implicitly claimed as implemented.

The focused shift/mask test compares negative and 64–511-bit inputs with
CPython, exercises aliasing, augmented assignment, mixed operand order and
automatic/native/tagged/JavaScript paths, and retains prior shift limits.
The experimental short-product client matches 228 PARI cases after replacing
power-of-two remainder extraction by masks. Short diagnostic timings suggest
an improvement, but are not paired performance qualification or class-group
parity. This feature removes a demonstrated language obstruction; it does not
replace arbitrary-precision word products with PARI's limb/carry representation.

Broad checks remain incomplete: `architecture:check` reaches the previously
documented stale optimizer manifest. `test:changed --base b294bcc05` passes
merge checks, self-hosted convergence and module precompilation, then its build
fails reconciling the installed FFLAS adapter because this worktree lacks
`packages/fflas/.native/prefix/lib/libgivaro.a`. The later compiler/integration
and documentation gates were not reached. No dependency installation or safety
limit was changed to conceal either failure.

## Reuse shared source-transparent import lowering

Connecting the PARI selector, FLATTER, fast and DPE passes exposed repeated
lowering of diamond-shaped dependency tails. The unmodified resolver reached
a diagnostic cap at 251 requests with only 23 distinct source/function pairs
(48.27s), and the uncapped connected compile aborted in Tree-sitter. This is
compiler work, not execution of the mathematical algorithm.

The resolver now memoizes a lowered selected entry by physical path, source
hash and function name within one compilation. Before reuse it verifies every
recorded transitive source hash. Cycle checks precede cache lookup; different
physical sources remain different identities. Cached IR and returned IR are
separate copies, so caller annotation cannot change another caller's input.
No on-disk stale cache or relaxed source-provenance rule is introduced.

The same connected source now completes lowering in 47 requests for 47 unique
pairs, producing 55 functions (6.69s diagnostic wall time). A five-layer
two-entry diamond regression requires exactly ten dependency lowerings.
Additional tests cover caller isolation, dependency/root content changes,
portable paths, cycles, conflicts, cache identity and CPython/JS/GMP/tagged
results; all five relative-import tests pass. Existing IR remains version 43.
These measurements are not a qualified runtime-speed result or a claim that
all frontend resource-lifetime issues have been eliminated.

## Copying binary64 signs (IR 43)

Native `math.copysign` now lowers by imported binding identity, with two Float64
operands. C uses the standard primitive; JS copies the IEEE sign bit rather
than comparing with zero, preserving negative zero and signed NaN sign sources.
The mixed frontend and scalar-only signatures use the same operation. A
196-pair CPython differential test checks scalar, nested sign extraction and
buffer mutation; all five binary64 focused tests pass. NaN payload identity is
not claimed across the host ABI. This enables an explicit PARI C-division
helper without weakening Python's division-by-zero exceptions.

## Scalar rounding and float conversion (IR 42)

The connected Babai source now lowers one-argument `round(Float64)` to an exact
integer with ties to even. Truncation followed by an exact half/tie decision
avoids dependence on the host rounding mode. NaN and infinity preserve Python's
ValueError/OverflowError distinction. Integer `round` is an identity; the
existing exact `round(sqrt(Integer))` path remains in place.

`float(Integer)` now rounds the magnitude to 53 bits using guard, sticky and
parity bits before binary scaling, rather than using GMP's truncating conversion
directly. Overflow, including carry at the largest finite boundary, raises
OverflowError. The C implementation uses two short-lived GMP temporaries for
wide values; their allocation cost is not yet benchmarked. JS uses its correctly
rounded Number conversion with the same finite-result check. Float-returning
native helpers may now also borrow Float64Buffer parameters; the existing
packed ABI supplies their lengths and lifetime.

Seven focused control/error and binary64 tests pass, including CPython rounding
oracles, integer conversion midpoint and overflow controls, and a borrowed-buffer
helper called from a mixed exact function. These changes clear the Babai source's
lowering obstructions, but do not themselves qualify whole-engine performance.

## Range control transfers (IR 41)

The Babai prototype requires both `break` and `continue` in descending range
loops. Mixed/exact lowering now admits both, retaining the existing rejection
of transfers that exit a live resource scope. `continue` records its target
range's iterator, step and stop in IR and performs exactly the normal range
advance before transferring. JS, GMP, tagged and guarded-word emission preserve
the unsigned terminal-overflow check; signed guarded-word iteration likewise
retains its overflow termination. Normal loop tails are unchanged, and nested
while transfers do not acquire a range increment. The IR version is bumped
because consumers must understand this additional transfer metadata.

Focused controls cover ascending/descending and empty ranges, large integers,
terminal overflow, and nested range/while targets. Both explicit-error/control
tests pass across JS/GMP/tagged entry points. This is not a performance or
Windows/Wasm qualification. The next Babai lowering obstruction is general
`round(float)`; only `round(sqrt(Integer))` currently lowers in the mixed path.

## Mixed scalar absolute value

The connected `Babai_fast` prototype exposed rejection of `abs(Float64)` in
an exact-buffer function. Pure-float lowering already supported this operation;
the mixed frontend incorrectly coerced every operand to an integer. It now
selects the existing `float64.abs` operation by operand type, with exact-path
C `fabs` and JS `Math.abs` emission and liveness tracking. Integer behavior is
unchanged. The binary64 differential suite exercises all 2,625 existing values
through a mixed buffer/exponent function, including negative zero and NaNs;
all four focused log/scaling tests pass. These are correctness checks, not a
performance measurement. Broad build/architecture gaps below remain open.

At this checkpoint the next compile failure was `break` targeting a `range`
loop; the subsequent IR 41 change above addresses that separate limitation.

## Portable root names and relative imports

The class-group branch's changed-file checks exposed a production inventory
failure: `lowerSource` receives a root name relative to `src/lib`, whereas
the import resolver records dependencies relative to the repository root.
Relative imports from that root therefore failed with `unknown relative import
source`. The resolver now accepts an explicit `initialDisplayPath`, supplied
by production inventory as the same logical root name passed to lowering.
It maps that name to the already authenticated physical root; imported
dependency paths, hashes, cycle checks and package-boundary checks are unchanged.
Unknown importer names still fail closed. No path guessing or working-directory
fallback is introduced, and portable root identities are not renamed.

A focused regression reproduces the failure before the fix using a root with
a different display convention and a two-level relative dependency chain.
It checks checkout-independent provenance and rejects an unregistered root.
The full graph-production inventory test is the integration regression.

The focused import and graph-production tests pass (six passes, one real-Wasm
skip for the unavailable pinned toolchain). Strict Python remains at zero
errors across 403 modules and parallel checks pass. Architecture checking still
fails at the separately recorded stale optimizer manifest. These results do
not qualify Windows or real Wasm execution.

The changed-file gate passed merge checks and build stages 1–5, then failed
addon reconciliation because this worktree lacks
`packages/fflas/.native/prefix/lib/libgivaro.a`. Its subsequent architecture,
unit, compiler, integration and documentation commands were not reached.
This missing library installation is separate from the fixed import resolver
failure; no full-build success is claimed.

## JavaScript reserved local and parameter names

The real-root translation exposed `new` emitted as a JavaScript local even
though it is a legal Python identifier. JavaScript emission now escapes
reserved parameter/local bindings in a private IR copy with collision-free
names. It traverses operand references, loop/branch bodies, call arguments,
tuple results and resource owners; it does not rewrite string literals,
record field names, callee identities or authoritative source IR/provenance.
Native buffer write-effect lookup maps back to the original source parameter
name, keeping copy-back behavior and published effect metadata intact.

The focused regression covers `new`, `let`, `var`, `arguments`, `package` and
`delete`, generated-name collisions, tuple calls, branching, loops, exact
buffer mutation, pure Float64 execution and Float64 buffer copy-back. It
checks CPython, the generated JS fallback and available native backends,
and asserts that emitting JavaScript does not mutate the original IR.
This change handles parameter/local bindings, not arbitrary public function
names or general shadowing of runtime helper identifiers.

## Imported exact GCD

Small-GCD follow-up: word execution now computes unsigned magnitudes and a
word Euclidean GCD, promoting only when the nonnegative result does not fit
signed int64 (notably gcd(INT64_MIN,0)). Tagged small operands have the same
nonallocating path; large operands retain GMP. Signed-magnitude conversion
uses unsigned subtraction, avoiding undefined negation of INT64_MIN. Linux
ASan/UBSan controls cover signed boundaries, exact promotion and aliased output.

On the port's short, unqualified boundary diagnostic, tagged batched execution
fell from approximately 0.101s to 0.056s for 11,480 logical admissions; GMP
remained approximately 0.204s. All 574 output/partial-write controls still agree
with PARI. This supports removing unnecessary promotion, not a whole-engine
performance claim. The diagnostic remains below the qualification sample
duration and includes deliberate arithmetic substitutions in the port.

The PARI port's next `Z_ppo` smoothness precheck needs repeated `gcdii` calls.
Native exact lowering previously had no matching GCD operation. Two-positional-
integer `from math import gcd` calls (including import aliases) now lower to
`integer.gcd`, then `mpz_gcd` in the GMP core. Tagged execution now retains
small-word execution when possible; the JavaScript fallback uses exact BigInt Euclid. This
does not claim that GMP and PARI GCD have identical implementation costs.
Unsupported arities/types, unimported names, ambiguous imports and shadowed
bindings fail compilation. No bare function-name dispatch or host callback is
introduced. Ordinary CPython remains the same-source oracle.

Focused tests cover 81 signed/zero/large operand pairs and chained calls in
generated JS, GMP and tagged execution, including reassignment and 4096-bit
inputs. Generated-core inspection checks the GMP call and absence of interpreter
calls. GCD, bit-length, shift and explicit-error focused tests all pass. No
Windows/Wasm execution or comparative performance qualification is claimed.

Ownership takeover approved by the user on 2026-09-13 for the bounded PARI
2.17.4 language experiment. Original unfinished edits are preserved in
`32cb0ee51`; `49dfa22ed` integrates the experiment base `938ccd425`.
Neither is a production qualification receipt.

The isolated exact core can use Float64Buffer state, Float64 arithmetic and
pure scalar binary64 helpers. `checked_float64` permits only integers in the
consecutive exact range ±2^53; it is not an unrestricted Python `float()`.
`int()` on a binary64 value truncates toward zero into an arbitrary-size exact
integer. NaN/infinity are rejected before GMP conversion. Negative floating
buffer indices remain outside the unsigned-index contract; exact positive
indices are checked before conversion. Unsupported float operators and unsafe
contextual integer literals fail compilation rather than miscompile.

Review fixed unsafe exact-index emission, unsupported float operators producing
invalid C, `/=` rejection, rounded large integer comparisons, and normal and
augmented assignment evaluation order. Regression cases include helpers that
mutate the destination while computing the index or RHS.

## Evidence and remaining qualification

- Focused IR test and generated JS/native execution tests pass; standalone
  Wasm test is skipped because its SDK is not prepared.
  After the interrupted broad dependency preparation left the local prefix
  incomplete, the final passing focused run explicitly used
  `SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix`.
  A default-prefix retry failed at missing MPC before compilation; it is not
  counted as passing. No performance comparison uses this diagnostic prefix.
- The actual PARI enumeration scaffold agrees in CPython, generated JS and
  native execution on 24 synthetic cases, including candidate order. Run:
  `node /home/user/sagejs-worktrees/pari-class-group-port/bench/pari-class-group-port/check_compiled.cjs /home/user/sagejs-worktrees/mixed-exact-float-sidecar`.
  This is not agreement with an upstream PARI trace or a performance result.
- Full build reaches stage 6, then fails on absent optional FFLAS `libgivaro.a`.
- Architecture checks reach optimizer opportunity verification, which reports
  stale generated input identity. Its integration-owned manifest still needs
  regeneration/review; it is not silently refreshed by this compiler lane.
- `pnpm test:native` starts rebuilding the broad dependency stack. This attempt
  was terminated during preparation, before tests, to respect the experiment's
  rule against repairing unrelated installations. Focused GMP-core execution
  works independently; full native qualification remains open.

No ABI layout changes are introduced: source/IR generator identities invalidate
compiled caches. No class-group policy, proof authority or public dispatch is
changed. Keep this prerequisite draft until qualification closes.
# Prepared field ingress follow-up (experimental)

The short-product prototype additionally exposed constant and augmented exact
shifts, and a tagged C local named `shift` colliding with the generated runtime
helper. Constant-literal shifts now retain exact semantics (including
`1 << 64`); augmented shifts reuse checked lowering. Tagged locals have a
separate name prefix from helpers. Focused shift tests cover these cases.

Native integer code now accepts explicit `ValueError` and `ZeroDivisionError`
with an optional constant message. Public dispatch preserves the exception
through native helper calls; a typed prefix in the raw ValueError status
prevents an explicit message from reclassifying an implicit division failure.
Dynamic messages and arbitrary exception construction remain unsupported.
`explicit-errors.cjs` checks dynamic, forced GMP and tagged paths, nested calls,
and message collisions. The effect analysis now records the IR exception
field rather than an absent property. No status ABI layout is changed.

The PARI rounding translation additionally motivates exact `int.bit_length()`.
It now lowers for Integer/uint64 expressions, with Python's sign-independent
result and zero returning zero. Tagged word and GMP paths and generated JS
are compared to CPython through 4,096-bit values by
`tools/native-kernel/test/integer-bit-length.cjs`. General exact-integer shifts
now lower to checked GMP/tagged operations and generated JS. Right shifts of
negative values round down, and arbitrarily large right counts saturate to
zero or minus one without allocating the requested bit count. Negative counts
raise `ValueError` through public dispatch (raw native status uses RangeError).
Left shifts have an explicit 1,048,576-result-bit allocation ceiling and raise
`MemoryError` through public dispatch rather than truncate; zero and count-zero
operations require no growth. This resource limit does not change ordinary
CPython execution. Machine `uint64` shift semantics remain separate.
`tools/native-kernel/test/integer-shifts.cjs` compares CPython, generated JS,
public dispatch and forced native execution, including signed and large-count
cases. The experimental PARI rounding translation now agrees on 75 prepared
real inputs across these execution paths. This does not qualify the embedding
norm or the connected class-group path.

Borrowed `RealNumberBuffer` and `ComplexNumberBuffer` arguments additionally
admit read-only indexing by nonnegative constants or uint64 indices inside
field loops. They are ordinary lists dynamically. The Node adapter constructs
a temporary pointer array, roots its handles for the synchronous call, and
checks type tags and precision; it frees the view on success and failure.
The isolated core receives const pointers and lengths and checks accesses.
Input limb storage is not copied during marshalling. Each read currently
copies into a precision-matched local; no zero-allocation performance claim is
made. Standalone callers must provide valid arrays and disjoint output storage.
Negative indexing and mutation are currently rejected at compilation; native
range failures use the existing RangeError status. These are explicit narrow
native capabilities, not changes to ordinary Python list semantics.

The user approved further reasonably justified compiler changes for the PARI
language experiment; the former one-correction count is no longer a stopping
rule. Existing time/compute limits and faithful-work comparison remain in force.

The first additional slice admits matching `RealNumber`/`ComplexNumber` scalar
inputs to legacy field kernels. Isolated cores borrow const MPFR/MPC operands;
Node checks the native type tags and precision before calling them. Public
wrappers require the same parent and nearest rounding, rather than silently
changing precision or accepting directed-rounding fields. Input rebinding is
still unsupported. This does not yet supply embedding containers or PARI's
rounding-error exponent calculation.

Focused validation:
`SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix node --test tools/native-kernel/test/prepared-field-inputs.cjs`.
It exercises standalone real/complex arithmetic against MPFR/MPC controls at
192 bits, unchanged inputs, precision rejection, forged handles and a minimal
JS fallback check. Windows and Wasm have not been qualified for this addition.
The broad `test/native-kernel.cjs` first stopped at a missing MPFR include;
with `CPATH` and `LIBRARY_PATH` pointed at the same explicit diagnostic prefix,
it passed that MPFR/MPC section and later stopped at a hard-coded missing
worktree `libgmp.a` path (line 2441). This is not a full-suite pass. The
architecture gate retains the previously reported stale optimizer manifest.
# Explicit relative native imports

The PARI experiment needs separate numerical, valuation and factorization
modules in one isolated call graph. Native import resolution now admits
`from .helper import function` and parent-relative forms inside regular Python
packages. Every traversed package must have `__init__.py`; namespace packages,
import search-path customization and imports beyond the regular-package root
remain unsupported. This is static source closure, not execution of Python
package initialization inside a kernel.

Imported source hashes, physical-path cycle detection and function provenance
are retained, including repository-relative display paths used by portable
artifacts. Imported-source changes invalidate native artifacts. Relative
`math` or `sagejs.ffi` names do not acquire the identities of absolute standard
or foreign imports. Existing alias, symbol-collision and decorated-entry
restrictions remain unchanged.

`tools/native-kernel/test/relative-native-imports.cjs` checks a two-level import
chain against CPython/JS/GMP/tagged, cache invalidation after an imported edit,
portable dependency provenance, relative-math identity, cycles, missing modules
and crossing the package root. This removes the need to concatenate the PARI
experiment's Python modules merely to compile a connected segment.

## Imported binary64 logarithm

Mixed exact kernels may return Float64 scalars through native calls and the
host adapter. The adapter now uses a double result slot and creates a JS
number, rather than incorrectly selecting an integer slot. The obsolete
restriction to pure-float scalar callees now also admits checked exact scalar
parameters; buffer/resource-bearing Float64-returning callees still fail closed
pending effect qualification. The typed isolated call remains authoritative. Regression
tests check fractional values and negative zero through direct, nested,
automatic, GMP and dynamic paths.

Explicit constant-message `OverflowError` is now admitted by exact native
lowering alongside `ValueError` and `ZeroDivisionError`. It uses the existing
exception transport, preserving the exception identity through nested calls.
Focused tests cover automatic, JS, GMP and tagged paths and reject shadowed
constructors and dynamic messages. PARI's real-to-binary64 conversion motivated
this addition; the port need not relabel an overflow as a domain error.

Mixed Float64 requirements now propagate through native dependencies, not
only parameters and locals of the immediate function. An integer-only wrapper
around a mixed helper selects GMP and explicitly rejects tagged execution;
it no longer attempts to emit a tagged call to a missing callee. A three-level
wrapper regression checks the analysis, automatic/GMP/JS results and tagged
capability rejection. This unblocks the complete logarithm constant call graph
without inventing floating-point variables in wrappers to force a backend.

The exponential integration also requires importing multiple entry points
from the same module when their native call graphs overlap. Such entries now
share an identical helper definition only when the resolved source path,
source hash and complete lowered definition agree. Conflicts with local
functions or different source modules still fail closed. The focused relative
import test checks both import orders, CPython/JS/GMP/tagged results, and an
identical-looking helper in a different module that must still be rejected.
General cross-module symbol namespacing remains outside this correction.

`math.log2` uses the same source-resolved binding and domain rules, with its
own `float64.log2` IR operation and direct libc/JavaScript `log2` calls. This
is required by PARI's exponential series schedule: replacing it by `log(x)`
divided by a constant would introduce another rounding decision. The focused
test exercises both logarithms against CPython on 92 positive inputs, aliases,
shadowing, invalid arity, signed zero, infinities and NaN. For base two it also
checks all 2,098 representable powers of two, from subnormal `2**-1074` through
`2**1023`, in pure and mixed native/fallback paths. No general bitwise
agreement between different platform math libraries is claimed.

`from math import atan` (including aliases) similarly lowers one explicit
Float64 argument to `float64.atan`, direct libc `atan` in the isolated core,
and `Math.atan` in the same-source fallback. Pure Float64 helpers and mixed
exact graphs share the imported-binding/shadowing checks; implicit exact
integer conversion is not admitted. Unlike logarithms, atan has no real
domain exclusion: signed zero, subnormals, finite inputs, infinities and NaN
are accepted. NaN payload/sign identity is not guaranteed by this ABI, and
cross-platform libm bitwise agreement is not asserted. Focused CPython
differentials and scalar/packed special-value checks cover both paths. A
pure helper returning `log2(3.141592653589793 / atan(value))`, called from an
exact graph, reproduces PARI's precision-selection expression without an
alternative approximation or a callback. This is correctness support, not a
timing or Windows/Wasm qualification.

PARI's bound check uses the C binary64 logarithm. Explicit `from math import
log` (including aliases) now lowers to `float64.log` and libc `log` in the
isolated core, with `Math.log` in the generated fallback. Both pure binary64
and mixed exact/binary64 functions accept one Float64 argument; implicit
large-integer conversion and the optional logarithm base remain unsupported.
Import identity and shadowing are checked, including aliases colliding with
builtin names. This does not introduce function-name-selected mathematics.

The focused `float64-log.cjs` test compares 92 positive binary64 inputs with
CPython, including subnormal and extreme values, and checks zero/negative
domain rejection, infinity, NaN and rejected bindings. Its numerical tolerance
does not assert bitwise agreement between platform logarithm libraries.
Mixed tagged execution remains unavailable; this adds no performance claim
or Windows/Wasm qualification. The focused logarithm, GCD and relative-import
tests pass. The architecture gate still stops at the previously recorded stale
optimizer-opportunity manifest; its preceding audits pass.

The same imported-function lowering now supports two-Float64-argument
`math.pow`, needed by PARI's GRH bound check. The native core uses libc `pow`,
not an alternative exponentiation recurrence. The JavaScript fallback handles
Python's `1**NaN` and `(-1)**infinity` math-library conventions explicitly.
Domain and finite-input overflow raise the low-level adapter's RangeError;
underflow remains a rounded result. This is the existing binary64 adapter
error convention, not a claim that its JavaScript exception classes are
CPython classes. Optional integer conversions are not introduced.

The logarithm test file also checks 739 power pairs against CPython in pure
binary64 and mixed JS/GMP execution: 169 special-value combinations and 570
positive `q**M` cases shaped like the upstream bound check. Finite nonzero
results use a small relative tolerance, not a bitwise cross-library guarantee;
signed zero and infinity are checked exactly. These are correctness controls,
not a performance qualification.

## Native calls used as statements

Shared native helpers reached through diamond imports are now coalesced by
their defining-source path, content hash, and complete lowered definition,
not the immediate importing module. This permits the exponential path to
share real-arithmetic helpers through multiple numerical modules. Missing or
ambiguous provenance, distinct defining modules, and unequal definitions do
not qualify. The relative-import regression exercises a diamond across JS,
GMP and tagged execution and checks that editing its shared leaf invalidates
the compiled cache. Distinct-source name collisions remain rejected.

Exact native functions may now call a known source-native helper and discard
its scalar result. This supports ordinary scratch-initialization calls without
a dummy assignment. The call, mutation and failure path still execute inside
the isolated graph. Only Integer, Float64, uint64 and bool results are admitted
by this new rule; tuple/resource return disposal is not inferred. Unknown
calls remain rejected. `native-call-statement.cjs` covers repeated mutations,
callee failure after mutation, mixed Float64 initialization, and rejected
unknown/tuple calls across the emitted backends.

## Binary64 exponent decomposition and scaling

The PARI class-group experiment's binary64 LLL pass needs `math.frexp` and
`math.ldexp`. Its 121-case dynamic-runtime probe found 14 discrepancies in
the ordinary `math` module, and native lowering rejected both imports. This
increment adds native lowering and correct generated fallback operations; it
**does not yet repair the separate non-native `src/lib/math.py` module**.

Imported `frexp` produces a typed `(Float64, Integer)` pair. The isolated C
core calls libc `frexp`, explicitly returning exponent zero for non-finite
values where C leaves the exponent unspecified. Mixed scalar tuple outputs
now use a double output pointer alongside the existing integer output slot;
the Node adapter already supports their individual representations. The
generated JS fallback reads exponent bits, first exactly normalizing
subnormals. Signed zero and non-finite values are preserved.

Imported `ldexp` accepts a Float64 and exact integer exponent. The isolated
core bounds the exponent to +/-4096 before converting it to C `int`: beyond
that range every nonzero finite binary64 value already overflows or rounds to
zero. JS normalizes the input, adds exponents exactly, and arranges scaling so
only the final multiplication can round into the subnormal range. Neither
path forms an overflowing intermediate `2**e`. Finite-input overflow raises
`OverflowError` through the typed host mapping; no infinity-on-overflow PARI
policy is silently substituted for Python semantics.

Functions with only floating public arguments/results can still have integer
exponent locals. Calls to these imported operations, or to typed native
helpers, select the mixed typed lowering from their actual source bodies.
Aliases and shadowing remain checked. This does not select an unrelated
implementation from an enclosing Python function name. Mixed execution still
uses GMP rather than claiming tagged or machine-only qualification.

`tools/native-kernel/test/float64-log.cjs` checks 2,625 decompositions and
3,814 scaling pairs against CPython, plus local and helper-call roundtrips in
generated JS and GMP-native execution. It includes every power-of-two
exponent, deterministic random bit patterns, odd subnormal rounding ties,
huge integer exponents, signed zero, infinities, NaNs, and overflow before
buffer mutation. Numeric values use exact binary64 equality (NaNs are compared
as NaNs), not a relative tolerance. Float/integer tuple Wasm bridge layout is
generated, but actual Wasm and Windows execution are not yet qualified. This
is capability/correctness evidence, not a performance measurement.

IR version 40 records the new operations. The focused exponent/logarithm,
mixed-sidecar, native-call, relative-import and explicit-error suite passes
14 tests, with one actual Wasm execution skipped for the missing toolchain.
Temporary-name regressions cover C locals and JS public function names; mixed
tuple tests preserve floats on both sides of a large exact integer. Strict
checking passes all 403 modules. The build reaches adapter reconciliation,
then fails at the existing missing FFLAS `libgivaro.a`; architecture reaches
the existing stale optimizer manifest. The compiler suite also fails, including
`series.py` with the previously observed undefined `$ρσ$py$Any` runtime name.
The integration tier stops at the Cantor test's missing default MPC prefix
(410 files unstarted). A targeted rerun using
`SAGEJS_FLINT_PREFIX=/home/user/sagejs/packages/flint/.native/prefix node --test test/hyperelliptic-native-cantor.cjs`
passes both Cantor checks in 330.8 seconds wall time, including native and
dynamic execution. This resolves that test's setup failure, not the unrun
integration tier. None of the full broad gates is claimed green.

The subsequent port unit gate caught a regression in the new source-call
scan: walking workspace-expanded synthetic AST nodes raised
`stat._walk is not a function` during production graph inventory. The scan
now runs on the original parser AST, before expansion, and only for floating
signatures that need that lowering decision. The exponent test file and
`test/wasm-graph-components.cjs` then pass seven checks, with actual Wasm
execution skipped; production graph core inventory is included in that pass.
## Tagged shift bookkeeping diagnostic

The PARI port's direct generated-core probe found that existing tagged short
products and signed real sums were slower than GMP-only execution on identical
PARI-checked operands. Mixed Float64 entry points still use GMP; this finding
does not justify changing their default or claiming tagged parity.

One concrete representation issue was unconditional promotion of both operands
inside `sagejs_tagged_shift`, including tiny shift counts. The runtime now keeps
small counts machine-sized, implements representable small results directly,
and uses GMP only when necessary. Negative right shifts implement Python floor
division without signed C shifts; INT64_MIN is never negated. Counts are saved
before stores to preserve output/count aliasing. Large-count behavior and the
existing 1-Mibit allocation limit are unchanged. There is no IR change; the
runtime source participates in generated-artifact cache identity.

Expanded checks compare 70 signed/boundary operand-count pairs in CPython,
generated JS, explicit GMP and explicit tagged execution, plus in-place/count
aliasing, enormous counts and cap edges. A Linux-only generated-core UBSan control
checks that a distinct small count stays small, representable results stay
small, and an output aliasing its count remains correct. Five focused compiler
tests pass; one standalone Wasm test is skipped for the unavailable toolchain.
Architecture checks reach the already documented stale optimizer manifest.

The port's `probe_arithmetic_backends.cjs` compares direct generated functions,
preloading exact operands and excluding marshalling. Three short alternating
diagnostic pairs cover 228 short-product and 1,344 signed-sum records, each
repeated 200 times after a discarded warmup. Before/after runs are separate,
unpinned and unqualified: tagged product totals changed from 209–212 ms to
193–195 ms; tagged signed sums from 431–433 ms to 383 ms. Corresponding GMP
totals were 135–139 ms and 258–266 ms. Every result still agrees with the PARI
records. The gap remains; these measurements support this narrow correction,
not a collector-wide speed claim or wholesale tagged-backend switch. These
initial measurements reused argument representation. Review found that callees
can promote borrowed tagged arguments, so the probe now restores argument
representation outside every call timer. The corrected baseline still favors
GMP: 199–201 ms tagged versus 139 ms GMP for products, and 386–393 ms versus
259–262 ms for signed sums. With the corrected boundary the candidate gives
187.6–187.9 ms tagged products and 364.6–370.1 ms tagged sums; GMP gives
136.5–137.4 ms and 260.4–262.4 ms. Every oracle record agrees. The host was not
quiet or pinned, so these are evidence for a narrow promising correction, not
a qualified percentage improvement. Do not mix the two timing boundaries.
Strict Python passes all 403 registered modules (904 formatted files in this
compiler worktree). The changed-file gate passes merge checks, rebuilds the
self-hosted compiler and Python modules, then fails at native adapter
reconciliation because the FFLAS prefix lacks `libgivaro.a` (644.65 seconds
total). Later broad suites are not reached; this is not a green release gate.

### Checked unsigned-word identity

The PARI port's portable word-product primitive exposed a redundant exact
round trip: `checked_uint64(x)` boxed an already typed `uint64` into GMP and
immediately decoded it. Lowering now preserves that typed value directly,
after lowering the argument expression so side effects still occur once.
Unknown exact integers retain the checked conversion; public host entry
validation is unchanged. No arithmetic reassociation or new primitive is used.

Focused tests cover zero, the upper unsigned half, UINT64_MAX, invalid public
and nested inputs, and a mutating helper argument. Generated GMP identity code
must contain neither GMP allocation nor conversion. All five shift/mask/GCD/
bit-length tests pass. Architecture checks still stop at the existing stale
optimizer manifest. The previously recorded changed-file adapter failure has
not been repaired or relabeled as a pass; no full rebuild was repeated here.

The port's 49-case one-word diagnostic changes from 67.7–68.2 ms to
59.8–60.6 ms per 49,000 products, with identical prepared inputs and outputs.
These are separate short three-sample runs, not qualified paired speedups;
PARI remains around 0.4 ms. The representation/entry overhead remains large,
and neither whole-collector improvement nor class-group parity follows.

## Explicit tagged execution for mixed exact/binary64 graphs

The class-group port's resident full-attempt experiment exposed a capability
gap: explicit tagged execution was rejected solely because the transitive
graph contained Float64 operations. This follow-up supersedes the historical
mixed-tagged restrictions recorded above; it makes no new speed claim.

Mixed exact functions now have genuine tagged bodies and tagged public
adapters, including Float64 scalar/tuple results and borrowed Float64 buffers.
They reuse the GMP backend's floating-operation emitter and therefore its
conversion rounding, nonfinite checks, domain/range failures, signed-zero
behavior, and operation ordering. Explicit integer/floating edges use
function-owned GMP temporaries, cleared on both success and failure; results
that fit machine integers normalize back to tagged-small values. This change
adds no whole-function GMP replacement or name-selected code; preexisting
exact-workspace bridge eligibility remains unchanged.
Pure Float64 callees are direct isolated native calls, and mixed exact callees
use tagged calls. Transitive integer-only wrappers inherit this capability.

Initially mixed functions enter tagged IR directly rather than using the
separate speculative all-word loop. Each tagged exact operation still uses
its established small-value path and promotes exactly as necessary. Pure
exact callees retain their existing word-loop optimization. This distinction
must remain visible when interpreting future timings. Automatic mixed
selection and implicit native-mode selection remain GMP; explicit `.tagged`
and explicit backend overrides now work. The dynamic fallback is unchanged.

Focused differentials include 80 CPython conversion/rounding/exact-promotion
cases across JS/GMP/tagged, nested calls and tuple results, scalar wrappers
with only transitive floating dependencies, nonfinite/decomposition/scaling
boundaries, borrowed-buffer mutation and evaluation order, range/domain/index
failures, and explicit backend selection. Generated cores remain callback-free.
Standalone Wasm is still skipped when the WASI toolchain is absent; these
local native tests do not qualify new Windows or browser performance claims.

The seven-file focused regression run passes 26 tests with one unavailable-WASI
skip. The architecture gate reaches a preexisting stale optimizer-opportunity
manifest and is not green; its manifest was not refreshed to hide the issue.
A separate tiny tagged-GCD sanitizer regression passes under a 4 GiB resident
memory watchdog (peak 391,741,440 bytes). That sanitizer alone needs an
address-space-limit exception for ASan's reserved shadow mapping; ordinary
diagnostics retain the 4 GiB address-space cap. These checks do not replace a
full integration/release run or a matched resident class-group measurement.

## Exact imported `math.isqrt`

Native exact graphs now recognize `from math import isqrt`, including aliases,
as an exact integer primitive. The admitted form has one positional `Integer`
argument; unsupported argument types/forms and ambiguous or shadowed bindings
fail compilation. This is separate from the preexisting approximate
`round(sqrt(n))` operation and never converts its input to floating point.

The GMP emitter uses a negative-input guard followed by `mpz_sqrt`. Tagged big
values use the same primitive and normalize small results; small tagged and
word execution use a bounded restoring base-four integer square root. The
generated JavaScript fallback uses exact BigInt Newton iteration. Negative
inputs raise Python `ValueError` through the generated runtime's exception
factory, including through native callers. They do not reach GMP's invalid
negative-input path. Direct low-level modules without Python exception
factories retain their established JavaScript `RangeError` fallback.

Focused checks cover small integers, word boundaries, huge squares and their
neighbors through 16,385 input bits, exact remainders, reassignment, mixed
Float64 graphs, transitive failure effects, and import provenance. A bounded
UBSan harness checks direct source/output aliasing, negative failure atomicity,
all integers below 65,536, and unsigned-word boundaries against GMP.

This capability allows the port to express `root = isqrt(n)` followed by
`n - root * root`. That is not a fused `mpn_sqrtrem` implementation: the extra
square/remainder arithmetic remains visible source work. No class-group speed
claim, backend-default change, new dependency, or full platform qualification
follows from adding the primitive. Full prepared-field replay remains the next
integration check, and the stale architecture-manifest blocker noted above
has not been hidden by regeneration.
