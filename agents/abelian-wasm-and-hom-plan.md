# Large-level portable decomposition and certified Hom/End over QQ

Base: merged PR 271, `origin/main` at `cc053a05c`. Two sequential PRs.

## 1. Portable decomposition

- [x] Attribute the level-726 cold construction to newspaces,
  factor splitting/validation, degeneracy maps, saturated images, product
  assembly, rank and Smith invariants. Retain the preceding 120 s failure.
- [x] Remove measured repeated computation and resource-boundary traffic,
  keeping exact integral matrices, construction recipes and source-transparent
  portable execution. Avoid merely increasing the timeout.
- [x] Obtain repeated completed large-level Node/Wasm runs and real-Chromium
  qualification, plus contemporaneous native/Sage comparison. Preserve all
  invariants, record source/artifact hashes, and state remaining gaps.
- [x] Run strict, architecture and merge checks; qualified performance change
  prepared for commit/push as the first ready PR.

The preceding qualified portable artifact can be used for diagnosis: its host
sources are unchanged by the main update. Final qualification must rebuild and
use the new branch's complete artifact, not relabel the old artifact.

## 2. Certified Hom groups and endomorphism rings

Reference: Sage's `sage/modular/abvar/homspace.py`, especially
`calculate_generators`, `_calculate_product_gens`, `_calculate_simple_gens`;
[reference manual](https://doc.sagemath.org/html/en/reference/modabvar/sage/modular/abvar/homspace.html).

- [ ] Specify `Hom(A,B)`, `End(A)`, parent methods, integral generators,
  membership/coordinates, rank, and ring composition for the existing
  weight-2 Gamma0/QQ domain; include zero varieties and ordered products.
- [ ] Build certified complementary isogenies and transport generators
  between labelled simple newform constituents and their repeated copies.
  Saturate the resulting rational morphism span inside integral homology
  matrices. Do not infer geometricity from arbitrary matrix commutants.
- [ ] Certify completeness using the simple-factor decomposition and exact
  newform coefficient-field action. Record and check multiplicities and the
  expected rational Hom dimension. Unknown completeness must stay explicitly
  a generated subgroup, not masquerade as full Hom.
- [ ] Distinguish the Hecke-order image from the full endomorphism order;
  test additive generators, identity and multiplicative closure rather than
  assuming that an arbitrary additive lattice is a ring.
- [ ] Authenticate serialization by replaying geometric generators and
  completeness evidence; reject altered matrices, ranks and factor labels.
- [ ] Compare with Sage: distinct factors at 37, repeated old copies at
  22/33/44, coefficient-field factors such as 23, products, inclusions and
  newform quotients. Compare exact lattices after explicit basis transport,
  not raw entries in unrelated bases.
- [ ] Add larger-level performance receipts, shared native/browser tests,
  guided documentation and roadmap reconciliation; open a separate ready PR.

Do not claim geometric endomorphisms over an algebraic closure: this task is
over QQ. Full Hom rank and a collection of certified maps are separate claims.
