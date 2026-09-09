# Exact conditional-center cubic search

This is a **diagnostic**, not a production optimization, a new class-group
certificate, or a PARI timing win. It addresses the remaining adjacent-search
cost on $f=x^3-x^2-7x+122$, of discriminant $-384587$. The production
mathematical source and its resource limits are unchanged.

## What PARI actually does

In PARI 2.17.4 `src/basemath/buch2.c`, `Fincke_Pohst_ideal` reduces the ideal
lattice, computes a triangular decomposition of its $T_2$ form, and chooses

$$
B=\max\left(2T_2(b_2),\operatorname{FPBound}
\left(\frac{4\cdot500}{\operatorname{vol}(B_3)},r\right)\right).
$$

Here $\operatorname{vol}(B_3)=4\pi/3$, so the volume parameter is $1500/\pi$.
`Fincke_Pohst_bound` forms the radius from successive products of the
Gram–Schmidt diagonal entries: it can select a two-dimensional root if that
radius lies below the third diagonal, otherwise it takes the cubic root.
This is a search-volume heuristic, not a proof that enough relations exist.

Enumeration starts at conditional nearest-integer centers, prunes whole
infeasible branches, rejects nonprimitive/scalar elements, and stops early
when the per-ideal relation quota or total relation target is reached. The
500 factorization-attempt limit and the 1,000,000 internal-search limit count
different events. Neither is a Cartesian bounding-box proposal count.

The saved trace `pari-first-staged-retry.trace` visits ideals of norms
$25,23,17,17$, collects $4,4,4,2$ relations in addition to four rational
relations, and reaches the first regulator check after 43 primitive nonscalar
small-norm candidates. The reported squared radii are approximately
$37980,35930,29370,29370$.

Reference: [official PARI 2.17.4 source archive](https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-2.17.4.tar.gz).
The extracted `buch2.c` SHA-256 is
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
Relevant definitions are `ballvol`, `Fincke_Pohst_bound`,
`Fincke_Pohst_ideal`, `step`, and `small_norm`.

## A separate exact enumeration oracle

`bench/class-unit-groups/diagnose-cubic-exact-fp.py` implements three routes:

1. A rational triangular-decomposition traversal using `Fraction`.
2. An integer-only traversal using completed squares.
3. An exhaustive Cartesian oracle using inverse-Gram coordinate bounds.

All enumerate the same primitive lattice points, modulo sign. The first two
also agree in order and visited-node counts. They search the **captured exact
integer Gram surrogate**; no claim is made that this surrogate is identical
to PARI's real $T_2$ form or that either uses the same reduced basis.

For an integer positive-definite symmetric matrix

$$
G=\begin{pmatrix}a&b&c\\b&d&e\\c&e&f\end{pmatrix},\qquad
\delta=ad-b^2,\quad D=\det G,\quad H=ae-bc,
$$

the triangular identity is

$$
Q(x,y,z)
=a\left(x+\frac{by+cz}{a}\right)^2
+\frac{\delta}{a}\left(y+\frac{Hz}{\delta}\right)^2
+\frac{D}{\delta}z^2.
$$

Sylvester's criterion gives $a,\delta,D>0$. For a squared radius $B$, the
exact conditional ranges follow without floating-point arithmetic:

$$
z^2\le\left\lfloor\frac{B\delta}{D}\right\rfloor,
$$

$$
(\delta y+Hz)^2\le a(B\delta-Dz^2),
$$

$$
(ax+by+cz)^2
\le a(B-dy^2-2eyz-fz^2)+(by+cz)^2.
$$

For integers $q>0$, $S\ge0$, and arbitrary integer $p$, set
$k=\lfloor\sqrt S\rfloor$. The integer solutions to $(qt+p)^2\le S$ are
exactly

$$
\left\lceil\frac{-k-p}{q}\right\rceil
\le t\le
\left\lfloor\frac{k-p}{q}\right\rfloor.
$$

Each level therefore visits exactly its feasible conditional interval. The
last nonzero coordinate is required positive, selecting precisely one of
$v,-v$; a gcd check selects primitive points. For a shell, the additional
test $Q(v)>B_{\mathrm{lower}}$ makes the lower boundary open and the upper
boundary closed. No lattice point is lost through rounding. This proves
enumeration of that region, **not completeness of a class-group relation
lattice**.

The integer formulation needs prepared $a,\delta,D,H$, exact integer square
roots/division, and coordinate cursors. It does not need rational objects or
a full six-term quadratic evaluation for every point in the outer box.
The diagnostic Python generators are not yet a native resumable state machine.

## Measured search evidence, not measured runtime

