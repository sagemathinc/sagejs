# Certified bad Euler factors and conductor exponents

Status: implemented production slice; nonsplit nested cluster pictures remain
a clearly delimited follow-up.

## Objective

Compute the genuine inertia-invariant Euler numerator
`det(1-T*Frob | H^1_et(C)^I_p)` and the Artin conductor exponent at odd bad
primes. Never confuse this with point counting on a singular plane model.

## Implemented phases

1. Freeze a separate `local_reduction` / `local_euler_factor` /
   `conductor_exponent` contract whose local polynomial may have degree below
   `2g` and whose certificate records the theorem used.
2. Normalize generalized models `y^2+h*y=f` to a checked integral completed
   square away from explicitly excluded denominator primes.
3. Implement all four genus-2 almost-good cluster types from
   Maistret--Sutherland Algorithms 1--7, including the nonsplit quadratic
   path through smalljac over a quadratic number field.
4. Implement tame semistable ordinary nodal genus-2/3 reduction by exact
   finite-field factorization, normalization point counting, Frobenius branch
   signs, and dual-graph homology, including both geometrically integral and
   two-component rational normalizations. The conductor exponent is certified
   from the graph rank.
5. Implement arbitrary-depth split semistable cluster pictures in genus 2/3:
   exact rational-root distances, the principal-cluster semistability test,
   explicit component curves, theta-character Frobenius signs, and graph
   homology.
6. Preserve exact proof artifacts: model changes, modular factors,
   normalization Euler factor, graph factor, node orbits, signs, cluster type,
   elliptic factors, and refinement depths.
7. Differentially test against the MIT Genus2Euler corpus and development
   PARI/GP `genus2charpoly` / `genus2red`, with independent genus-3 graph
   fixtures.
8. Keep unsupported cases explicit and document the mathematical boundary.

## Follow-up phases

The next cluster-picture expansion should add, in order:

1. unramified nonsplit clusters using exact residual extensions;
2. all tame semistable cluster pictures in genus 2 and 3;
3. potentially semistable but non-semistable inputs;
4. wild odd primes, and only then residue characteristic 2.

Each phase must return the component curves and Frobenius graph action as a
certificate, not merely an integer conductor and polynomial.
