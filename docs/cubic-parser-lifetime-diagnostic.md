# Cubic qualification exposes parser lifetime exhaustion

Diagnostic checkpoint, 2026-09-09. No production compiler or mathematical
source changes, no memory-limit increase, and no class-number timing claim.

The full unit-tier follow-up reproducibly fails
`test/wasm-production-native-kernels.cjs`, including when that file runs alone.
Its repeated production inventories eventually fail at Tree-sitter parser
initialization with `RuntimeError: table index is out of bounds`. This is not
a missing numerical reactor, a failed class-group certificate, or an exact
arena exhaustion status. The full unit gate is therefore not green even apart
from the separately recorded modular q-expansion source-freeze mismatch.

## Distinguishing two lifetimes

`createTreeSitterParser` caches core initialization but calls `Language.load`
on every new parser. The installed implementation of `Language.load` loads
another Wasm side module. The Python syntax frontend closes its parser but
does not dispose the trees returned by `parse`/`assertValid`; neither the
compiler frontend nor its module resolver currently deletes those trees.
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

From a built checkout, execute each command separately; the baseline failures
are expected and should retain their nonzero status:

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

## Required production follow-up

Cache immutable grammar modules with an explicit identity and failed-load
policy. Give compiler-created syntax trees deterministic all-exit ownership,
including imported modules and syntax-error paths. Do not indiscriminately
delete every tree when its parser closes: raw syntax clients can legitimately
retain returned trees beyond the parser's lifetime. Preserve that API contract
and dispose trees where the compiler has finished consuming them.

Then exercise repeated valid/invalid/imported compilations, both syntax modes,
retained-tree clients, the complete Wasm inventory test, and the broader
compiler/native gates. Rebuild and recollect compiler-bound artifacts instead
of treating the diagnostic's grammar cache as release-ready implementation.
