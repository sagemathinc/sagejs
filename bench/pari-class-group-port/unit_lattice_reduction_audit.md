# Totally-real cubic fundamental-unit lattice cut

This lane implements the smallest authentic Phase-4 suffix shared by the two
frozen totally-real cubic sentinels. It stops immediately before algebraic unit
reconstruction (`getfu`). It does not claim a complete unit group or BNF.

## Pinned source and provenance

The oracle is PARI 2.17.4, archive SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
The relevant pristine files are:

- `src/basemath/buch2.c`, SHA-256
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`;
- `src/basemath/lll.c`, SHA-256
  `ba42f21e52b09873ba5bf2817edd8f0a8b69d4e0ff779419cc5390941aa7404b`.

A disposable rebuild inserted observation-only prints in the fundamental-unit
block at pristine `buch2.c:4144-4160`. It split the two source expressions into
named temporaries without changing their order:

```c
U1 = ZM_lll(L, 0.99, LLL_IM);
P = RgM_ZM_mul(real_i(A), U1);
U2 = lll(P);
U = ZM_mul(U1, U2);
AU = RgM_ZM_mul(A, U);
A = cleanarchunit(AU, N, NULL, PREC);
```

The observation emitted `L`, exact PARI real triples for `P`, `U1`, `U2`, `U`,
binary64 projections of `AU` and cleaned `A`, and both regulator values. The
captured trace SHA-256 is
`a4e038550ee47b9160e58168e634ef74e9306b1a2cd8aa80ca98b374122db5d2`.
The immutable transcription is
[`unit-lattice-reduction-fixtures.json`](unit-lattice-reduction-fixtures.json).
The checker independently verifies the pristine archive/file hashes before
using those observations.

## Exact source path retained

Both accepted relation lattices have two rows and seven columns. Consequently
`extract_full_lattice` takes its literal `lg(x) < 200` `NULL` shortcut; no
permutation is applied. The native entry rejects 199 or more columns rather
than silently pretending that the unexercised selector path ran.

The integer stage uses the existing source-translated PARI fast LLL pass and
mandatory DPE certification with a 7-by-7 unimodular transformation. Both
sentinels return five leading kernel columns and the final two image columns;
the copied 7-by-2 `U1` agrees entry-for-entry with PARI.

The real stage consumes exact `(mantissa, bit precision, exponent)` triples,
not decimal or binary64 substitutes. It runs the translated
`RgM_rescale_to_int`, then the same fast and DPE passes at `LLLDFT = 0.75`.
This distinction matters: the 3-by-2 matrix does not enter PARI's specialized
2-by-2 binary-form shortcut. The resulting `U2`, and then `U1 * U2`, agree
entry-for-entry with PARI. Exact replay checks unimodularity and the composite
transformation.

For a totally-real cubic, `cleanarchunit` checks that each three-entry real
column sums below its exponent threshold and reduces imaginary components
modulo `2*pi`. The bounded implementation retains that decision and computes
`abs(det(A[1:2, :]))` exactly as `get_regulator`. Binary64 is only the published
archimedean projection for this cut; acceptance uses PARI's absolute
regulator-difference threshold of `1/2`. The native repeated-reduction path is
within `1e-9` of the 192-bit PARI projection on every cell. The real log columns
and regulator are substantially farther from every decision boundary.

## Frozen results

| Polynomial | h | selector | integer zeros | `det(U2)` | regulator |
| --- | ---: | --- | ---: | ---: | ---: |
| `x^3-20018*x+20034` | 1 | `NULL` | 5 | -1 | 1507063.149984185 |
| `x^3-20010*x+20018` | 3 | `NULL` | 5 | 1 | 162681.24696896108 |

The second case is useful rather than redundant: its floating transform has a
large off-diagonal entry, `U2 = [[1,119],[0,1]]`, while the first swaps and
negates columns.

## Validation and failure semantics

`check_unit_lattice_reduction.cjs` runs:

1. pinned-source SHA validation;
2. CPython execution of the ordinary source;
3. generated JavaScript, GMP, and tagged native backends;
4. entrywise comparison of `U1`, `U2`, and `U`;
5. clean-arch and regulator comparisons;
6. exact determinant/composition replay;
7. short-storage, unsupported-selector, log-norm, and regulator-discrepancy
   negative controls.

All storage is caller-owned and reusable. Shape/capacity failures occur before
writes. LLL fallback status is explicit rather than being mistaken for a
mathematical answer. A failed clean log-norm check publishes no output; a later
regulator rejection leaves the cleaned private output available only to the
caller that supplied it.

## Handoff boundary and exclusions

The consumer receives prepared cleaned archimedean columns, `U`, and regulator
evidence. That is the intended input to a subsequent `getfu` lane. These real
cubics still have source-authentic `0`/`pi` sign phases in their imaginary
components. A sign-free real-only `getfu` leaf must not consume this boundary
until a doubling/sign-phase or characteristic-two adapter certifies that
conversion; discarding the phases would be wrong. This lane
does not exponentiate relation generators, solve for algebraic coordinates,
test exact unit inverses or norms, handle complex places, perform precision
retry ownership changes, or expand compact units. The wide
`extract_full_lattice` selector is already separately source-matched in
`unit_lattice_selection.py`; it was not selected by either frozen cubic and is
not falsely counted as exercised here.

No performance claim is made. This cut establishes correctness, compiler
closure, and a reusable-storage ABI before timing or integration into the
resident class-group driver.
