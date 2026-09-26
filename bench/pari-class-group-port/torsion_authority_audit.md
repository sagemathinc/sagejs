# Exact torsion authority for the real-cubic sentinel

`torsion_authority.py` closes the torsion leaf expected by PARI 2.17.4
`buchall_end` for the authentic prepared sentinel
`x^3 - 20018*x + 20034`. It does not read a class-number, unit, regulator, or
roots-of-unity fixture.

Source correspondence: pinned `buch2.c:3782-3783` computes `zu =
nfrootsof1(nf)` and converts its generator to field representation;
`buch2.c:4196-4197` puts `zu` in the fourth slot of `res` before calling
`buchall_end`.

The input is only the ascending defining-polynomial coefficients already in
the neutral prepared number-field state. The authority then:

1. proves the monic cubic irreducible by exact rational-root exhaustion;
2. computes its exact discriminant `32075641032116` and hence its three real
   embeddings;
3. multiplies `(-1, 0, 0)` in the exact quotient algebra and verifies that it
   has exact order two;
4. records norm `-1`, as required in odd degree; and
5. proves maximality: an injective real embedding maps every root of unity to
   a real root of unity, so the already verified `1` and `-1` exhaust the
   torsion subgroup.

Detached replay recomputes every mathematical claim and pins the result to a
SHA-256 identity of the neutral prepared polynomial. Rehashing a mutated
answer is insufficient. The checker covers discriminant, signature,
irreducibility transcript, generator, order, norm, maximality, different-field,
reducible-field, non-real-field, and stale-publication mutations.

With `--pari-gp PATH`, the checker additionally requires a private PARI 2.17.4
`gp-dyn` and compares against `nfrootsof1(nf) = [2, -1]`. This is an external
correspondence oracle only; neither value enters the Python derivation.

This leaf remains dynamic ordinary Python by design. Its bounded exact work is
performed once per field during finalization, so native compilation would add
more crossing and artifact complexity than useful computation. No handwritten
native code or architecture exception is introduced.
