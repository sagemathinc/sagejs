# Authentic cubic unit composition bridge

This lane connects the resident equal-bound output for
`x^3-20018*x+20034` to the signed real-cubic `getfu` leaf. It deliberately
does not claim that the full unit reconstruction succeeds at the resident
192-bit precision. PARI reports `fupb_PRECI` at that boundary, and this port
reports the same status.

## Source and frozen input

The source oracle is PARI 2.17.4 from archive SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
The checker verifies pristine `buch2.c` and `lll.c` as
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`
and `ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b`.

The immutable bridge fixture is the actual 73-relation resident result: seven
accepted archimedean columns, the corresponding two-row relation lattice,
the 192-bit regulator, maximal-order multiplication tables, and the initial
embedding matrix. It is not a reduced synthetic unit example.

The algebraic reconstruction dependency is the signed `getfu` adapter from
upstream commit `0eff12d72`, cherry-picked here as `1a1367404`. That adapter
preserves the characteristic-two sign information which a real-only logarithm
matrix would otherwise discard.

## Composed path

[`unit_bridge_cubic.py`](unit_bridge_cubic.py) executes the following path
with caller-owned reusable storage:

1. integer rank-two extraction from the resident relation lattice;
2. packed seven-field `A * U1`;
3. real LLL and exact composition `U = U1 * U2`;
4. packed `A * U`, log-norm cleaning, and `0`/`pi` phase extraction;
5. regulator determinant replay against the resident value;
6. `fixarch` plus the rank-two pre-`getfu` real LLL factor;
7. exact composition of that factor with accepted-column provenance;
8. invocation of the signed cubic reconstruction leaf.

For the frozen field the sign bits are `[0,0,1,1,1,1]`, the inner factor is
unimodular, and the regulator is `1507063.149984185`. CPython, generated
JavaScript, GMP, and tagged execution agree on every packed output and status.
The checker also validates both exact PARI fundamental units by constructing
their multiplication matrices, proving determinant `+/-1`, and replaying an
exact inverse product.

## Honest precision frontier

The resident 192-bit call reaches `getfu` and returns `fupb_PRECI`. This is a
real algorithmic retry, not an implementation mismatch: the larger
fundamental unit has 2115-bit integral-basis coordinates. A pristine
`bnfnewprec` replay at 2048 requested bits produces packed real logs of
precision 2176 and an embedding entry of precision 2240.

Those values exceed the current translated packed-real capacity. The existing
shared graph admits at most 1856-bit regulator scalars; division, logarithm,
short-product, and exponential helpers have related 1920--2048-bit limits.
The source-faithful retry needs p2240 inputs and at least p2304 working/log2
capacity. Truncating the values, accepting a lower-precision reconstruction,
or publishing source units as if this bridge reconstructed them would all be
incorrect, so this lane does none of those things.

The next dependency is therefore the precision-resource campaign: raise the
packed-real arithmetic graph coherently to p2240 input and p2304 working
precision, with division, exponential, solve, and rounding fixtures. Once it
lands, this checker can turn the currently asserted `PRECI` boundary into the
same exact unit/log/factor comparisons already provided by the signed leaf.

## Exclusions

This cut does not implement precision retry ownership, the wide
`extract_full_lattice` selector, mixed signatures, quartic reconstruction, or
the shared final driver. It makes no timing claim. Its narrow result is that
the real resident relation output now reaches the authentic signed `getfu`
boundary with exact provenance and sign handling, and that the sole observed
stop is quantitatively identified precision capacity.
