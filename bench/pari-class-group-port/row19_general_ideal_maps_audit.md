# Row-19 general supported-ideal maps

The row-19 phase-5 map domain is every fractional cubic ideal represented as
an integral ideal HNF numerator and a positive rational denominator, provided
that its complete prime-ideal support is contained in the authenticated
424-prime factor base. This includes arbitrary supported HNFs; inputs are not
required to be retained packets or predeclared products.

The implementation in
[`row19_general_ideal_maps.py`](row19_general_ideal_maps.py) uses the retained
prime descriptors and PARI-derived prepared HNF valuation translation to
factor an input. It accepts the result only when residue-degree-weighted
valuations exhaust every rational norm valuation. A denominator contributes
the exact negative ramification indices of its principal rational ideal.
Anything outside the retained prime support is rejected.

For a factor exponent row `x`, the exact raw Smith proof

```text
U R V = D
```

gives `x V mod D`, whose final nine entries are the normalized coordinates in
`(Z/3Z)^8 x Z/6Z`. The nine published class-generator HNFs are independently
factored and checked to map to the nine standard generators. If their chosen
representative has factor row `r`, then `(x-r)V` is divisible by `D`. Setting

```text
a = (x-r)V / D
c = a U
```

produces the exact identity `c R = x-r`. Thus the reduce result includes a
signed product of retained principal generators witnessing the quotient; it
does not infer principality from a class number or a numerical approximation.
Combine adds signed factor rows and reuses the same reduction.

The focused gate reports:

```text
factor-base prime round trips:              424
arbitrary published-generator HNF inputs:     9
fractional principal-denominator checks:      1
out-of-support rejections:                    2
exact map operations ready:     factor/reduce/combine
```

It also rejects mutations of the prepared `tau` data and raw Smith `V`. Run:

```bash
node bench/pari-class-group-port/check_row19_general_ideal_maps.cjs
```

This is correctness evidence, not qualified timing. Ideals with support
outside the retained factor base require extending or recomputing the factor
base and remain outside this fixed prepared-field result.
