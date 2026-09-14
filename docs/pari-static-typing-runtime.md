# Runtime typing imports in standalone output

This compiler-runtime correction supports the PARI language experiment but is
not a class-group algorithm or a performance optimization.

## Defect and correction

`lowerImport` and the module resolver both discarded `from typing import ...`
whenever `runtime_imports` was false. Ordinary standalone compilation sets
that flag false. Imports needed by runtime assignments such as
`Values = list[Any]` therefore disappeared, leaving an unbound name in the
generated program. In the experiment this surfaced while initializing the
public `sagejs.native.RealNumberBuffer` alias, even for unrelated user code.

The two sites now discard typing imports only for `compiler_bootstrap`.
Normal static output includes the ordinary `typing` module; runtime-import
sessions keep their existing behavior. Bootstrap call sites in `tools/self.js`
explicitly set this flag, and imported-module options retain it. The existing
`typing.py` module has no imports of its own.

The module-cache regression compiles and executes `list[Any]` aliases in both
Python and Sage modes, checking `get_origin` and `get_args` rather than merely
checking that compilation succeeds. The existing local `numbers` shadow test
also exercises the original implicit-module initialization failure.

## Validation

The isolated worktree starts at `e4a2d82b6`. Its initial diagnostics reused a
copy of that worktree's generated `dist` artifacts, not a fresh complete build.
TypeScript compilation and two self-host passes succeeded, but a copied
`dist/runtime-cache/compiler.bin` still loaded the old embedded compiler
version. Moving that generated file to `compiler.bin.pre-typing` exposed the
new version; subsequent checks correctly exposed other stale generated caches.
Regenerating the standard-library and runtime caches resolves those staging
failures. The complete module-cache test now passes, including both added
language modes. A direct frontend check also confirms that bootstrap parsing
still omits the typing dependency. Its first diagnostic incorrectly inspected
an AST property instead of the supplied import map; that diagnostic was fixed
and rerun, not counted as a compiler failure.

The full changed-file gate completed its eight-stage build. Its unit stage
first stopped because the new worktree had no FLINT addon. The direct addon
was then copied from the compiler prerequisite worktree only after verifying
identical source, Node/runtime, environment and artifact-content identities;
the generated FLINT FFI adapter was built locally. The previously failing
module-isolation test then passed. A compiler-suite run before this dependency
restoration also failed on missing FLINT; it is not a qualification pass.

The next unit run exposed the completer test's legacy compiler options. Its
manual parse/print harness omitted the Python attributes, tuple, truthiness,
strict-scope and sequential-definition settings used by the CLI and REPL.
Loading the now-retained typing module exposed legacy keyword dictionaries
and prematurely hoisted class bases. The test now uses the same semantic
settings as `tools/compile.ts`; its completion assertions are unchanged and
pass. Merely adding attribute emission was insufficient, and those failed
intermediate attempts remain in the ledger. This does not change defaults in
the low-level OutputStream or grant the bootstrap ordinary runtime imports.

The full unit tier now passes all 242 files. The compiler tier still fails
after native and lazy-cache restoration: algebra reaches the existing roughly
60-second fixture timeout, while polynomial/extension fixtures cannot import
`sagejs.polynomial_algorithms.extension_mpoly_backend` through their standalone
harness. Those outcomes are not qualification passes.

A selected pre-fix compiler control is also failing, but differently: algebra
and polynomial hit the original unbound `Any` error, while extension-geometry
cannot import `field_capabilities`. Thus the fix demonstrably gets past the
original typing defect, but the old run does not establish that every later
failure is pre-existing. No broad compiler regression-free claim is made.

The integration tier passes the hyperelliptic native Cantor file, but stops
after two failures in `number-field-class-unit-engine.cjs` (34 pass, one skip,
two fail in that file; 409 files never started). The two selected failures
also reproduce on the native compiler prerequisite worktree without the typing
fix: reduced-cubic source assertions and an incomplete large-cubic result.
They are not caused solely by this typing change; that does not make the
unexecuted remainder a pass or justify weakening the mathematical assertions.

`architecture:check` reaches the pre-existing
stale optimizer opportunity manifest and fails there; the expected input hash
also changes with this frontend diff. No manifest was refreshed to hide that
failure. These outcomes do not constitute release qualification.
The old bytecode cache remains recoverable
at `dist/compiler.bin.pre-typing` in the new worktree; no source or other
worktree cache was removed.

Read-only independent review found no blocking source defect and recommended
covering Sage mode, which the regression now includes. The review used 73
active seconds and no execution. Build/test receipts are charged to the PARI
experiment's approved continuation ledger.

A second read-only review confirmed that the completer flags match CLI, REPL,
and the standalone compiler harness, including inherited dependency flags.
It made no edits and weakened no expectations. Reserve five aggregate active
minutes for that review. Keep this change draft pending broader qualification;
do not silently refresh unrelated manifests or change mathematical test bounds.
