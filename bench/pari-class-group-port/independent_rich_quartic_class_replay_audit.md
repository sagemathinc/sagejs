# Detached rich-quartic class replay audit

This adapter independently consumes only the data-only neutral result envelopes
from genuine fresh prepared executions of panel rows 13 and 14. It does not
import either publisher, terminal class owner, or a PARI answer.

It exactly replays:

- the Smith invariants and class number from the retained presentation;
- every generator-order identity `R*c = n*f` over the full raw relation matrix;
- membership of each order quotient in the retained factor-map span;
- the published generator ideal when the quotient is one positive factor-base
  ideal; and
- all 806 row-14 principal ideal equations from the retained integral-basis
  multiplication table, factor-base ideals, and principal generators.

Row 13 deliberately reports that its neutral payload omitted the
`field-multiplication-table`, so its 1,006 raw principal ideal equations cannot
be detached from the terminal publisher. Row 14's second generator has negative
factor exponents `-2,-1,-1`; the payload does not retain the inverse ideals and
principal scaling which convert that signed factor product into the published
integral HNF. The report therefore names the missing
`signed-class-generator-reduction-witness` rather than claiming that ideal was
independently reconstructed. Both generator-order equations are nevertheless
checked exactly.

The checker rejects independent mutations of the order coefficients, a used raw
relation entry, the class presentation, and a published generator ideal for
each row. This is correctness evidence only; it makes no timing claim.
