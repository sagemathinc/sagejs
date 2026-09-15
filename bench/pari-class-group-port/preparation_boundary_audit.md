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

## Execution boundary and subsequent connections

The resident prepared attempt already collects relations, performs HNF and
regulator acceptance, and extracts class invariants for its tested corridor.
Its caller still supplies class-group-specific preparation beyond `nfinit`.
`check_actual_initial_collector.cjs` now executes the translated initial-base
selector and builds arithmetic packets from its selected indices into a full
raw descriptor catalog. `expected.groups` supplies assertions only, not selected
HNF, norm, valuation metadata, or grouping inputs.

The packet connector calls `pari_prime_ideal_hnf` and derives each norm from
its prime and residue degree. The metadata connector gathers ramification,
residue degree, inert flag and tau using the same active indices; grouping and
support data come from the translated initial-base output. This removes
selected-packet answers, not prime decomposition itself. The raw catalog still
comes from PARI and may overprepare descriptors relative to the upstream path.

`pari_analytic_class_group_attempt` now connects exact discriminant-to-LOGD,
bound selection, inverse residue and normalization to the resident initial
attempt. CPython, generated JavaScript and GMP native pass on the prepared
cubic fixture. Incoming LOGD and inverse
hR scratch are poisoned in the test. Analytic exceptions leave an unpublished
partial state and prohibit re-entry. Raw prime patterns, roots of unity and
the existing prepared attempt inputs remain caller-supplied: this is not yet
an `nfinit`-only entry. Factor-base preparation and this analytic wrapper are
also not yet combined into one driver. The existence of each component does
not establish that final composed boundary or its timing.

See `analytic_class_group_attempt_audit.md` for native artifact identities and
failure controls, and `get_fs_dependency_frontier.md` for the next translated
prime-pattern producer. Neither qualification changes production proof status.

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
