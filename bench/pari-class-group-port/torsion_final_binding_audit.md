# Torsion binding at the live final-result boundary

`torsion_final_binding.py` is a narrow composition layer between the neutral
prepared cubic and the live
`sagejs.pari-class-group/internal-correspondence-completion-v1` state. It does
not accept a roots-of-unity answer, PARI oracle, fixture path, or expected
result digest.

The composer recomputes the exact torsion authority from the neutral
polynomial, verifies that the live final state names the same polynomial and
field, checks the live authority digest/order/generator, and binds the result
to the canonical digest of the complete live state. Its output is:

- order `2` and generator `(-1, 0, 0)`;
- exact norm `-1`;
- maximality by the injective-real-embedding proof; and
- an explicit empty list for both oracle and fixture inputs.

Replay takes the neutral polynomial and current live final state again and
recomposes the entire binding. Coordinated rehashing therefore cannot promote
a false order or generator, and a later mutation of the live final state makes
the old binding stale. The component leaves public completion and unit
saturation unchanged; it closes only the torsion leaf.

This once-per-field exact composition remains ordinary Python. There is no
performance justification for another native boundary and no handwritten
native code.
