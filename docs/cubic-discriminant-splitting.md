# Cubic splitting from the discriminant character

This change is not yet a production qualification or a PARI win.
It extends the reusable polynomial splitting kernel rather than
adding field-specific cases to the class-group algorithm.

## Exact rule

Let $f=X^3+bX^2+cX+d\in\mathbf F_p[X]$, where $p$ is an odd prime, and put

$$
\Delta=b^2c^2-4c^3-4b^3d-27d^2+18bcd.
$$

If $\Delta^{(p-1)/2}=-1$ in $\mathbf F_p$, then $f$ is squarefree and
has factor degrees $(1,2)$. In particular it has exactly one rational root,
of multiplicity one. This statement requires no GRH assumption.

To prove it, take the three distinct roots in a splitting field and their
Vandermonde product $V$. The discriminant satisfies $V^2=\Delta$. Frobenius
permutes the roots by a permutation $\sigma$, so

$$
V^p=\operatorname{sgn}(\sigma)V,
\qquad
\Delta^{(p-1)/2}=V^{p-1}=\operatorname{sgn}(\sigma).
$$

The nonzero character ensures distinct roots. A permutation of three letters
with sign $-1$ is a transposition. Its cycles, and therefore the irreducible
factor degrees, are one and two. No assertion is made from a square or zero
discriminant: those cases use the existing exact Frobenius/gcd algorithm.
Characteristic two likewise uses the existing algorithm. Characteristic
three is covered by the argument when the discriminant is nonzero.

The number-field caller's index-prime guard remains essential. Polynomial
factor degrees describe maximal-order prime splitting only under the existing
certified preconditions; this shortcut does not replace that guard.

## Arithmetic and failure bounds

The existing entry checks require $2\le p\le65535$ and canonical coefficients
$0\le b,c,d<p$. Primality is a caller obligation. The discriminant is evaluated
as a sum of nonnegative reduced products, followed by modular subtraction.
All new intermediate expressions are below $32p^2<2^{37}$, and therefore fit
in the existing unsigned 64-bit storage. This bound also keeps the generated
JavaScript arithmetic exact. In particular, the previous docstring bound of
$3p^2$ is replaced by this larger bound; it does not bound the new expression.
The impossible-count invalid-input result remains unchanged.

## What PARI 2.17.4 does at this boundary

In the official 2.17.4 source, `buch2.c:get_fs` calls `Flx_degfact` away from
index primes, and uses `idealprimedec` at index primes. In `FpX_factor.c`,
`Flx_degfact` calls `Flx_factor_i` with flag one. For odd-prime cubics this
reaches `Flx_simplefact_Cantor`: squarefree factorization followed by
`Flx_Frobenius_pre` and `Flx_ddf_Shoup`. There is no cubic discriminant-character
early return along this inspected path. This is a source observation, not a
claim about every PARI polynomial API or about mathematical novelty.

Source: [official PARI 2.17.4 archive](https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-2.17.4.tar.gz).
Archive SHA-256: `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
`FpX_factor.c` SHA-256: `41af00858395172cc1663d8b48e774dfee599f08f4e28088be2e7e957b595b49`.

## Experimental evidence and limits

The standalone source passed 58,397 exact root-enumeration and Hasse-multiplicity
comparisons per JavaScript, tagged, GMP, and automatic backend, plus the same
source executed by CPython. The cases include exhaustive cubics at primes
through 31, sampled larger primes through 65521, and repeated roots.
The integrated regression additionally instruments the CPython multiplication
helper: nonsquare cases in characteristics three and five make no polynomial
multiply calls, while zero/square discriminants and characteristic two retain
the existing powering path.

The complete-program prototype agreed in every output slot on the fixed-effort
1,012-field survey: both versions accepted 948 and declined 64, with no errors
or changed coverage. This is not the public adaptive API's full replay.
The prototype inlines a copy only to keep the live production checkout frozen.
The integrated change lives in the reusable imported module, without that
duplication.

The integrated reusable module also preserves all 64 output slots on that
same survey. Its diagnostic complete-program cache key is
`d25ed0fe23164a93c0604258a153686b8318682ff01ef32c67e8afc167640ed9`.
In the same-path Linux resource comparison with `47a7db451`, core C grows from
17,447,843 to 17,556,404 bytes. The host adapter and header retain their sizes
of 200,768 and 9,513 bytes; the standalone binary remains 20,390,672 bytes.
These are size comparisons, not claims that artifact contents are unchanged.
Source allowances, arena limits, and the public ABI are not increased.

The rebuilt production pack uses its explicit function ordering and therefore
has a different cache key,
`927a5fcfaa166af43d95bbe17e4014f708ece1020f9b6bfd89bdd977110857be`,
in pack `566dbe2b85035421aab69b93f41045648472d75c578a981a768a34d50fd0a936`.
The production artifact separately preserves every output slot across the
1,012-field diagnostic survey. Both builds retain 106 functions, 245 call
edges, and ABI 23. The eight-stage build, strict Python, architecture, and
documentation checks pass. All twelve focused cubic regressions pass,
including authenticated public receipts, independent exact replay, pinned
nontrivial LMFDB cases, large regulators, and invalid-resource boundaries.
The inherited parallel-task registry ambiguity remains an unpassed gate.

Local, uncontrolled paired medians improved approximately 2--3% on five
development fields. They are not controlled `opt` timings, a comparison with
PARI, or evidence for previously unseen fields. Public independent replay,
resource review, and controlled timings remain necessary before promotion.