The diagnostic uses the existing twelve prepared ideal bases, not new PARI
bases. It compares the old radius, four times that radius, and a volume
heuristic with rational parameter $T=478$. This last value approximates
$1500/\pi$ but is deliberately **not called an exact reproduction of PARI's
floating-point radius policy**. Integer roots are rounded upward.

Across all twelve initial regions, the exact conditional traversal visits
126 partial/complete nodes and 87 complete points before primitive filtering;
70 are primitive. The captured original coordinate boxes contain 1,568
triples. These are geometric counts for exhaustive initial regions, not the
production profile's counters or a prediction of the speedup.

The separate GP forensic driver takes an explicit ideal order. It uses the
trace's order for the first four ideals, transforms coordinates through the
captured unimodular matrices, normalizes rational content/sign, and checks
each principal-ideal factorization exactly. It admits up to four distinct
smooth generators per ideal and stops at 18 rows. This is **not PARI's or
Sage.js's modular-rank admission policy**. It checks integer kernels and
their exact unit products but performs no final analytic certification.

| Radius policy | Ideals searched to reach 18 rows | Primitive nonscalar proposals | Relation rank | Lattice index | Nontrivial unit |
| --- | ---: | ---: | ---: | ---: | --- |
| Initial | 7 | 24 | 12 | 8 | No |
| Fourfold | 4 | 42 | 12 | 8 | Yes |
| Volume $T=478$ | 4 | 39 | 12 | 8 | Yes |

For the volume policy, rank 12, index 8, and a nontrivial unit are already
present after the third ideal, at 16 rows and 36 proposals. Its unit is

$$
v=-17506a^2+106579a-419747.
$$

The fourfold policy recovers

$$
u=-33a^2-106a+315.
$$

Exact arithmetic modulo $f$ gives $uv=1$ and $N(u)=N(v)=-1$. Thus these
prefixes recover the same unit subgroup. This alone does not prove that it
is the full unit group. Nor does lattice index 8 alone prove the class
number is 8. The existing completeness/regulator certificate remains essential.

## Validation and reproduction

`test/number-field-cubic-exact-fp-oracle.cjs` checks 500 rational intervals,
82 positive-definite matrices against exhaustive enumeration, ordered
rational/integer equivalence, shell boundaries, suspended generators,
300-bit rescaling, exact-root rounding, and invalid-input/resource guards.
The captured-field run additionally exhausts and compares all 36 regions
(twelve ideals times three radius policies).

The input is `build/cubic-next-evidence/expanded-shell-capture-counted.json`,
SHA-256 `a81545caee948287097f2f8594482f41ad7a2bad09a0d994bdbd381c27aad33b`.
It is a historical diagnostic capture, **not the current production source**;
its source hash is `1bf762be5f8d799b0eae79c31d9d7f4865d42ce812431b28bee432d63df3a041`.
Its origin and deliberate output instrumentation are recorded in
[the expanded-shell experiment](cubic-resident-expanded-shell-experiment.md).

```sh
node --test test/number-field-cubic-exact-fp-oracle.cjs
python3 bench/class-unit-groups/diagnose-cubic-exact-fp.py CAPTURE.json > GEOMETRY.json
node bench/class-unit-groups/diagnose-cubic-exact-fp-relations.cjs \
  CAPTURE.json GEOMETRY.json /path/to/gp 3,11,10,9,8,7,6,5,4,2,1,0 > PREFIX.json
```

Reports bind input and driver hashes; the prefix report retains the full GP
program. GP is an exact forensic oracle here, **not** independent Sage.js
certificate replay. No `opt` timing, unseen neighbors, production adoption,
or resource non-regression is claimed.

The recorded geometry report `exact-fp-geometry-final.json` has SHA-256
`6b04e28201c822a246061db1c3dc6df432af5724b3694b6b1a022937972980fa`;
the prefix report `exact-fp-relation-prefix-final.json` has SHA-256
`3a416424f8ce063b4b47d565cfe1a9e61d3f3087f32912fbd5f669830131dd96`.
Both are under `build/cubic-next-evidence/`. The initial prefix-driver attempt
failed because a vector-of-row-vectors was not converted to a scalar matrix;
the checked driver constructs its matrix explicitly. That failed attempt is
not counted as evidence.

## Next experiment

Implement the integer traversal as a resumable native iterator over the same
resident ideal state. First compare identical-region point sets, ordering,
and suspension across every checkpoint. Then test the volume-guided policy
as a separate scheduling choice with unchanged final certification. Keep
successful cheap prefixes available; the earlier global-radius experiment
lost acceptances and regressed control timings.

The key question is now whether conditional pruning plus better relation
prefixes pays for exact interval setup in the actual compiled program. Only
a rebuilt source-transparent candidate, corpus/replay checks, and paired
controlled timings can answer that. Copying the larger radius alone or
equating a nontrivial unit with a valid certificate would not answer it.
