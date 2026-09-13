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
