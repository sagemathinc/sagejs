# Row 4 exact compact rank-two unit authority

This connector closes the exact unit *suffix* for development-panel row 4,
the totally real cubic

```text
x^3 - 20000000010*x + 20000000018.
```

It consumes the immutable row-4 presentation owner
`122f1a9f8731f3c6d7202426c4f1c9b133bff815091aff55dce0166c6c53bcfa`
and pristine W0 relation trace
`acebe2f9f4bdfc0c3da76ab6d9ad1aa409a1fb0bfd4113ebec9b825c432e2cb8`.
The presentation already authenticates all 567 principal relations and the
567-by-7 relation-kernel ancestry.  W0 is needed because that presentation
retains only the raw-log digest, not the raw packed logarithms themselves.

The producer recomputes those raw logarithms from the authenticated principal
generators, reruns translated `hnfspec_i`, and checks both the raw-log digest
and the resulting seven kernel columns.  It then obtains the rank-two kernel
transform

```text
[1, 0, 0, 0, 0, 0, 0]
[-35372943053, 0, 0, 0, 0, 0, 1].
```

Composing it with the raw kernel map gives exact products of the authenticated
principal generators, with respectively 2 and 397 nonzero factors.  Direct
replay proves `R*T = 0`.  Every raw relation's principal-ideal norm is checked
against the factor-base norms, which proves the compact products have norms
`-1` and `+1`.  Exact rational root isolation proves real signs
`(-,+,+)` and `(-,+,-)`, independently confirming those norms.

The regulator determinant is `218671508114152.38`, equal to the accepted
regulator at the available packed precision.  The ordinary translated cubic
`getfu` returns `not_given(LARGE)` with maximum real exponent 41, exactly the
policy branch expected for this field.  Expanded power-basis units are thus
not claimed; the exact factored units and their correspondence are retained.

One source-specific wrinkle is explicit rather than hidden: multiplying a
192-bit phase by `35372943053` loses 13 low phase bits.  The generic bridge
stops with its phase-only status 4 and maximum phase error `2^-13`.  Integer
and real LLL have already completed.  This owner replaces only that approximate
phase decision with exact root-sign certificates, while independently checking
the real logs, product formula, regulator, ideal kernel, and norms.

## Boundary honesty

This is not yet the plan's live prepared-NF input root and it is not a
qualified timing result.  `frozenW0UsedAsInput=true`,
`preparedNfLiveRoot=false`, and `inputBoundaryComplete=false` are part of the
verified contract.  The owner establishes an exact suffix correspondence that
can feed a development C7 envelope.  A future live connector must regenerate
the raw logs from the prepared field without taking W0 as an input.

The producer never selects the pristine `fundamental_units` or terminal
`result` events.  The checker instruments event selection during a second
full replay and observes only `prepared` and `factor_base`.  It also rejects
mutations of logs, both transforms, norms, signs, `LARGE` state, provenance,
ancestry, and boundary flags.

Run the bounded checker with:

```bash
timeout 600 prlimit --as=4294967296 --rss=4294967296 --cpu=600 -- \
  node bench/pari-class-group-port/check_row4_rank2_unit_authority.cjs \
  ROW4_PRESENTATION.json panel-04-beb19c9584069e83.json
```
