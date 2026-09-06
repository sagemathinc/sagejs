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
- `subclass_native1.py`: detecting native layouts by absence of `__bases__`
  missed representation-owning builtins that publish class metadata. Register
  native storage roots by identity, walk inherited roots, and deduplicate shared
  ancestry. Validate dynamic `type()` construction too. Pure mixins and shared
  native ancestry remain legal. This is not a claim to implement every CPython
  solid-base or `__slots__` rule. Historical causal attribution is not established
  merely because the old validator's source predates the current work.

Focused regressions cover Python/Sage modes and enter portable routine coverage.
All four new cases pass against the rebuilt runtime, and strict Python passes
for 382 modules. Complete build and live corpus qualification remain pending:
the build's NLopt verifier requires reviewed source to match a committed
candidate, so this repair checkpoint must precede that verification. Its
manifest is rebound to the additive runtime intrinsics and retains its existing
pending-source-current-requalification status; no release is certified.
Core source grows from 907,535 to 909,541 bytes (+2,006); its ceiling
rises from 907,750 to 909,900. No startup/time limit, baseline, or dependency
policy is relaxed.
