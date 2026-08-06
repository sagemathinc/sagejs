# Python and Sage frontend

Tree-sitter is the syntax authority for both Python and Sage source. The
portable default loads pinned WASM grammars from `vendor/tree-sitter`; native
bindings are not required by the CLI, SEA, browser, or Windows builds.

The frontend has four explicit layers:

1. `tools/python/frontend.ts` parses source and reports `ERROR`/`MISSING`
   diagnostics with stable source locations.
2. `tools/python/lowerer.ts` lowers named CST nodes directly to the established
   semantic AST. It also owns literal decoding; the shipping compiler has no
   tokenizer.
3. `tools/python/module-resolver.ts` discovers imports from CST nodes, resolves
   packages and relative imports, validates caches, and recursively compiles
   modules without reparsing user statements.
4. `tools/python/semantic.ts` performs the scope and definition analysis that
   is independent of concrete syntax.

`tree-sitter-python` defines Python mode. `tree-sitter-sage` is derived from it
and adds only documented mathematics-oriented syntax. Ordinary `.py` library
sources remain CPython-parseable. The grammar audit runs both grammars over the
compiler, strict baselib, standard library, MicroPython, Sage doctest, and book
corpora and records every encountered grammar node and discrepancy.

Tree-sitter is deliberately an error-recovering editor parser, so its concrete
syntax tree is followed by explicit compiler validation. This covers structural
indentation, parameter ordering and duplicate names, assignment and deletion
targets, `global`/`nonlocal` declarations and bindings, and other restrictions
that CPython checks after constructing its parse tree. The checked audit
currently accepts and directly lowers all 2,632 inputs across the combined
corpus. Its historical-JavaScript comparison is reported separately: the
immutable bootstrap predates live module namespaces and numerous current
semantic fixes, so byte-identical old output is an oracle observation rather
than a release criterion.

Language behavior has a second, runtime-level denominator. The vendored
MicroPython corpus compares output and exceptions against CPython 3.14.4. Of
508 applicable programs, 506 agree and the remaining two are reviewed,
documented weak-reference/finalization nondeterminism rather than parser gaps.

`bootstrap/compiler.js` is the immutable stage-zero compiler. It retains the
historical RapydScript parser solely so an old checkout can build the current
compiler and so differential audits have an independent acceptance oracle.
It is not loaded by the installed CLI, kernel, linter, dynamic `compile`/`eval`,
module loader, or embedded compiler. The compiler produced in `dist/` exports
AST/output machinery and a version only; `parse` and `tokenizer` are
intentionally absent.

Historical compiler fixtures containing RapydScript-only syntax are marked
`STAGE_ZERO_ONLY`. They are retained as provenance for the immutable bootstrap
artifact, not counted as Python/Sage programs, and are enumerated explicitly
under `excludedCompilerTests` in the grammar audit. Every unmarked compiler
fixture is parsed and executed through Tree-sitter in CI.

The FLINT-WASM browser evaluator bundles these same TypeScript lowering and
module-resolution layers with `web-tree-sitter`. Its worker receives the core,
Python, and Sage WASM grammars as ordinary package assets and resolves the
precompiled standard library from an in-memory resource map. It does not ship
or revive the stage-zero parser.

Empty CLI startup does not initialize Tree-sitter. The first submitted program
loads the WASM grammar and subsequent parses reuse it. CI measures empty
startup separately from first-computation startup so neither performance
property can regress unnoticed.
