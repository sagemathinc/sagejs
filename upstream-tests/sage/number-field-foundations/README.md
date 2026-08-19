# Number-field foundations oracle regeneration

The committed corpus is an offline test input. Sage/PARI, Magma, Hecke, and
Oscar are never loaded by the ordinary Sage.js test suite.

Regenerate or verify the primary Sage/PARI corpus with one persistent process:

```sh
SAGE=/path/to/sage node upstream-tests/sage/number-field-foundations/check-regeneration.cjs
```

To intentionally refresh it, run `generate.py` to the committed path and
review both the semantic diff and `contentSha256`:

```sh
/path/to/sage upstream-tests/sage/number-field-foundations/generate.py \
  test/fixtures/number-field-foundations/corpus.json
node --test test/number-field-foundations-oracle.cjs
```

Generate or verify the independent exact Magma snapshot with one persistent
Magma process:

```sh
MAGMA=/path/to/magma node \
  upstream-tests/sage/number-field-foundations/regenerate-magma.cjs --update
MAGMA=/path/to/magma node \
  upstream-tests/sage/number-field-foundations/regenerate-magma.cjs
```

The generator freezes the plan's completion convention:

```text
Gamma_R(s) = pi^(-s/2) Gamma(s/2)
Gamma_C(s) = 2 (2*pi)^(-s) Gamma(s)
Lambda_K(s) = |D_K|^(s/2) Gamma_R(s)^r1 Gamma_C(s)^r2 zeta_K(s)
xi_K(s) = s (s-1) Lambda_K(s).
```

Magma 2.18-5 is available on the original regeneration host. Julia and hence
Hecke/Oscar were not provisioned there; that absence is recorded instead of
making either package a dependency.
