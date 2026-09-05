# PR 101–120 integration audit

Status: in progress. This is development integration, not a release.

Starting main: `675b1d3f494d1e9dedab86e5a348524b0493b1fb`.
Integration branch: `agent/integrate-prs101-120`.
Coordination: GitHub Discussion #104.

## Inventory and order

Seven PRs in the requested range were open at inventory time:

| PR | Scope | Reviewed initial head | Integration order |
| --- | --- | --- | --- |
| 117 | Python namespace, object, and exception semantics | `977f50e8d8ddb27396d42a6adbfad6745233fb1a` | Runtime foundation |
| 119 | Python performance corpus and classification | `ad1d47befd649dc0b333869aae96fec3992b6440` | Depends on 117 |
| 120 | Native list/tuple slice fast paths | `ee53d47686184da437bb3affe1d7c7d2c1cad5d7` | Depends on 119 |
| 118 | Canonical macOS temporary fixture paths | `00f25cd246afed50981dbf3b127e9008a21e7aef` | Test infrastructure |
| 106 | Gamma1 modular forms and cyclotomic operators | `5733bd63ee17da17a0ea1a394a6cc220cfa47f5a` | Mathematics |
| 114 | Exact no-Singular algebraic geometry | `5b6ffb5075fabd1f040cbf2553d34837ff8e3da5` | Mathematics |
| 101 | Resident fmpz backend and cubic class groups | `96df6701a9879dd32d23df5239ad09f22d07895c` | Broad native compiler integration |

The remaining numbers include already merged/closed PRs and issues or
discussions. No open PR had review threads at inventory time. Recheck tips and
comments before final publication; branch authors may still be working.

## Confirmed integration findings

- #117 overlaps main's recent namespace performance fixes. Keep set-based
  `dir()` deduplication, direct construction of namespace dictionaries, cached
  class mapping proxies, and callable-instance allocation metadata while
  integrating deleted-binding filtering and live instance dictionaries.
- Git automatically duplicated the tier annotation in
  `test/python-conformance-runner.cjs`; remove the duplicate.
- #117 returned the original `abs` after clearing an exception target named
  `abs`, even when `builtins.abs` had been monkey-patched. CPython returns the
  patched result. A focused regression now covers this interaction.
- #117 accepted nested exception-handler tuples. CPython requires a flat tuple
  of exception classes and validates all entries even after finding a match.
  The focused regression includes an invalid nested entry after a valid match.
- #106's routine CI run `33914376124` failed because its q-expansion source
  freeze did not match `modular.py` and `qexp.py`. Regenerate from the integrated
  source after validating it; do not disable the source-freeze check.

## Validation so far

- Initial merged compiler: 63/63 focused CST lowering tests passed.
- Initial merged strict library: 367 modules, zero errors or warnings.
- Initial runtime hot-path tests passed apart from the newly added regression
  exposing the two defects above.
- After fixing those defects, all 13 runtime hot-path tests pass. Compiler
  convergence, cache-dependent tests, and final generated manifests will be
  checked again after integrating the dependent slice optimization.
- Initial build was deliberately stopped after defect reproduction. Cache
  tests attempted during module-cache construction saw missing artifacts and
  must be rerun after the final build; they are not passing receipts.

## Review follow-ups

- Audit #120's full-slice pattern against user-defined classes named `slice`;
  source identifiers must not be confused with compiler-created slice syntax.
- Review #114's recursive Laplace determinant for Jacobian minors: order eight
  is bounded but still factorial work. Prefer a division-free subset recurrence
  if the public matrix engine cannot handle this coefficient domain directly.
- Check #101's implicit FLINT backend fingerprint includes transitive headers,
  not only `fmpz.h` and the static library.
- Measure combined bootstrap source and emitted runtime growth. Preserve all
  startup and compressed-size guardrails; explain any narrow reviewed source
  budget change with actual measurements.
  The #117/main combination currently owns 884,112 core source bytes; its
  proposed narrow ceiling is 890,000 bytes (main previously allowed 853,000).
  No startup timing or compressed-artifact ceiling has been raised here.
- Invalidate source-bound production qualification receipts when runtime or
  qualification tooling changes. Do not carry release evidence from a
  different source into this integration.

Final combined build, mathematical regressions, architecture checks, portable
tests, browser/Wasm checks, and main CI remain pending.
