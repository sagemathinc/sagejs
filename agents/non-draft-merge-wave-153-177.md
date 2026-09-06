# Non-draft integration wave 153–177

Scope pinned from open PRs on 2026-09-06. No release, no draft dependencies.
Start from `origin/main` at `60ab78c2a`; use `agent/non-draft153-177`.

## Reviewed heads and order

The Python stack is linear; integrate and qualify it together:

| PR | Head | Scope |
| --- | --- | --- |
| 153 | 8964ff0e0 | Independent implementation and language identities |
| 154 | 445789fd9 | Explicit-self native method access |
| 157 | 3924f8e3f | Structured diagnostics and bounded cache-test IPC |
| 160 | 0a88c3607 | Pinned package workflows and phase-specific evidence |
| 163 | 75fae48a3 | Independent interpreter assertion-program adoption |
| 170 | 33a6e842a | Dynamic module namespaces and nested class bindings |
| 172 | 682990ddd | Compiler-only unbound methods and evidence reuse |
| 175 | 472e2264f | Generator identity, live builtin calls, unbound locals |
| 176 | a290b4c02 | Whole-source RustPython inventory review |
| 177 | a6850d5df | Callable-instance descriptors |

Then integrate #155 (`c5702e58d`), portable exact character-Hecke action.
All eleven heads were non-draft; no inline review comments were present.
Recheck heads and draft status before publication.

## Review decisions

- Retain the distinction between corpus adoption and passing qualification.
  The new required cases remain required even when unsupported; inventory
  reviews are not runtime passes. Package timing requires successful exact
  behavior, pinned installed source and an authenticated CPython oracle.
- The `sys1.py` baseline difference is solely the independent `sagejs` name;
  retain source and exact output fingerprints rather than spoofing CPython.
- Compiler receiver-method policy applies only to compiler-source parsing;
  ordinary Python still binds methods. Test actual AST operations and emitted
  Python, not only source patterns or a refreshed manifest.
- Preserve main's optimized descriptor lookup and explicit-receiver adapter.
  The callable-instance condition already exists on main; do not replace it
  with repeated generic member/type lookups.
- Preserve SEA shared native resource setup before importing the evaluator,
  while adopting trusted, bounded structured diagnostic serialization.
- Keep main's compact-output semicolon regression alongside the new complete
  checked-name-resolution assertions. Preserve existing size limits pending
  measurement, rather than resolving conflicts by increasing them.
- Character Hecke uses sparse accumulation over used generator columns and
  one exact bulk quotient reduction. Native acceleration remains available;
  degree-four, bad-prime, imprimitive and parity-zero cases require oracles.
  The linear-constituent shortcut is mathematically exact; broader cyclotomic
  factorization limitations are not disguised as passing browser support.
- Keep prior abelian-variety imports, canonical-map serialization and public
  constructor documentation when merging the independent browser branch.

## Validation

Pending combined build, focused semantic/mathematical tests, unit/portable,
strict Python, architecture, current optimizer census, generated reference,
and real packaged browser qualification. The initial 51 source-level tooling
tests pass. No main push is justified by this preliminary result alone.

Coordinate progress in GitHub Discussion #104. Existing empty-arrow-loop
`math` lookup ordering and wider package compatibility remain explicit
follow-ups, not capabilities claimed by this wave.
