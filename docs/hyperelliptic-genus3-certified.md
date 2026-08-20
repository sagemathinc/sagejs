# Genus-3 rforest completion contract

The public algorithm name for this pipeline is `rforest`. It means a complete,
exact local-factor computation; it never means “return the Hasse–Witt
residues.” The diagnostic `rforest_hasse_witt_rows` function remains the only
API that exposes `det(I-TW) mod p`. `exhaustive` names the deterministic exact
fallback. `auto` selects `rforest` only in the measured complete-workflow
envelope documented below; explicit `rforest` remains available outside that
automatic envelope.

## Examples

For a single prime, request the certified backend explicitly. The equation is
`y^2 + x^2*y = x^7 - x + 1`:

```sage
sage: R.<x> = QQ[]
sage: C = HyperellipticCurve(x^7 - x + 1, x^2)
sage: C.local_lpolynomial(7, algorithm="rforest")
343*T^6 - 49*T^5 - 35*T^4 + 11*T^3 - 5*T^2 - T + 1
sage: C.local_lpolynomial(11, algorithm="rforest")
1331*T^6 + 121*T^5 + 88*T^4 - 22*T^3 + 8*T^2 + T + 1
```

The displayed polynomial is `det(1-T*Frob)`. Equivalently, its ascending
coefficient tuple at 11 is `(1, 1, 8, -22, 88, 121, 1331)`.

Use `local_lpolynomials` for a modest closed interval. It performs one
rforest traversal instead of starting the remainder forest separately at
each prime:

```sage
sage: C.local_lpolynomials(5, 13, algorithm="rforest", chunk_size=3)
[(7, 343*T^6 - 49*T^5 - 35*T^4 + 11*T^3 - 5*T^2 - T + 1),
 (11, 1331*T^6 + 121*T^5 + 88*T^4 - 22*T^3 + 8*T^2 + T + 1),
 (13, 2197*T^6 + 169*T^5 + 208*T^4 + 16*T^3 + 16*T^2 + T + 1)]
```

Here 5 is absent because the supplied integral model reduces singularly at 5.
For a large interval, consume bounded chunks rather than materializing the
entire result; this small example demonstrates the pattern:

```sage
sage: total = 0
sage: for chunk in C.local_lpolynomial_chunks(
....:         5, 100, algorithm="rforest", chunk_size=8
....:     ):
....:     total += len(chunk)
sage: total
21
```

The lower-level completion result exposes proof diagnostics. This API is
useful for testing and profiling; ordinary applications should use the curve
methods above:

```sage
sage: from sagejs.hyperelliptic_curves.certified_genus3 import rforest_genus3_local_factor
sage: result = rforest_genus3_local_factor(C, 11)
sage: result["status"]
'unique'
sage: result["coefficients"]
(1, 1, 8, -22, 88, 121, 1331)
sage: result["certificate"]["initial_candidate_count"]
24
sage: result["certificate"]["jacobian"]["certificate_count"]
1
```

Even-degree genus-3 models currently use the exact fallback because the fast
Jacobian law assumes one point at infinity. The status makes that explicit;
the returned polynomial is still exact:

```sage
sage: D = HyperellipticCurve(x^8 + x + 1)
sage: result = rforest_genus3_local_factor(D, 11)
sage: result["status"]
'fallback'
sage: result["diagnostics"]["fallback_reason"]
'unsupported_jacobian_model'
sage: D.local_lpolynomial(11, algorithm="rforest")
1331*T^6 + 363*T^5 + 88*T^4 + 12*T^3 + 8*T^2 + 3*T + 1
```

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
infinity. Degree-eight models and characteristic 2 therefore fall back properly. An unavailable rforest backend, an excluded denominator, a failed
native row, a candidate cap, a group-operation resource cap, or unresolved
ambiguity also falls back. An arithmetic inconsistency—no Weil lift, a false
certificate, or disagreement between rforest and the exact backend—is an
error, not a fallback.

Interval results retain an explicit `omitted` row with no coefficients when
the supplied rational model is nonintegral or singular at that prime. Public
`local_lpolynomials` integration skips these rows, matching the existing
good-reduction-only contract, while still completing later rows from the one
rforest traversal.

## Native certificate boundary

The single internal adapter `_native_order_certificates` marshals a packed
Mumford divisor to the native group kernel. Candidate orders are first
partitioned, separately for each fixed `(c1,c2)`, into maximal arithmetic
progressions. Each call searches one `(base, stride=p, count)` progression for
one divisor under explicit budgets. It reports `not_found`, `resource_limit`,
or `found` with the mathematical record:

```text
{ divisor, element_order, prime_factors }
```

Before using `element_order = e` as a divisibility witness, Python checks that
the factor bases are actually prime and that their multiplicities multiply to
`e`. The native factor-and-strip routine has already checked `e*D == 0` and
`(e/q)*D != 0` for every distinct prime `q | e`; those exact checks are part of
the trusted native-kernel result, while survivor hints remain diagnostics only.
Injected certificate providers and the dynamic fallback receive the same
checks through the independent ordinary-Python group law.

Each result reports candidate counts, sampled-element counts, exact-order
certificates, and scalar-multiplication counts separately for the primary and
twist stages. An optional stage observer receives `residue`, `candidate`,
`primary`, `twist`, and `fallback` start/end events so benchmark code can time
the stages without embedding clocks in mathematical results.

## Public integration

The central `frobenius.py` integration is deliberately small:

- accept `algorithm="rforest"` only for rational genus-3 local factors;
- call `rforest_genus3_local_factor` for a one-off prime and extract its
  checked ascending `coefficients`;
- call `rforest_genus3_local_factors` for intervals so one rforest traversal
  serves the whole batch;
- cache the resulting exact coefficients under the selected algorithm;
- add `certified_genus3.py` to the strict module list in `pyrightconfig.json`;
- select `rforest` automatically for supported odd-degree one-off primes and
  intervals ending at 100000, the measured complete-stream envelope; larger
  intervals and unsupported capabilities fail closed to `exhaustive`.

The curve model needs no new public method: its existing local-factor dispatch
already routes explicit and automatic algorithm selection through
`frobenius.py`.
