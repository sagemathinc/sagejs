# Live `h = 1` class-state binding

This boundary consumes only the live presentation, Smith matrices, inverse
matrices, Smith terminal state, and the already-published transform component.
It accepts no class number, invariant list, generator list, oracle answer, or
resident fixture path.  Exact replay establishes

`U * presentation * V = I`, `U * Ui = Ui * U = I`, and
`V * Vi = Vi * V = I`.

Consequently the presented quotient is trivial: its class number is one, it
has no non-unit invariant factors, and its class-generator and generator-order
witness arrays are genuinely empty.  The adapter publishes the exact
`{"entries": []}` generator evidence required by the existing final-state
assembler and binds it to the candidate and transform fingerprints from the
same owner generation.

This is correspondence-complete, not publicly certified.  The implication
from the live factor-base presentation to the full ideal class group still
uses the fixed PARI 2.17.4/GRH assumptions recorded by the result.  Those
assumptions are constants and labels, not computation inputs.  A public result
still needs independent maximal-order authority, a proved factor-base bound,
and a replayable global saturation argument.

The checker differentially runs the ordinary source and all three native
integer backends, binds the authentic 8-by-8 live presentation, and rejects
coordinated mutations of every arithmetic owner and every completion claim.
