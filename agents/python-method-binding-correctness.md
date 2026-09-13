# Method-binding correctness experiment

Status: follow-on PR #211 to canonical type PR #209 (`f9b2b4d98`). The lexical
capture revision passes local routine including startup; exact-revision platform
CI remains required. Earlier failures below are retained as experiment history.
PR #209 independently passed Linux x64, Linux ARM64, macOS ARM64, Windows x64
and Chromium parity. This experiment is not part of that PR.

## Representation change

Remove eager instance-field method caches. Ordinary generated methods use fresh
prototype binding, extending the existing lightweight-class getter mechanism
without storing a bound value on the receiver. Explicit instance assignments
remain real namespace entries, including `obj.m = obj.m`; the old eager-cache
marker no longer changes their meaning. Saved bound values retain their target.

Getter metadata carries the unbound function so copied multiple-inheritance
descriptors do not bind to their original prototype. Class dictionaries expose
functions rather than converting method getters into properties. Dynamic class
reconstruction restores receiver-style functions behind explicit-self adapters.
Decorated descriptor objects must not be wrapped as ordinary method functions.
Attribute read/write/delete paths use private Python type ownership, retaining
unknown native fallback behavior.

## Evidence and unfinished qualification

Evidence logs are under `/home/user/python-output-integration-evidence.X9vc1T/`
with `method-binding-` prefixes. Intermediate failures are retained.

- `test/fixtures/method-binding-mutations.py` passes CPython 3.14.4. It covers
  fresh reads, saved methods, explicit assignments, class replacement/deletion,
  class reassignment after calling, evaluation order, constructor shadowing,
  data descriptors, old-marker spoofing and inherited class-level access.
- The latest diagnostic compiler/runtime-cache build passes all 12 canonical
  type groups (including standalone compilation) and all 11 method/traitlets/
  widget groups. Notification and rollback transcripts match the pinned oracle.
- An earlier full 536-case run had two new multiple-inheritance regressions:
  `class_inherit_mul` and `class_store_class`. Both now pass direct diagnostic
  replay; a complete current-source corpus rerun is still required. Preserve
  the main baseline of 518 passes, 3 reviewed differences, 15 required failures.
- A complete current-source build finished in 7m28s. Architecture checks pass
  with 902753/903000 core-runtime source bytes; no budget increase was needed.
- Diagnostic self-build passes took about 117–120 seconds and standalone
  compilation about 78 seconds. After the complete build refreshed module
  caches, the standalone regression takes about 2.1 seconds (M1 recorded about
  1.8 seconds). Do not compare diagnostic self-build timings with the 27/45
  second passes inside `pnpm build`: that command first restores the bootstrap
  compiler. Neither comparison establishes warm method-call performance.
- The rebuilt product passes 88 focused groups: canonical type, method
  mutation, CST lowering, traitlets and widget models. Routine validation first
  stopped on an obsolete assertion requiring constructor-time deletion of an
  eager cache. The assertion now requires absence of eager binding/cleanup;
  an executable static-method override oracle also passes CPython and Sage.js.
- The frozen full-corpus rerun (`method-binding-frozen-compat.json`) preserves
  all 536 dispositions, with `unchanged: true`. 535 case evidence records match
  M1 exactly; the finalizer case selects the other already-reviewed asynchronous
  output fingerprint. The 15 required failures still make the corpus explicitly
  unqualified. An earlier run was invalidated by editing these notes during
  execution; it is retained as diagnostic evidence, not qualification.
- Routine validation passes portable tests, strict Python checks, generated
  documentation, FFI and public API smoke tests. Startup fails narrowly at
  404.9 ms against the unchanged 400 ms limit. Retain this failure alongside
  any subsequent independent result, rather than describing routine as green.
- A three-sample warm diagnostic records roughly 91x CPython for method calls,
  44x for simple construction and 30x for construction with an initializer.
  These are existing-cost candidates, not qualified before/after claims. A
  separate exact M1 checkout is being built for paired comparison.
- Startup qualification and paired call/construction measurements remain
  required before publication. No timeout, startup limit or outcome baseline
  has been relaxed. No performance-cliff closure is claimed.

The latest class-access fix avoids using the descriptor cache during bootstrap:
that cache can require the map primitive before it exists. A prior diagnostic
revision failed bootstrap for that reason; it is not the current source.

## Next actions

1. Qualify the lexical-capture commit in platform CI before merging. Retarget
   main after the canonical-type prerequisite merges.
2. Independently confirm performance on a quiet qualification host before
   claiming cliff closure. Startup margin remains narrow; retain failed runs.
3. Add any reduced regressions found by broader testing. Do not publish this
   as ready while a new required failure or unexplained large cost remains.

## Compact-helper checkpoint

Factoring bound-method metadata into `ρσ_finish_bound_method` removes about
635 KB of repeated runtime JavaScript, but does not materially reduce its V8
cache. The new helper also serves ordinary descriptor and super binding.

The final build completes in 7m22s, all 88 focused groups pass, architecture
passes at 902463/903000 core-runtime bytes, and routine portable, strict Python,
documentation, FFI and API checks pass. Startup remains over budget: 405.2 ms
isolated and 408.2 ms in routine versus 400 ms. Exact M1 baseline startup was
391.4 ms. This is an unresolved regression, not a waived budget.

`method-binding-shared-compat.json` is a frozen complete run with all 536
dispositions unchanged (518 passes, three reviewed differences, 15 required
failures). Seven-sample local medians after three warmups compare exact M1
with the compact revision:

| Workload | M1 | Compact revision |
| --- | ---: | ---: |
| Simple instance construction | 4990 ms | 2600 ms |
| Construction with initializer | 500 ms | 270 ms |
| Instance method calls | 335 ms | 287 ms |

These establish useful local regression evidence, not independent performance
qualification or cliff closure. The final revision remains roughly 43x, 29x
and 88x CPython respectively on these workloads. Full reports include the
runtime identities, samples and environment; filenames are
`method-binding-calls-baseline7.json` and `method-binding-shared-calls7.json`.

## Lexical capture follow-up

Replace each immediately invoked method-binding factory with a lexical block
and `const` captures. Getter/setter behavior remains unchanged; repeated class
definitions in a loop now have an explicit independent-target regression.
The compiler no longer emits or initializes one extra factory per method.

The runtime V8 cache shrinks from 8347784 to 7913624 bytes (434160 bytes).
The full build passes in 7m17s; 88 focused groups, architecture and the complete
routine suite pass. Isolated startup is 399.5 ms against 400 ms, followed by a
successful routine startup check. This resolves the local gate, not the narrow
margin or every environment's startup cost.

The frozen `method-binding-block-compat.json` preserves all 536 dispositions
with unchanged source/build identity. Seven-sample warm medians are 2617 ms
simple construction, 274 ms initialized construction, and 284 ms method calls.
They retain the earlier local improvement against exact M1 (4990/500/335 ms),
but remain approximately 45x/30x/87x CPython: no performance cliff is closed.
Logs and samples use the `method-binding-block-` prefix in the evidence folder.
