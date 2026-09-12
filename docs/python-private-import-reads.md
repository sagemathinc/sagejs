# Private compiler import reads

`private_compiler_import_reads` is an opt-in self-hosting OutputStream option,
disabled by default. `tools/self.js` feature-detects it after the immutable
seed pass. Ordinary Python and mathematical baselib compilation do not opt in.

For direct, declared imports in a compiler-bootstrap module, emission tests
`ρσ_is_missing_binding(cell)` before using the live lexical cell. Missing values
use the unchanged namespace resolver, including builtin fallback. All three
missing sentinels remain significant: undefined, deleted builtin, and cleared
exception. The resolver intentionally returns the latter marker for an outer
unbound check; this optimization must not reinterpret it.

The authority argument is limited to the private compiler: non-reusable module
namespaces install nonconfigurable getter/setter pairs over the exact lexical
cells. Export writes and live globals-dictionary writes call the setters;
dictionary deletion assigns undefined. Ordinary reassignment remains live.
Arbitrary JavaScript escapes replacing the private module table are outside
this internal option's contract. No public Python compatibility is weakened.

Conditional imports, nested imports, star-import modules, reusable modules,
exec namespaces, module-cache output, and ordinary Python symbols do not use
this path. Transparent AST import containers are recognized structurally;
the existing public control-flow classification is deliberately unchanged.
Removing its apparent depth false positive alone loses NameError for calls
before an import executes.

PR248's direct AST predicate binding is a prerequisite for the candidate
performance comparison. Bootstrap diagnostics alone are not a speed claim:
the extra missing-binding predicate can consume some of the saved lookup cost.
Promotion requires measured benefit and full candidate qualification.
