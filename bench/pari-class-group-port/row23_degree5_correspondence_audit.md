# Row 23 degree-five class correspondence audit

This owner closes the two explicit gaps left by the cyclic class witness
`beafd37a…`: expanded ideal arithmetic and the degree-five `idealred` call made
by `genback` for exponent one.  Its inputs are the immutable class owner, the
immutable factor-base owner `b4fa7209…`, and prepared authority `0bb8aa66…`.
The frozen W0 class-group answer is not an input.  It is opened only after the
new owner has been written read-only, for a differential comparison.

## Expanded principal identity

The ordinary Python source multiplies and inverts elements in the authenticated
integral-basis multiplication tensor.  Expanding all 22 signed factors gives

```text
alpha = [55527, 2886, -7934, -1304, 695].
```

It separately multiplies the five-column ideal lattice six times.  Each of the
25 product generators is reduced by exact integer column operations.  The sixth
power and the principal multiplication lattice of `alpha` have the identical
row-major HNF

```text
[117649,79592,16635,6589,13355,
 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0, 0,0,0,0,1].
```

Thus this is an expanded ideal identity `J^6=(alpha)`, not merely equality of
factor-base valuations or norms.

## Source-derived `idealred`

PARI 2.17.4 `idealred0` forms `(I intersection Z) I^-1`, calls
`idealpseudomin`, and immediately returns `I` when the short element is scalar.
For the selected prime above 7, the quotient-generator descriptor constructs
the inverse-scaled ideal.  An independent ideal product first verifies
`I * (7 I^-1) = 7 O_K`.  Exact delta-0.99 LLL on the authenticated rounded T2
matrix times that ideal then yields first transform coefficient
`[1,0,0,0,0]` and short element `[7,0,0,0,0]`.  The translated scalar branch
therefore returns the original selected HNF.  The post-publication W0
comparison agrees exactly.

The checker rejects mutations to the expanded generator, sixth-power lattice,
LLL coefficient, pseudominimum, ancestry, compact relation source, and prime
descriptor source.
