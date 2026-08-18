# Genus-3 rforest completion contract

The public algorithm name for this pipeline is `rforest`. It means a complete,
exact local-factor computation; it never means “return the Hasse–Witt
residues.” The diagnostic `rforest_hasse_witt_rows` function remains the only
API that exposes `det(I-TW) mod p`. `exhaustive` names the deterministic exact
fallback. `auto` must not select `rforest` until the complete workflow passes
the documented performance and platform gates.

For every available genus-3 residue row the pipeline:

1. enumerates every integral genus-3 Weil polynomial in the residue class;
2. reduces the rational model and, at odd primes, changes the generalized
   equation `y^2+h*y=f` to the isomorphic completed model `Y^2=h^2+4f`;
3. derives exact orders of deterministic Jacobian elements and retains only
   candidates whose `L(1)` is divisible by every witnessed order;
4. if necessary, repeats the exact-order filtering on `Y^2=d(h^2+4f)` for the
   least deterministic nonsquare `d`, using candidate orders `L(-1)`;
5. returns the factor only if one candidate remains, and otherwise invokes the
   exact exhaustive backend.

The existing Mumford group law supports odd-degree models with one point at
infinity. Degree-eight models and characteristic two therefore fall back
honestly. An unavailable rforest backend, an excluded denominator, a failed
native row, a candidate cap, a group-operation resource cap, or unresolved
ambiguity also falls back. An arithmetic inconsistency—no Weil lift, a false
certificate, or disagreement between rforest and the exact backend—is an
error, not a fallback.

## Native certificate boundary

The single internal adapter `_native_order_certificates` may later marshal a
packed Mumford divisor to the native group kernel. Candidate orders are first
partitioned, separately for each fixed `(c1,c2)`, into maximal arithmetic
progressions. Each call searches one `(base, stride=p, count)` progression for
one divisor under explicit budgets. It reports `not_found`, `resource_limit`,
or `found` with the mathematical record:

```text
{ divisor, element_order, prime_factors }
```

Before using `element_order = e` as a divisibility witness, Python checks that
the factor bases are actually prime, that the supplied multiplicities multiply
to `e`, that `e*D == 0`, and that `(e/q)*D != 0` for every distinct prime
`q | e`. Native survivor masks are diagnostics only. The ordinary path derives
the same certificate by finding any candidate annihilator, factoring it, and
stripping its prime powers.

Each result reports candidate counts, sampled-element counts, exact-order
certificates, and scalar-multiplication counts separately for the primary and
twist stages. An optional stage observer receives `residue`, `candidate`,
`primary`, `twist`, and `fallback` start/end events so benchmark code can time
the stages without embedding clocks in mathematical results.

## Integration patch

The central `frobenius.py` integration should be deliberately small:

- accept `algorithm="rforest"` only for rational genus-3 local factors;
- call `rforest_genus3_local_factor` for a one-off prime and extract its
  checked ascending `coefficients`;
- call `rforest_genus3_local_factors` for intervals so one rforest traversal
  serves the whole batch;
- cache the resulting exact coefficients under the selected algorithm;
- add `certified_genus3.py` to the strict module list in `pyrightconfig.json`;
- leave `auto` unchanged until end-to-end benchmarks through `10^4`, `10^5`,
  and `10^6`, exact cross-platform streams, cancellation/shared-state tests,
  and sanitizer coverage pass.

The curve model needs no new public method: its existing local-factor dispatch
already routes explicit algorithm strings through `frobenius.py`.
