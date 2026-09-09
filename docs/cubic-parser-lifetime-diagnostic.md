# Cubic qualification exposes parser lifetime exhaustion

Diagnostic checkpoint, 2026-09-09, followed by the production ownership repair
below. No mathematical source change, memory-limit increase, or class-number
timing claim.

Before the repair, the full unit-tier follow-up reproducibly failed
`test/wasm-production-native-kernels.cjs`, including when that file runs alone.
Its repeated production inventories eventually failed at Tree-sitter parser
initialization with `RuntimeError: table index is out of bounds`. This is not
a missing numerical reactor, a failed class-group certificate, or an exact
arena exhaustion status. The full unit gate was therefore not green even apart
from the separately recorded modular q-expansion source-freeze mismatch.

## Distinguishing two lifetimes

At the diagnostic baseline, `createTreeSitterParser` caches core initialization
but calls `Language.load` on every new parser. The installed implementation loads
another Wasm side module. The Python syntax frontend closes its parser but
does not dispose the trees returned by `parse`/`assertValid`; neither the
compiler frontend nor its module resolver deletes those trees.
A parser and its returned trees have distinct lifetimes.

The read-only diagnostic
`bench/class-unit-groups/diagnose-cubic-parser-lifetimes.cjs` alternates Python
and Sage parsers in a fresh process. It offers independent interventions:
cache grammar loads by exact binary hash, explicitly delete each returned
tree after checking its diagnostics, or do both. It instruments the existing
Wasm memory object without changing its initial size or maximum. These
interventions are diagnostic monkeypatches, not installed production fixes.

| Workload | Intervention | Observed result | Wasm linear memory |
| --- | --- | --- | ---: |
| Tiny function, 1,024 requested parses | None | Fails after 822 completed parses; 823 grammar loads | 396,230,656 bytes |
| Tiny function, 1,024 parses | Grammar cache only | All pass; two grammar loads | 33,554,432 bytes |
| Full cubic module, 128 requested parses | Grammar cache only | Fails after 50 completed parses | 396,230,656 bytes |
| Full cubic module, 128 parses | Grammar cache and tree deletion | All pass; two grammar loads | 33,554,432 bytes |

The tiny-function experiment also compares 256 parses with and without tree
deletion alone: both uncached runs load 256 grammars and grow Wasm memory to
144,703,488 bytes. Disposing tiny trees does not address repeated grammar
loading. Conversely, grammar caching alone does not address the large cubic
syntax trees. The two interventions isolate different retained allocations.
The initial failure counts are observations, not promised thresholds.

These memory figures are Wasm linear-memory sizes, not total process peaks.
The diagnostic also records RSS; ordinary JavaScript allocations still exist.
It checks syntax diagnostics, not equivalence of every lowered semantic AST
or native executable. The successful intervention is therefore motivation
for a production ownership fix and its tests, not sufficient qualification.

## Reproduction

From the diagnostic baseline `76ccff2de`, execute each command separately;
the baseline failures are expected and should retain their nonzero status.
On the repaired compiler, even `baseline` benefits from production grammar
caching; it still intentionally retains caller-owned syntax trees:

```sh
node bench/class-unit-groups/diagnose-cubic-parser-lifetimes.cjs baseline 1024 small
node bench/class-unit-groups/diagnose-cubic-parser-lifetimes.cjs cache 1024 small
node bench/class-unit-groups/diagnose-cubic-parser-lifetimes.cjs cache 128 cubic
node bench/class-unit-groups/diagnose-cubic-parser-lifetimes.cjs both 128 cubic
```

The tracked driver records its own hash, parsed-source hash, built frontend
hash, and Node version. Initial and provenance-bound rerun logs are retained
under `build/cubic-next-evidence/parser-lifetime-*.log`; the standalone unit
failure is `integration-wasm-inventory-isolated.log`. The production cubic
source remains
`93a41e20e4c7916bb00957ae0322b5378bf16491c317f5eeea2ef3f011a29e2c`.

## Production ownership repair

The shared parser factory now caches a grammar-loading promise by its resolved
bundled resource path. Assets are immutable within the initialized runtime.
Concurrent requests share the same load; rejection removes that promise so a
later request can retry. A parser whose language binding fails is deleted.
The initial 512-page and maximum 6,144-page Wasm memory limits are unchanged.

