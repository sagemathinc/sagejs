# Non-draft integration wave 153–178

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

Final addition: #178 (`b779c2067`), opened during qualification, restricts
virtual ABC registry lookup to the candidate's own class. Existing registration
propagates upward explicitly; inherited registry lookup incorrectly admits
unrelated child classes. Review includes collection ABCs, sibling and later
children, and subclasses of registered concrete classes. It does not claim
complete ABC hooks, cycle rejection or pyparsing qualification. Freeze this
twelve-PR wave here rather than continuously admitting new arrivals.

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

Final runtime corrections are in `e200d188c`; generated evidence is in
`020f79904`. All twelve reviewed heads are ancestors of the candidate.

- Full eight-stage build: pass in 10m19s, all 41 native kernel families reused.
- Routine `pnpm test`: all eight stages pass in 1m34s, including 142 portable
  files, startup budget, smoke, strict Python and generated-document integrity.
- Complete unit coverage: the 142 portable files plus all 15 remaining unit
  files pass. The latter contain 51 passing cases and one existing optional
  external-SageMath oracle skip; no failing or cancelled cases.
- Focused combined semantic/mathematical tests: 133 pass, including exact
  native/portable character-Hecke comparisons and lazy analytic batches.
- Strict Python: 381 modules, zero errors; formatting is current.
- Architecture: pass, including 1090 reviewed Wasm capabilities and the
  source-current optimizer census (16521 functions, zero compilation failures).
- CPython 3.14.4 conformance: 505 pass, three declared incompatibilities,
  unchanged baseline; 68 existing exclusions remain explicit.
- Reference: 226 pass, two expected failures, four skips, zero failures or
  unexpected passes.
- Fresh Wasm build: 286 compiled kernels, one explicitly unsupported, all 15
  reviewed ABI modules verified. Artifact identity:
  `sha256:7e580dd1fc77d1f3f52c587e1c61635e572ce318aba1f264a9f53544ff2c8fb1`.
- Packaged Node-Wasm/Chromium mathematical tests: seven pass, no skips.
  Real Chromium additionally passes four character-Hecke/Gamma1 cases and
  seven Python protocol fixtures, including builtin deletion and ABC isolation.
- Optimizer evidence cold-download and content hashes verify. Its infrastructure
  prerelease is explicitly not Latest; no product release or deployment is made.

## Integration fixes and qualification lessons

The combined source exceeded the unchanged core limit. Move unchanged
gamma/xi/zeta host orchestration into lazy `sagejs.special_functions`, with
public signatures retained and cache/batch regressions. Final core source is
889462/890000 bytes. The native inventory changes only three consumer paths;
no native export policy was relaxed. The generated compiler is 4103036 bytes,
below the existing limit.

Real Chromium exposed a deleted-builtin resurrection missed by private-scope
standalone tests. The standalone facade now advertises its names, and missing
known builtins cannot fall through to stale worker-global aliases. Add both
global-realm standalone and real-worker coverage; retain normal module and
lexical lookup before this guard.

Two unsuccessful validation attempts were rerun rather than waived: a contended
zeta integration test timed out but passed isolated in 13 seconds; a unit run
overlapped runtime-cache replacement and correctly failed its missing-output
guard. Final routine and complementary unit checks ran with stable build
outputs. Do not parallelize output-inspecting tests with a build mutating the
same output directories.

Coordinate progress in GitHub Discussion #104. Existing empty-arrow-loop
`math` lookup ordering and wider package compatibility remain explicit
follow-ups, not capabilities claimed by this wave.
