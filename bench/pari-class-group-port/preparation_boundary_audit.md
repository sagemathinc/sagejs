# Closing the prepared-field boundary

Read-only source audit, 2026-09-15. This is an implementation dependency map,
not evidence of a completed `nfinit`-only entry or a new performance result.
The authoritative upstream is PARI 2.17.4, `buch2.c` SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.

## Two different prime catalogs

Do not make the future field-preparation layer construct complete prime ideals
for every prime used in analytic normalization. PARI deliberately separates:

| Consumer | Required data | Upstream producer |
| --- | --- | --- |
| GRH bound and inverse residue | Residue-degree patterns and counts | `get_fs` / `cache_prime_dec` |
| Selected factor-base arithmetic | Prime-ideal descriptors, with generators and valuation data | `FBgen` and prime decomposition |
| Small-norm search | Selected ideal HNFs and norms | `pr_hnf` / `pr_norm` |

In `get_fs`, when the rational prime does **not** divide the equation-order
index, PARI uses `Flx_degfact(ZX_to_Flx(P,p),p)` and compresses equal factor
degrees. It does not construct all prime-ideal descriptors. Only the
index-divisor branch calls `idealprimedec` there. Factor exponents returned
by polynomial factorization are not the counts of distinct prime ideals;
preserve the source's grouping of the degree vector.

`FpX_factor.c:Flx_degfact` normalizes the polynomial and calls
`Flx_factor_i(...,1)`. Its dependencies include a separate characteristic-two
path, small-degree dispatch, squarefree decomposition, Frobenius, and Shoup
distinct-degree factorization. Replacing these with another backend's
factorization may be useful later, but would not isolate a language-only
comparison without separately accounting for that algorithm change.

## Current execution boundary, before the next connections

The resident prepared attempt already collects relations, performs HNF and
regulator acceptance, and extracts class invariants for its tested corridor.
Its caller still supplies class-group-specific preparation beyond `nfinit`.
`check_actual_initial_collector.cjs` executes the translated initial-base
selector, but builds arithmetic packets from upstream `expected.groups`;
asserting that selected indices agree does not itself remove that input.

The next packet connector must consume the **full raw descriptor catalog**
and the translated selector's active indices. It can call the existing
`pari_prime_ideal_hnf` and derive each norm from its prime and residue degree.
Expected selected HNFs and norms belong only in comparison assertions.
This removes selected-packet answers, not prime decomposition itself.

Likewise, `pari_analytic_inverse_hr` already computes bound selection, inverse
residue, and normalization from raw pattern data, but is separately invoked.
Joining it to the resident driver is still required. The existence of each
component does not establish the composed boundary or its timing.

## Source ordering to retain when composing

In `Buchall_param`, the initial GRH search and `nthideal` floor precede
`primeneeded`, cached degree patterns, and inverse-hR computation. `FBgen`
and `subFBgen` then run inside the factor-base-attempt loop. Reusing the
analytic cache across retries is different from precomputing a class answer.
The tiny-discriminant product limit is computed before that loop and capped
by the current checking bound when passed to `subFBgen`.

After HNF, PARI extracts unit log columns, computes a regulator multiple,
checks lambda/R and unchanged cache, and only then computes the tentative
determinant and multiplies by inverse hR. The current eager diagnostic input
bridge must not define the scheduling of the eventual faithful driver.

## Completion evidence still needed

- One declared maximal-order `nfinit` interchange, with no factor-base,
  selected-ideal, relation, regulator, or class-answer inputs.
- In-kernel or explicitly measured translated construction of the required
  patterns, descriptors, selected packets, and analytic normalization.
- Source-corresponding automorphism, retry, precision and termination paths,
  with unsupported branches reported rather than inferred successful.
- Composed differential and work-count checks before matched panel timings.

The new scalar policies and packet constructor are steps toward this boundary;
neither alone qualifies the prepared-field objective.
