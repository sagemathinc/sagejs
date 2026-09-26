# Row 13 connected prepared-input class-and-unit result

Frozen development-panel row 13 is now internally correspondence-complete from
two authenticated inputs: its prepared-number-field projection and immutable
prepared factor-base/initial-relation root.  The connected worker does not read
the frozen PARI trace, a previously accepted relation owner, a post-HNF answer,
a class witness, a unit owner, or a C7 result.

The field is

```text
x^4 - 20000000006*x - 20000000010
signature (2,1), unit rank 2
```

The worker executes the ten-pass live relation/HNF schedule through 1,006
relations, derives analytic acceptance and the terminal lattice, reconstructs
the raw class and unit transforms, authenticates all 1,006 principal-relation
generators, proves the cyclic order-two class witness, executes the rank-two
C5/C6 suffix, and composes the immutable neutral C7 envelope.  The result is

```text
Cl(K) = Z/2Z
class number = 2
torsion order = 2
unit rank = 2
unit materialization = not_given(LARGE)
correspondence_complete = true
public_complete = false
```

`not_given(LARGE)` is PARI 2.17.4's authentic flag-zero policy outcome.  The
envelope retains the 7-by-2 compact unit transform, 1,006-relation factored
unit transform, regulator enclosure, raw logs, and exact norm signs; it does
not invent expanded fundamental units.  `public_complete=false` is equally
intentional: PARI's conditional bounds and correspondence are assumed for this
port experiment, not independently certified as Sage.js mathematics.

## Connected evidence

The fresh capped run used 4 GiB address-space/RSS limits and 600-second
CPU/wall limits.  It completed in 509.684962384 seconds at 1,326,656 KiB peak
RSS:

```text
live relation/HNF Gate C       344.948404996 s
post-1006 analytic/Smith       116.066814900 s
exact class witnesses           36.430102227 s
rank-two unit suffix             0.255805173 s
```

The final relation state is `[1006,10110,0,0,1006,1006]`.  The immutable
5,700,777-byte envelope and its authorities are:

```text
envelope SHA256                17ccbab46e27cae538d8958f4eb0a760fbbbfde112ea26b784dcc54057505b73
accepted owner SHA256          098aed841e961aa069f7d15aa384ec415201c8a0aff247f98106f80d5b22f1c9
factor metadata SHA256         7a0ce1b382806783bb4fb416ccd15a076fdf166f03107f529ce5555ded7a1654
class owner SHA256             cd21a194f3d002245c612df8ace3d2422bec2c8c866dff954deea6544384aa07
unit owner SHA256              77e3f2bbac12940d8da9a8ca47d1cad8030d82782fb9cfeb6ecb8c211bd6c76c
mathematical authority SHA256  95e495a5ed48f508b719a9fcb8759453a688e905c220de5b4758c0febd6904b1
```

Fourteen adversarial checks reject mutations to the prepared projection,
prepared root, accepted relation owner, post-HNF owner, class owner, unit
owner, and sealed envelope.  Only after the capped worker exits does the
checker read frozen W0 (SHA-256
`50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589`)
and confirm the class invariants and authentic absence of expanded units.

Reproduce with the immutable prepared inputs named in the checker defaults:

```sh
node bench/pari-class-group-port/check_row13_prepared_complete.cjs
```

This run is correctness and resource evidence, not a qualified PARI/Sage.js
timing comparison.  The C7 replay recomposes the authenticated in-memory
owners and is strong enough for the internal correspondence contract; it is
not the independent Sage.js certification required for public completion.
