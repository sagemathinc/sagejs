# Repairs found by the live MicroPython gate

The output-helper extraction passed 24 synthetic tests, but its fresh live
gate found 503 exact matches and three reviewed differences, rather than the
required 505 plus three. The unchanged original runner reproduced both failures
against the same artifacts; no baseline was regenerated.

- `fun_code.py`: runtime-compiled forwarding treated an empty positional
  signature as an opaque callable and passed the keyword carrier as a real
  argument. Existing Python function identity now selects the modern callee
  contract even when the caller was compiled in bootstrap mode. Truly legacy
  and opaque host-callable behavior is retained.
- `subclass_native1.py`: its two expected errors have identical text. Labelled
  probes showed that the surviving failure was an incorrectly accepted function
  type subclass, not the adjacent `type`/`tuple` conflict. Register native storage
  roots and subclassability by identity rather than inferring them from missing
  class metadata. Walk inherited roots and deduplicate shared ancestry; pure
  mixins and shared native ancestry remain legal. No historical causal claim
  follows merely from the age of the old validator's source.
- Metaclasses may normalize proposed bases before actual allocation. Retain
  early type/prototype checks, but defer storage/subclassability checks until
  ordinary class allocation or `type.__new__`. Cover dynamic, inherited and
  explicit metaclass routes. Reconstruction must not mark a shared native method
  adapter as a Python explicit-self descriptor: doing so corrupted later list
  containment. Native adapter identity now preserves its receiver convention.
  These changes do not implement every solid-base, `__slots__`, duplicate-base
  or inconsistent-MRO normalization rule.

Focused regressions cover Python/Sage modes and enter portable routine coverage.
All 117 expanded focused cases pass. Final architecture checks pass, including
the two portable intrinsic classifications and refreshed Wasm dashboard.
The final full build passes in 9m 34s; `pnpm test` passes in 11m 12s, including
strict Python, portable units, public API smoke tests, and the unchanged startup
budget. All 21 enabled compiler tests pass (28 existing historical/disabled
fixtures remain skipped). The final unchanged MicroPython replay passes with
505 exact matches and three reviewed differences in 38.12s on Linux x64,
Node 26.8.1 and pinned CPython 3.14.4. No baseline was regenerated.

Broader qualification remains incomplete: a fresh required assertion run is
17/28 passing, and package workflows are 8/11 passing plus all seven selected
Tomli upstream tests. The existing pyparsing execution failure, IDNA stderr,
and mpmath cold timeout remain visible; no failure or performance cliff is
waived by this repair. Four-platform/browser qualification remains separate.

The initial checkpoint was necessary because the build's NLopt verifier
requires reviewed source to match a committed candidate. Its
manifest is rebound to the additive runtime intrinsics and retains its existing
pending-source-current-requalification status; no release is certified.
Core source grows from 907,535 to 909,959 bytes (+2,424); its ceiling
rises from 907,750 to 910,200. No startup/time limit, baseline, or dependency
policy is relaxed.