Compiler lowering now deletes its main and imported concrete syntax trees in
`finally`, after the semantic AST has copied token text and positions. Invalid
trees that `assertValid` never returns are deleted too, including diagnostic
traversal failures. Failed construction of the second, Python-import parser
in Sage mode releases both allocated parsers. Raw syntax clients still own
their returned trees, including recovery trees from `parse`; closing a parser
does not invalidate those trees.

`test/python-parser-lifetimes.cjs` tests concurrent load sharing, failed-load
retry, failed binding and partial construction, valid and invalid imported
modules in both modes, diagnostic failure, exactly-once disposal, and retained
raw trees. It also prints semantic ASTs after their concrete trees are gone.
The imported-module cases deliberately use real compilation, not the lint-only
mode that substitutes import stubs. Unresolved imports remain dynamic imports;
that existing behavior is not converted into a compile-time error.

Two production probes complement the focused tests:

```sh
node bench/class-unit-groups/check-cubic-parser-ownership.cjs 128
node bench/class-unit-groups/check-cubic-generated-equivalence.cjs \
  packages/flint/.native/production-kernels/f0e09f53ed38550e6293db4bf6f33a07bc5e4a31ce0c8ee113e0668c68a7819a
```

The ownership probe instruments allocations but does not cache or delete
anything on behalf of the compiler. It repeatedly lowers the complete cubic
source, alternates syntax modes, and follows each success with a lowering
failure. It records source/compiler hashes and observed Wasm memory and RSS.
The 128-iteration production run passes with two grammar loads, 256 trees
created and deleted exactly once, no live trees after each operation, and
33,554,432 bytes of Wasm linear memory at every observation. Final RSS is
456,380,416 bytes; a repeat after the full build also passes all 128 iterations,
with final RSS 475,000,832 bytes. Neither is a peak-RSS bound. The repeated run
records self-hosted compiler SHA-256
`12e6df015dbb3579a63d7757e7b95f5c2563454097a016e3556b669ad0ce3ba4`.
The earlier raw-tree diagnostic
and this semantic-compilation workload are different workloads, not a timing
comparison.
The equivalence probe compares the durable serialized IR and all generated
core, header, and adapter bytes against the preserved pre-fix production
cache. It fixes the symbol identity solely for that comparison; it does not
authorize reuse of an old compiler receipt.

The 109-function cubic serialized IR is identical, with SHA-256
`7da445fcd1feccc61e18152005944125c49095a3abc9db34081d4b70a378dd0b`.
All three emitted files are byte-identical. The 17,762,154-byte core retains
SHA-256 `433e55a36fabb08f26055962e9600f4a34c4962221a88ab8318db6bffdd1d0c6`.
This isolates the change to compiler resource lifetimes; it is not a new
controlled timing result or cross-platform qualification.

The formerly crashing standalone Wasm inventory test completes: six passes,
three existing toolchain-dependent execution skips, zero failures. The
skipped tests are not claimed as browser/Wasm execution evidence.

The full local build passes, including two self-hosting passes and native-pack
publication. The generated-equivalence probe also passes again after that
build. The focused Python/diagnostic/Magma suite has 80 passes without skips;
the existing compiler suite has 21 passes and 28 existing fixture-marker
skips. The module-cache test passes when run after build completion. Its first
run overlapped cache preparation and failed because `collections.abc` had not
yet been installed; that run is retained, not counted as a pass.

Architecture and strict Python (382 modules, zero errors) pass. The optimizer
snapshot was regenerated for the changed compiler identity; its mathematical
source bundle and census counts are unchanged. Relevant logs are
`build/cubic-next-evidence/parser-fix-*.log`. Broad `test:changed` qualification
is separate from these focused passes, and a running suite is not a pass.

The broad plan's `test:wasm` step invokes another full build. Separate public
cubic tests accidentally overlapped that rebuild and saw incomplete compiler
exports and unavailable native-cache entries. Those concurrent failures are
retained but do not qualify the candidate either way. Finish the mutating
build/test plan before rerunning public tests against a frozen runtime; do not
weaken receipt matching, constructor checks, or cache requirements to make
the overlap pass. An isolated ownership-test recheck passes after the compiler
converges, but is not a substitute for the required serialized public rerun.

## Remaining qualification

Rebuild and recollect compiler-bound artifacts and run the broader
compiler/native gates. The earlier 1,000-field replay remains evidence for
its recorded runtime, not automatically for the new compiler. Retain the
separately recorded source-freeze and parallel-metadata failures until their
own gates are satisfied. PR190 remains draft pending broader qualification.
