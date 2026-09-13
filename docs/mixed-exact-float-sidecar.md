# Mixed exact/binary64 prerequisite checkpoint

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
